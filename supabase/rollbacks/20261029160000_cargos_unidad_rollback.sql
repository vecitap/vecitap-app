-- Rollback de 20261029160000_cargos_unidad.sql (ronda 10, C, R10-5).
--
-- Vuelve cerrar_periodo() y simular_cierre() a la versión anterior (md5
-- eaa0fce9… y 19b62999…) y borra `cargos_unidad` con su guarda. **Borra los
-- cargos cargados en Cobros**: los de meses ya cerrados quedan en
-- `recibos.cargos` y `recibos.directos` (el recibo emitido no cambia); los de
-- meses abiertos se pierden y habría que volver a cargarlos como gasto «Solo
-- a una unidad». Antes de correrlo, para anotarlos:
--   select p.etiqueta, u.codigo, c.concepto, c.monto from cargos_unidad c
--     join periodos p on p.id = c.periodo_id join unidades u on u.id = c.unidad_id
--    where p.estado = 'abierto';

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from '2db1cb7be8c9a6d8330e29da8a6a7ac3' then
    raise exception 'ABORTADO: cerrar_periodo no es el de 20261029160000 (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'c116e31f4170921832b2f640a5592d77' then
    raise exception 'ABORTADO: simular_cierre no es el de 20261029160000 (md5=%)', v;
  end if;
end
$guarda$;

do $reemplazo$
declare
  d text;
  -- Los mismos reemplazos de la migración, al revés (b → a).
  -- cerrar_periodo, reemplazo 1: la suma de los cargos de la unidad suma también los de Cobros.
  a1 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n\n      -- Ronda 10 (C): cada cargo';
  b1 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n'
             || E'\n'
             || E'      -- Ronda 10 (C, R10-5): más los cargos a una sola unidad de Cobros\n'
             || E'      -- (multa, consumo), que no son gastos del edificio. Mismo bolsillo\n'
             || E'      -- (condominio) y mismo lugar del cálculo que el gasto directo: antes de\n'
             || E'      -- la mora y del redondeo.\n'
             || E'      v_directos := v_directos + coalesce((select sum(cu.monto) from cargos_unidad cu\n'
             || E'                                            where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n'
             || E'\n      -- Ronda 10 (C): cada cargo';
  -- cerrar_periodo, reemplazo 2: la lista con su motivo incluye los de Cobros.
  a2 text := E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
             || E'               ''concepto'', g.concepto, ''referencia'', g.referencia, ''monto'', g.monto)\n'
             || E'               order by g.orden nulls last, g.creado_en), ''[]''::jsonb)\n'
             || E'        into v_cargos\n'
             || E'        from gastos g\n'
             || E'       where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id;\n';
  b2 text := E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
             || E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto)\n'
             || E'               order by x.creado_en), ''[]''::jsonb)\n'
             || E'        into v_cargos\n'
             || E'        from (select g.concepto, g.referencia, g.monto, g.creado_en\n'
             || E'                from gastos g\n'
             || E'               where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id\n'
             || E'              union all\n'
             || E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en\n'
             || E'                from cargos_unidad cu\n'
             || E'               where cu.periodo_id = p_periodo and cu.unidad_id = r.id) x;\n';
  -- simular_cierre, reemplazo 3: la misma suma, en el bolsillo de condominio.
  a3 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n\n      v_adm  := v_adm  + v_dir_adm;\n';
  b3 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n'
             || E'\n'
             || E'      -- Ronda 10 (C, R10-5): los cargos a una sola unidad de Cobros, igual\n'
             || E'      -- que en cerrar_periodo() (condominio, antes de la mora y del redondeo).\n'
             || E'      v_dir_cond := v_dir_cond + coalesce((select sum(cu.monto) from cargos_unidad cu\n'
             || E'                                            where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n'
             || E'\n      v_adm  := v_adm  + v_dir_adm;\n';
  i int; pares text[][];
begin
  d := pg_get_functiondef('public.cerrar_periodo(uuid)'::regprocedure);
  pares := array[[b1, a1], [b2, a2]];
  for i in 1..2 loop
    if (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 then
      raise exception 'ABORTADA: el reemplazo % de cerrar_periodo no aparece exactamente una vez', i;
    end if;
    d := replace(d, pares[i][1], pares[i][2]);
  end loop;
  execute d;

  d := pg_get_functiondef('public.simular_cierre(uuid)'::regprocedure);
  if (length(d) - length(replace(d, b3, ''))) / length(b3) <> 1 then
    raise exception 'ABORTADA: el reemplazo de simular_cierre no aparece exactamente una vez';
  end if;
  execute replace(d, b3, a3);
end
$reemplazo$;

drop table public.cargos_unidad;
drop function public.cargos_unidad_guarda();

do $despues$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'eaa0fce90bcfe90a248a0c0393f8f3b1' then
    raise exception 'ABORTADO: cerrar_periodo no volvió a la versión anterior (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from '19b6299970311a6d0bf17d48f3aa673f' then
    raise exception 'ABORTADO: simular_cierre no volvió a la versión anterior (md5=%)', v;
  end if;
end
$despues$;

commit;
