-- El cargo a una sola unidad, en su propia línea del recibo (ronda 10,
-- bloque C).
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261028120000_redondeo_regla_gustavo.sql** (la guarda
-- exige su cerrar_periodo()). Rollback:
-- supabase/rollbacks/20261029140000_cargos_en_recibo_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE YA HABÍA
-- ─────────────────────────────────────────────────────────────────────────
-- Un cargo a una sola unidad ya existe: es un gasto `tipo = 'directo'` con su
-- `unidad_id` (Gastos del mes → «Solo a una unidad»), editable y borrable
-- mientras el mes está abierto. simular_cierre() y cerrar_periodo() ya lo
-- suman al total de esa unidad antes del redondeo (ronda 9, A2: probado con
-- «Cargo de prueba» y cuotas extraordinarias). Lo que faltaba: el recibo lo
-- mostraba como una sola línea «Cargos de su unidad» con la suma, sin el
-- motivo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. `recibos.cargos jsonb not null default '[]'`: cada cargo del mes de esa
--    unidad, con su motivo (`concepto`), su referencia y su monto. Los
--    recibos ya emitidos quedan con '[]' (la pantalla sigue mostrando la línea
--    sumada, como hasta hoy).
-- 2. cerrar_periodo(): llena `cargos` al emitir. **Nada más**: el cálculo, el
--    total, el redondeo y el corte no cambian una cifra (`recibos.directos`
--    sigue siendo la suma). Se aplica como dos reemplazos exactos dentro del
--    texto de la función, con su md5 antes y después.
-- simular_cierre() no cambia: ya calcula lo mismo.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from '36bdef305a5cc58cd1cd3b66038220aa' then
    raise exception 'ABORTADA: cerrar_periodo cambió (md5=%). ¿Falta 20261028120000_redondeo_regla_gustavo.sql?', v;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'recibos' and column_name = 'cargos') then
    raise exception 'ABORTADA: recibos.cargos ya existe';
  end if;
end
$guarda$;

alter table public.recibos add column cargos jsonb not null default '[]'::jsonb;

do $reemplazo$
declare
  d text;
  -- Reemplazo 1: la variable, en las declaraciones de cada unidad.
  a1 text := E'      v_dif numeric(18,4);   -- Ronda 7 (bloque 6)\n';
  b1 text := E'      v_dif numeric(18,4);   -- Ronda 7 (bloque 6)\n      v_cargos jsonb;        -- Ronda 10 (C)\n';
  -- Reemplazo 2: después de sumar los cargos de la unidad, la lista con su motivo.
  a2 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n';
  b2 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n'
             || E'\n'
             || E'      -- Ronda 10 (C): cada cargo a esta unidad con su motivo, para su línea\n'
             || E'      -- propia en el recibo. Solo se muestra: el total sigue saliendo de la\n'
             || E'      -- suma de arriba.\n'
             || E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
             || E'               ''concepto'', g.concepto, ''referencia'', g.referencia, ''monto'', g.monto)\n'
             || E'               order by g.orden nulls last, g.creado_en), ''[]''::jsonb)\n'
             || E'        into v_cargos\n'
             || E'        from gastos g\n'
             || E'       where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id;\n';
  -- Reemplazo 3: la columna nueva en el INSERT del recibo.
  a3 text := E'                           total, detalle, conceptos, mora_base, vence_el)\n';
  b3 text := E'                           total, detalle, conceptos, mora_base, vence_el, cargos)\n';
  a4 text := E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox);\n';
  b4 text := E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox, v_cargos);\n';
  i int; pares text[][];
begin
  d := pg_get_functiondef('public.cerrar_periodo(uuid)'::regprocedure);
  pares := array[[a1, b1], [a2, b2], [a3, b3], [a4, b4]];
  for i in 1..4 loop
    if (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 then
      raise exception 'ABORTADA: el reemplazo % no aparece exactamente una vez', i;
    end if;
    d := replace(d, pares[i][1], pares[i][2]);
  end loop;
  execute d;
end
$reemplazo$;

do $despues$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'eaa0fce90bcfe90a248a0c0393f8f3b1' then
    raise exception 'ABORTADA: cerrar_periodo no quedó como se esperaba (md5=%)', v;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc) from pg_proc where proname = 'cerrar_periodo';  → eaa0fce90bcfe90a248a0c0393f8f3b1
--    select column_default, is_nullable from information_schema.columns
--     where table_name = 'recibos' and column_name = 'cargos';  → '[]'::jsonb, NO
-- 2. En una transacción deshecha, como la administradora: un mes abierto con
--    dos cargos a la misma unidad (gastos tipo 'directo', con concepto),
--    redondeo 'redondear' y una cuota extraordinaria:
--      select codigo, total from simular_cierre('<mes>');
--      select * from cerrar_periodo('<mes>');
--      select u.codigo, r.total, r.directos, r.cargos from recibos r join unidades u on u.id = r.unidad_id where r.periodo_id = '<mes>';
--    -- Esperado: el total del recibo = el de la previa; `directos` = la suma
--    --   de los dos cargos; `cargos` = los dos, con su concepto y monto; las
--    --   demás unidades con cargos = '[]'.
