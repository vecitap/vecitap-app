-- Reverso de 20261026180000_estado_financiero.sql (ronda 7, bloque 8).
-- Solo borra la función: no hay datos que perder.

begin;
drop function if exists public.estado_financiero(uuid, date, date);
commit;

-- Verificación: select to_regprocedure('public.estado_financiero(uuid, date, date)');  -- null
