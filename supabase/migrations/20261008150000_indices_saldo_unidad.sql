-- Índices por unidad para `saldo_unidad()` (y con ella `saldos_actuales`,
-- `mis_unidades()`, `mis_cuotas()`, `mora_de()`).
--
-- Aplicada en vecitap-pruebas el 08-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. No cambia ningún dato ni ninguna
-- función: solo agrega índices.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ (ronda 3, punto 5: "revisa el costo de saldos_actuales")
-- ─────────────────────────────────────────────────────────────────────────
-- Medido el 08-oct en pruebas, como la administradora de Gustavo:
-- `saldos_actuales` del edificio de 53 unidades tarda ~108 ms (≈2 ms por
-- unidad; la vista llama a saldo_unidad() una vez por unidad, con RLS).
-- Hoy alcanza. Pero saldo_unidad() busca en `recibos`, `pagos` y `ajustes`
-- filtrando **solo por unidad_id**, y los índices que existen empiezan por
-- `org_id` (`recibos_org_id_periodo_id_unidad_id_key`, `pagos_sin_cerrar`,
-- `ajustes_sin_cerrar`), así que Postgres no los puede usar para esa
-- búsqueda: recorre la tabla. Con meses cerrados `recibos` crece unidades ×
-- meses (53 × 12 = 636 filas al año por edificio) y el costo crece con ella.
--
-- Estos índices siguen exactamente los filtros de saldo_unidad():
--   · recibos   (unidad_id)                       — + join a periodos cerrados
--   · pagos     (unidad_id) donde conciliado y sin cerrar
--   · ajustes   (unidad_id) donde sin cerrar
--
-- Sin CONCURRENTLY a propósito: va dentro de una transacción (con su
-- rollback simétrico) y las tablas son chicas — el bloqueo de escritura dura
-- milisegundos. Si algún día las tablas fueran grandes, aplicar cada CREATE
-- INDEX CONCURRENTLY fuera de la transacción.

begin;

create index if not exists recibos_por_unidad
  on public.recibos (unidad_id);

create index if not exists pagos_conciliados_sin_cerrar_por_unidad
  on public.pagos (unidad_id)
  where estado = 'conciliado' and periodo_cierre_id is null;

create index if not exists ajustes_sin_cerrar_por_unidad
  on public.ajustes (unidad_id)
  where periodo_cierre_id is null;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Existen los tres:
--   select indexname from pg_indexes
--    where schemaname = 'public'
--      and indexname in ('recibos_por_unidad',
--                        'pagos_conciliados_sin_cerrar_por_unidad',
--                        'ajustes_sin_cerrar_por_unidad');
--   -- Esperado: 3 filas.
--
-- 2. El plan los usa (con tablas chicas Postgres puede preferir el recorrido
--    secuencial igual; para verlo, desactivarlo solo en esta sesión):
--   set enable_seqscan = off;
--   explain select 1 from public.recibos where unidad_id = '<id>';
--   -- Esperado: "Index Scan using recibos_por_unidad" (o Bitmap Index Scan).
--   reset enable_seqscan;
