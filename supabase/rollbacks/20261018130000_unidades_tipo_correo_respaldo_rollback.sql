-- Reverso de 20261018130000_unidades_tipo_correo_respaldo.sql.
--
-- OJO: a diferencia del de ida, este SÍ borra datos: el tipo de cada unidad
-- y los correos de respaldo que se hayan cargado desde que se aplicó. Si hay
-- que conservarlos, exportarlos antes:
--   select id, codigo, tipo from public.unidades where tipo <> 'apartamento';
--   select id, nombre, correo_respaldo from public.personas where correo_respaldo is not null;
--
-- Antes de correrlo, revertir 20261018140000_importar_unidades.sql (la
-- función escribe estas dos columnas).

begin;

alter table public.unidades drop column if exists tipo;
alter table public.personas drop column if exists correo_respaldo;

commit;

-- Verificación:
--   select count(*) from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (('unidades','tipo'), ('personas','correo_respaldo'));
--   -- Esperado: 0
