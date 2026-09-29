-- Rollback de 20260928140000_garita_bitacora_dia_local.sql — ver ese archivo.
--
-- Devuelve `garita_bitacora` **exactamente** a la versión que Nicolás sacó de
-- vecitap-pruebas con `pg_get_functiondef` el 28-sep (el arreglo del correo
-- del vigilante de Gustavo incluido, tal cual), y borra las dos auxiliares de
-- zona.
--
-- Reversible sin pérdida de datos: no toca ninguna fila, columna, política ni
-- GRANT. `bitacora` es de solo inserción en todo el esquema de Garita — nada
-- de lo que hace esta migración ni su reversión escribe ahí.
--
-- **Ojo: este rollback devuelve el bug.** Vuelve a decidir el día en la zona
-- de la sesión (UTC), así que las notas registradas entre las 20:00 y la
-- medianoche de Venezuela vuelven a aparecer en el día siguiente. Solo tiene
-- sentido si la corrección rompiera algo que hoy no se ve.
--
-- El orden importa: primero se restaura `garita_bitacora` (para que deje de
-- referenciar a las auxiliares) y después se borran las auxiliares. Al revés,
-- el DROP fallaría por dependencia.

begin;

-- 1) La versión original, byte por byte como estaba.
CREATE OR REPLACE FUNCTION public.garita_bitacora(p_edificio uuid, p_fecha date DEFAULT NULL::date, p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, creado_en timestamp with time zone, tipo text, texto text, vigilante text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_f date;
begin
  perform permitir_garita(p_edificio);
  v_f := coalesce(p_fecha, current_date);
  return query
  select b.id, b.creado_en, b.tipo, b.texto,
         coalesce((select au.email::text from auth.users au   -- ← el arreglo
                    where au.id = b.vigilante_id), '—')
    from bitacora b
   where b.edificio_id = p_edificio
     and b.creado_en >= v_f::timestamptz
     and b.creado_en <  (v_f + 1)::timestamptz
   order by b.creado_en desc
   limit greatest(coalesce(p_limite, 200), 1);
end $function$;

-- 2) Recién ahora, las auxiliares. (Se crearon con `SET search_path = ''` y
--    sin SECURITY DEFINER; para el DROP eso no cambia nada, las firmas son
--    las mismas.)
DROP FUNCTION IF EXISTS public.inicio_dia_local(date);
DROP FUNCTION IF EXISTS public.hoy_local();

commit;

-- Verificación después de revertir:
--
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('hoy_local', 'inicio_dia_local');
--   -- (0 filas esperadas)
--
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'garita_bitacora' and pronamespace = 'public'::regnamespace;
--   -- Esperado: vuelve a decir `current_date` y `v_f::timestamptz`.
--
-- Si el DROP de una auxiliar falla por dependencia, es que algo más empezó a
-- usarla (el bloque 13, u otra corrección de zona posterior). En ese caso NO
-- forzar con CASCADE: revisar quién la usa antes de borrarla.
