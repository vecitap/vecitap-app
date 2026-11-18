-- Cambio 3 del feedback de ING3: trabajar sin internet (parte B).
-- Plan: docs/plan-sin-conexion.md, 2.6 y 2.7. Rollback:
-- supabase/rollbacks/20261118140000_bandeja_sin_conexion_rollback.sql.
--
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo,
-- junto con el resto del cambio 3 (después de 20261118120000_copia_edificio).
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- 1. `id_equipo` y `hecho_en` en pagos, gastos, cargos_unidad y ajustes (2.6).
--    `id_equipo` es un uuid que crea el navegador para cada cosa que manda;
--    si la manda dos veces (la primera llegó pero se perdió la respuesta), la
--    segunda se salta SIN ERROR: un trigger BEFORE INSERT devuelve NULL si ya
--    hay una fila con ese id_equipo. `hecho_en` es la hora del equipo (cuándo
--    se hizo de verdad); `creado_en` sigue siendo la hora de llegada.
--    · Por qué un trigger y no `on conflict do nothing`: los BEFORE INSERT
--      corren antes de mirar conflictos, y pago_no_repetido rechazaría el
--      reintento de un pago con referencia (o cargos_unidad_guarda el de un
--      cargo de un mes que ya se cerró). Los triggers corren por orden
--      alfabético: se llaman <tabla>_0_id_equipo para ir primero.
--    · El `unique` es la red final: dos pestañas a la vez → 23505, que el
--      navegador trata como «ya estaba».
--    · Los null no chocan entre sí: lo de hoy (sin id_equipo) no cambia.
--
-- 2. `equipos_sin_conexion` (2.7): qué equipos pueden tener cosas por enviar
--    de un edificio. Cada navegador con el modo sin conexión avisa cada
--    minuto (latido_equipo) cuántas cosas tiene por enviar; al cerrarse con
--    conexión avisa «cerrado». Queda EN RIESGO un equipo no liberado que
--      · tiene pendientes > 0, o
--      · está 'en_linea' y hace más de 3 minutos que no avisa (se quedó sin
--        conexión, o sin luz, con la app abierta).
--
-- 3. Un trigger nuevo en `periodos` (periodos_sin_equipos_en_riesgo) que NO
--    deja cerrar el mes de un edificio con algún equipo en riesgo. No toca
--    cerrar_periodo(): su md5 no cambia.
--
-- 4. liberar_equipo(): cualquier administrador de la organización libera un
--    equipo en riesgo («confirma que no tiene nada por enviar»). Queda en la
--    auditoría quién y cuándo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD (familia de revisión cuidadosa: deciden si se puede cerrar un mes)
-- ─────────────────────────────────────────────────────────────────────────
-- · saltar_id_equipo_repetido(): SECURITY INVOKER; busca la fila con la RLS
--   de quien inserta (solo ve lo que ya puede ver).
-- · equipos_sin_conexion: RLS activa. SELECT para quien opera la
--   organización (puede_operar). Sin políticas de escritura: se escribe solo
--   por latido_equipo() y liberar_equipo().
-- · latido_equipo(): SECURITY DEFINER, search_path fijo. Exige sesión y
--   puede_operar(org del edificio); la fila queda a nombre de auth.uid() y
--   un equipo_id ajeno no se pisa (otro usuario no puede «limpiar» el riesgo
--   de un equipo que no es suyo).
-- · liberar_equipo(): SECURITY DEFINER, search_path fijo. Exige
--   puede_operar(org del edificio). Escribe la auditoría.
-- · equipos_en_riesgo(): SECURITY DEFINER (para mostrar el correo de quien
--   usa el equipo, que está en auth.users). Exige puede_operar.
-- · periodos_sin_equipos_en_riesgo(): SECURITY DEFINER (tiene que ver todas
--   las filas del edificio, no solo las del que cierra).
-- Ejecutables solo por authenticated. Las de trigger no se pueden llamar
-- directo.
--
-- No cambia ninguna función existente: no hay md5 que guardar.

begin;

do $antes$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'pagos' and column_name = 'id_equipo') then
    raise exception 'ABORTADA: pagos.id_equipo ya existe. No se cambió nada.';
  end if;
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'equipos_sin_conexion') then
    raise exception 'ABORTADA: equipos_sin_conexion ya existe. No se cambió nada.';
  end if;
end
$antes$;

-- ── 1. id_equipo + hecho_en ─────────────────────────────────────────────

alter table public.pagos         add column id_equipo uuid, add column hecho_en timestamptz;
alter table public.gastos        add column id_equipo uuid, add column hecho_en timestamptz;
alter table public.cargos_unidad add column id_equipo uuid, add column hecho_en timestamptz;
alter table public.ajustes       add column id_equipo uuid, add column hecho_en timestamptz;

alter table public.pagos         add constraint pagos_id_equipo_key         unique (id_equipo);
alter table public.gastos        add constraint gastos_id_equipo_key        unique (id_equipo);
alter table public.cargos_unidad add constraint cargos_unidad_id_equipo_key unique (id_equipo);
alter table public.ajustes       add constraint ajustes_id_equipo_key       unique (id_equipo);

create function public.saltar_id_equipo_repetido()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public'
as $$
declare v_hay boolean;
begin
  if new.id_equipo is null then
    return new;
  end if;
  execute format('select exists (select 1 from %I.%I where id_equipo = $1)', tg_table_schema, tg_table_name)
    into v_hay using new.id_equipo;
  if v_hay then
    -- Ya llegó antes: se salta la fila, sin error.
    return null;
  end if;
  return new;
end $$;

revoke all on function public.saltar_id_equipo_repetido() from public, anon, authenticated;

create trigger pagos_0_id_equipo         before insert on public.pagos         for each row execute function public.saltar_id_equipo_repetido();
create trigger gastos_0_id_equipo        before insert on public.gastos        for each row execute function public.saltar_id_equipo_repetido();
create trigger cargos_unidad_0_id_equipo before insert on public.cargos_unidad for each row execute function public.saltar_id_equipo_repetido();
create trigger ajustes_0_id_equipo       before insert on public.ajustes       for each row execute function public.saltar_id_equipo_repetido();

-- ── 2. equipos_sin_conexion ─────────────────────────────────────────────

create table public.equipos_sin_conexion (
  equipo_id       uuid not null,
  edificio_id     uuid not null references public.edificios (id) on delete cascade,
  org_id          uuid not null references public.organizaciones (id) on delete cascade,
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  descripcion     text check (descripcion is null or length(descripcion) <= 80),
  pendientes      integer not null default 0 check (pendientes >= 0),
  estado          text not null check (estado in ('en_linea', 'cerrado')),
  ultimo_contacto timestamptz not null default now(),
  liberado_por    uuid references auth.users (id) on delete set null,
  liberado_en     timestamptz,
  primary key (equipo_id, edificio_id)
);

create index equipos_sin_conexion_edificio on public.equipos_sin_conexion (edificio_id);

alter table public.equipos_sin_conexion enable row level security;

create policy equipos_sin_conexion_ver on public.equipos_sin_conexion
  for select to authenticated using (puede_operar(org_id));

revoke all on public.equipos_sin_conexion from anon;
grant select on public.equipos_sin_conexion to authenticated;

-- El equipo avisa: cuántas cosas tiene por enviar de ese edificio y si
-- sigue abierto ('en_linea') o se cerró con conexión ('cerrado').
create function public.latido_equipo(p_equipo uuid, p_edificio uuid, p_pendientes integer, p_estado text, p_descripcion text default null)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_org uuid; v_dueno uuid;
begin
  if auth.uid() is null then
    raise exception 'Sin sesión.' using errcode = '42501';
  end if;
  if p_equipo is null or p_edificio is null then
    raise exception 'Falta el equipo o el edificio.';
  end if;
  if p_estado not in ('en_linea', 'cerrado') then
    raise exception 'Estado de equipo desconocido.';
  end if;
  select e.org_id into v_org from edificios e where e.id = p_edificio;
  if v_org is null or not puede_operar(v_org) then
    raise exception 'No administra ese edificio.' using errcode = '42501';
  end if;

  select usuario_id into v_dueno from equipos_sin_conexion where equipo_id = p_equipo and edificio_id = p_edificio;
  if v_dueno is not null and v_dueno <> auth.uid() then
    -- Un equipo_id es de un solo usuario (se guarda en su base local).
    raise exception 'Ese equipo es de otro usuario.' using errcode = '42501';
  end if;

  insert into equipos_sin_conexion (equipo_id, edificio_id, org_id, usuario_id, descripcion, pendientes, estado, ultimo_contacto)
  values (p_equipo, p_edificio, v_org, auth.uid(), left(p_descripcion, 80), greatest(coalesce(p_pendientes, 0), 0), p_estado, now())
  on conflict (equipo_id, edificio_id) do update
     set pendientes      = excluded.pendientes,
         estado          = excluded.estado,
         descripcion     = coalesce(excluded.descripcion, equipos_sin_conexion.descripcion),
         ultimo_contacto = now(),
         -- Volvió a hablar: lo que diga ahora vale más que una liberación vieja.
         liberado_por    = null,
         liberado_en     = null;
end $$;

-- Los equipos en riesgo de un edificio, con el correo de quien lo usa.
create function public.equipos_en_riesgo(p_edificio uuid)
  returns table (equipo_id uuid, usuario_id uuid, quien text, descripcion text, pendientes integer, estado text, ultimo_contacto timestamptz, es_mio boolean)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
declare v_org uuid;
begin
  select e.org_id into v_org from edificios e where e.id = p_edificio;
  if v_org is null or not puede_operar(v_org) then
    raise exception 'No administra ese edificio.' using errcode = '42501';
  end if;
  return query
    select q.equipo_id, q.usuario_id,
           coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email::text, 'otro usuario'),
           q.descripcion, q.pendientes, q.estado, q.ultimo_contacto, q.usuario_id = auth.uid()
      from equipos_sin_conexion q
      left join auth.users u on u.id = q.usuario_id
     where q.edificio_id = p_edificio
       and q.liberado_en is null
       and (q.pendientes > 0 or (q.estado = 'en_linea' and q.ultimo_contacto < now() - interval '3 minutes'))
     order by q.ultimo_contacto;
end $$;

-- «Confirma que no tiene nada por enviar»: cualquier administrador.
create function public.liberar_equipo(p_equipo uuid, p_edificio uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_org uuid; v_antes jsonb; v_despues jsonb;
begin
  select e.org_id into v_org from edificios e where e.id = p_edificio;
  if v_org is null or not puede_operar(v_org) then
    raise exception 'No administra ese edificio.' using errcode = '42501';
  end if;
  select to_jsonb(q) into v_antes from equipos_sin_conexion q where q.equipo_id = p_equipo and q.edificio_id = p_edificio;
  if v_antes is null then
    raise exception 'Ese equipo no está en la lista.';
  end if;
  update equipos_sin_conexion
     set liberado_por = auth.uid(), liberado_en = now()
   where equipo_id = p_equipo and edificio_id = p_edificio
  returning to_jsonb(equipos_sin_conexion.*) into v_despues;
  insert into auditoria (org_id, usuario_id, entidad, entidad_id, accion, antes, despues)
  values (v_org, auth.uid(), 'equipos_sin_conexion', p_equipo, 'liberar', v_antes, v_despues);
end $$;

revoke all on function public.latido_equipo(uuid, uuid, integer, text, text) from public, anon;
revoke all on function public.equipos_en_riesgo(uuid) from public, anon;
revoke all on function public.liberar_equipo(uuid, uuid) from public, anon;
grant execute on function public.latido_equipo(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.equipos_en_riesgo(uuid) to authenticated;
grant execute on function public.liberar_equipo(uuid, uuid) to authenticated;

-- ── 3. No se cierra el mes con equipos en riesgo ────────────────────────

create function public.periodos_sin_equipos_en_riesgo()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare r record;
begin
  if new.estado = 'cerrado' and old.estado = 'abierto' then
    select coalesce(nullif(u.raw_user_meta_data ->> 'nombre', ''), u.email::text, 'otro usuario') as quien,
           q.pendientes, q.ultimo_contacto
      into r
      from equipos_sin_conexion q
      left join auth.users u on u.id = q.usuario_id
     where q.edificio_id = new.edificio_id
       and q.liberado_en is null
       and (q.pendientes > 0 or (q.estado = 'en_linea' and q.ultimo_contacto < now() - interval '3 minutes'))
     order by q.ultimo_contacto
     limit 1;
    if found then
      if r.pendientes > 0 then
        raise exception 'No se puede cerrar: el equipo de % tiene % cosa(s) sin enviar de este edificio. Espere a que se envíen o, si ya no hay nada, libérelo en «Equipos sin conexión».',
          r.quien, r.pendientes using errcode = 'P0001';
      else
        raise exception 'No se puede cerrar: el equipo de % está sin conexión desde el % y puede tener cosas por enviar. Si no las tiene, libérelo en «Equipos sin conexión».',
          r.quien, to_char(r.ultimo_contacto at time zone 'America/Caracas', 'DD/MM HH24:MI') using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.periodos_sin_equipos_en_riesgo() from public, anon, authenticated;

create trigger periodos_sin_equipos_en_riesgo
  before update on public.periodos
  for each row execute function public.periodos_sin_equipos_en_riesgo();

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (después de aplicar)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas, unique y triggers (esperado: 4, 4, 4 y 1):
--    select count(*) from information_schema.columns where table_schema='public'
--      and column_name='id_equipo' and table_name in ('pagos','gastos','cargos_unidad','ajustes');
--    select count(*) from pg_constraint where conname like '%\_id_equipo\_key';
--    select count(*) from pg_trigger where tgname like '%\_0\_id\_equipo';
--    select count(*) from pg_trigger where tgname = 'periodos_sin_equipos_en_riesgo';
-- 2. Funciones nuevas: definer las 4 de equipos, invoker saltar_id_equipo_repetido,
--    sin «\r» (esperado 0):
--    select proname, prosecdef, proacl from pg_proc where pronamespace='public'::regnamespace
--      and proname in ('saltar_id_equipo_repetido','latido_equipo','equipos_en_riesgo',
--                      'liberar_equipo','periodos_sin_equipos_en_riesgo');
--    select count(*) from pg_proc where pronamespace='public'::regnamespace and position(chr(13) in prosrc) > 0;
-- 3. En una transacción que se deshace (begin … rollback), como un
--    administrador (set local role authenticated + request.jwt.claims):
--    · el mismo pago CON referencia y el mismo id_equipo dos veces → 1 fila, ningún error;
--    · el mismo cargo con el mismo id_equipo dos veces → 1 fila;
--    · dos pagos con id_equipo null → entran los dos (si no son repetidos);
--    · latido_equipo(e, edificio, 2, 'en_linea') y cerrar el periodo abierto →
--      «No se puede cerrar: el equipo de … tiene 2 cosa(s) sin enviar…»;
--    · liberar_equipo(e, edificio) → el cierre pasa (o falla por otra regla, no por esta),
--      y hay una fila nueva en auditoria con accion = 'liberar'.
