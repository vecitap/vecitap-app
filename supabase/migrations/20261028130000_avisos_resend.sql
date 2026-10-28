-- Avisos de Resend: entregado, rebotado, demorado, spam, abierto (ronda 9,
-- bloque A3).
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). **Va después de 20261027160000_correos_estado_y_cupo.sql**
-- (usa `cola_correo.evento`/`evento_en` y `correos_malos`; la guarda lo
-- comprueba). Rollback:
-- supabase/rollbacks/20261028130000_avisos_resend_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CÓMO LLEGA UN AVISO
-- ─────────────────────────────────────────────────────────────────────────
-- Resend manda cada evento (un POST firmado con Svix) a la ruta
-- `app/api/resend/route.ts` de la app. La ruta verifica la firma con
-- RESEND_WEBHOOK_SECRET (variable de entorno de Vercel, nunca en el repo) y
-- recién entonces llama a registrar_evento_correo(), con la clave anónima de
-- Supabase (no hay sesión: lo llama Resend, no una persona).
--
-- Por eso la función no confía en quien la llama: exige como primer
-- argumento el mismo secreto del webhook, y lo compara contra su sha256,
-- guardado en `secretos` con el nombre 'webhook_resend_sha256' (la tabla no
-- es legible desde la app: RLS sin políticas). La base no guarda el secreto,
-- solo su huella. Sin esa fila, o con otro secreto, «Sin permiso».
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- · Busca el correo por `cola_correo.proveedor_id` (el id que devolvió
--   Resend al mandarlo). **Pruebas y producción usan la misma cuenta de
--   Resend**, así que cada webhook recibe los eventos de los correos de las
--   dos bases: si el id no está en esta cola, devuelve 'no es de esta base'
--   y no toca nada.
-- · Guarda el evento en `evento`/`evento_en`, con los mismos nombres que ya
--   usa la pantalla de Cortes (los de `last_event` de Resend): delivered,
--   delivery_delayed, opened, clicked, complained, bounced.
-- · No retrocede: los avisos pueden llegar fuera de orden (un «abierto»
--   antes que el «entregado»). Orden: demorado < entregado < abierto <
--   clic < spam < rebotó; uno de menor rango no pisa a uno mayor.
-- · Un rebote o una queja de spam anota la dirección en `correos_malos`,
--   como ya hace el despachador cuando lo consulta (no se le vuelve a
--   escribir). Si el correo llevaba copia (mensajes masivos con el correo
--   de respaldo en copia), no se anota ninguna: el aviso no dice cuál de las
--   dos rebotó. La pantalla dice igual «Rebotó».
-- · 'email.sent' y lo demás se ignoran ('ignorado').
-- Un índice por proveedor_id, para que la búsqueda no recorra la cola.

begin;

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cola_correo' and column_name = 'evento_en') then
    raise exception 'ABORTADA: falta cola_correo.evento_en. ¿Falta 20261027160000_correos_estado_y_cupo.sql?';
  end if;
  if to_regprocedure('public.registrar_evento_correo(text, text, text, timestamptz)') is not null then
    raise exception 'ABORTADA: registrar_evento_correo ya existe';
  end if;
end
$guarda$;

create index cola_por_proveedor on public.cola_correo (proveedor_id) where proveedor_id is not null;

create function public.registrar_evento_correo(p_clave text, p_tipo text, p_email_id text, p_en timestamptz default null)
  returns text
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
  as $function$
declare v_hash text; v_evento text; v_rango int; v_n int;
begin
  select valor into v_hash from secretos where nombre = 'webhook_resend_sha256';
  if v_hash is null or coalesce(p_clave, '') = ''
     or encode(digest(p_clave, 'sha256'), 'hex') <> lower(btrim(v_hash)) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  v_evento := case p_tipo
    when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.delivered'        then 'delivered'
    when 'email.opened'           then 'opened'
    when 'email.clicked'          then 'clicked'
    when 'email.complained'       then 'complained'
    when 'email.bounced'          then 'bounced'
  end;
  if v_evento is null or coalesce(btrim(p_email_id), '') = '' then return 'ignorado'; end if;

  -- La cuenta de Resend es la misma para las dos bases: un correo que no está
  -- en esta cola es de la otra.
  if not exists (select 1 from cola_correo c where c.proveedor_id = p_email_id) then
    return 'no es de esta base';
  end if;

  v_rango := case v_evento when 'delivery_delayed' then 1 when 'delivered' then 2 when 'opened' then 3
                           when 'clicked' then 4 when 'complained' then 5 when 'bounced' then 6 end;
  update cola_correo c
     set evento = v_evento, evento_en = coalesce(p_en, now())
   where c.proveedor_id = p_email_id
     and v_rango >= case c.evento when 'delivery_delayed' then 1 when 'delivered' then 2 when 'opened' then 3
                                  when 'clicked' then 4 when 'complained' then 5 when 'bounced' then 6 else 0 end;
  get diagnostics v_n = row_count;

  -- Un rebote o una queja: no se le vuelve a escribir a esa dirección.
  if v_evento in ('bounced', 'complained') then
    insert into correos_malos (correo, motivo)
    select distinct lower(btrim(c.destino)), 'Resend: ' || v_evento
      from cola_correo c
     where c.proveedor_id = p_email_id and c.copia is null
    on conflict (correo) do nothing;
  end if;

  return case when v_n > 0 then v_evento else 'sin cambio' end;
end $function$;

revoke all on function public.registrar_evento_correo(text, text, text, timestamptz) from public;
grant execute on function public.registrar_evento_correo(text, text, text, timestamptz) to anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- DESPUÉS DE APLICARLA (dato, no migración; lo corre Nicolás)
-- ─────────────────────────────────────────────────────────────────────────
-- La huella del secreto del webhook de ESTA base (cada base tiene su propio
-- webhook en Resend, con su propio secreto «whsec_…»):
--   insert into public.secretos (nombre, valor)
--   values ('webhook_resend_sha256', encode(extensions.digest('<whsec_… de Resend>', 'sha256'), 'hex'))
--   on conflict (nombre) do update set valor = excluded.valor, actualizado = now();
-- (Así la base guarda la huella, no el secreto; el secreto queda solo en
-- Resend y en la variable RESEND_WEBHOOK_SECRET de Vercel.)
--
-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), prosecdef, proconfig from pg_proc where proname = 'registrar_evento_correo';
--    -- Esperado: feb53cdc2d8cc0ad3c7319d5cd04ce7c, true, {"search_path=public, extensions"}.
--    select has_function_privilege('anon', 'public.registrar_evento_correo(text,text,text,timestamptz)', 'execute');  -- true
--    select count(*) from pg_indexes where indexname = 'cola_por_proveedor';  -- 1
-- 2. En una transacción deshecha (begin; … rollback;), como postgres:
--      insert into secretos values ('webhook_resend_sha256', encode(extensions.digest('clave-de-prueba','sha256'),'hex'), now())
--        on conflict (nombre) do update set valor = excluded.valor;
--      select registrar_evento_correo('otra', 'email.delivered', '<proveedor_id>', now());   -- ERROR Sin permiso
--      select registrar_evento_correo('clave-de-prueba', 'email.delivered', 'no-existe', now());  -- 'no es de esta base'
--      select registrar_evento_correo('clave-de-prueba', 'email.sent', '<proveedor_id>', now());   -- 'ignorado'
--      select registrar_evento_correo('clave-de-prueba', 'email.opened', '<proveedor_id>', now());  -- 'opened'
--      select registrar_evento_correo('clave-de-prueba', 'email.delivered', '<proveedor_id>', now()); -- 'sin cambio' (no retrocede)
--      select registrar_evento_correo('clave-de-prueba', 'email.bounced', '<proveedor_id>', now());  -- 'bounced'
--      select * from correos_malos where correo = '<destino de ese correo>';  -- 1 fila «Resend: bounced»
--    rollback;
