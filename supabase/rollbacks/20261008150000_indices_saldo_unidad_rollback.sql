-- Reverso de 20261008150000_indices_saldo_unidad.sql. Solo borra los índices;
-- ningún dato cambia.

begin;

drop index if exists public.recibos_por_unidad;
drop index if exists public.pagos_conciliados_sin_cerrar_por_unidad;
drop index if exists public.ajustes_sin_cerrar_por_unidad;

commit;

-- Verificación:
--   select count(*) from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('recibos_por_unidad',
--                        'pagos_conciliados_sin_cerrar_por_unidad',
--                        'ajustes_sin_cerrar_por_unidad');
--   -- Esperado: 0
