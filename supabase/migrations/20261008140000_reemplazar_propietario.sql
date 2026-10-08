-- `reemplazar_propietario`: cambiar el propietario de una unidad desde la
-- ficha cierra al anterior (con su acceso a ESA unidad y sus invitaciones
-- pendientes de ESA unidad) y carga al nuevo, en una sola transacción.
-- Mismo diseño que `reemplazar_inquilino` (20261008120000).
--
-- Aplicada en vecitap-pruebas el 08-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo (docs/respaldo.md), después de
-- 20261008120000.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA (ronda 3, punto 2)
-- ─────────────────────────────────────────────────────────────────────────
-- En la ficha, escribir el correo de OTRO propietario encima del que había
-- sobrescribía a la misma persona (el dueño anterior "se convertía" en el
-- nuevo) y su acceso a la app seguía activo. Es el mismo problema que se
-- corrigió para el inquilino en la ronda 2 (caso 38).
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL CAMBIO
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Disparador nuevo `vinculos_propietario_sale_accesos` (SECURITY
--    DEFINER), gemelo del 3b de 20260930120000: cuando deja de estar
--    vigente el ÚLTIMO propietario de una unidad, se apagan las membresías
--    de residente con relación 'propietario' de ESA unidad.
--    Por qué DEFINER: igual que en 3b, la política de escritura de
--    `membresias` solo deja pasar a `propietario_cuenta`; una
--    `administrador` puede cerrar el vínculo pero su UPDATE a membresías
--    afectaría 0 filas en silencio. Acotado al mínimo: una sola columna
--    (`activo = false`), una sola unidad, misma organización que la unidad,
--    y solo si no queda otro propietario vigente. No es invocable como RPC
--    (función de disparador) y se le quita EXECUTE a todos.
--
-- 2. La función `reemplazar_propietario(p_unidad, datos del nuevo)`,
--    SECURITY INVOKER (corre con los permisos de quien la llama):
--      a. bloquea la unidad;
--      b. cierra los vínculos de propietario vigentes de ESA unidad
--         (`hasta = hoy_local()`) → el disparador de (1) apaga los accesos
--         de propietario de esa unidad;
--      c. anula las invitaciones pendientes de residente de ESA unidad para
--         el correo del propietario que se fue;
--      d. crea la persona y el vínculo nuevos;
--      e. devuelve cuántos accesos se apagaron.
--
-- **Un propietario con varias unidades no pierde las otras.** Todo lo de
-- arriba está filtrado por `unidad_id = p_unidad`: el vínculo que se cierra,
-- las membresías que se apagan (cada membresía de residente es de UNA
-- unidad) y las invitaciones que se anulan. La fila de `personas` del
-- anterior no se toca: sus vínculos con otras unidades, y el resto de su
-- historia, quedan igual.
--
-- `paga` no se toca: sigue siendo del inquilino o del propietario, sea
-- quien sea el propietario.
--
-- Lo que esto amplía, dicho explícitamente: hasta hoy cerrar un vínculo de
-- propietario no tenía efectos sobre los accesos. Desde acá, cerrar al
-- último propietario de una unidad —por esta función o por cualquier otro
-- camino— apaga los accesos de propietario de esa unidad. Es la misma regla
-- que ya rige para el inquilino. Queda en `auditoria` (aud_membresias).

begin;

-- ── 1. Disparador: se fue el último propietario → accesos de esa unidad ─

create function public.vinculos_propietario_sale_accesos() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare
  v_org uuid;
begin
  select u.org_id into v_org
    from public.unidades u
   where u.id = old.unidad_id
     for update;
  if not found or v_org <> old.org_id then
    return null;
  end if;

  if exists (
       select 1 from public.vinculos v
        where v.unidad_id = old.unidad_id
          and v.org_id    = v_org
          and v.tipo      = 'propietario'
          and v.hasta is null) then
    return null;
  end if;

  update public.membresias m
     set activo = false
   where m.unidad_id = old.unidad_id
     and m.org_id    = v_org
     and m.rol       = 'residente'
     and m.relacion  = 'propietario'
     and m.activo;
  return null;
end $function$;

revoke all on function public.vinculos_propietario_sale_accesos() from public;
revoke all on function public.vinculos_propietario_sale_accesos() from anon, authenticated;

create trigger vinculos_propietario_sale_accesos_upd
  after update of tipo, hasta, unidad_id, org_id on public.vinculos
  for each row
  when (old.tipo = 'propietario' and old.hasta is null
        and (new.tipo <> 'propietario'
             or new.hasta is not null
             or new.unidad_id <> old.unidad_id
             or new.org_id <> old.org_id))
  execute function public.vinculos_propietario_sale_accesos();

create trigger vinculos_propietario_sale_accesos_del
  after delete on public.vinculos
  for each row
  when (old.tipo = 'propietario' and old.hasta is null)
  execute function public.vinculos_propietario_sale_accesos();

-- ── 2. La función ─────────────────────────────────────────────────────────

create function public.reemplazar_propietario(
  p_unidad    uuid,
  p_prefijo   text,
  p_nombre    text,
  p_documento text,
  p_telefono  text,
  p_correo    text,
  p_enviar    boolean default true
) returns integer
    language plpgsql
    security invoker
    set search_path to 'public'
    as $function$
declare
  v_org     uuid;
  v_codigo  text;
  v_correos text[];
  v_antes   integer;
  v_despues integer;
  v_persona uuid;
begin
  select u.org_id, u.codigo
    into v_org, v_codigo
    from public.unidades u
   where u.id = p_unidad
     for update;
  if not found then
    raise exception 'No se encontró la unidad.';
  end if;
  if not public.puede_operar(v_org) then
    raise exception 'Sin permiso para cambiar el propietario de %.', v_codigo;
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre del propietario nuevo.';
  end if;

  if not exists (
       select 1 from public.vinculos v
        where v.unidad_id = p_unidad and v.org_id = v_org
          and v.tipo = 'propietario' and v.hasta is null) then
    raise exception 'La unidad % no tiene un propietario registrado para reemplazar.', v_codigo;
  end if;

  select array_agg(lower(trim(p.correo))) filter (where coalesce(trim(p.correo), '') <> '')
    into v_correos
    from public.vinculos v
    join public.personas p on p.id = v.persona_id
   where v.unidad_id = p_unidad
     and v.org_id    = v_org
     and v.tipo      = 'propietario'
     and v.hasta is null;

  select count(*) into v_antes
    from public.membresias m
   where m.unidad_id = p_unidad and m.org_id = v_org
     and m.rol = 'residente' and m.relacion = 'propietario' and m.activo;

  -- b. Solo los vínculos de ESTA unidad.
  update public.vinculos v
     set hasta = public.hoy_local()
   where v.unidad_id = p_unidad
     and v.org_id    = v_org
     and v.tipo      = 'propietario'
     and v.hasta is null;

  -- c. Solo las invitaciones de ESTA unidad.
  if v_correos is not null then
    update public.invitaciones i
       set expira_en = now() - interval '1 second'
     where i.org_id    = v_org
       and i.unidad_id = p_unidad
       and i.rol       = 'residente'
       and i.correo    = any (v_correos)
       and i.usada_en is null
       and i.expira_en > now();
  end if;

  -- d. El nuevo.
  insert into public.personas (org_id, prefijo, nombre, documento, telefono, correo)
  values (v_org,
          nullif(trim(coalesce(p_prefijo, '')), ''),
          trim(p_nombre),
          nullif(trim(coalesce(p_documento, '')), ''),
          nullif(trim(coalesce(p_telefono, '')), ''),
          nullif(lower(trim(coalesce(p_correo, ''))), ''))
  returning id into v_persona;

  insert into public.vinculos (org_id, unidad_id, persona_id, tipo, desde, enviar_corte)
  values (v_org, p_unidad, v_persona, 'propietario', public.hoy_local(), coalesce(p_enviar, true));

  select count(*) into v_despues
    from public.membresias m
   where m.unidad_id = p_unidad and m.org_id = v_org
     and m.rol = 'residente' and m.relacion = 'propietario' and m.activo;

  return greatest(v_antes - v_despues, 0);
end $function$;

comment on function public.reemplazar_propietario(uuid, text, text, text, text, text, boolean) is
  'Cambia el propietario de UNA unidad: cierra el vigente, apaga sus accesos '
  'y anula sus invitaciones pendientes de esa unidad (no de otras), y carga '
  'al nuevo. SECURITY INVOKER. Devuelve cuántos accesos se apagaron. Ver '
  'supabase/migrations/20261008140000_reemplazar_propietario.sql.';

revoke all on function public.reemplazar_propietario(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.reemplazar_propietario(uuid, text, text, text, text, text, boolean) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Modo y permisos:
--
--   select proname, prosecdef, proconfig, proacl::text
--     from pg_proc
--    where proname in ('reemplazar_propietario', 'vinculos_propietario_sale_accesos');
--   -- Esperado:
--   --   reemplazar_propietario            | false | {search_path=public} | {postgres=X/postgres,authenticated=X/postgres}
--   --   vinculos_propietario_sale_accesos | true  | {search_path=public} | {postgres=X/postgres}
--
-- 2. Sin sesión no hace nada:
--   select public.reemplazar_propietario('<id de una unidad>', 'Sr.', 'Prueba', null, null, 'x@ejemplo.com');
--   -- Esperado: ERROR "Sin permiso para cambiar el propietario de …"
--
-- 3. Un propietario con varias unidades conserva las otras. Como la
--    administradora, en una transacción que se deshace, reemplazar al
--    propietario de UNA de las 6 unidades de +propietario y contar:
--
--   select count(*) filter (where m.unidad_id = '<la unidad>' and m.activo) as esa,
--          count(*) filter (where m.unidad_id <> '<la unidad>' and m.activo) as otras
--     from public.membresias m
--    where m.usuario_id = '<id de +propietario>' and m.rol = 'residente';
--   -- Esperado: esa = 0, otras = 5 (las mismas que antes).
