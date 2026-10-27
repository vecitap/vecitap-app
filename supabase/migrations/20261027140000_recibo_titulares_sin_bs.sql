-- El recibo por correo: código solo a los titulares, copia al correo de
-- respaldo sin código y sin bolívares (ronda 8, bloques B2 y C1; corrige
-- 20261026130000_invitacion_en_recibo.sql en la revisión cruzada).
--
-- Aplicada en vecitap-pruebas el 27-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261026140000_cobro_solo_usd.sql** (la guarda exige su
-- correo_recibo()) **y de 20261026130000_invitacion_en_recibo.sql**.
-- Rollback: supabase/rollbacks/20261027140000_recibo_titulares_sin_bs_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- B2 · A QUIÉN VA EL RECIBO Y QUIÉN RECIBE CÓDIGO
-- ─────────────────────────────────────────────────────────────────────────
-- Antes: `destinatarios_de(unidad)` devuelve una fila por vínculo vigente
-- (propietario o inquilino) con «recibe corte», con el correo PRINCIPAL de
-- la ficha (`personas.correo`), y rol 'propietario' o 'inquilino'. **No
-- devuelve el correo de respaldo ni copias**: hasta hoy el recibo no le
-- llegaba al correo de respaldo. Si la unidad tenía dos propietarios
-- vigentes, los dos recibían código.
-- Ahora (decisión de Gustavo):
--   · El recibo va al correo principal del propietario y del inquilino, y
--     **también al correo de respaldo**, en un correo aparte (no en copia:
--     así ese correo sale sin el bloque del código). Los mensajes masivos ya
--     mandaban copia al respaldo; ahora el recibo también.
--   · Código de invitación solo para el **propietario principal** (el
--     vínculo vigente más reciente) y el **inquilino**, a su correo
--     principal. El respaldo nunca recibe código ni invitación.
--   · `asegurar_invitaciones_recibo()` crea o extiende invitaciones solo
--     para esos dos.
--   · Al usar o anular una invitación, su código se borra de
--     `invitaciones_codigo` (disparador en invitaciones). Se borran también
--     los que ya estaban usados o vencidos.
-- Ojo con el cupo: cada correo de respaldo es un correo más por unidad.
--
-- ─────────────────────────────────────────────────────────────────────────
-- C1 · SIN BOLÍVARES EN EL CORREO
-- ─────────────────────────────────────────────────────────────────────────
-- Decisión de Gustavo: un monto fijo en Bs lleva a pagar días después con
-- otra tasa y pagar de menos creyendo que se pagó bien. El correo trae solo
-- el total en dólares y «Se paga en bolívares a la tasa oficial BCV del día
-- del pago», con el enlace al portal (ahí está el «Monto exacto en Bs» con
-- la tasa del día). Los datos para pagar siguen, sin montos en Bs. Con
-- «Cobrar solo en dólares» no va la frase. (El recibo impreso y el PDF se
-- cambian en la app: lib/recibo-papel.ts.)

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.correo_recibo(uuid)', 'd84d3494c388f5fa1edb9e4195d1f4ad'),
      ('public.asegurar_invitaciones_recibo(uuid)', 'd2966a9d9d3fbcb49ca44a81c1c3edf9')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then
    raise exception 'ABORTADA: cambiaron:%  ¿Falta 20261026140000_cobro_solo_usd.sql?', malas;
  end if;
end
$guarda$;

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
begin
  select rc.id, rc.numero, rc.total, rc.org_id, rc.unidad_id, rc.vence_el,
         rc.honorario, rc.anterior_hon, u.edificio_id,
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
      <div style="font-size:12px;color:#3D3D6B">Total a pagar</div>
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
      v_total,
      case when v_frase is null then ''
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
Total a pagar: %s%s
Recibo: %s%s
%s%s
Véalo y reporte su pago aquí:
%s

%s$t$,
      coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino'), r.etiqueta, r.codigo,
      v_nota_txt,
      v_total,
      case when v_frase is null then '' else E'\n' || v_frase || E'\nEl monto en bolívares de hoy está en el portal: ' || v_enlace end,
      r.numero,
      case when v_vence is null then '' else E'\nVence el ' || v_vence end,
      v_pago_txt,
      v_inv_txt,
      v_enlace, r.org);

    return next;
  end loop;
end $function$;

create or replace function public.asegurar_invitaciones_recibo(p_recibo uuid)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare v_org uuid; v_unidad uuid; d record; n int := 0;
begin
  select rc.org_id, rc.unidad_id into v_org, v_unidad from recibos rc where rc.id = p_recibo;
  if v_org is null then return 0; end if;
  if not puede_operar(v_org) then raise exception 'Sin permiso'; end if;

  -- Ronda 8 (revisión cruzada): solo el propietario principal (el vínculo
  -- vigente más reciente) y el inquilino, con «recibe corte», a su correo
  -- principal. El correo de respaldo nunca recibe una invitación.
  for d in select x.rol, x.correo from (
      select v.tipo as rol, nullif(btrim(coalesce(pe.correo, '')), '') as correo,
             row_number() over (partition by v.tipo order by v.desde desc, v.id) as n
        from vinculos v
        join personas pe on pe.id = v.persona_id
       where v.unidad_id = v_unidad and v.hasta is null and v.enviar_corte) x
     where x.n = 1 and x.correo is not null loop
    continue when exists (select 1 from correos_malos where correo = lower(btrim(d.correo)));
    begin
      if invitacion_para_recibo(v_org, v_unidad, d.correo, d.rol) then n := n + 1; end if;
    exception when others then
      -- Organización atrasada con Vecitap, correo que no pasa la validación…:
      -- ese correo sale sin código, el recibo sale igual.
      null;
    end;
  end loop;
  return n;
end $function$;

create function public.invitacion_borra_codigo() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
begin
  -- Usada (aceptar_invitacion) o anulada (revocar_invitacion, o reemplazada
  -- por crear_invitacion): las dos ponen usada_en o vencen expira_en.
  if new.usada_en is not null or new.expira_en <= now() then
    delete from invitaciones_codigo c where c.invitacion_id = new.id;
  end if;
  return null;
end $function$;

create trigger invitaciones_borra_codigo
  after update of usada_en, expira_en on public.invitaciones
  for each row execute function public.invitacion_borra_codigo();

revoke all on function public.invitacion_borra_codigo() from public, anon, authenticated;

-- Los códigos de invitaciones ya usadas o vencidas.
delete from public.invitaciones_codigo c
 using public.invitaciones i
 where i.id = c.invitacion_id and (i.usada_en is not null or i.expira_en <= now());

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc
--     where proname in ('correo_recibo','asegurar_invitaciones_recibo','invitacion_borra_codigo');
--    -- Esperado: correo_recibo fc342ae7a87d2beac3ad8a10060d440c, asegurar_invitaciones_recibo 169010a2f4fdb4cc44e1c4171d09be05.
-- 2. Un recibo de una unidad cuyo propietario tiene correo_respaldo:
--      select rol, destino, position('Bs ' in html) = 0 as sin_bs,
--             position('Todavía no tiene usuario' in html) > 0 as con_codigo
--        from public.correo_recibo('<recibo>');
--    -- Esperado: dos filas (principal y respaldo), las dos sin_bs; el
--    --   código solo en la principal (si no tiene acceso).
-- 3. select count(*) from invitaciones_codigo c join invitaciones i on i.id = c.invitacion_id
--     where i.usada_en is not null or i.expira_en <= now();   -- 0
--    Y en una transacción deshecha, revocar_invitacion('<pendiente con código>')
--    → su fila de invitaciones_codigo desaparece.
