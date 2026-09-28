-- Rollback de 20260928120000_puede_ver_garita.sql — sin aplicar, ver ese
-- archivo. Reversible sin pérdida de datos: la función es nueva y no toca
-- ninguna tabla ni ninguna función existente (no hay ALTER TABLE ni CREATE
-- OR REPLACE de por medio en la migración que revierte).

begin;

DROP FUNCTION IF EXISTS public.puede_ver_garita(uuid);

commit;

-- Verificación sugerida después de revertir:
--   select proname from pg_proc
--   where proname = 'puede_ver_garita' and pronamespace = 'public'::regnamespace;
--   -- (0 filas esperadas)
