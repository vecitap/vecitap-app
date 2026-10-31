-- Rollback de 20261031140000_cuotas_y_cargos_en_previa.sql (ronda 11, C).
--
-- Vuelve simular_cierre() a la versión de 20261029160000 (md5 c116e31f…), sin
-- las columnas cuotas_cargos y detalle_cargos: los mismos cinco reemplazos, al
-- revés, borrando y recreando la función, y con los mismos permisos. No toca
-- datos. **Volver atrás también el código de CierreMes.tsx**: sin las columnas,
-- «Cuotas y cargos» saldría en $ 0,00 y «Condominio» con todo sumado.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'd52802ecfebd69c0ad488af6a44079d7' then
    raise exception 'ABORTADO: simular_cierre no es el de 20261031140000 (md5=%)', v;
  end if;
  if exists (select 1 from pg_depend
              where refobjid = 'public.simular_cierre(uuid)'::regprocedure and deptype <> 'n') then
    raise exception 'ABORTADO: hay objetos que dependen de simular_cierre(): no se puede borrar y recrear';
  end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text;
begin
  d := pg_get_functiondef('public.simular_cierre(uuid)'::regprocedure);
  -- (n, a = antes, b = después de la migración): acá se cambia b → a.
  for r in select * from (values
      (1, E' RETURNS TABLE(codigo text, alicuota numeric, condominio numeric, administracion numeric, servicio numeric, anterior numeric, a_favor numeric, mora numeric, total numeric, redondeo numeric)\n',
          E' RETURNS TABLE(codigo text, alicuota numeric, condominio numeric, administracion numeric, servicio numeric, anterior numeric, a_favor numeric, mora numeric, total numeric, redondeo numeric, cuotas_cargos numeric, detalle_cargos jsonb)\n'),
      (2, E'      v_hechas int; -- Ronda 7 (bloque 5)\n',
          E'      v_hechas int; -- Ronda 7 (bloque 5)\n'
          || E'      v_extra numeric(18,4) := 0; v_det jsonb := ''[]'';   -- Ronda 11 (C)\n'),
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
      (5, E'      redondeo := greatest(v_dif, 0);\n',
          E'      redondeo := greatest(v_dif, 0);\n'
          || E'      cuotas_cargos := v_extra;   -- Ronda 11 (C): ya está sumado en condominio\n'
          || E'      detalle_cargos := v_det;\n')
    ) x(n, a, b) order by n desc loop
    if (length(d) - length(replace(d, r.b, ''))) / length(r.b) <> 1 then
      raise exception 'ABORTADO: el reemplazo % de simular_cierre no aparece exactamente una vez', r.n;
    end if;
    d := replace(d, r.b, r.a);
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
  if v is distinct from 'c116e31f4170921832b2f640a5592d77' then
    raise exception 'ABORTADO: simular_cierre no volvió a la versión anterior (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADO: los permisos de simular_cierre no quedaron como estaban (%)', a;
  end if;
end
$despues$;

commit;
