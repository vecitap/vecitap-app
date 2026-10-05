-- Rollback de 20261005120000_crear_invitacion_reemplaza_pendiente.sql — ver ese archivo.
--
-- Devuelve `crear_invitacion` a la versión de 20260926120000 (PASO 3),
-- copiada tal cual de ese archivo: generar una invitación nueva vuelve a
-- dejar viva la pendiente anterior del mismo correo y la misma unidad.
--
-- Sin pérdida de datos. Las invitaciones que la versión nueva ya anuló
-- quedan anuladas (vencidas): el rollback no las revive, igual que no
-- revive una revocada a mano.

begin;

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

commit;

-- Verificación después de revertir:
--
--   select md5(replace(prosrc, E'\r', '')) from pg_proc
--    where oid = 'public.crear_invitacion(uuid,text,text,uuid,uuid,text)'::regprocedure;
--   -- Esperado: f29847e7ef3fcfdafaa7cfe14830647c (el valor de antes de la
--   -- migración, el mismo en las dos bases el 05-oct). Si da otro, avisar:
--   -- el cuerpo restaurado no es byte a byte el que había.
