-- Reverso de 20261026170000_mensajes_masivos.sql (ronda 7, bloque 7).
--
-- Vuelve `despachar_correos()` a como estaba (el cuerpo de abajo, tal cual:
-- sin tope diario) y borra las funciones de mensajes, la tabla `mensajes` (se
-- pierde el historial) y las columnas nuevas de `cola_correo`.
-- **Antes de revertir:** los mensajes que sigan en la cola sin mandar se
-- cancelan acá mismo (la cola vieja no conoce el tipo 'mensaje').

begin;

update public.cola_correo set estado = 'cancelado'
 where tipo = 'mensaje' and estado = 'pendiente';

create or replace function public.despachar_correos(p_tanda integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'net'
    AS $$
declare
  v_clave text; v_remitente text; v_nombre text;
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

  for r in select c.*, coalesce(ac.remitente, o.nombre) as visible
             from cola_correo c
             join organizaciones o on o.id = c.org_id
             left join ajustes_correo ac on ac.org_id = c.org_id
            where c.estado = 'pendiente' and c.request_id is null
              and c.intentos < 3
            order by c.encolado_en
            limit p_tanda
  loop
    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_clave,
        'Content-Type', 'application/json'),
      body := jsonb_strip_nulls(jsonb_build_object(
        'from', r.visible || ' <' || v_remitente || '>',
        'to', jsonb_build_array(r.destino),
        'reply_to', r.responder_a,
        'subject', r.asunto,
        'html', r.html,
        'text', r.texto)),
      timeout_milliseconds := 12000)
      into v_req;

    update cola_correo
       set request_id = v_req, intentos = intentos + 1
     where id = r.id;
    v_mandados := v_mandados + 1;
  end loop;

  insert into tareas_log (tarea, detalle) values ('despachar_correos',
    jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                       'fallidos', v_mal, 'mandados', v_mandados));

  return jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                            'fallidos', v_mal, 'mandados', v_mandados);
exception when others then
  insert into tareas_log (tarea, detalle)
    values ('despachar_correos', jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('error', sqlerrm);
end $$;

drop function if exists public.enviar_mensaje(uuid, text, text, text);
drop function if exists public.vista_previa_mensaje(uuid, text);
drop function if exists public.historial_mensajes(uuid);
drop function if exists public.destinatarios_mensaje(uuid, text);

delete from public.cola_correo where tipo = 'mensaje';
alter table public.cola_correo drop constraint if exists cola_correo_tipo_check;
alter table public.cola_correo add constraint cola_correo_tipo_check
  check (tipo = any (array['recibo', 'mora', 'pago_confirmado', 'pago_rechazado', 'prueba', 'visita']));
drop index if exists public.cola_mandados;
alter table public.cola_correo
  drop column if exists mensaje_id,
  drop column if exists copia,
  drop column if exists mandado_en;
drop table if exists public.mensajes;

commit;

-- Verificación después de revertir:
--   select md5(prosrc) from pg_proc where oid = 'public.despachar_correos(integer)'::regprocedure;
--   -- 9c5e5a398a3af2f356f15c36095d6e66
--   select to_regclass('public.mensajes');   -- null
