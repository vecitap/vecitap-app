-- Un mes cerrado tiene que tener tasa del BCV (ronda 4, punto 1.3).
--
-- Aplicada en vecitap-pruebas el 18-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. No cambia ningún dato ni ninguna
-- función: solo agrega una restricción.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ
-- ─────────────────────────────────────────────────────────────────────────
-- Al leer la base para esta ronda (18-oct) se vio que `cerrar_periodo()` ya
-- se cuida sola: si la tasa del período es 0 o nula, toma la del BCV del
-- último día del mes (`tasa_del_dia()`, la última publicada antes de esa
-- fecha) y, si no hay ninguna, se niega a cerrar. Así que cerrar desde la
-- pantalla con el campo vacío **no** deja los bolívares en cero.
--
-- Lo que nada impedía es llegar a un mes cerrado sin tasa por otro camino:
-- un UPDATE directo a `periodos` (la política de la tabla deja escribir
-- `tasa_bcv` a quien opera la organización; la corrección de la pantalla lo
-- hace), o una versión futura de `cerrar_periodo()` que pierda esa guarda.
-- Con tasa 0, cada monto en bolívares de ese mes (recibos, cortes, correo)
-- sale en Bs 0,00. Esta restricción lo hace imposible en la base, que es
-- donde no se puede saltar.
--
-- Una CHECK y no un disparador: es una regla sobre la fila, sin consultas,
-- y Postgres la comprueba también sobre las filas que ya existen al
-- agregarla. Al 18-oct no hay ninguna que la viole: pruebas tiene 3 meses
-- cerrados, todos con tasa; producción no tiene ningún período (leído, no
-- escrito).
--
-- `cerrar_periodo()` fija la tasa ANTES de pasar el estado a 'cerrado'
-- (`update periodos set tasa_bcv = v_tasa` y después el cierre), así que la
-- restricción nunca le corta el camino. Reabrir (estado 'abierto') tampoco
-- la toca. Un mes abierto puede seguir teniendo tasa 0: significa "la del
-- último día del mes, al cerrar".

begin;

alter table public.periodos
  add constraint periodos_cerrado_con_tasa
  check (estado <> 'cerrado' or tasa_bcv > 0);

comment on constraint periodos_cerrado_con_tasa on public.periodos is
  'Un mes cerrado tiene tasa del BCV mayor que cero: con 0, todos sus montos '
  'en bolívares salen en cero. Ver '
  'supabase/migrations/20261018120000_periodo_cerrado_exige_tasa.sql.';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. La restricción existe y está validada:
--   select conname, convalidated, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.periodos'::regclass
--      and conname = 'periodos_cerrado_con_tasa';
--   -- Esperado: 1 fila, convalidated = true,
--   --   CHECK (((estado <> 'cerrado'::text) OR (tasa_bcv > (0)::numeric)))
--
-- 2. No deja poner tasa 0 a un mes cerrado (en una transacción que se
--    deshace sola, sobre cualquier período cerrado):
--   begin;
--   update public.periodos set tasa_bcv = 0
--    where id = (select id from public.periodos where estado = 'cerrado' limit 1);
--   -- Esperado: ERROR 23514, violates check constraint "periodos_cerrado_con_tasa"
--   rollback;
--
-- 3. Cerrar un mes abierto con tasa 0 sigue funcionando: `cerrar_periodo()`
--    toma la del BCV del último día del mes. Probado en pruebas el 18-oct en
--    una transacción deshecha (abrir con tasa 0 → cerrar → la tasa del
--    período queda > 0 y la restricción no salta).
