-- Reverso de 20261018140000_importar_unidades.sql. Solo borra la función:
-- lo que se haya cargado con ella (unidades, personas, vínculos) queda, como
-- cualquier dato cargado a mano.

begin;

drop function if exists public.importar_unidades(uuid, jsonb, jsonb);

commit;

-- Verificación:
--   select count(*) from pg_proc where proname = 'importar_unidades';
--   -- Esperado: 0
