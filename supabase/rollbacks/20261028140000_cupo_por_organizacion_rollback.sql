-- Reverso de 20261028140000_cupo_por_organizacion.sql (ronda 9, C3 y A4).
--
-- Vuelve cupo_correo() y despachar_correos() a los de
-- 20261027160000_correos_estado_y_cupo.sql, tal cual: toda administradora
-- vuelve a ver el cupo de toda la cuenta y el aviso vuelve a la ventana de 20
-- horas.

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.cupo_correo()', '969a97d27dc5380fbb51bc4578a65e33'),
      ('public.despachar_correos(integer)', 'e2b9a8ad1adee36bed93e9ccb80ecdb9')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no son las de la ronda 9:%', malas; end if;
end
$guarda$;

create or replace function public.cupo_correo() returns jsonb
  language plpgsql stable security definer set search_path to 'public'
  as $function$
declare v_tope int := tope_correo(); v_usados int; v_cola int;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if not (es_operador() or exists (select 1 from membresias m where m.usuario_id = auth.uid() and m.activo
                                     and m.rol in ('propietario_cuenta', 'administrador'))) then
    raise exception 'Sin permiso';
  end if;
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_cola
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3;
  return jsonb_build_object(
    'tope', v_tope, 'usados', v_usados, 'libre', greatest(v_tope - v_usados, 0),
    'en_cola', v_cola,
    -- Cuándo sale lo último que espera hoy (null: más de un día).
    'sale_todo_en', case when v_cola = 0 then null else momento_cupo(v_cola) end,
    'ultimo_aviso', (select t.corrida_en from tareas_log t where t.tarea = 'cupo_correo'
                      order by t.corrida_en desc limit 1));
end $function$;

create or replace function public.despachar_correos(p_tanda integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'net'
    AS $$
declare
  v_clave text; v_remitente text; v_nombre text;
  v_tope int; v_usados int; v_libre int; v_cuenta int;   -- Ronda 7 (bloque 7)
  -- Ronda 8: Resend acepta 10 pedidos por segundo; cada vuelta hace como
  -- mucho 8 (envíos y consultas de estado juntos).
  v_por_vuelta constant int := 8;
  v_consultas int := 0; v_eventos int := 0; v_espera int; v_operador text;
  v_consultar boolean;
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

  -- a2) Ronda 8: recoger las consultas de estado (GET /emails/{id}).
  for r in select c.id, c.evento_req, c.destino from cola_correo c where c.evento_req is not null loop
    select rp.status_code, rp.content into v_status, v_body
      from net._http_response rp where rp.id = r.evento_req;
    if v_status is null then
      -- Sin respuesta en una hora (pg_net la descartó): se vuelve a preguntar.
      update cola_correo set evento_req = null
       where id = r.id and evento_consultado < now() - interval '1 hour';
      continue;
    end if;
    -- En su propio bloque: una respuesta rara no deshace la vuelta entera.
    begin
      update cola_correo
         set evento = case when v_status between 200 and 299
                           then coalesce(nullif(v_body::jsonb ->> 'last_event', ''), evento) else evento end,
             evento_en = case when v_status between 200 and 299 then now() else evento_en end,
             evento_req = null
       where id = r.id;
      -- Un rebote o una queja: no se le vuelve a escribir a esa dirección.
      if v_status between 200 and 299 and (v_body::jsonb ->> 'last_event') in ('bounced', 'complained') then
        insert into correos_malos (correo, motivo)
        values (r.destino, 'Resend: ' || (v_body::jsonb ->> 'last_event'))
        on conflict (correo) do nothing;
      end if;
      v_eventos := v_eventos + 1;
    exception when others then
      update cola_correo set evento_req = null where id = r.id;
    end;
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
  v_tope := tope_correo();
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
            limit least(p_tanda, v_libre, v_por_vuelta)
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

  -- c) Ronda 8: preguntarle a Resend cómo les fue a los ya enviados (no
  -- gasta cupo). Recibos, reenvíos y mensajes de los últimos 3 días, hasta
  -- que se sepa si se entregó (o rebotó, o se abrió); los entregados se
  -- vuelven a mirar cada 6 horas por si los abren.
  -- **Apagado por omisión**: una clave de Resend «Sending access» (la que
  -- tienen las dos bases al 27-oct) no puede leer correos (401
  -- restricted_api_key). Se enciende con el secreto
  -- correo_consultar_estado = 'si', con una clave «Full access».
  v_consultar := coalesce((select btrim(valor) from secretos where nombre = 'correo_consultar_estado'), '') = 'si';
  for r in select c.id, c.proveedor_id from cola_correo c
            where v_consultar
              and c.estado = 'enviado' and c.proveedor_id is not null and c.evento_req is null
              and c.tipo in ('recibo', 'reenvio', 'mensaje')
              and c.enviado_en > now() - interval '3 days'
              and coalesce(c.evento, '') not in ('bounced', 'complained', 'opened', 'clicked')
              and (c.evento_consultado is null
                   or c.evento_consultado < now() - case when c.evento = 'delivered' then interval '6 hours'
                                                         else interval '15 minutes' end)
            order by c.evento_consultado nulls first, c.enviado_en
            limit greatest(v_por_vuelta - v_mandados, 0)
  loop
    select net.http_get(
      url := 'https://api.resend.com/emails/' || r.proveedor_id,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_clave),
      timeout_milliseconds := 8000)
      into v_req;
    update cola_correo set evento_req = v_req, evento_consultado = now() where id = r.id;
    v_consultas := v_consultas + 1;
  end loop;

  -- d) Ronda 8: se acabó el cupo y quedan correos esperando → aviso a
  -- Vecitap, una vez por día (no unidad por unidad).
  select count(*) into v_espera from cola_correo c
   where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3;
  if v_espera > 0 and v_libre = 0
     and not exists (select 1 from tareas_log t where t.tarea = 'cupo_correo'
                      and t.corrida_en > now() - interval '20 hours') then
    insert into tareas_log (tarea, detalle) values ('cupo_correo',
      jsonb_build_object('esperan', v_espera, 'tope', v_tope, 'sale_todo_en', momento_cupo(v_espera)));
    select valor into v_operador from secretos where nombre = 'correo_operador';
    if v_operador is not null and v_remitente is not null then
      -- Fuera de la cola: un solo correo, dentro del margen del tope.
      perform net.http_post(
        url := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_clave, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'from', 'Vecitap <' || v_remitente || '>',
          'to', jsonb_build_array(v_operador),
          'subject', 'Vecitap: se acabó el cupo diario de correos',
          'text', format('Se llegó al tope de %s correos en 24 horas. Quedan %s correos esperando en la cola; salen solos a medida que se libera cupo (el último, alrededor de %s, hora de Venezuela). Para mandar más por día hay que subir de plan en Resend y cambiar el secreto correo_tope_diario.',
                         v_tope, v_espera,
                         coalesce(to_char(momento_cupo(v_espera) at time zone 'America/Caracas', 'DD/MM HH24:MI'), 'más de un día'))),
        timeout_milliseconds := 12000);
    end if;
  end if;

  insert into tareas_log (tarea, detalle) values ('despachar_correos',
    jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                       'fallidos', v_mal, 'mandados', v_mandados,
                       'tope', v_tope, 'libre', v_libre,
                       'consultas', v_consultas, 'eventos', v_eventos));

  return jsonb_build_object('recogidos', v_recogidos, 'enviados', v_ok,
                            'fallidos', v_mal, 'mandados', v_mandados,
                            'consultas', v_consultas, 'eventos', v_eventos);
exception when others then
  insert into tareas_log (tarea, detalle)
    values ('despachar_correos', jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('error', sqlerrm);
end $$;

commit;

-- Verificación: md5 de cupo_correo → 39d8311ecc9260f2e653f87dd3bd0e07 y de
-- despachar_correos → ab2d4304b921029146ec19ca9220d00f (los de la ronda 8).
