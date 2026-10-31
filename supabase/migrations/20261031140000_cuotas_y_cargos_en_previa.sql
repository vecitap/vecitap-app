-- «Cómo se reparte»: las cuotas extraordinarias y los cargos de la unidad,
-- aparte y con su detalle (ronda 11, C).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261029160000_cargos_unidad.sql** (la guarda exige su simular_cierre(),
-- c116e31f…). Rollback:
-- supabase/rollbacks/20261031140000_cuotas_y_cargos_en_previa_rollback.sql.
--
-- POR QUÉ
-- En la previa del cierre, la cuota extraordinaria, el gasto directo y los
-- cargos de Cobros iban sumados dentro de «Condominio» (08D, mayo: $ 65 sin
-- saber de qué). Gustavo pidió una columna aparte, «Cuotas y cargos», con el
-- detalle de cada monto.
--
-- QUÉ CAMBIA (solo simular_cierre(); cerrar_periodo() y el recibo no se tocan):
-- · Dos columnas nuevas al final de lo que devuelve:
--     cuotas_cargos   numeric  lo que, dentro de `condominio`, no es la cuota
--                              ordinaria: cuotas extraordinarias de condominio
--                              (conceptos con `cuotas`), gastos directos de
--                              condominio de la unidad y cargos de Cobros
--                              (`cargos_unidad`). **Ya está sumado en
--                              `condominio`**: `condominio` no cambia, el total
--                              tampoco.
--     detalle_cargos  jsonb    una línea por monto: {tipo: 'cuota'|'gasto'|
--                              'cargo', etiqueta, monto}. La cuota extraordinaria
--                              con el mismo nombre que el recibo («Ascensor
--                              (cuota 1 de 3)»); el gasto y el cargo con su
--                              motivo y referencia.
-- · Las cuotas extraordinarias de administración o de servicio siguen en sus
--   columnas, como hoy (no están en `condominio`).
-- · Como cambia lo que devuelve, la función se borra y se vuelve a crear (no se
--   puede con «create or replace»). Ningún objeto de la base depende de ella
--   (comprobado: 0 en pg_depend). Los permisos se reponen igual que estaban:
--   EXECUTE solo para authenticated.
--
-- La app (components/admin/CierreMes.tsx) lee las columnas nuevas; con el
-- código anterior las ignora (supabase-js no falla por columnas de más).

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'c116e31f4170921832b2f640a5592d77' then
    raise exception 'ABORTADA: simular_cierre cambió (md5=%). ¿Falta 20261029160000_cargos_unidad.sql?', v;
  end if;
  if exists (select 1 from pg_depend
              where refobjid = 'public.simular_cierre(uuid)'::regprocedure and deptype <> 'n') then
    raise exception 'ABORTADA: hay objetos que dependen de simular_cierre(): no se puede borrar y recrear';
  end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text;
begin
  d := pg_get_functiondef('public.simular_cierre(uuid)'::regprocedure);
  for r in select * from (values
      -- 1. Las dos columnas nuevas.
      (1, E' RETURNS TABLE(codigo text, alicuota numeric, condominio numeric, administracion numeric, servicio numeric, anterior numeric, a_favor numeric, mora numeric, total numeric, redondeo numeric)\n',
          E' RETURNS TABLE(codigo text, alicuota numeric, condominio numeric, administracion numeric, servicio numeric, anterior numeric, a_favor numeric, mora numeric, total numeric, redondeo numeric, cuotas_cargos numeric, detalle_cargos jsonb)\n'),
      -- 2. Por unidad: la suma y la lista.
      (2, E'      v_hechas int; -- Ronda 7 (bloque 5)\n',
          E'      v_hechas int; -- Ronda 7 (bloque 5)\n'
          || E'      v_extra numeric(18,4) := 0; v_det jsonb := ''[]'';   -- Ronda 11 (C)\n'),
      -- 3. La cuota extraordinaria de condominio.
      (3, E'          end if;\n        end if;\n        v_monto := round(v_base * (1 + c.iva / 100), 4);\n',
          E'          end if;\n        end if;\n        v_monto := round(v_base * (1 + c.iva / 100), 4);\n'
          || E'        -- Ronda 11 (C): la cuota extraordinaria de condominio va aparte, en\n'
          || E'        -- «Cuotas y cargos», con el mismo nombre que le pone el recibo.\n'
          || E'        if c.cuotas is not null and c.bolsillo = ''condominio'' then\n'
          || E'          v_extra := v_extra + v_monto;\n'
          || E'          v_det := v_det || jsonb_build_object(''tipo'', ''cuota'',\n'
          || E'                     ''etiqueta'', case when c.cuotas > 1 then format(''%s (cuota %s de %s)'', c.nombre, v_hechas + 1, c.cuotas) else c.nombre end,\n'
          || E'                     ''monto'', round(v_monto, 2));\n'
          || E'        end if;\n'),
      -- 4. El gasto directo de condominio y los cargos de Cobros.
      (4, E'where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n\n      v_adm  := v_adm  + v_dir_adm;\n',
          E'where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n'
          || E'\n'
          || E'      -- Ronda 11 (C): el gasto directo de condominio y los cargos de Cobros\n'
          || E'      -- también van en «Cuotas y cargos», cada uno con su motivo.\n'
          || E'      v_extra := v_extra + v_dir_cond;\n'
          || E'      select v_det || coalesce(jsonb_agg(jsonb_build_object(''tipo'', x.tipo, ''etiqueta'', x.etiqueta,\n'
          || E'                                                    ''monto'', round(x.monto, 2)) order by x.creado_en), ''[]''::jsonb)\n'
          || E'        into v_det\n'
          || E'        from (select ''gasto'' as tipo, concat_ws('' · '', g.concepto, nullif(btrim(g.referencia), '''')) as etiqueta,\n'
          || E'                     g.monto, g.creado_en\n'
          || E'                from gastos g\n'
          || E'               where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id\n'
          || E'                 and g.bolsillo = ''condominio''\n'
          || E'              union all\n'
          || E'              select ''cargo'', concat_ws('' · '', cu.concepto, cu.referencia), cu.monto, cu.creado_en\n'
          || E'                from cargos_unidad cu\n'
          || E'               where cu.periodo_id = p_periodo and cu.unidad_id = r.id) x;\n'
          || E'\n      v_adm  := v_adm  + v_dir_adm;\n'),
      -- 5. Las dos columnas, en la fila de salida.
      (5, E'      redondeo := greatest(v_dif, 0);\n',
          E'      redondeo := greatest(v_dif, 0);\n'
          || E'      cuotas_cargos := v_extra;   -- Ronda 11 (C): ya está sumado en condominio\n'
          || E'      detalle_cargos := v_det;\n')
    ) x(n, a, b) order by n loop
    if (length(d) - length(replace(d, r.a, ''))) / length(r.a) <> 1 then
      raise exception 'ABORTADA: el reemplazo % de simular_cierre no aparece exactamente una vez', r.n;
    end if;
    d := replace(d, r.a, r.b);
  end loop;

  drop function public.simular_cierre(uuid);
  execute d;
end
$reemplazo$;

revoke all on function public.simular_cierre(uuid) from public, anon;
grant execute on function public.simular_cierre(uuid) to authenticated;

do $despues$
declare v text; a text;
begin
  select md5(prosrc), array_to_string(proacl, ',') into v, a
    from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'd52802ecfebd69c0ad488af6a44079d7' then
    raise exception 'ABORTADA: simular_cierre no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: los permisos de simular_cierre no quedaron como estaban (%)', a;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), prosecdef, array_to_string(proacl, ','), pg_get_function_result(oid)
--      from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
--    -- Esperado: d52802ecfebd69c0ad488af6a44079d7, true,
--    --   postgres=X/postgres,authenticated=X/postgres, y al final del TABLE(…)
--    --   «redondeo numeric, cuotas_cargos numeric, detalle_cargos jsonb».
-- 2. Como la administradora del edificio, con el mes abierto:
--      select codigo, condominio, cuotas_cargos, detalle_cargos, total from simular_cierre('<período>');
--    -- Esperado: cuotas_cargos = la suma de los `monto` de detalle_cargos;
--    --   condominio y total iguales a antes de la migración (comparar con la
--    --   misma consulta antes de aplicarla, o con el rollback en seco).
--    -- Edificio Gustavo, Mayo 2027, 08D: cuotas_cargos 55,00 = «Reparacion de
--    --   tuberia» 40 + «Multa por ruido» 15 (el 31-oct, Ascensor ya terminó sus 3
--    --   cuotas y Pintura está inactiva).
