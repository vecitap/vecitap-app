-- Rollback de 20260928130000_correos_malos_ver_solo_operador.sql — ver ese
-- archivo. Devuelve la política de SELECT de `correos_malos` a como estaba:
-- cualquier usuario con sesión puede leer la tabla completa.
--
-- Reversible sin pérdida de datos: solo cambia una política, no toca filas,
-- columnas, GRANTs ni funciones.
--
-- Ojo, es un rollback que AFLOJA el acceso: solo tiene sentido si el cambio
-- resultara romper algo que hoy no se ve (no debería — ver el análisis del
-- archivo de migración: las tres funciones que tocan la tabla son
-- SECURITY DEFINER y no hay ninguna consulta directa desde el cliente).

begin;

DROP POLICY IF EXISTS correos_malos_ver ON public.correos_malos;

CREATE POLICY correos_malos_ver ON public.correos_malos
    FOR SELECT USING ((auth.uid() IS NOT NULL));

commit;

-- Verificación después de revertir (esperado: `correos_malos_ver` con
-- `auth.uid() IS NOT NULL` en SELECT, `correos_malos_borrar` intacta con
-- `es_operador()` en DELETE):
--
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname = 'public' and tablename = 'correos_malos'
--    order by policyname;
