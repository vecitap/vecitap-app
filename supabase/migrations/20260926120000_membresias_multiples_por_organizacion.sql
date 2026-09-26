-- PROPUESTA — NO aplicada a ninguna base todavía.
--
-- Ver docs/casos-de-uso-mejorados.md (casos 8, 9 y 10) y la decisión
-- registrada en docs/estado-migracion.md: desvío deliberado del plan (esto
-- estaba pautado para la Fase 5), sujeto a revisión con el socio al terminar
-- la migración.
--
-- Contexto confirmado por consulta directa a la base:
--   - 2026-09-26, ronda 1: la restricción actual sobre `membresias` es
--     UNIQUE (org_id, usuario_id), formal (pg_constraint), NO parcial por
--     `activo`. Roles válidos (CHECK): propietario_cuenta, administrador,
--     contador, junta, residente, vigilante. `membresia_alcance` clasifica
--     cada rol: 'residente' -> unidad; 'junta'/'vigilante' -> edificio; el
--     resto -> organización. Las funciones de lectura/permisos y el trigger
--     membresia_ultimo_admin ya toleran varias filas por (org_id,
--     usuario_id) — no requieren cambios.
--   - 2026-09-26, ronda 2 (pg_get_functiondef de aceptar_invitacion,
--     crear_invitacion, invitaciones_de): ninguna de las dos primeras
--     verifica membresías existentes al crear la invitación —
--     invitaciones_de no requiere cambios. El único punto de escritura real
--     es el INSERT ... ON CONFLICT (org_id, usuario_id) DO UPDATE dentro de
--     aceptar_invitacion (PASO 4 de abajo). Se encontraron 2 filas de rol
--     'residente' con edificio_id poblado (dato sobrante: hoy solo se
--     normaliza unidad_id, y solo para 'vigilante') — de ahí el PASO 1.
--     Confirmado que nada en app.html ni en el código migrado lee
--     `membresias.edificio_id` de una fila de rol residente (el único
--     `.from("membresias")` de todo el frontend es un UPDATE puntual por id
--     en app.html:3746, que no toca edificio_id); en la base, las 16
--     funciones que leen `membresias` solo usan edificio_id en caminos que
--     exigen rol junta o vigilante. Ninguna ruta de app.html manda
--     p_edificio en invitaciones de residente (app.html:3721-3723 siempre
--     manda `p_edificio: null`), así que el origen más probable de las 2
--     filas sucias es una carga manual o una versión anterior de la
--     función — no bloquea esta migración, solo justifica el PASO 1.
--
-- Orden dentro de esta única transacción (pedido explícito): limpieza de
-- datos -> cambio de restricción -> nuevas versiones de las funciones.
--
-- Requiere Postgres 15+ por `UNIQUE NULLS NOT DISTINCT`. Confirmar con
-- `select version();` antes de aplicar; si la instancia fuera anterior a la
-- 15, la alternativa es un índice único parcial por cada valor de alcance en
-- vez del UNIQUE del PASO 2.

begin;

-- ════════════════════════════════════════════════════════════════
-- PASO 1 — Limpieza puntual de datos (por id, acotada a rol residente)
-- ════════════════════════════════════════════════════════════════
-- Solo estas 2 filas, confirmadas por consulta directa el 2026-09-26:
--   6f6fedca-b731-4e29-8253-2ae838472f33 (edificio_id actual: ca95bcd3-01ca-4419-b19a-56275a5b0a2f)
--   f057dc25-bc0a-4437-b020-561d699ac8a4 (edificio_id actual: f51676d7-80ff-4812-8830-6307267baecf)
-- El `and rol = 'residente'` es una segunda barrera: si por lo que sea el id
-- ya no correspondiera a una fila de residente cuando esto se corra, el
-- UPDATE no toca nada en vez de nular un edificio_id que sí correspondía.
update public.membresias
   set edificio_id = null
 where id in (
   '6f6fedca-b731-4e29-8253-2ae838472f33',
   'f057dc25-bc0a-4437-b020-561d699ac8a4'
 )
 and rol = 'residente';

-- ════════════════════════════════════════════════════════════════
-- PASO 2 — Restricción única nueva
-- ════════════════════════════════════════════════════════════════
do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'public.membresias'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (org_id, usuario_id)';

  if v_conname is null then
    raise exception
      'No se encontro una UNIQUE (org_id, usuario_id) en membresias con esa definicion exacta -- revisar antes de continuar, no forzar.';
  end if;

  execute format('alter table public.membresias drop constraint %I', v_conname);
end $$;

-- NULLS NOT DISTINCT: ver razonamiento completo en el caso 8 de
-- docs/casos-de-uso-mejorados.md. En corto: dos filas del mismo rol de
-- alcance "organización" (unidad_id y edificio_id ambos NULL) siguen
-- chocando entre sí; dos filas de rol 'residente' con distinto unidad_id, o
-- de rol 'junta'/'vigilante' con distinto edificio_id, no chocan. Esto
-- depende de que el PASO 1 ya haya limpiado los campos sobrantes — por eso
-- va después.
alter table public.membresias
  add constraint membresias_persona_rol_alcance_key
  unique nulls not distinct (org_id, usuario_id, rol, unidad_id, edificio_id);

-- ════════════════════════════════════════════════════════════════
-- PASO 3 — crear_invitacion: normaliza unidad_id/edificio_id por rol
-- ════════════════════════════════════════════════════════════════
-- Único cambio real respecto a la versión actual: antes solo se nulaba
-- unidad_id, y solo para 'vigilante'
--   (v_unidad := case when p_rol = 'vigilante' then null else p_unidad end;).
-- Ahora se normalizan los dos campos para los 6 roles, para que lo que
-- llega a `invitaciones` (y de ahí, vía aceptar_invitacion, a `membresias`)
-- ya venga limpio. Nada más de esta función cambia: sigue sin verificar
-- membresías existentes — confirmado que no le corresponde a
-- crear_invitacion evitar duplicados, eso lo resuelve aceptar_invitacion al
-- momento de aceptar (PASO 4).
CREATE OR REPLACE FUNCTION public.crear_invitacion(p_org uuid, p_correo text, p_rol text, p_edificio uuid DEFAULT NULL::uuid, p_unidad uuid DEFAULT NULL::uuid, p_relacion text DEFAULT 'propietario'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; v_rel text; v_unidad uuid; v_edificio uuid; -- CAMBIO: + v_edificio
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

  -- CAMBIO: antes --
  --   v_unidad := case when p_rol = 'vigilante' then null else p_unidad end;
  -- ahora normaliza unidad_id y edificio_id para los 6 roles según su
  -- alcance (residente -> unidad; junta/vigilante -> edificio; el resto ->
  -- organización, ambos NULL). No existía ninguna línea equivalente para
  -- edificio_id antes de este cambio.
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

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into invitaciones (org_id, correo, rol, edificio_id, unidad_id,
                            relacion, token_hash, creada_por)
  values (p_org, lower(trim(p_correo)), p_rol, v_edificio, v_unidad, v_rel, -- CAMBIO: p_edificio -> v_edificio
          encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end $function$;

-- ════════════════════════════════════════════════════════════════
-- PASO 4 — aceptar_invitacion: sin sobrescritura silenciosa
-- ════════════════════════════════════════════════════════════════
-- Cambios respecto a la versión actual (cada uno marcado con CAMBIO: más
-- abajo, en el cuerpo de la función):
--   1. Se quita "select rol into v_actual from membresias where org_id =
--      ... and usuario_id = ..." y los dos IF que dependían de v_actual
--      (propietario_cuenta / administrador·contador). Con varias filas
--      posibles por organización esa fila "actual" era arbitraria (sin
--      ORDER BY, sin error si hay más de una) y ya no representa "el rol"
--      de la persona. El riesgo que esos dos IF evitaban -- perder un rol
--      por sobrescritura silenciosa -- desaparece solo: más abajo nunca se
--      sobrescribe una membresía distinta, solo se agrega o se reactiva la
--      exacta. Además, bloquear a un administrador que acepta una
--      invitación de residente contradice la decisión de negocio de esta
--      misma migración (administrador + residente en la misma organización
--      es un caso válido). Esta eliminación es un juicio de producto, no
--      solo técnico — queda marcada como tal en el caso 9 de
--      docs/casos-de-uso-mejorados.md para que el socio la confirme.
--   2. Normalización por rol agregada para edificio_id (antes solo nulaba
--      unidad_id, y solo para 'vigilante') — mismo razonamiento que
--      crear_invitacion, necesario para que la restricción del PASO 2
--      identifique bien cada membresía.
--   3. El INSERT ya no hace `on conflict (org_id, usuario_id) do update set
--      ...` sin condiciones (sobrescritura total). Primero se rechaza
--      explícitamente el caso de conflicto real (misma membresía activa,
--      relación distinta — p. ej. alguien que figura como propietario de
--      una unidad y la invitación nueva lo pondría como inquilino de esa
--      misma unidad sin que nadie lo haya dado de baja antes), porque un DO
--      UPDATE no puede levantar una excepción condicional, solo aplicarse o
--      saltarse en silencio. Después, el INSERT usa
--      `on conflict on constraint membresias_persona_rol_alcance_key` (por
--      nombre, no por lista de columnas — pedido explícito, para no
--      depender de la inferencia de índice con NULLS NOT DISTINCT) para
--      reactivar una membresía inactiva, o dejar igual (update idempotente)
--      una ya activa con la misma relación.
--   Límite conocido, no resuelto acá: entre el chequeo de conflicto y el
--   INSERT hay una ventana de carrera si dos invitaciones DISTINTAS que
--   apuntan a la misma membresía destino se aceptan en el mismo instante —
--   el `for update` sobre la invitación (más abajo) ya serializa dos
--   aceptaciones del MISMO token, pero no dos tokens distintos. No se
--   agregó un lock adicional porque no se pidió endurecer concurrencia en
--   esta tarea; si llega a importar, la solución es un
--   `pg_advisory_xact_lock` sobre (org_id, usuario_id) al principio de la
--   función.
CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v invitaciones%rowtype;
  v_correo text; v_rel text; v_unidad uuid; v_edificio uuid; -- CAMBIO: se quita v_actual, se agrega v_edificio
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;

  select * into v from invitaciones
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and usada_en is null
     and expira_en > now()
   for update;

  if not found then raise exception 'Invitación inválida o vencida'; end if;

  v_correo := lower(coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    (select email from auth.users where id = auth.uid())));

  if v_correo is distinct from v.correo then
    raise exception 'Esta invitación fue enviada a otro correo';
  end if;

  -- CAMBIO: se elimina el bloque completo que estaba acá --
  --   select rol into v_actual from membresias
  --    where org_id = v.org_id and usuario_id = auth.uid();
  --   if v_actual = 'propietario_cuenta' and v.rol <> 'propietario_cuenta' then
  --     raise exception 'Esta cuenta es la dueña de la organización. '
  --                     'Aceptar esta invitación le quitaría la administración.';
  --   end if;
  --   if v_actual in ('administrador','contador')
  --      and v.rol in ('residente','vigilante') then
  --     raise exception 'Esta cuenta administra la organización. '
  --                     'Para cambiarle el rol hay que quitarle antes el que tiene.';
  --   end if;
  -- Ver razonamiento (punto 1) en el comentario de cabecera de este PASO 4.

  -- CAMBIO: normalización de edificio_id agregada (antes no existía; solo
  -- se nulaba unidad_id, y solo para 'vigilante':
  --   v_unidad := case when v.rol = 'vigilante' then null else v.unidad_id end;
  -- y edificio_id se insertaba tal cual venía de la invitación, sin normalizar).
  v_unidad   := case v.rol
                  when 'residente' then v.unidad_id
                  else null end;
  v_edificio := case v.rol
                  when 'junta' then v.edificio_id
                  when 'vigilante' then v.edificio_id
                  else null end;

  v_rel := case when v.rol = 'residente'
                then coalesce(v.relacion, 'propietario') else null end;

  -- CAMBIO: chequeo nuevo, reemplaza al ON CONFLICT ... DO UPDATE sin
  -- condiciones que sobrescribía cualquier fila existente.
  if exists (
    select 1 from membresias
     where org_id = v.org_id and usuario_id = auth.uid() and rol = v.rol
       and unidad_id is not distinct from v_unidad
       and edificio_id is not distinct from v_edificio
       and activo
       and relacion is distinct from v_rel
  ) then
    raise exception 'Ya tiene una membresía activa de este tipo con una relación distinta. '
                    'Corríjalo desde Accesos antes de aceptar esta invitación.';
  end if;

  -- CAMBIO: antes --
  --   insert into membresias (org_id, usuario_id, rol, unidad_id, edificio_id, relacion)
  --   values (v.org_id, auth.uid(), v.rol, v_unidad, v.edificio_id, v_rel)
  --   on conflict (org_id, usuario_id)
  --   do update set rol = excluded.rol,
  --                 unidad_id = excluded.unidad_id,
  --                 edificio_id = excluded.edificio_id,
  --                 relacion = excluded.relacion,
  --                 activo = true;
  -- ahora: mismo INSERT (con v_edificio normalizado en vez de v.edificio_id
  -- crudo), pero el ON CONFLICT apunta a la restricción nueva por nombre y
  -- el DO UPDATE queda acotado por WHERE a los dos casos ya permitidos
  -- (reactivar, o dejar igual una ya activa con la misma relación) — el
  -- caso de conflicto real ya fue rechazado arriba, así que acá no puede
  -- volver a chocar con una relación distinta salvo la carrera descrita en
  -- la cabecera del PASO 4.
  insert into membresias (org_id, usuario_id, rol, unidad_id, edificio_id, relacion)
  values (v.org_id, auth.uid(), v.rol, v_unidad, v_edificio, v_rel)
  on conflict on constraint membresias_persona_rol_alcance_key
  do update set activo = true, relacion = excluded.relacion
  where not membresias.activo or membresias.relacion is not distinct from excluded.relacion;

  update invitaciones set usada_en = now() where id = v.id;

  return v.org_id;
end $function$;

commit;

-- Verificación sugerida después de aplicar (no forma parte de la migración):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.membresias'::regclass and contype = 'u';
--
--   select proname, pg_get_functiondef(oid) from pg_proc
--   where proname in ('crear_invitacion','aceptar_invitacion')
--     and pronamespace = 'public'::regnamespace;
