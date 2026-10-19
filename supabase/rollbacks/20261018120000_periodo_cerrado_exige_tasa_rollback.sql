-- Reverso de 20261018120000_periodo_cerrado_exige_tasa.sql. Solo quita la
-- restricción; ningún dato cambia.

begin;

alter table public.periodos
  drop constraint if exists periodos_cerrado_con_tasa;

commit;

-- Verificación:
--   select count(*) from pg_constraint
--    where conrelid = 'public.periodos'::regclass
--      and conname = 'periodos_cerrado_con_tasa';
--   -- Esperado: 0
