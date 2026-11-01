-- Una multa lleva su fundamento (ronda 12, B).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261031150000_multas_sin_mora.sql** (crea cargos_unidad.tipo). Rollback:
-- supabase/rollbacks/20261031170000_multa_con_fundamento_rollback.sql.
--
-- DECISIÓN DE GUSTAVO
-- Al responder «Sí, es una multa», el campo de referencia pasa a llamarse
-- «Fundamento (artículo del documento de condominio o acta de asamblea)» y es
-- obligatorio. Si no es multa, sigue opcional. La base también lo exige.
--
-- QUÉ CAMBIA
-- Una restricción en cargos_unidad: tipo 'multa' sin referencia (o solo con
-- espacios) → error. Se guarda en la misma columna `referencia` (hasta 120
-- letras, como hoy), así que el recibo y el papel la muestran al lado de la
-- multa sin cambios.
--
-- LAS MULTAS QUE YA EXISTEN
-- La restricción se valida al crearla, sobre todas las filas. Si hubiera una
-- multa sin referencia, la migración se detiene y dice cuántas hay (no las
-- cambia por su cuenta: el fundamento lo tiene que escribir la administradora).
-- El 31-oct: en vecitap-pruebas hay una sola multa (08D de Edificio Gustavo,
-- «Acta 12/10») y tiene referencia; en vecitap-produccion la tabla todavía no
-- existe. Los recibos ya emitidos no se tocan: `recibos.cargos` es una copia y
-- no tiene la restricción (en pruebas, la única multa emitida también tiene
-- referencia).

begin;

do $guarda$
declare n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cargos_unidad' and column_name = 'tipo') then
    raise exception 'ABORTADA: falta cargos_unidad.tipo. ¿Falta 20261031150000_multas_sin_mora.sql?';
  end if;
  if exists (select 1 from pg_constraint
              where conrelid = 'public.cargos_unidad'::regclass and conname = 'cargos_unidad_multa_con_fundamento') then
    raise exception 'ABORTADA: la restricción cargos_unidad_multa_con_fundamento ya existe';
  end if;
  select count(*) into n from public.cargos_unidad
   where tipo = 'multa' and nullif(btrim(referencia), '') is null;
  if n > 0 then
    raise exception 'ABORTADA: hay % multa(s) sin fundamento. Escríbalo en Cobros (o páselas a tipo ''otro'') y vuelva a correrla.', n;
  end if;
end
$guarda$;

alter table public.cargos_unidad
  add constraint cargos_unidad_multa_con_fundamento
  check (tipo <> 'multa' or nullif(btrim(referencia), '') is not null);

comment on constraint cargos_unidad_multa_con_fundamento on public.cargos_unidad is
  'Ronda 12 (B): una multa lleva su fundamento (artículo del documento de condominio o acta de asamblea) en `referencia`.';

do $despues$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.cargos_unidad'::regclass and conname = 'cargos_unidad_multa_con_fundamento'
                    and convalidated) then
    raise exception 'ABORTADA: la restricción no quedó validada';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select conname, convalidated, pg_get_constraintdef(oid) from pg_constraint
--     where conname = 'cargos_unidad_multa_con_fundamento';
--    -- Esperado: una fila, true, CHECK ((tipo <> 'multa'::text) OR (NULLIF(btrim(referencia), ''::text) IS NOT NULL)).
-- 2. En un bloque que se deshace, una multa sin referencia y una con solo espacios:
--      insert into cargos_unidad (org_id, periodo_id, unidad_id, concepto, monto, tipo, referencia)
--      values ('<org>', '<mes abierto>', '<unidad>', 'Prueba', 5, 'multa', '  ');
--    -- Esperado: violates check constraint "cargos_unidad_multa_con_fundamento".
--    -- Con tipo 'otro' y sin referencia: entra.
