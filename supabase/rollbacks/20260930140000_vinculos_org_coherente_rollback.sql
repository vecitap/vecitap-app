-- Rollback de 20260930140000_vinculos_org_coherente.sql — ver ese archivo.
--
-- Borra los dos disparadores y sus funciones. Sin pérdida de datos: la
-- migración no tocó ninguna fila. Devuelve el hueco: una administradora
-- vuelve a poder crear un vínculo sobre una unidad de otra organización.
--
-- Orden: los disparadores antes que sus funciones (el DROP FUNCTION falla si
-- un disparador todavía la usa).

begin;

drop trigger if exists vinculos_unidad_misma_org on public.vinculos;
drop trigger if exists unidades_org_con_vinculos on public.unidades;

drop function if exists public.vinculos_unidad_misma_org();
drop function if exists public.unidades_org_con_vinculos();

commit;

-- Verificación después de revertir:
--
--   select tgname from pg_trigger
--    where tgname in ('vinculos_unidad_misma_org', 'unidades_org_con_vinculos');
--   -- 0 filas esperadas
--
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('vinculos_unidad_misma_org', 'unidades_org_con_vinculos');
--   -- 0 filas esperadas
