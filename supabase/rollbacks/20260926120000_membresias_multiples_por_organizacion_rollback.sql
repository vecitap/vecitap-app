-- Reversión de
-- supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql
--
-- Vive fuera de supabase/migrations/ a propósito: todo lo que está en esa
-- carpeta se aplica en orden con `supabase db push`, y este archivo no debe
-- correr solo porque sí — es una acción manual, deliberada, para el día que
-- el socio decida revertir los casos 8/9/10 de docs/casos-de-uso-mejorados.md.
--
-- Orden: inverso al de la migración (funciones -> restricción -> datos).
--
-- OJO — leer antes de correr, restricción (PASO 2 de la migración): si para
-- el momento de revertir ya existen personas con más de una membresía en la
-- misma organización (el caso que la migración de ida habilitó a propósito:
-- dos unidades, o junta + residente, o administrador + residente, etc.), la
-- restricción anterior vuelve a prohibirlo sin excepciones. La restricción
-- UNIQUE (org_id, usuario_id) que se restaura NO es parcial por `activo`, así
-- que esto incluye membresías inactivas: una persona con una fila activa y
-- otra dada de baja en la misma organización también rompe el ADD CONSTRAINT
-- de abajo, no solo el caso de dos filas activas. Antes de ejecutar esto,
-- correr (sin filtrar por `activo`):
--
--   select org_id, usuario_id, count(*) as membresias
--   from public.membresias
--   group by org_id, usuario_id
--   having count(*) > 1;
--
-- Esa consulta debe devolver CERO filas antes de aplicar esta reversión sin
-- pérdida de datos. Si devuelve filas, decidir con el socio, por cada persona
-- listada, qué hacer con CADA una de sus filas en esa organización (activas e
-- inactivas por igual, ya que con la restricción anterior no pueden coexistir
-- ni siquiera dadas de baja):
--   - cuál se conserva tal cual, y
--   - cuáles de las demás se borran o se fusionan en una sola fila, o
--   - si el negocio decide que sí deben coexistir, no revertir esta parte
--     todavía y resolver el conflicto puntual que motivó la reversión por
--     otra vía.
--
-- OJO — datos (PASO 1 de la migración): esta reversión restaura los 2
-- valores exactos de edificio_id que la migración nuló. Si entre la
-- aplicación de la migración y esta reversión se crearon membresías nuevas
-- de rol residente que legítimamente no deberían tener edificio_id, este
-- UPDATE no las toca (va acotado por id) — no hace falta nada extra ahí.

begin;

-- 1. Restaurar la versión anterior de aceptar_invitacion (con la sobrescritura
--    silenciosa y las dos protecciones por v_actual).
CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v invitaciones%rowtype;
  v_correo text; v_rel text; v_actual text; v_unidad uuid;
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

  select rol into v_actual from membresias
   where org_id = v.org_id and usuario_id = auth.uid();

  if v_actual = 'propietario_cuenta' and v.rol <> 'propietario_cuenta' then
    raise exception 'Esta cuenta es la dueña de la organización. '
                    'Aceptar esta invitación le quitaría la administración.';
  end if;

  -- Antes esto solo miraba el caso de residente. Con vigilante el
  -- accidente es el mismo: quien administra pierde la administración.
  if v_actual in ('administrador','contador')
     and v.rol in ('residente','vigilante') then
    raise exception 'Esta cuenta administra la organización. '
                    'Para cambiarle el rol hay que quitarle antes el que tiene.';
  end if;

  v_rel := case when v.rol = 'residente'
                then coalesce(v.relacion, 'propietario') else null end;
  v_unidad := case when v.rol = 'vigilante' then null else v.unidad_id end;

  insert into membresias (org_id, usuario_id, rol, unidad_id, edificio_id, relacion)
  values (v.org_id, auth.uid(), v.rol, v_unidad, v.edificio_id, v_rel)
  on conflict (org_id, usuario_id)
  do update set rol = excluded.rol,
                unidad_id = excluded.unidad_id,
                edificio_id = excluded.edificio_id,
                relacion = excluded.relacion,
                activo = true;

  update invitaciones set usada_en = now() where id = v.id;

  return v.org_id;
end $function$;

-- 2. Restaurar la versión anterior de crear_invitacion (sin normalización
--    por rol).
CREATE OR REPLACE FUNCTION public.crear_invitacion(p_org uuid, p_correo text, p_rol text, p_edificio uuid DEFAULT NULL::uuid, p_unidad uuid DEFAULT NULL::uuid, p_relacion text DEFAULT 'propietario'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; v_rel text; v_unidad uuid;
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

  -- El vigilante se asigna a un edificio entero, nunca a una unidad.
  v_unidad := case when p_rol = 'vigilante' then null else p_unidad end;

  v_rel := case when p_rol = 'residente'
                then coalesce(nullif(p_relacion, ''), 'propietario') else null end;
  if v_rel is not null and v_rel not in ('propietario','inquilino') then
    raise exception 'La relación tiene que ser propietario o inquilino';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into invitaciones (org_id, correo, rol, edificio_id, unidad_id,
                            relacion, token_hash, creada_por)
  values (p_org, lower(trim(p_correo)), p_rol, p_edificio, v_unidad, v_rel,
          encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end $function$;

-- 3. Restaurar la restricción anterior.
alter table public.membresias
  drop constraint if exists membresias_persona_rol_alcance_key;

alter table public.membresias
  add constraint membresias_org_id_usuario_id_key
  unique (org_id, usuario_id);

-- 4. Restaurar los 2 valores exactos de edificio_id que el PASO 1 de la
--    migración nuló.
update public.membresias set edificio_id = 'ca95bcd3-01ca-4419-b19a-56275a5b0a2f'
 where id = '6f6fedca-b731-4e29-8253-2ae838472f33';

update public.membresias set edificio_id = 'f51676d7-80ff-4812-8830-6307267baecf'
 where id = 'f057dc25-bc0a-4437-b020-561d699ac8a4';

commit;

-- Verificación sugerida después de revertir:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.membresias'::regclass and contype = 'u';
--
--   select id, rol, unidad_id, edificio_id from public.membresias
--   where id in ('6f6fedca-b731-4e29-8253-2ae838472f33',
--                'f057dc25-bc0a-4437-b020-561d699ac8a4');
