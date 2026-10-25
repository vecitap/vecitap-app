-- Tipo de unidad y correo de respaldo de la persona (ronda 5, importador
-- «Cargar datos»).
--
-- Aplicada en vecitap-pruebas el 18-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. Solo agrega dos columnas con valor
-- por omisión: no cambia ningún dato existente ni ninguna función.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ
-- ─────────────────────────────────────────────────────────────────────────
-- 1. `unidades.tipo` — pedido de Gustavo del 04-oct ("distinguir el tipo de
--    unidad"). En la planilla del piloto el tipo viene como prefijo del
--    código ("PB. L-B", "Mz. L-B" son locales) y como una fila
--    "Estacionamiento". Hoy no hay dónde guardarlo. Lista cerrada, para que
--    se pueda filtrar y contar; "otro" cubre lo que no encaje. Todas las
--    unidades que ya existen quedan como 'apartamento' (el caso de casi
--    todas); la administradora corrige las demás en la ficha.
--    No cambia ninguna cuenta: el tipo no entra en el reparto, que sigue
--    siendo por alícuota.
--
-- 2. `personas.correo_respaldo` — la planilla trae "Correo 2" en 30 de 54
--    filas y la ficha tenía un solo correo: el dato se perdía. Decisión de
--    Nicolás (18-oct): se guarda, se ve y se edita en la ficha, y sirve para
--    reconocer a la persona al importar. **No se usa para mandar nada**
--    (`encolar_recibos()` y los demás envíos siguen leyendo solo `correo`).
--    Las políticas de RLS de `personas` son por fila, así que la columna
--    nueva queda cubierta por las mismas.

begin;

alter table public.unidades
  add column tipo text not null default 'apartamento'
  constraint unidades_tipo_check
  check (tipo in ('apartamento', 'casa', 'local', 'oficina', 'estacionamiento', 'deposito', 'otro'));

comment on column public.unidades.tipo is
  'Qué es la unidad. Solo informativo: el reparto sigue siendo por alícuota. '
  'Ver supabase/migrations/20261018130000_unidades_tipo_correo_respaldo.sql.';

alter table public.personas
  add column correo_respaldo text;

comment on column public.personas.correo_respaldo is
  'Segundo correo de la persona ("Correo 2" de las planillas). Sirve para '
  'reconocerla al importar; NO se usa para enviar correos. Ver '
  'supabase/migrations/20261018130000_unidades_tipo_correo_respaldo.sql.';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Las dos columnas existen con su valor por omisión:
--   select table_name, column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and (table_name, column_name) in (('unidades','tipo'), ('personas','correo_respaldo'));
--   -- Esperado: unidades.tipo text NOT NULL default 'apartamento'::text;
--   --           personas.correo_respaldo text NULL sin default.
--
-- 2. Todas las unidades existentes quedaron como apartamento:
--   select tipo, count(*) from public.unidades group by tipo;
--   -- Esperado: una sola fila, 'apartamento'.
--
-- 3. La lista cerrada se cumple (en una transacción que se deshace):
--   begin;
--   update public.unidades set tipo = 'bodega' where id = (select id from public.unidades limit 1);
--   -- Esperado: ERROR 23514, violates check constraint "unidades_tipo_check"
--   rollback;
