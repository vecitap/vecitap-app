-- `crear_invitacion`: una invitación nueva anula la pendiente del mismo
-- correo y el mismo alcance.
--
-- SIN APLICAR. La aplica Nicolás: primero en vecitap-pruebas, después en
-- vecitap-produccion, con respaldo previo (docs/respaldo.md).
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA (validación de la fase 1 en el Preview, 04-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- Accesos le dice al administrador "Este código se muestra una sola vez…
-- Si se pierde, genere otro". Pero generar otro dejaba la invitación
-- anterior viva: dos códigos válidos para el mismo correo y la misma
-- unidad, el perdido incluido, hasta que vencieran (7 días) o alguien los
-- revocara uno por uno a mano.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL CAMBIO
-- ─────────────────────────────────────────────────────────────────────────
-- Antes del INSERT, se anulan las invitaciones PENDIENTES (sin usar y sin
-- vencer) de la misma organización, el mismo correo, el mismo rol y el
-- mismo alcance (unidad_id / edificio_id ya normalizados por rol). Se
-- anulan igual que lo hace `revocar_invitacion`: `expira_en` a un segundo
-- atrás. No se borran: quedan en la lista de Accesos como "vencida" y en la
-- auditoría.
--
-- · La relación (propietario / inquilino) NO entra en la comparación: una
--   invitación nueva para el mismo correo y la misma unidad reemplaza a la
--   anterior aunque la relación sea otra — es la que el administrador
--   quiere ahora.
-- · Una invitación ya USADA no se toca (usada_en is not null).
-- · Todo pasa en la misma transacción que el INSERT: si el INSERT falla
--   (por ejemplo, `invitacion_exige_al_dia` con la organización atrasada),
--   la anulación se deshace con él y la pendiente anterior sigue viva.
-- · Mismos permisos que antes: la anulación ocurre después del
--   `tiene_rol(...)` del principio, y solo sobre filas de `p_org`.
--
-- Resto de la función: idéntico a 20260926120000 (PASO 3). La firma no
-- cambia, así que CREATE OR REPLACE conserva dueño y permisos (EXECUTE para
-- `authenticated`, verificado el 05-oct en las dos bases).
--
-- Cuerpo actual verificado el 05-oct: igual en vecitap-pruebas y en
-- vecitap-produccion (md5 de prosrc sin retornos de carro
-- f29847e7ef3fcfdafaa7cfe14830647c en las dos).
--
-- `aceptar_invitacion` NO cambia. Se revisó contra el caso que destapó el
-- problema (una cuenta con una unidad que acepta otra): la membresía es
-- única por (org, usuario, rol, unidad, edificio), así que una segunda
-- unidad de la misma organización, o una unidad de otra organización, es
-- una fila nueva y se acepta. Lo que faltaba era la pantalla, no la base.

begin;

CREATE OR REPLACE FUNCTION public.crear_invitacion(p_org uuid, p_correo text, p_rol text, p_edificio uuid DEFAULT NULL::uuid, p_unidad uuid DEFAULT NULL::uuid, p_relacion text DEFAULT 'propietario'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_token text; v_rel text; v_unidad uuid; v_edificio uuid; v_correo text;
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

  -- Normaliza unidad_id y edificio_id según el alcance del rol
  -- (residente -> unidad; junta/vigilante -> edificio; el resto ->
  -- organización, ambos NULL).
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

  v_correo := lower(trim(p_correo));

  -- NUEVO (05-oct): la invitación nueva reemplaza a la pendiente del mismo
  -- correo y el mismo alcance. Se anula igual que en revocar_invitacion.
  update invitaciones
     set expira_en = now() - interval '1 second'
   where org_id = p_org
     and correo = v_correo
     and rol = p_rol
     and unidad_id is not distinct from v_unidad
     and edificio_id is not distinct from v_edificio
     and usada_en is null
     and expira_en > now();

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into invitaciones (org_id, correo, rol, edificio_id, unidad_id,
                            relacion, token_hash, creada_por)
  values (p_org, v_correo, p_rol, v_edificio, v_unidad, v_rel,
          encode(digest(v_token, 'sha256'), 'hex'), auth.uid());

  return v_token;
end $function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. La función tiene el bloque nuevo y conserva modo y permisos:
--
--   select prosecdef, proconfig, proacl::text,
--          md5(replace(prosrc, E'\r', '')) as cuerpo
--     from pg_proc
--    where oid = 'public.crear_invitacion(uuid,text,text,uuid,uuid,text)'::regprocedure;
--   -- Esperado: true | {"search_path=public, extensions"}
--   --           | {postgres=X/postgres,authenticated=X/postgres}
--   --           | d5807ae08c2fb3415f04056493b5e5a7
--
-- 2. Desde la app (Preview de dev, como administradora): Accesos → generar
--    dos invitaciones seguidas para el mismo correo y la misma unidad. En
--    "Invitaciones" la primera tiene que quedar "vencida" y la segunda
--    "pendiente". Y por SQL, para esa unidad:
--
--   select count(*) filter (where usada_en is null and expira_en > now()) as pendientes
--     from public.invitaciones
--    where unidad_id = '<id de la unidad>' and correo = '<correo>';
--   -- Esperado: 1
--
-- 3. El código de la primera ya no sirve: pegarlo en /mi/agregar con la
--    cuenta de ese correo tiene que decir "Invitación inválida o vencida".
