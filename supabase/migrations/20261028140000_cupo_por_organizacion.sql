-- El cupo de correos que ve cada administradora y el aviso a Vecitap una vez
-- por día (ronda 9, bloques C3 y A4).
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). **Va después de 20261027160000_correos_estado_y_cupo.sql** (la
-- guarda exige su cupo_correo() y su despachar_correos()). Rollback:
-- supabase/rollbacks/20261028140000_cupo_por_organizacion_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. cupo_correo() (C3, revisión cruzada de la ronda 8): le mostraba a
--    cualquier administradora los correos de toda la cuenta de Resend,
--    incluidos los de otros clientes. Ahora:
--      · el operador ve lo mismo que antes (todo, y cuándo fue el último
--        aviso de cupo);
--      · una administradora ve lo de SU organización: `usados` (lo que mandó
--        en 24 horas), `en_cola` (lo que tiene esperando) y `sale_todo_en`
--        (cuándo sale lo último suyo, con su puesto real en la cola); y
--        `libre`, lo que queda hoy para ella: el tope menos lo mandado por
--        todos y menos lo que otros ya tienen esperando delante. Es un solo
--        número, no dice de quién es cada correo. `ultimo_aviso` va en null.
--    Lo que devuelve tiene las mismas claves: la pantalla no cambia de forma.
-- 2. despachar_correos() (A4): el aviso a Vecitap de «se acabó el cupo»
--    salía si no había otro en las últimas 20 horas; ahora, si no hubo otro
--    en el día de Venezuela (`inicio_dia_local(hoy_local())`). Una sola vez
--    por día, también si el primero salió de madrugada. Nada más cambia.

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.cupo_correo()', '39d8311ecc9260f2e653f87dd3bd0e07'),
      ('public.despachar_correos(integer)', 'ab2d4304b921029146ec19ca9220d00f')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: cambiaron:%  ¿Falta 20261027160000_correos_estado_y_cupo.sql?', malas; end if;
end
$guarda$;

create or replace function public.cupo_correo() returns jsonb
  language plpgsql stable security definer set search_path to 'public'
  as $function$
declare
  v_tope int := tope_correo(); v_usados int; v_cola int;
  v_operador boolean := es_operador(); v_orgs uuid[];
  v_mios_usados int; v_mios_cola int; v_ult record;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if not v_operador then
    select array_agg(m.org_id) into v_orgs from membresias m
     where m.usuario_id = auth.uid() and m.activo and m.rol in ('propietario_cuenta', 'administrador');
    if v_orgs is null then raise exception 'Sin permiso'; end if;
  end if;
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_cola
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3;

  if v_operador then
    return jsonb_build_object(
      'tope', v_tope, 'usados', v_usados, 'libre', greatest(v_tope - v_usados, 0),
      'en_cola', v_cola,
      -- Cuándo sale lo último que espera hoy (null: más de un día).
      'sale_todo_en', case when v_cola = 0 then null else momento_cupo(v_cola) end,
      'ultimo_aviso', (select t.corrida_en from tareas_log t where t.tarea = 'cupo_correo'
                        order by t.corrida_en desc limit 1));
  end if;

  -- Ronda 9 (C3): la administradora ve solo lo de su organización —lo que
  -- mandó en 24 horas, lo que tiene esperando y cuándo sale lo último suyo—
  -- y el cupo que queda hoy para ella: el tope menos lo mandado por todos y
  -- lo que otros ya tienen esperando delante. Nada por cliente.
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_mios_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours' and c.org_id = any(v_orgs);
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_mios_cola
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3
     and c.org_id = any(v_orgs);
  -- El último suyo en salir: los mensajes masivos van después de lo demás.
  select (c.tipo = 'mensaje') as mensaje, c.encolado_en into v_ult
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3
     and c.org_id = any(v_orgs)
   order by (c.tipo = 'mensaje') desc, c.encolado_en desc limit 1;
  return jsonb_build_object(
    'tope', v_tope, 'usados', v_mios_usados,
    'libre', greatest(v_tope - v_usados - (v_cola - v_mios_cola), 0),
    'en_cola', v_mios_cola,
    'sale_todo_en', case when v_mios_cola = 0 then null
                         else momento_cupo(puesto_en_cola(v_ult.mensaje, v_ult.encolado_en)) end,
    'ultimo_aviso', null);
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
     -- Ronda 9 (A4): una vez por día de Venezuela (antes, 20 horas desde el
     -- último: dos avisos el mismo día si el primero era de madrugada).
     and not exists (select 1 from tareas_log t where t.tarea = 'cupo_correo'
                      and t.corrida_en >= inicio_dia_local(hoy_local())) then
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

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in ('cupo_correo','despachar_correos');
--    -- Esperado: cupo_correo 969a97d27dc5380fbb51bc4578a65e33, despachar_correos e2b9a8ad1adee36bed93e9ccb80ecdb9.
--    select array_to_string(proacl, ',') from pg_proc where proname = 'cupo_correo';
--    -- Esperado: los mismos permisos de antes (authenticated sí, anon no).
-- 2. Como una administradora (set local role authenticated + su sub en
--    request.jwt.claims), en una transacción deshecha:
--      select public.cupo_correo();
--    -- Esperado: `usados` y `en_cola` cuentan solo correos de su
--    --   organización; `ultimo_aviso` null. Como el operador: lo mismo de
--    --   antes (todo).
-- 3. El aviso: select count(*) from tareas_log where tarea = 'cupo_correo'
--      and corrida_en >= inicio_dia_local(hoy_local());   -- 0 o 1, nunca más.
