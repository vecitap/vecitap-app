-- Reverso de 20261027160000_correos_estado_y_cupo.sql (ronda 8, A4 y C2).
--
-- Vuelve el despachador y las funciones de mensajes a las de
-- 20261026170000_mensajes_masivos.sql (los cuerpos de abajo, tal cual), borra
-- las funciones nuevas (cupo, estado por recibo, reenviar, unidades del
-- mensaje) y las columnas nuevas de la cola y de mensajes, y deja el índice y
-- el tipo de la cola como estaban.
-- **Los correos de tipo 'reenvio' se borran de la cola** (el tipo deja de
-- existir); los que ya salieron, salieron. Se pierde el estado de entrega
-- guardado (columna evento).

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.despachar_correos(integer)', 'ab2d4304b921029146ec19ca9220d00f'),
      ('public.historial_mensajes(uuid)', 'b9796ea27ab686f9ae7061ad126fabdc'),
      ('public.enviar_mensaje(uuid,text,text,text,uuid[])', '7185c20292fabff8d0bcaca50452c13b'),
      ('public.vista_previa_mensaje(uuid,text,uuid[])', '0835cbe11e2386ddd21cb8fb2732e35d'),
      ('public.destinatarios_mensaje(uuid,text,uuid[])', '5e46454840e7ceebaa3cf905ef65bde3')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no son las de la ronda 8:%', malas; end if;
end
$guarda$;

drop function public.reenviar_recibo(uuid);
drop function public.estado_correos_periodo(uuid);
drop function public.historial_mensajes(uuid);
drop function public.enviar_mensaje(uuid, text, text, text, uuid[]);
drop function public.vista_previa_mensaje(uuid, text, uuid[]);
drop function public.unidades_mensaje(uuid, text);
drop function public.destinatarios_mensaje(uuid, text, uuid[]);
drop function public.cupo_correo();

create or replace function public.despachar_correos(p_tanda integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'net'
    AS $$
declare
  v_clave text; v_remitente text; v_nombre text;
  v_tope int; v_usados int; v_libre int; v_cuenta int;   -- Ronda 7 (bloque 7)
  r record; v_status int; v_body text;
  v_recogidos int := 0; v_ok int := 0; v_mal int := 0; v_mandados int := 0;
  v_req bigint;
begin
  -- a) recoger lo que quedó esperando respuesta
  for r in select c.id, c.request_id, c.intentos, c.destino
             from cola_correo c
            where c.estado = 'pendiente' and c.request_id is not null
  loop
    select rp.status_code, rp.content into v_status, v_body
      from net._http_response rp where rp.id = r.request_id;

    if v_status is null then continue; end if;   -- todavía no responde
    v_recogidos := v_recogidos + 1;

    if v_status between 200 and 299 then
      update cola_correo
         set estado = 'enviado', enviado_en = now(), request_id = null,
             proveedor_id = (v_body::jsonb ->> 'id'), ultimo_error = null
       where id = r.id;
      v_ok := v_ok + 1;
    else
      -- 422 con "invalid" suele ser una dirección que no existe
      if v_status = 422 and v_body ilike '%invalid%' then
        insert into correos_malos (correo, motivo)
        values (r.destino, left(coalesce(v_body, ''), 300))
        on conflict (correo) do nothing;
      end if;

      update cola_correo
         set request_id = null,
             ultimo_error = left(coalesce(v_body, 'sin respuesta'), 500),
             estado = case when r.intentos >= 3 then 'fallido' else 'pendiente' end
       where id = r.id;
      v_mal := v_mal + 1;
    end if;
  end loop;

  -- b) mandar una tanda nueva
  select valor into v_clave from secretos where nombre = 'resend_api_key';
  if v_clave is null then
    insert into tareas_log (tarea, detalle) values ('despachar_correos',
      jsonb_build_object('error', 'falta la clave de Resend'));
    return jsonb_build_object('error', 'falta la clave de Resend');
  end if;

  select valor into v_remitente from secretos where nombre = 'correo_remitente';

  -- Ronda 7 (bloque 7): el tope diario del plan de Resend (el gratuito: 100
  -- por día). Se cuenta lo mandado en las últimas 24 horas (cada copia, una
  -- más); lo que no cabe espera en la cola y sale cuando se libera cupo, así
  -- que un envío grande se reparte en varios días en vez de fallar. El tope
  -- se cambia con el secreto 'correo_tope_diario' (el plan pago).
  v_tope := coalesce((select case when btrim(valor) ~ '^\d+$' then btrim(valor)::int end
                        from secretos where nombre = 'correo_tope_diario'), 100);
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  v_libre := greatest(v_tope - v_usados, 0);

  for r in select c.*, coalesce(ac.remitente, o.nombre) as visible
             from cola_correo c
             join organizaciones o on o.id = c.org_id
             left join ajustes_correo ac on ac.org_id = c.org_id
            where c.estado = 'pendiente' and c.request_id is null
              and c.intentos < 3
            -- Primero los recibos y los avisos; los mensajes masivos, después.
            order by (c.tipo = 'mensaje'), c.encolado_en
            limit least(p_tanda, v_libre)
  loop
    v_cuenta := case when r.copia is not null then 2 else 1 end;
    exit when v_libre < v_cuenta;
    v_libre := v_libre - v_cuenta;

    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_clave,
        'Content-Type', 'application/json'),
      body := jsonb_strip_nulls(jsonb_build_object(
        'from', r.visible || ' <' || v_remitente || '>',
        'to', jsonb_build_array(r.destino),
        'cc', case when r.copia is not null then jsonb_build_array(r.copia) end,
        'reply_to', r.responder_a,
        'subject', r.asunto,
        'html', r.html,
        'text', r.texto)),
      timeout_milliseconds := 12000)
      into v_req;

    update cola_correo
       set request_id = v_req, intentos = intentos + 1, mandado_en = now()
     where id = r.id;
    v_mandados := v_mandados + 1;
  end loop;

  insert into tareas_log (tarea, detalle) values ('despachar_correos',
    jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                       'fallidos', v_mal, 'mandados', v_mandados,
                       'tope', v_tope, 'libre', v_libre));

  return jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                            'fallidos', v_mal, 'mandados', v_mandados);
exception when others then
  insert into tareas_log (tarea, detalle)
    values ('despachar_correos', jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('error', sqlerrm);
end $$;

drop function public.puesto_en_cola(boolean, timestamptz);
drop function public.momento_cupo(integer);
drop function public.tope_correo();

create function public.destinatarios_mensaje(p_edificio uuid, p_filtro text)
  returns table(correo text, copia text, nombre text)
  language sql
  stable security definer
  set search_path to 'public'
  as $function$
  with vig as (
    select lower(btrim(pe.correo)) as correo,
           nullif(lower(btrim(coalesce(pe.correo_respaldo, ''))), '') as respaldo,
           concat_ws(' ', pe.prefijo, pe.nombre) as nombre
      from vinculos v
      join personas pe on pe.id = v.persona_id
      join unidades u on u.id = v.unidad_id
     where u.edificio_id = p_edificio and u.activa and v.hasta is null
       and nullif(btrim(coalesce(pe.correo, '')), '') is not null
       and case p_filtro
             when 'propietarios' then v.tipo = 'propietario'
             when 'inquilinos'   then v.tipo = 'inquilino'
             when 'deudores'     then v.tipo = coalesce(u.paga, 'propietario')
                                      and (select s.total from saldo_unidad(u.id) s) > 0.009
             else true end
  )
  select g.correo,
         (select x.respaldo from vig x
           where x.correo = g.correo and x.respaldo is not null and x.respaldo <> g.correo
             and not exists (select 1 from correos_malos m where m.correo = x.respaldo)
           limit 1),
         (select x.nombre from vig x where x.correo = g.correo limit 1)
    from (select distinct correo from vig) g
   where not exists (select 1 from correos_malos m where m.correo = g.correo)
   order by 1
$function$;

revoke all on function public.destinatarios_mensaje(uuid, text) from public, anon, authenticated;

create function public.vista_previa_mensaje(p_edificio uuid, p_filtro text)
  returns jsonb
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare
  v_org uuid; v_n int; v_copias int; v_tope int; v_usados int; v_cola int; v_libre int; v_total int;
begin
  select org_id into v_org from edificios where id = p_edificio;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;

  select count(*), count(copia) into v_n, v_copias from destinatarios_mensaje(p_edificio, p_filtro);
  v_tope := coalesce((select case when btrim(valor) ~ '^\d+$' then btrim(valor)::int end
                        from secretos where nombre = 'correo_tope_diario'), 100);
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  -- Lo que ya espera en la cola (de cualquier organización: el cupo es uno).
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_cola
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3;
  v_libre := greatest(v_tope - v_usados, 0);
  v_total := v_cola + v_n + v_copias;

  return jsonb_build_object(
    'destinatarios', v_n,
    'con_copia', v_copias,
    'correos', v_n + v_copias,
    'tope', v_tope,
    'libre_hoy', v_libre,
    'en_cola', v_cola,
    -- 1 = sale todo hoy; 2 = una parte hoy y el resto mañana; etc.
    'dias', case when v_total <= v_libre then 1
                 else 1 + ceil((v_total - v_libre)::numeric / greatest(v_tope, 1))::int end);
end $function$;

create function public.enviar_mensaje(p_edificio uuid, p_asunto text, p_texto text, p_filtro text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare
  v_org uuid; v_org_nombre text; v_edificio text; v_responder text; v_id uuid;
  v_asunto text := btrim(coalesce(p_asunto, ''));
  v_texto text := btrim(coalesce(p_texto, ''));
  v_html text; v_n int := 0; d record;
begin
  select e.org_id, e.nombre, o.nombre into v_org, v_edificio, v_org_nombre
    from edificios e join organizaciones o on o.id = e.org_id where e.id = p_edificio;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  if p_filtro not in ('todos', 'propietarios', 'inquilinos', 'deudores') then
    raise exception 'Elija a quién va el mensaje.';
  end if;
  if v_asunto = '' then raise exception 'Falta el asunto.'; end if;
  if v_texto = '' then raise exception 'Falta el texto del mensaje.'; end if;

  -- Un doble toque no lo manda dos veces.
  if exists (select 1 from mensajes m
              where m.edificio_id = p_edificio and m.asunto = v_asunto and m.texto = v_texto
                and m.destinatarios = p_filtro and m.creado_en > now() - interval '2 minutes') then
    raise exception 'Ese mismo mensaje ya se envió hace un momento.';
  end if;

  select ac.responder_a into v_responder from ajustes_correo ac where ac.org_id = v_org;

  insert into mensajes (org_id, edificio_id, asunto, texto, destinatarios)
  values (v_org, p_edificio, v_asunto, v_texto, p_filtro)
  returning id into v_id;

  v_html := format($h$<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F1EC;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111144">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#66668A;font-weight:700">%s</div>
  <div style="font-size:19px;font-weight:700;margin:2px 0 18px">%s</div>
  <div style="background:#fff;border:1px solid #E6E3EC;border-radius:14px;padding:20px">
    <div style="font-size:16px;font-weight:700;margin-bottom:10px">%s</div>
    <div style="font-size:14px;line-height:1.65;color:#111144">%s</div>
  </div>
  <p style="font-size:11.5px;color:#66668A;line-height:1.6;margin-top:16px">
    Este mensaje lo envía %s a través de Vecitap.</p>
</div></body></html>$h$,
    esc_html(v_org_nombre), esc_html(v_edificio), esc_html(v_asunto),
    replace(esc_html(v_texto), E'\n', '<br>'), esc_html(v_org_nombre));

  for d in select * from destinatarios_mensaje(p_edificio, p_filtro) loop
    insert into cola_correo (org_id, tipo, destino, copia, responder_a, asunto, html, texto, mensaje_id)
    values (v_org, 'mensaje', d.correo, d.copia, v_responder, v_asunto, v_html,
            v_texto || E'\n\n--\n' || v_org_nombre || ' · ' || v_edificio, v_id);
    v_n := v_n + 1;
  end loop;

  update mensajes set cantidad = v_n where id = v_id;
  return jsonb_build_object('mensaje_id', v_id, 'encolados', v_n);
end $function$;

revoke all on function public.vista_previa_mensaje(uuid, text) from public, anon;
revoke all on function public.enviar_mensaje(uuid, text, text, text) from public, anon;
grant execute on function public.vista_previa_mensaje(uuid, text) to authenticated;
grant execute on function public.enviar_mensaje(uuid, text, text, text) to authenticated;

create function public.historial_mensajes(p_edificio uuid)
  returns table(id uuid, asunto text, texto text, destinatarios text, cantidad integer,
                creado_en timestamptz, enviados integer, pendientes integer, fallidos integer)
  language sql
  stable
  set search_path to 'public'
  as $function$
  select m.id, m.asunto, m.texto, m.destinatarios, m.cantidad, m.creado_en,
         count(c.id) filter (where c.estado = 'enviado')::int,
         count(c.id) filter (where c.estado = 'pendiente')::int,
         count(c.id) filter (where c.estado = 'fallido')::int
    from mensajes m
    left join cola_correo c on c.mensaje_id = m.id
   where m.edificio_id = p_edificio
   group by m.id
   order by m.creado_en desc
   limit 50
$function$;

delete from public.cola_correo where tipo = 'reenvio';
drop index if exists public.cola_por_recibo;
drop index public.cola_un_correo_por_recibo;
create unique index cola_un_correo_por_recibo on public.cola_correo (recibo_id, tipo, destino)
  where recibo_id is not null and estado <> 'cancelado';
alter table public.cola_correo drop constraint cola_correo_tipo_check;
alter table public.cola_correo add constraint cola_correo_tipo_check
  check (tipo = any (array['recibo', 'mora', 'pago_confirmado', 'pago_rechazado', 'prueba', 'visita', 'mensaje']));
alter table public.cola_correo
  drop column evento, drop column evento_en, drop column evento_req, drop column evento_consultado;
alter table public.mensajes drop column unidades;

commit;

-- Verificación: md5(prosrc) de despachar_correos → 734b58aa8b3e953b70774e054a62ec22;
-- historial_mensajes → 16ae46ccaa9ed2cda79466d5808338d0;
-- select to_regprocedure('public.cupo_correo()');  → null.
