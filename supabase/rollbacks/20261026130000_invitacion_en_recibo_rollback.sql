-- Reverso de 20261026130000_invitacion_en_recibo.sql (ronda 7, bloque 3).
--
-- 1. Vuelve a dejar `correo_recibo()` como en 20261026120000_datos_pago.sql,
--    `encolar_recibos()` y `crear_invitacion()` como estaban el 26-oct
--    (los cuerpos de abajo son esos, tal cual).
-- 2. Borra las funciones nuevas y la tabla `invitaciones_codigo`. Las
--    invitaciones creadas por los recibos **no se borran**: siguen en Accesos
--    y siguen sirviendo hasta que venzan; solo se pierde el código guardado
--    (ya no se puede volver a mandar en un correo).
--
-- Si se aplicaron migraciones de la ronda 7 posteriores a esta, revertirlas
-- primero.

begin;

CREATE OR REPLACE FUNCTION public.crear_invitacion(p_org uuid, p_correo text, p_rol text, p_edificio uuid DEFAULT NULL::uuid, p_unidad uuid DEFAULT NULL::uuid, p_relacion text DEFAULT 'propietario'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; v_rel text; v_unidad uuid; v_edificio uuid; v_correo text;
begin
  if not tiene_rol(p_org, array['propietario_cuenta','administrador']) then
    raise exception 'Sin permiso para invitar';
  end if;
  if p_rol = 'residente' and p_unidad is null then
    raise exception 'Una invitación de residente necesita unidad';
  end if;
  if p_rol = 'junta' and p_edificio is null then
    raise exception 'Una invitación de junta necesita edificio';
  end if;

  if p_rol = 'vigilante' then
    if p_edificio is null then
      raise exception 'Una invitación de vigilante necesita edificio';
    end if;
    -- Sin módulo de garita, el vigilante entraría a una pantalla donde
    -- la base le va a negar todo. Mejor no darle la cuenta.
    perform exigir_modulo(p_org, 'garita', p_edificio);
  end if;

  if p_unidad is not null and not exists (
       select 1 from unidades where id = p_unidad and org_id = p_org) then
    raise exception 'Esa unidad no es de esta organización';
  end if;
  if p_edificio is not null and not exists (
       select 1 from edificios where id = p_edificio and org_id = p_org) then
    raise exception 'Ese edificio no es de esta organización';
  end if;

  -- Normaliza unidad_id y edificio_id según el alcance del rol
  -- (residente -> unidad; junta/vigilante -> edificio; el resto ->
  -- organización, ambos NULL).
  v_unidad := case p_rol
                when 'residente' then p_unidad
                else null end;
  v_edificio := case p_rol
                  when 'junta' then p_edificio
                  when 'vigilante' then p_edificio
                  else null end;

  v_rel := case when p_rol = 'residente'
                then coalesce(nullif(p_relacion, ''), 'propietario') else null end;
  if v_rel is not null and v_rel not in ('propietario','inquilino') then
    raise exception 'La relación tiene que ser propietario o inquilino';
  end if;

  v_correo := lower(trim(p_correo));

  -- NUEVO (05-oct): la invitación nueva reemplaza a la pendiente del mismo
  -- correo y el mismo alcance. Se anula igual que en revocar_invitacion.
  update invitaciones
     set expira_en = now() - interval '1 second'
   where org_id = p_org
     and correo = v_correo
     and rol = p_rol
     and unidad_id is not distinct from v_unidad
     and edificio_id is not distinct from v_edificio
     and usada_en is null
     and expira_en > now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into invitaciones (org_id, correo, rol, edificio_id, unidad_id,
                            relacion, token_hash, creada_por)
  values (p_org, v_correo, p_rol, v_edificio, v_unidad, v_rel,
          encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end $function$;

create or replace function public.encolar_recibos(p_periodo uuid) RETURNS TABLE(encolados integer, sin_correo integer, rebotados integer, ya_estaban integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_org uuid; v_estado text;
  r record; c record;
  v_enc int := 0; v_sin int := 0; v_reb int := 0; v_ya int := 0;
  v_alguno boolean;
begin
  select org_id, estado into v_org, v_estado from periodos where id = p_periodo;
  if v_org is null then raise exception 'El período no existe'; end if;
  if not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  if v_estado <> 'cerrado' then
    raise exception 'El mes no está cerrado: todavía no hay recibos que enviar';
  end if;

  for r in select id from recibos where periodo_id = p_periodo loop
    v_alguno := false;

    for c in select * from correo_recibo(r.id) loop
      v_alguno := true;

      if exists (select 1 from correos_malos where correo = lower(btrim(c.destino))) then
        v_reb := v_reb + 1;
        continue;
      end if;

      begin
        insert into cola_correo (org_id, unidad_id, recibo_id, tipo, destino,
                                 responder_a, asunto, html, texto)
        values (c.org_id, c.unidad_id, r.id, 'recibo', lower(btrim(c.destino)),
                c.responder_a, c.asunto, c.html, c.texto);
        v_enc := v_enc + 1;
      exception when unique_violation then
        v_ya := v_ya + 1;   -- a esa persona ya se le encoló: no se manda dos veces
      end;
    end loop;

    -- Nadie registrado, nadie con correo, o a todos les quitaron el envío
    if not v_alguno then v_sin := v_sin + 1; end if;
  end loop;

  if v_enc > 0 then perform marcar_enviado(p_periodo, true); end if;

  insert into tareas_log (tarea, detalle) values ('encolar_recibos',
    jsonb_build_object('periodo', p_periodo, 'encolados', v_enc,
                       'sin_correo', v_sin, 'rebotados', v_reb, 'ya_estaban', v_ya));

  return query select v_enc, v_sin, v_reb, v_ya;
end $$;

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

  -- La última tasa cargada hasta hoy (día de Venezuela), con su fecha. No la
  -- del recibo: lo que se paga en bolívares se convierte con la del día.
  select t.tasa, t.fecha into v_tasa, v_tasa_fecha
    from tasas_bcv t where t.fecha <= hoy_local()
   order by t.fecha desc limit 1;
  v_bs := case when coalesce(v_tasa, 0) > 0
               then 'Bs ' || fmt_monto(ceil(r.total * v_tasa * 100) / 100) else null end;
  v_frase := case when v_bs is null then null else format(
    'Calculado a la tasa oficial BCV del dólar del %s. Si paga en bolívares, use la tasa BCV del día en que pague.',
    to_char(v_tasa_fecha, 'DD/MM/YYYY')) end;

  v_vence  := case when r.vence_el is not null
                   then to_char(r.vence_el, 'DD/MM/YYYY') else null end;

  -- A qué cuenta va cada parte (ver la cabecera de la migración).
  v_hon  := case when exists (select 1 from datos_pago x where x.edificio_id = r.edificio_id and x.destino = 'honorarios')
                 then least(greatest(coalesce(r.honorario, 0) + coalesce(r.anterior_hon, 0), 0), greatest(r.total, 0))
                 else 0 end;
  v_cond := greatest(r.total, 0) - v_hon;
  v_pago_html := datos_pago_html(r.edificio_id, v_cond, v_hon, v_tasa, true);
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

  for d in
    select * from destinatarios_de(r.unidad_id)
     where enviar and correo is not null
  loop
    rol := d.rol;
    destino := d.correo;
    responder_a := r.responder_a;
    asunto := format('Su recibo de condominio · %s · %s', r.codigo, r.etiqueta);
    org_id := r.org_id;
    unidad_id := r.unidad_id;

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
      case when v_bs is null then ''
           else format('<div style="font-size:15px;font-weight:700;margin-top:2px">%s</div>'
                       '<div style="font-size:12px;color:#66668A;line-height:1.5;margin-top:2px">%s</div>',
                       v_bs, esc_html(v_frase)) end,
      case when v_vence is null then ''
           else format('<div style="font-size:12.5px;color:#8A5A00;margin-top:6px">Vence el %s</div>', v_vence) end,
      esc_html(r.numero),
      v_pago_html,
      esc_html(v_enlace), esc_html(r.org));

    texto := format($t$%s,

Ya está disponible el recibo de condominio de %s para la unidad %s.
%s
Total a pagar: %s%s
Recibo: %s%s
%s
Véalo y reporte su pago aquí:
%s

%s$t$,
      coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino'), r.etiqueta, r.codigo,
      v_nota_txt,
      v_total,
      case when v_bs is null then '' else E'\n' || v_bs || E'\n' || v_frase end,
      r.numero,
      case when v_vence is null then '' else E'\nVence el ' || v_vence end,
      v_pago_txt,
      v_enlace, r.org);

    return next;
  end loop;
end $function$;

drop function if exists public.asegurar_invitaciones_recibo(uuid);
drop function if exists public.invitacion_para_recibo(uuid, uuid, text, text);
drop function if exists public.codigo_invitacion_vigente(uuid, text);
drop function if exists public.acceso_a_unidad(uuid, text);
drop table if exists public.invitaciones_codigo;

commit;

-- Verificación después de revertir:
--   select proname, md5(prosrc) from pg_proc
--    where proname in ('correo_recibo', 'encolar_recibos', 'crear_invitacion');
--   -- correo_recibo 83afc196154108cf42d6fa594f36becd
--   -- encolar_recibos eed96621a90138d3cf3b97e257779657
--   -- crear_invitacion d5807ae08c2fb3415f04056493b5e5a7
--   select to_regclass('public.invitaciones_codigo');   -- null
