-- Reverso de 20261029140000_cargos_en_recibo.sql (ronda 10, C).
--
-- Vuelve cerrar_periodo() al de 20261028120000_redondeo_regla_gustavo.sql
-- (los mismos reemplazos, al revés) y borra recibos.cargos. Los recibos
-- emitidos con cargos pierden su lista de cargos (la suma sigue en
-- `directos`): el recibo vuelve a mostrar la línea «Cargos de su unidad».
-- Antes, la app tiene que volver a la versión que no lee `cargos`.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'eaa0fce90bcfe90a248a0c0393f8f3b1' then
    raise exception 'ABORTADA: cerrar_periodo no es la de la ronda 10 (md5=%)', v;
  end if;
end
$guarda$;

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
  pares := array[[b1, a1], [b2, a2], [b3, a3], [b4, a4]];
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
  if v is distinct from '36bdef305a5cc58cd1cd3b66038220aa' then
    raise exception 'ABORTADA: cerrar_periodo no volvió al de la ronda 9 (md5=%)', v;
  end if;
end
$despues$;

alter table public.recibos drop column cargos;

commit;
