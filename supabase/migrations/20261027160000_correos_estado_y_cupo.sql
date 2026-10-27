-- Correos: a qué unidades va un mensaje, cuándo sale lo que espera el cupo,
-- estado de cada recibo por unidad y «Reenviar recibo» (ronda 8, bloques A4
-- y C2).
--
-- Aplicada en vecitap-pruebas el 27-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261026170000_mensajes_masivos.sql** (la guarda exige sus
-- funciones) **y de 20261027140000_recibo_titulares_sin_bs.sql** (reenviar
-- usa su correo_recibo()). Rollback:
-- supabase/rollbacks/20261027160000_correos_estado_y_cupo_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ: LO QUE PASÓ EN LA PRUEBA 13 DE GUSTAVO
-- ─────────────────────────────────────────────────────────────────────────
-- Envió un mensaje a «Todos» (36 personas) en el Edificio Gustavo a las
-- 11:42 p. m. del 26-oct y vio «0 enviados». Dos causas, las dos medidas en
-- la cola de pruebas:
--   1. «0 enviados» al momento es normal: el despachador corre cada 5
--      minutos. La pantalla no lo decía.
--   2. **El cupo**: esa noche ya habían salido 58 recibos (prueba 9) y otros
--      mensajes; con 22 del mensaje se llegó a 100 en 24 horas y los otros 14
--      quedaron esperando, sin que la pantalla dijera hasta cuándo (salen
--      solos cuando se libera cupo, 24 horas después de los primeros).
--   Y una tercera, que no se veía: 2 correos fallaron con «Too many requests.
--   You can only make 10 requests per second»: el despachador mandaba 20 de
--   una vez. Se reintentan solos, pero un correo puede agotar sus 3 intentos.
-- El filtro «Solo quienes deben» sí funciona en la base (31 personas contra
-- 36 de «Todos» en el Edificio Gustavo): la pantalla no mostraba a quiénes
-- iba, y los números se parecían.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Mensajes, por unidad: `unidades_mensaje(edificio, filtro)` lista las
--    unidades con las que el filtro elige y quién recibe en cada una; la
--    pantalla las muestra y deja agregar o quitar unidades a mano.
--    `vista_previa_mensaje` y `enviar_mensaje` reciben la lista final
--    (`p_unidades`; null = la del filtro). En una unidad agregada a mano
--    recibe quien el filtro diga (con «Solo quienes deben», quien paga,
--    deba o no). `mensajes.unidades` guarda la lista elegida a mano.
-- 2. Cuándo sale lo que espera: `momento_cupo(n)` (uso interno) calcula
--    cuándo hay lugar para n correos más, mirando cuándo se liberan los
--    mandados en las últimas 24 horas. `historial_mensajes` devuelve además
--    `sale_en` (cuándo sale el último que espera) y separa lo que espera el
--    cupo de lo que sale en el próximo envío. `cupo_correo()` da el estado
--    del cupo para la pantalla (tope, usados, libres, en cola, cuándo sale
--    todo).
-- 3. Despachador (con guarda md5):
--    · **8 pedidos a Resend por vuelta** como máximo (envíos y consultas
--      juntos), debajo del límite de 10 por segundo.
--    · **Estado de entrega** (apagado por omisión): después de enviar,
--      consulta cada correo en Resend (`GET /emails/{id}`, que devuelve
--      `last_event`: delivered, bounced, opened…) y lo guarda en
--      `cola_correo.evento`. Un rebote se anota en `correos_malos` (no se
--      le vuelve a escribir). «Abierto» solo aparece si el seguimiento de
--      aperturas está encendido en el dominio de Resend, y no es del todo
--      confiable (hay correos que cargan las imágenes solos o las
--      bloquean). Las consultas no gastan el cupo diario: solo los envíos.
--      **Se probó en pruebas el 27-oct y la clave de Resend de las dos bases
--      es «Sending access»: Resend contesta 401 «This API key is restricted
--      to only send emails».** Por eso solo consulta si existe el secreto
--      `correo_consultar_estado` = 'si' (con una clave «Full access»). La
--      otra forma, recomendada para producción, son los webhooks de Resend
--      (ver docs/estado-migracion.md, «Ronda 8»). Sin esto, la pantalla
--      igual dice enviado, esperando el cupo, falló o rebotó (dirección
--      inválida).
--    · **Aviso a Vecitap** cuando se acaba el cupo y quedan correos
--      esperando: una vez por día, en `tareas_log` ('cupo_correo') —la
--      consola del operador lo muestra— y, si existe el secreto
--      `correo_operador`, un correo a esa dirección (fuera de la cola).
-- 4. Cortes de cuenta: `estado_correos_periodo(periodo)` da, por unidad y
--    destinatario, si el recibo se entregó, rebotó, espera el cupo (y
--    cuándo sale) o falló. `reenviar_recibo(recibo)` lo vuelve a mandar a
--    sus destinatarios (tipo 'reenvio'; uno cada 10 minutos por recibo).
--
-- El cupo de Resend es de la cuenta, compartido por las dos bases si usan
-- la misma (ver docs/estado-migracion.md, «Resend: pruebas y producción»).

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.despachar_correos(integer)',               '734b58aa8b3e953b70774e054a62ec22'),
      ('public.destinatarios_mensaje(uuid,text)',         '8185df4d475b553418a6150498cc9f1f'),
      ('public.vista_previa_mensaje(uuid,text)',          '870619a2f0233cdb4ec31f8e10093ef7'),
      ('public.enviar_mensaje(uuid,text,text,text)',      '3767cc8f109d727f78aa7ffa569c2630'),
      ('public.historial_mensajes(uuid)',                 '16ae46ccaa9ed2cda79466d5808338d0'),
      ('public.correo_recibo(uuid)',                      'fc342ae7a87d2beac3ad8a10060d440c')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then
    raise exception 'ABORTADA: cambiaron:%  ¿Faltan 20261026170000_mensajes_masivos.sql o 20261027140000_recibo_titulares_sin_bs.sql?', malas;
  end if;
end
$guarda$;

-- ── La cola: estado de entrega y reenvíos ──────────────────────────────
alter table public.cola_correo
  add column evento            text,          -- last_event de Resend
  add column evento_en         timestamptz,
  add column evento_req        bigint,        -- consulta en curso (pg_net)
  add column evento_consultado timestamptz;
comment on column public.cola_correo.evento is
  'Ronda 8: lo último que Resend sabe de este correo (delivered, bounced, opened, '
  'clicked, complained, delivery_delayed…). Lo consulta despachar_correos().';

alter table public.cola_correo drop constraint cola_correo_tipo_check;
alter table public.cola_correo add constraint cola_correo_tipo_check
  check (tipo = any (array['recibo', 'mora', 'pago_confirmado', 'pago_rechazado', 'prueba', 'visita', 'mensaje', 'reenvio']));

-- Un recibo se encola una vez por destinatario; los reenvíos, aparte.
drop index public.cola_un_correo_por_recibo;
create unique index cola_un_correo_por_recibo on public.cola_correo (recibo_id, tipo, destino)
  where recibo_id is not null and estado <> 'cancelado' and tipo <> 'reenvio';
create index cola_por_recibo on public.cola_correo (recibo_id) where recibo_id is not null;

alter table public.mensajes add column unidades uuid[];
comment on column public.mensajes.unidades is
  'Ronda 8: las unidades elegidas a mano (null = las del filtro de destinatarios).';

-- ── El cupo ──────────────────────────────────────────────────────────────
-- Uso interno: el tope del plan (100, o el secreto correo_tope_diario).
create function public.tope_correo() returns integer
  language sql stable security definer set search_path to 'public'
  as $function$
  select coalesce((select case when btrim(valor) ~ '^\d+$' then btrim(valor)::int end
                     from secretos where nombre = 'correo_tope_diario'), 100)
$function$;

-- Uso interno: cuándo hay lugar para p_n correos más (now() si caben ya;
-- null si hace falta más de un día de cupo). Una copia cuenta como dos. Si
-- lo mandado ya pasa el tope (se bajó el tope, como en pruebas), primero
-- tiene que vencer lo que sobra.
create function public.momento_cupo(p_n integer) returns timestamptz
  language plpgsql stable security definer set search_path to 'public'
  as $function$
declare v_tope int := tope_correo(); v_libre int; v_t timestamptz;
begin
  select v_tope - coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_libre
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  if p_n <= v_libre then return now(); end if;
  select x.m + interval '24 hours' into v_t from (
    select c.mandado_en as m,
           sum(case when c.copia is not null then 2 else 1 end) over (order by c.mandado_en, c.id) as acum
      from cola_correo c where c.mandado_en > now() - interval '24 hours') x
   where x.acum >= p_n - v_libre
   order by x.acum limit 1;
  return v_t;
end $function$;

-- Uso interno: cuántos correos esperan delante de una fila de la cola, ella
-- incluida (en el orden del despachador: primero lo que no es mensaje).
create function public.puesto_en_cola(p_mensaje boolean, p_encolado timestamptz) returns integer
  language sql stable security definer set search_path to 'public'
  as $function$
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int
    from cola_correo c
   where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3
     and ((c.tipo = 'mensaje') < p_mensaje
          or ((c.tipo = 'mensaje') = p_mensaje and c.encolado_en <= p_encolado))
$function$;

revoke all on function public.tope_correo() from public, anon, authenticated;
revoke all on function public.momento_cupo(integer) from public, anon, authenticated;
revoke all on function public.puesto_en_cola(boolean, timestamptz) from public, anon, authenticated;

-- Para la pantalla (administración y operador): el estado del cupo.
create function public.cupo_correo() returns jsonb
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
revoke all on function public.cupo_correo() from public, anon;
grant execute on function public.cupo_correo() to authenticated;

-- ── Mensajes: a quiénes, por unidad ───────────────────────────────────
drop function public.enviar_mensaje(uuid, text, text, text);
drop function public.vista_previa_mensaje(uuid, text);
drop function public.destinatarios_mensaje(uuid, text);

-- Quién recibe en una unidad según el filtro: 'todos' → propietario e
-- inquilino; 'propietarios' / 'inquilinos' → ese; 'deudores' → quien paga.
-- p_unidades null: las unidades que el filtro elige (con 'deudores', las
-- que deben). Con lista: esas, del edificio (con 'deudores', quien paga,
-- deba o no: la administradora la agregó a mano).
create function public.destinatarios_mensaje(p_edificio uuid, p_filtro text, p_unidades uuid[] default null)
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
       and (p_unidades is null or u.id = any (p_unidades))
       and case p_filtro
             when 'propietarios' then v.tipo = 'propietario'
             when 'inquilinos'   then v.tipo = 'inquilino'
             when 'deudores'     then v.tipo = coalesce(u.paga, 'propietario')
                                      and (p_unidades is not null
                                           or (select s.total from saldo_unidad(u.id) s) > 0.009)
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
revoke all on function public.destinatarios_mensaje(uuid, text, uuid[]) from public, anon, authenticated;

-- Las unidades del edificio: cuáles elige el filtro, y quién recibe en cada
-- una (para la pantalla, que deja agregar o quitar).
create function public.unidades_mensaje(p_edificio uuid, p_filtro text)
  returns table(unidad_id uuid, codigo text, incluida boolean, quien text, con_correo boolean)
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare v_org uuid;
begin
  select org_id into v_org from edificios where id = p_edificio;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  return query
  select u.id, u.codigo,
         case p_filtro
           when 'inquilinos' then exists (select 1 from vinculos v where v.unidad_id = u.id and v.hasta is null and v.tipo = 'inquilino')
           when 'deudores'   then (select s.total from saldo_unidad(u.id) s) > 0.009
           else true end,
         (select string_agg(concat_ws(' ', pe.prefijo, pe.nombre)
                            || coalesce(' (' || nullif(lower(btrim(coalesce(pe.correo, ''))), '') || ')', ' (sin correo)'), ' · '
                            order by v.tipo)
            from vinculos v join personas pe on pe.id = v.persona_id
           where v.unidad_id = u.id and v.hasta is null
             and case p_filtro
                   when 'propietarios' then v.tipo = 'propietario'
                   when 'inquilinos'   then v.tipo = 'inquilino'
                   when 'deudores'     then v.tipo = coalesce(u.paga, 'propietario')
                   else true end),
         exists (select 1 from vinculos v join personas pe on pe.id = v.persona_id
                  where v.unidad_id = u.id and v.hasta is null
                    and nullif(btrim(coalesce(pe.correo, '')), '') is not null
                    and case p_filtro
                          when 'propietarios' then v.tipo = 'propietario'
                          when 'inquilinos'   then v.tipo = 'inquilino'
                          when 'deudores'     then v.tipo = coalesce(u.paga, 'propietario')
                          else true end)
    from unidades u
   where u.edificio_id = p_edificio and u.activa
   order by u.codigo;
end $function$;
revoke all on function public.unidades_mensaje(uuid, text) from public, anon;
grant execute on function public.unidades_mensaje(uuid, text) to authenticated;

create function public.vista_previa_mensaje(p_edificio uuid, p_filtro text, p_unidades uuid[] default null)
  returns jsonb
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare
  v_org uuid; v_n int; v_copias int; v_tope int := tope_correo(); v_usados int; v_cola int; v_libre int;
  v_sale timestamptz;
begin
  select org_id into v_org from edificios where id = p_edificio;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;

  select count(*), count(copia) into v_n, v_copias from destinatarios_mensaje(p_edificio, p_filtro, p_unidades);
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_usados
    from cola_correo c where c.mandado_en > now() - interval '24 hours';
  -- Lo que ya espera en la cola (de cualquier organización: el cupo es uno).
  select coalesce(sum(case when c.copia is not null then 2 else 1 end), 0)::int into v_cola
    from cola_correo c where c.estado = 'pendiente' and c.request_id is null and c.intentos < 3;
  v_libre := greatest(v_tope - v_usados, 0);
  -- Ronda 8: cuándo sale el último (los mensajes van detrás de lo que espera).
  v_sale := momento_cupo(v_cola + v_n + v_copias);

  return jsonb_build_object(
    'destinatarios', v_n,
    'con_copia', v_copias,
    'correos', v_n + v_copias,
    'tope', v_tope,
    'libre_hoy', v_libre,
    'en_cola', v_cola,
    'sale_en', v_sale,
    'dias', case when v_cola + v_n + v_copias <= v_libre then 1
                 else 1 + ceil((v_cola + v_n + v_copias - v_libre)::numeric / greatest(v_tope, 1))::int end);
end $function$;

create function public.enviar_mensaje(p_edificio uuid, p_asunto text, p_texto text, p_filtro text, p_unidades uuid[] default null)
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
  if p_unidades is not null and exists (
       select 1 from unnest(p_unidades) x(id)
        where not exists (select 1 from unidades u where u.id = x.id and u.edificio_id = p_edificio and u.activa)) then
    raise exception 'Una de las unidades elegidas no es de este edificio.';
  end if;

  -- Un doble toque no lo manda dos veces.
  if exists (select 1 from mensajes m
              where m.edificio_id = p_edificio and m.asunto = v_asunto and m.texto = v_texto
                and m.destinatarios = p_filtro and m.creado_en > now() - interval '2 minutes') then
    raise exception 'Ese mismo mensaje ya se envió hace un momento.';
  end if;

  select ac.responder_a into v_responder from ajustes_correo ac where ac.org_id = v_org;

  insert into mensajes (org_id, edificio_id, asunto, texto, destinatarios, unidades)
  values (v_org, p_edificio, v_asunto, v_texto, p_filtro, p_unidades)
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

  for d in select * from destinatarios_mensaje(p_edificio, p_filtro, p_unidades) loop
    insert into cola_correo (org_id, tipo, destino, copia, responder_a, asunto, html, texto, mensaje_id)
    values (v_org, 'mensaje', d.correo, d.copia, v_responder, v_asunto, v_html,
            v_texto || E'\n\n--\n' || v_org_nombre || ' · ' || v_edificio, v_id);
    v_n := v_n + 1;
  end loop;

  update mensajes set cantidad = v_n where id = v_id;
  return jsonb_build_object('mensaje_id', v_id, 'encolados', v_n,
                            'sale_en', momento_cupo(puesto_en_cola(true, now())));
end $function$;

revoke all on function public.vista_previa_mensaje(uuid, text, uuid[]) from public, anon;
revoke all on function public.enviar_mensaje(uuid, text, text, text, uuid[]) from public, anon;
grant execute on function public.vista_previa_mensaje(uuid, text, uuid[]) to authenticated;
grant execute on function public.enviar_mensaje(uuid, text, text, text, uuid[]) to authenticated;

-- El historial, con lo que espera el cupo y cuándo sale. Ahora SECURITY
-- DEFINER (mira la cola entera para saber cuándo sale): exige puede_operar.
drop function public.historial_mensajes(uuid);
create function public.historial_mensajes(p_edificio uuid)
  returns table(id uuid, asunto text, texto text, destinatarios text, cantidad integer,
                creado_en timestamptz, enviados integer, pendientes integer, fallidos integer,
                esperan_cupo integer, sale_en timestamptz, a_mano boolean)
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare v_org uuid;
begin
  select e.org_id into v_org from edificios e where e.id = p_edificio;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  return query
  select m.id, m.asunto, m.texto, m.destinatarios, m.cantidad, m.creado_en,
         count(c.id) filter (where c.estado = 'enviado')::int,
         count(c.id) filter (where c.estado = 'pendiente')::int,
         count(c.id) filter (where c.estado = 'fallido')::int,
         -- Los que no entran en el cupo de ahora.
         (case when count(c.id) filter (where c.estado = 'pendiente') = 0 then 0
               when momento_cupo(puesto_en_cola(true, max(c.encolado_en) filter (where c.estado = 'pendiente'))) <= now() then 0
               else count(c.id) filter (where c.estado = 'pendiente') end)::int,
         case when count(c.id) filter (where c.estado = 'pendiente') = 0 then null
              else momento_cupo(puesto_en_cola(true, max(c.encolado_en) filter (where c.estado = 'pendiente'))) end,
         m.unidades is not null
    from mensajes m
    left join cola_correo c on c.mensaje_id = m.id
   where m.edificio_id = p_edificio
   group by m.id
   order by m.creado_en desc
   limit 50;
end $function$;
revoke all on function public.historial_mensajes(uuid) from public, anon;
grant execute on function public.historial_mensajes(uuid) to authenticated;

-- ── Cortes de cuenta: cómo va el correo de cada recibo ─────────────────
create function public.estado_correos_periodo(p_periodo uuid)
  returns table(unidad_id uuid, recibo_id uuid, destino text, tipo text, estado text, evento text,
                encolado_en timestamptz, enviado_en timestamptz, sale_en timestamptz,
                rebotado boolean, error text)
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare v_org uuid;
begin
  select p.org_id into v_org from periodos p where p.id = p_periodo;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  return query
  select c.unidad_id, c.recibo_id, c.destino, c.tipo, c.estado, c.evento,
         c.encolado_en, c.enviado_en,
         case when c.estado = 'pendiente' and c.request_id is null and c.intentos < 3
              then momento_cupo(puesto_en_cola(false, c.encolado_en)) end,
         exists (select 1 from correos_malos m where m.correo = c.destino),
         left(c.ultimo_error, 200)
    from cola_correo c
    join recibos rc on rc.id = c.recibo_id
   where rc.periodo_id = p_periodo and c.tipo in ('recibo', 'reenvio') and c.estado <> 'cancelado'
   order by c.unidad_id, c.destino, c.encolado_en desc;
end $function$;
revoke all on function public.estado_correos_periodo(uuid) from public, anon;
grant execute on function public.estado_correos_periodo(uuid) to authenticated;

-- «Reenviar recibo»: a los mismos destinatarios que el envío del mes, otra vez.
create function public.reenviar_recibo(p_recibo uuid)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare v_org uuid; v_estado text; c record; n int := 0;
begin
  select rc.org_id, p.estado into v_org, v_estado
    from recibos rc join periodos p on p.id = rc.periodo_id where rc.id = p_recibo;
  if v_org is null then raise exception 'Ese recibo no existe.'; end if;
  if not puede_operar(v_org) then raise exception 'Sin permiso'; end if;
  if v_estado <> 'cerrado' then raise exception 'El mes no está cerrado.'; end if;
  if exists (select 1 from cola_correo q where q.recibo_id = p_recibo and q.tipo = 'reenvio'
              and q.encolado_en > now() - interval '10 minutes') then
    raise exception 'Ese recibo ya se reenvió hace un momento.';
  end if;

  perform asegurar_invitaciones_recibo(p_recibo);
  for c in select * from correo_recibo(p_recibo) loop
    continue when exists (select 1 from correos_malos m where m.correo = lower(btrim(c.destino)));
    insert into cola_correo (org_id, unidad_id, recibo_id, tipo, destino, responder_a, asunto, html, texto)
    values (c.org_id, c.unidad_id, p_recibo, 'reenvio', lower(btrim(c.destino)),
            c.responder_a, c.asunto, c.html, c.texto);
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'Esta unidad no tiene a nadie con correo y con el envío marcado (o sus correos rebotaron).';
  end if;
  return n;
end $function$;
revoke all on function public.reenviar_recibo(uuid) from public, anon;
grant execute on function public.reenviar_recibo(uuid) to authenticated;

-- ── El despachador ──────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in
--      ('despachar_correos','historial_mensajes','vista_previa_mensaje','enviar_mensaje',
--       'destinatarios_mensaje','unidades_mensaje','estado_correos_periodo','reenviar_recibo',
--       'cupo_correo','momento_cupo','puesto_en_cola','tope_correo');
--    -- Esperado: una fila por función (los md5 están en
--    --   docs/estado-migracion.md, «Ronda 8»).
--    select indexdef from pg_indexes where indexname = 'cola_un_correo_por_recibo';
--    -- Esperado: … WHERE … AND (tipo <> 'reenvio'::text)
-- 2. Como la administradora, en una transacción deshecha:
--      select count(*) filter (where incluida) from public.unidades_mensaje('<edificio>', 'deudores');
--      select public.vista_previa_mensaje('<edificio>', 'deudores');
--      select public.vista_previa_mensaje('<edificio>', 'todos', array['<u1>','<u2>']::uuid[]);
--    -- Esperado: los deudores son menos que 'todos'; con dos unidades, sus
--    --   destinatarios solamente.
-- 3. Después de una vuelta del cron con correos enviados:
--      select evento, count(*) from cola_correo where enviado_en > now() - interval '1 hour' group by 1;
--    -- Esperado: 'delivered' en los de @resend.dev que entregan, 'bounced'
--    --   en bounced@resend.dev (y esa dirección en correos_malos).
--    select detalle from tareas_log where tarea = 'despachar_correos' order by corrida_en desc limit 3;
--    -- Esperado: mandados + consultas ≤ 8 en cada vuelta.
-- 4. Con el tope en 0 y un correo esperando, una vuelta del cron deja una
--    fila 'cupo_correo' en tareas_log (una sola por día).
