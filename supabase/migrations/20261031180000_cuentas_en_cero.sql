-- Una cuenta a la que no le toca nada no sale en el correo del recibo, y un
-- recibo sin nada que pagar lo dice (ronda 12, F).
--
-- Aplicada en vecitap-pruebas el 01-nov, y vuelta a aplicar el mismo día dos
-- veces: con el ajuste del recibo en $ 0,00 o a favor y con el control de quién
-- llama a correo_recibo(). SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261026120000_datos_pago.sql y de 20261027140000_recibo_titulares_sin_bs.sql** (la
-- guarda exige datos_pago_html() 78cc1d2e…, datos_pago_texto() 5be588ad… y
-- correo_recibo() fc342ae7…). Rollback:
-- supabase/rollbacks/20261031180000_cuentas_en_cero_rollback.sql.
--
-- PEDIDO DE GUSTAVO
-- El correo del recibo de 04D (Abril 2027) decía «Honorarios de
-- administración: $ 0,00» con los datos del pago móvil. Si a una cuenta le
-- toca $ 0,00 o menos en ese recibo, no se muestra ni su monto ni sus datos.
--
-- Y (ajuste del 01-nov): cuando el recibo queda en $ 0,00 o a favor, el
-- correo hace lo mismo que el papel.
--
-- QUÉ CAMBIA
-- 1. datos_pago_html() y datos_pago_texto(), el bloque «Datos para pagar» del
--    correo: una cuenta con monto ≤ $ 0,00 se salta, siempre que a otra le
--    toque algo. Si a ninguna (o sin monto, null), salen todas, como antes;
--    correo_recibo() ya no las muestra en ese caso.
-- 2. correo_recibo(): con el recibo en $ 0,00 o a favor (total ≤ 0), sin
--    «Datos para pagar», sin la frase de los bolívares y sin «Vence el», y en
--    lugar de «Total a pagar: $ 0,00» dice «Está al día · no tiene que pagar»
--    o «A favor $ X · no tiene que pagar» (X: lo que le queda a favor, como en
--    el papel), en el HTML y en el texto. Con algo que pagar, el correo es el
--    mismo que con el punto 1 solo.
-- 3. Seguridad: correo_recibo() pasa a controlar quién la llama. Es SECURITY
--    DEFINER y authenticated la puede ejecutar (la usa «Probar el correo» de
--    Cortes, por eso el permiso se queda), pero no revisaba nada: cualquiera
--    con sesión y el id de un recibo ajeno recibía su correo (nombres,
--    correos, montos y el código de invitación). Ahora: «Sin acceso a ese
--    recibo» si quien llama no puede operar la organización del recibo
--    (puede_operar). Sin sesión y fuera de la API (cron, SQL) pasa.
-- Fuera del punto 3, es solo lo que se muestra: ningún monto ni recibo
-- cambia, y los correos ya enviados quedan como salieron.

begin;

do $guarda$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.datos_pago_html(uuid, numeric, numeric, numeric, boolean)');
  if v is distinct from '78cc1d2e38b195cb424e54752dd44904' then
    raise exception 'ABORTADA: datos_pago_html cambió (md5=%). ¿Falta 20261026120000_datos_pago.sql?', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: datos_pago_html tiene otros permisos (%)', a;
  end if;
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.datos_pago_texto(uuid, numeric, numeric)');
  if v is distinct from '5be588ad933a8adc758a44d725e1d285' then
    raise exception 'ABORTADA: datos_pago_texto cambió (md5=%). ¿Falta 20261026120000_datos_pago.sql?', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: datos_pago_texto tiene otros permisos (%)', a;
  end if;
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.correo_recibo(uuid)');
  if v is distinct from 'fc342ae7a87d2beac3ad8a10060d440c' then
    raise exception 'ABORTADA: correo_recibo cambió (md5=%). ¿Falta 20261027140000_recibo_titulares_sin_bs.sql?', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: correo_recibo tiene otros permisos (%)', a;
  end if;
end
$guarda$;

create or replace function public.datos_pago_html(p_edificio uuid, p_cond numeric, p_hon numeric,
                                                  p_tasa numeric, p_con_bs boolean)
  returns text
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v_html text := ''; v_cuentas text; v_dest text; v_monto numeric; v_hay_hon boolean; d record;
  v_alguna boolean;
begin
  select exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'honorarios')
    into v_hay_hon;
  if not exists (select 1 from datos_pago x where x.edificio_id = p_edificio) then
    return '';
  end if;
  -- Ronda 12 (F): ¿a alguna cuenta le toca algo? Entonces las que quedan en
  -- $ 0,00 o menos no salen. Si a ninguna, salen todas, como antes.
  v_alguna := (exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'condominio')
               and round(coalesce(case when v_hay_hon then p_cond else p_cond + p_hon end, 0), 2) > 0)
           or (v_hay_hon and round(coalesce(p_hon, 0), 2) > 0);

  foreach v_dest in array array['condominio', 'honorarios'] loop
    continue when v_dest = 'honorarios' and not v_hay_hon;
    v_monto := case when v_dest = 'honorarios' then p_hon
                    when v_hay_hon then p_cond else p_cond + p_hon end;
    continue when v_alguna and v_monto is not null and round(v_monto, 2) <= 0;
    v_cuentas := '';
    for d in select * from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest
              order by x.orden, x.creado_en loop
      v_cuentas := v_cuentas || format(
        '<div style="border-top:1px solid #E6E3EC;padding:8px 0;font-size:13px;line-height:1.55;color:#111144">'
        '<b>%s</b>%s%s%s%s%s</div>',
        case d.tipo when 'pago_movil' then 'Pago móvil' when 'otro' then 'Otro' else 'Transferencia' end,
        case when coalesce(btrim(d.banco), '') <> '' then ' · ' || esc_html(d.banco) else '' end,
        case when coalesce(btrim(d.titular), '') <> '' then '<br>Titular: ' || esc_html(d.titular) else '' end,
        case when coalesce(btrim(d.documento), '') <> '' then '<br>RIF/CI: ' || esc_html(d.documento) else '' end,
        case when coalesce(btrim(d.cuenta), '') <> '' then
          '<br>' || case d.tipo when 'pago_movil' then 'Teléfono' else 'Cuenta' end
          || ': <span style="font-family:ui-monospace,Menlo,Consolas,monospace">' || esc_html(d.cuenta) || '</span>'
          else '' end,
        case when coalesce(btrim(d.nota), '') <> '' then
          '<br><span style="color:#66668A">' || esc_html(d.nota) || '</span>' else '' end);
    end loop;
    continue when v_cuentas = '';

    v_html := v_html || format(
      '<div style="margin-top:10px"><div style="font-size:12px;color:#3D3D6B;font-weight:700">%s%s</div>%s</div>',
      case when v_hay_hon then case v_dest when 'honorarios' then 'Honorarios de administración'
                                           else 'Condominio' end
           else 'Cuenta del condominio' end,
      case when v_monto is null then ''
           else ': $ ' || fmt_monto(v_monto)
                || case when p_con_bs and coalesce(p_tasa, 0) > 0
                        then ' (Bs ' || fmt_monto(ceil(v_monto * p_tasa * 100) / 100) || ')' else '' end end,
      v_cuentas);
  end loop;

  return format(
    '<div style="border:1px solid #E6E3EC;border-radius:10px;padding:12px 14px;margin-bottom:18px">'
    '<div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#66668A;font-weight:700">Datos para pagar</div>'
    '%s</div>', v_html);
end $function$;

create or replace function public.datos_pago_texto(p_edificio uuid, p_cond numeric, p_hon numeric)
  returns text
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v text := ''; v_dest text; v_hay_hon boolean; v_monto numeric; d record;
  v_alguna boolean;
begin
  select exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'honorarios')
    into v_hay_hon;
  -- Ronda 12 (F): la misma regla que datos_pago_html().
  v_alguna := (exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'condominio')
               and round(coalesce(case when v_hay_hon then p_cond else p_cond + p_hon end, 0), 2) > 0)
           or (v_hay_hon and round(coalesce(p_hon, 0), 2) > 0);
  foreach v_dest in array array['condominio', 'honorarios'] loop
    continue when v_dest = 'honorarios' and not v_hay_hon;
    continue when not exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest);
    v_monto := case when v_dest = 'honorarios' then p_hon
                    when v_hay_hon then p_cond else p_cond + p_hon end;
    continue when v_alguna and v_monto is not null and round(v_monto, 2) <= 0;
    v := v || E'\n' || case when v_hay_hon then case v_dest when 'honorarios' then 'Honorarios de administración'
                                                         else 'Condominio' end
                            else 'Cuenta del condominio' end
           || case when v_monto is null then '' else ': $ ' || fmt_monto(v_monto) end || E'\n';
    for d in select * from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest
              order by x.orden, x.creado_en loop
      v := v || '- ' || concat_ws(' · ',
             case d.tipo when 'pago_movil' then 'Pago móvil' when 'otro' then 'Otro' else 'Transferencia' end,
             nullif(btrim(coalesce(d.banco, '')), ''),
             case when coalesce(btrim(d.titular), '') <> '' then 'Titular: ' || btrim(d.titular) end,
             case when coalesce(btrim(d.documento), '') <> '' then 'RIF/CI: ' || btrim(d.documento) end,
             case when coalesce(btrim(d.cuenta), '') <> '' then
               case d.tipo when 'pago_movil' then 'Teléfono: ' else 'Cuenta: ' end || btrim(d.cuenta) end,
             nullif(btrim(coalesce(d.nota, '')), '')) || E'\n';
    end loop;
  end loop;
  return case when v = '' then '' else E'\nDatos para pagar:' || v end;
end $function$;

create or replace function public.correo_recibo(p_recibo uuid)
 RETURNS TABLE(rol text, destino text, responder_a text, asunto text, html text, texto text, org_id uuid, unidad_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; d record;
  v_enlace text; v_total text; v_bs text; v_vence text;
  v_nota text; v_nota_html text; v_nota_txt text;
  -- Ronda 7 (bloque 2): la tasa del día en que se encola, con su fecha, y
  -- cuánto va a cada cuenta.
  v_tasa numeric; v_tasa_fecha date; v_frase text;
  v_hon numeric; v_cond numeric; v_pago_html text; v_pago_txt text;
  -- Ronda 7 (bloque 3): el código de invitación de quien no tiene acceso.
  v_origen text; v_codigo text; v_link text; v_inv_html text; v_inv_txt text;
  -- Ronda 7 (bloque 4): la organización cobra solo en dólares.
  v_solo_usd boolean;
  -- Ronda 12 (F): el recibo no tiene nada que pagar, y lo que le queda a favor.
  v_nada boolean; v_favor numeric;
begin
  select rc.id, rc.numero, rc.total, rc.org_id, rc.unidad_id, rc.vence_el,
         rc.honorario, rc.anterior_hon, rc.a_favor, rc.anterior, rc.directos, rc.mora, rc.conceptos,
         u.edificio_id,
         u.codigo, o.nombre as org, e.nombre as edificio,
         p.etiqueta, p.tasa_bcv,
         ac.remitente, ac.responder_a, ac.enlace_base, ac.nota, ac.nota_hasta
    into r
    from recibos rc
    join unidades u        on u.id = rc.unidad_id
    join edificios e       on e.id = u.edificio_id
    join organizaciones o  on o.id = rc.org_id
    join periodos p        on p.id = rc.periodo_id
    left join ajustes_correo ac on ac.org_id = rc.org_id
   where rc.id = p_recibo;

  if r.id is null then raise exception 'Ese recibo no existe'; end if;
  -- Ronda 12 (F, seguridad): control propio. Antes no tenía ninguno: es
  -- SECURITY DEFINER, authenticated la puede ejecutar (la usa «Probar el
  -- correo» de Cortes) y cualquiera con sesión y el id de un recibo ajeno
  -- recibía su correo: nombres, correos, montos y el código de invitación.
  -- Pasa quien puede operar la organización del recibo. Las funciones que la
  -- llaman (encolar_recibos, reenviar_recibo, encolar_prueba,
  -- estado_envio_periodo) ya exigen puede_operar() con la sesión de quien las
  -- llama, así que también pasan. Sin sesión y fuera de la API (el cron, el
  -- SQL de mantenimiento) pasa: ahí no hay a quién controlar. No se usa
  -- current_user como en saldo_unidad(): dentro de una SECURITY DEFINER es
  -- siempre su dueño (postgres), la llame quien la llame.
  if not (puede_operar(r.org_id)
          or (auth.uid() is null and session_user <> 'authenticator')) then
    raise exception 'Sin acceso a ese recibo';
  end if;

  v_enlace := coalesce(r.enlace_base,
                       (select valor from secretos where nombre = 'correo_enlace'));
  v_total  := '$ ' || fmt_monto(r.total);
  -- https://vecitap.com/mi → https://vecitap.com (el enlace de crear usuario va a /entrar).
  v_origen := coalesce(substring(v_enlace from '^(https?://[^/]+)'), v_enlace);

  -- La última tasa cargada hasta hoy (día de Venezuela), con su fecha. No la
  -- del recibo: lo que se paga en bolívares se convierte con la del día.
  select t.tasa, t.fecha into v_tasa, v_tasa_fecha
    from tasas_bcv t where t.fecha <= hoy_local()
   order by t.fecha desc limit 1;
  v_solo_usd := coalesce((select a.solo_usd from ajustes_cobro a where a.org_id = r.org_id), false);
  -- Solo en dólares: sin el monto en bolívares (y sin la frase de la tasa).
  -- Ronda 8 (decisión de Gustavo): ningún monto en bolívares en el correo.
  -- Un monto fijo en Bs lleva a pagar días después con otra tasa y pagar de
  -- menos creyendo que se pagó bien. Solo los dólares, la frase y el enlace
  -- al portal, que da el monto exacto en Bs con la tasa del día.
  v_bs := null;
  v_frase := case when v_solo_usd then null
                  else 'Se paga en bolívares a la tasa oficial BCV del día del pago.' end;

  v_vence  := case when r.vence_el is not null
                   then to_char(r.vence_el, 'DD/MM/YYYY') else null end;

  -- A qué cuenta va cada parte (ver la cabecera de la migración).
  v_hon  := case when exists (select 1 from datos_pago x where x.edificio_id = r.edificio_id and x.destino = 'honorarios')
                 then least(greatest(coalesce(r.honorario, 0) + coalesce(r.anterior_hon, 0), 0), greatest(r.total, 0))
                 else 0 end;
  v_cond := greatest(r.total, 0) - v_hon;
  v_pago_html := datos_pago_html(r.edificio_id, v_cond, v_hon, v_tasa, false);   -- Ronda 8: sin Bs
  v_pago_txt  := datos_pago_texto(r.edificio_id, v_cond, v_hon);

  -- Ronda 12 (F): un recibo en $ 0,00 o a favor no tiene nada que pagar.
  -- Como el papel: sin «Datos para pagar», sin la frase de los bolívares ni
  -- el vencimiento, y en lugar de «Total a pagar: $ 0,00», «Está al día» o
  -- «A favor $ X», con «no tiene que pagar». X es lo que le queda a favor
  -- después de este recibo, la misma cuenta que favorQueQueda() del papel
  -- (lib/recibo-papel.ts): a favor − (conceptos + directos + anterior + mora).
  v_nada := r.total <= 0.005;
  if v_nada then
    v_favor := round(coalesce(r.a_favor, 0)
                     - (coalesce((select sum((x->>'monto')::numeric)
                                    from jsonb_array_elements(case when jsonb_typeof(r.conceptos) = 'array'
                                                                   then r.conceptos else '[]'::jsonb end) x), 0)
                        + coalesce(r.directos, 0) + coalesce(r.anterior, 0) + coalesce(r.mora, 0)), 2);
    v_total := case when v_favor > 0 then 'A favor $ ' || fmt_monto(v_favor) else 'Está al día' end;
    v_pago_html := ''; v_pago_txt := ''; v_frase := null; v_vence := null;
  end if;

  -- La nota caduca sola si le pusieron fecha
  v_nota := nullif(btrim(coalesce(r.nota, '')), '');
  if v_nota is not null and r.nota_hasta is not null and r.nota_hasta < current_date then
    v_nota := null;
  end if;

  v_nota_html := case when v_nota is null then '' else format(
    '<div style="background:#FDEDDC;border-radius:10px;padding:13px 15px;margin-bottom:18px">'
    '<div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;'
    'color:#8A5A00;font-weight:700;margin-bottom:4px">De su administración</div>'
    '<div style="font-size:13.5px;line-height:1.6;color:#111144">%s</div></div>',
    replace(esc_html(v_nota), E'\n', '<br>')) end;

  v_nota_txt := case when v_nota is null then ''
                     else E'\n--\n' || v_nota || E'\n--\n' end;

  -- Ronda 8 (revisión cruzada): a quién va. El propietario y el inquilino
  -- con «recibe corte», a su correo; y aparte, a su correo de respaldo (la
  -- copia), en un correo propio. Código de invitación solo para el
  -- propietario principal (el vínculo vigente más reciente) y el inquilino,
  -- y solo a su correo principal: el respaldo nunca lleva código.
  for d in
    with vin as (
      select v.tipo, v.desde, pe.prefijo, pe.nombre, pe.correo, pe.correo_respaldo,
             row_number() over (partition by v.tipo order by v.desde desc, v.id) as n
        from vinculos v
        join personas pe on pe.id = v.persona_id
       where v.unidad_id = r.unidad_id and v.hasta is null and v.enviar_corte)
    select vin.tipo as rol, concat_ws(' ', vin.prefijo, vin.nombre) as nombre, c.correo,
           (not c.respaldo and vin.n = 1) as invita
      from vin
     cross join lateral (values (nullif(btrim(coalesce(vin.correo, '')), ''), false),
                                (nullif(lower(btrim(coalesce(vin.correo_respaldo, ''))), ''), true)) c(correo, respaldo)
     where c.correo is not null
       and not (c.respaldo and c.correo = lower(btrim(coalesce(vin.correo, ''))))
     order by case vin.tipo when 'propietario' then 1 else 2 end, vin.desde desc, c.respaldo
  loop
    rol := d.rol;
    destino := d.correo;
    responder_a := r.responder_a;
    asunto := format('Su recibo de condominio · %s · %s', r.codigo, r.etiqueta);
    org_id := r.org_id;
    unidad_id := r.unidad_id;

    -- null: ya tiene acceso (o no hay invitación); '': tiene una pendiente
    -- sin el código guardado (anterior a la ronda 7).
    v_codigo := case when d.invita then codigo_invitacion_vigente(r.unidad_id, d.correo) end;
    v_link := case when coalesce(v_codigo, '') <> ''
                   then v_origen || '/entrar?volver=%2Fmi%2Fagregar%3Fcodigo%3D' || v_codigo end;
    v_inv_html := case
      when v_codigo is null then ''
      when v_codigo = '' then
        '<div style="background:#EEF2F7;border-radius:10px;padding:13px 15px;margin-bottom:18px;font-size:13px;line-height:1.6;color:#111144">'
        'Para entrar a la app, use el código de invitación que le envió su administración.</div>'
      else format(
        '<div style="background:#EEF2F7;border-radius:10px;padding:13px 15px;margin-bottom:18px">'
        '<div style="font-size:14px;font-weight:700;color:#111144">Todavía no tiene usuario en la app</div>'
        '<div style="font-size:13px;line-height:1.6;color:#3D3D6B;margin-top:4px">Cree su usuario con este correo (%s) y pegue este código de invitación:</div>'
        '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:#fff;border:1px solid #E6E3EC;border-radius:8px;padding:8px 10px;margin:8px 0;word-break:break-all">%s</div>'
        '<a href="%s" style="color:#111144;font-weight:700;font-size:14px">Crear mi usuario</a></div>',
        esc_html(d.correo), esc_html(v_codigo), esc_html(v_link)) end;
    v_inv_txt := case
      when v_codigo is null then ''
      when v_codigo = '' then E'\nPara entrar a la app, use el código de invitación que le envió su administración.\n'
      else E'\nTodavía no tiene usuario en la app. Cree su usuario con este correo (' || d.correo
           || E') y pegue este código de invitación:\n' || v_codigo || E'\nCrear mi usuario: ' || v_link || E'\n' end;

    html := format($h$<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F1EC;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111144">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#66668A;font-weight:700">%s</div>
  <div style="font-size:19px;font-weight:700;margin:2px 0 18px">%s</div>
  <div style="background:#fff;border:1px solid #E6E3EC;border-radius:14px;padding:20px">
    <p style="margin:0 0 6px;font-size:15px">%s,</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3D3D6B">
      Ya está disponible el recibo de condominio de <b>%s</b> para la unidad <b>%s</b>.</p>
    %s
    <div style="background:#F4F1EC;border-radius:10px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:12px;color:#3D3D6B">%s</div>
      <div style="font-size:26px;font-weight:700">%s</div>
      %s
      %s
      <div style="font-size:12px;color:#66668A;margin-top:6px">Recibo %s</div>
    </div>
    %s
    %s
    <a href="%s" style="display:block;text-align:center;background:#F98513;color:#111144;
      text-decoration:none;font-weight:700;font-size:15px;padding:14px 18px;border-radius:10px">
      Ver mi recibo y reportar mi pago</a>
    <p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#66668A">
      Desde ahí ve el desglose completo, su saldo al día de hoy, y puede reportar su pago
      con la foto del comprobante. Si es la primera vez que entra, use este mismo correo
      para crear su clave.</p>
  </div>
  <p style="font-size:11.5px;color:#66668A;line-height:1.6;margin-top:16px">
    Este aviso lo envía %s a través de Vecitap.</p>
</div></body></html>$h$,
      esc_html(r.org), esc_html(r.edificio),
      esc_html(coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino')),
      esc_html(r.etiqueta), esc_html(r.codigo),
      v_nota_html,
      case when v_nada then 'Este mes' else 'Total a pagar' end,
      v_total,
      case when v_nada then '<div style="font-size:12.5px;color:#3D3D6B;margin-top:4px">no tiene que pagar</div>'
           when v_frase is null then ''
           else format('<div style="font-size:12.5px;color:#3D3D6B;line-height:1.55;margin-top:4px">%s '
                       '<a href="%s" style="color:#111144;font-weight:700">Vea el monto en bolívares de hoy en el portal</a>.</div>',
                       esc_html(v_frase), esc_html(v_enlace)) end,
      case when v_vence is null then ''
           else format('<div style="font-size:12.5px;color:#8A5A00;margin-top:6px">Vence el %s</div>', v_vence) end,
      esc_html(r.numero),
      v_pago_html,
      v_inv_html,
      esc_html(v_enlace), esc_html(r.org));

    texto := format($t$%s,

Ya está disponible el recibo de condominio de %s para la unidad %s.
%s
%s%s
Recibo: %s%s
%s%s
Véalo y reporte su pago aquí:
%s

%s$t$,
      coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino'), r.etiqueta, r.codigo,
      v_nota_txt,
      case when v_nada then v_total || ' · no tiene que pagar' else 'Total a pagar: ' || v_total end,
      case when v_frase is null then '' else E'\n' || v_frase || E'\nEl monto en bolívares de hoy está en el portal: ' || v_enlace end,
      r.numero,
      case when v_vence is null then '' else E'\nVence el ' || v_vence end,
      v_pago_txt,
      v_inv_txt,
      v_enlace, r.org);

    return next;
  end loop;
end $function$;

do $despues$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.datos_pago_html(uuid, numeric, numeric, numeric, boolean)'::regprocedure;
  if v is distinct from 'fdf7692914e87a3c31df7a4168770b46' then
    raise exception 'ABORTADA: datos_pago_html no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: datos_pago_html tiene otros permisos (%)', a;
  end if;
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.datos_pago_texto(uuid, numeric, numeric)'::regprocedure;
  if v is distinct from '2a6fa6a5dffba8ab25fa031f65bacf9c' then
    raise exception 'ABORTADA: datos_pago_texto no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: datos_pago_texto tiene otros permisos (%)', a;
  end if;
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.correo_recibo(uuid)'::regprocedure;
  if v is distinct from '76eed05ec00d037400bd624bdf1dfd2d' then
    raise exception 'ABORTADA: correo_recibo no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: correo_recibo tiene otros permisos (%)', a;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc), array_to_string(proacl, ',') from pg_proc
--     where proname in ('datos_pago_html', 'datos_pago_texto', 'correo_recibo') order by 1;
--    -- Esperado: correo_recibo 76eed05ec00d037400bd624bdf1dfd2d
--    --   (postgres=X/postgres,authenticated=X/postgres); datos_pago_html fdf7692914e87a3c31df7a4168770b46 y
--    --   datos_pago_texto 2a6fa6a5dffba8ab25fa031f65bacf9c, las dos postgres=X/postgres.
-- 2. Con un edificio que tiene cuenta de condominio y de honorarios:
--      select datos_pago_texto('<edificio>', 70, 0);   -- Esperado: solo «Condominio: $ 70,00» y su cuenta.
--      select datos_pago_texto('<edificio>', 0, 10);   -- Esperado: solo «Honorarios de administración: $ 10,00».
--      select datos_pago_texto('<edificio>', 60, 10);  -- Esperado: las dos, con su monto.
--      select datos_pago_texto('<edificio>', 0, 0);    -- Esperado: las dos con «$ 0,00», como antes.
--    Lo mismo con datos_pago_html('<edificio>', …, null, false).
-- 3. El correo de un recibo con honorario en 0 (04D de Abril 2027 en pruebas):
--      select html, texto from correo_recibo('<recibo>');
--    -- Esperado: sin «Honorarios de administración» ni el pago móvil de honorarios.
-- 4. El correo de un recibo en $ 0,00 o a favor (02D de Mayo 2027 en pruebas, a favor 8,51):
--    -- Esperado: «Este mes · A favor $ 8,51 · no tiene que pagar» (texto: «A favor $ 8,51 ·
--    --   no tiene que pagar»), sin «Total a pagar», sin «Datos para pagar», sin «Vence el» y
--    --   sin la frase de los bolívares. Con el recibo en $ 0,00 y nada a favor: «Está al día».
-- 5. Quién la puede llamar (como la sesión, en un bloque que se deshace):
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario>","role":"authenticated"}';
--      select count(*) from correo_recibo('<recibo>');
--    -- Esperado: con el administrador de la organización del recibo, las filas del correo;
--    --   con cualquier otro usuario (un residente, el administrador de otra organización),
--    --   «Sin acceso a ese recibo». Por la API, lo mismo («Probar el correo» de Cortes).
