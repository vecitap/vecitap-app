-- Rollback de 20261031150000_multas_sin_mora.sql (ronda 11, B).
--
-- Vuelve simular_cierre() (d52802ec…) y cerrar_periodo() (2db1cb7b…) a la
-- versión anterior —los mismos ocho reemplazos, al revés—, borra
-- deuda_por_orden() y las columnas cargos_unidad.tipo y
-- cortes_mensuales.multas_acumuladas.
--
-- Qué se pierde: qué cargo era una multa y cuántas multas quedaban sin pagar en
-- cada cierre. Desde el próximo cierre las multas vuelven a generar mora, como
-- antes de la ronda 11. Los recibos ya emitidos no cambian (sus líneas de
-- `recibos.cargos` conservan la clave "tipo", que nadie lee). Antes de correrlo,
-- para anotarlas:
--   select p.etiqueta, u.codigo, c.concepto, c.monto from cargos_unidad c
--     join periodos p on p.id = c.periodo_id join unidades u on u.id = c.unidad_id
--    where c.tipo = 'multa' and p.estado = 'abierto';
-- **Volver atrás también el código** (Cobros manda `tipo` al guardar un cargo).

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from '5bb826a852dd38de42cfc7ca78bb59a4' then
    raise exception 'ABORTADO: simular_cierre no es el de 20261031150000 (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'cf6653ad5390d41bc5a4c579af0fd1a1' then
    raise exception 'ABORTADO: cerrar_periodo no es el de 20261031150000 (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.deuda_por_orden(uuid, date)'::regprocedure;
  if v is distinct from 'e5d46aa2bd52c3af12d827555dd52410' then
    raise exception 'ABORTADO: deuda_por_orden no es la de 20261031150000 (md5=%)', v;
  end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text; v_fn text := '';
begin
  -- (n, firma, a = antes, b = después de la migración): acá se cambia b → a.
  for r in select * from (values
      (1, 'public.cerrar_periodo(uuid)',
          E'      v_base_mora := greatest(v_capital + v_pago_tarde, 0);\n',
          E'      -- Ronda 11 (B): las multas que seguían sin pagar el día del vencimiento\n'
          || E'      -- no generan mora (deuda_por_orden, la misma que usa simular_cierre).\n'
          || E'      v_base_mora := greatest(v_capital + v_pago_tarde\n'
          || E'                              - (select d.multas from deuda_por_orden(r.id, v_vence) d), 0);\n'),
      (2, 'public.cerrar_periodo(uuid)',
          E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto)\n',
          E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto, ''tipo'', x.tipo)\n'),
      (3, 'public.cerrar_periodo(uuid)',
          E'        from (select g.concepto, g.referencia, g.monto, g.creado_en\n',
          E'        from (select g.concepto, g.referencia, g.monto, g.creado_en, ''otro'' as tipo\n'),
      (4, 'public.cerrar_periodo(uuid)',
          E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en\n',
          E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en, cu.tipo\n'),
      (5, 'public.cerrar_periodo(uuid)',
          E'                                    mora_acumulada)\n',
          E'                                    mora_acumulada, multas_acumuladas)\n'),
      (6, 'public.cerrar_periodo(uuid)',
          E'                    greatest(v_anterior + v_mora + v_cond + v_directos - v_afavor, 0)));\n',
          E'                    greatest(v_anterior + v_mora + v_cond + v_directos - v_afavor, 0)),\n'
          || E'              -- Ronda 11 (B): las multas sin pagar hoy más las de este recibo, sin\n'
          || E'              -- pasar de lo que queda de condominio después de la mora.\n'
          || E'              least((select d.multas from deuda_por_orden(r.id, null) d)\n'
          || E'                    + coalesce((select sum(cu.monto) from cargos_unidad cu\n'
          || E'                                 where cu.periodo_id = p_periodo and cu.unidad_id = r.id\n'
          || E'                                   and cu.tipo = ''multa''), 0),\n'
          || E'                    greatest(v_anterior + v_mora + v_cond + v_directos - v_afavor\n'
          || E'                             - least(greatest(coalesce(r.previo_mora, 0), 0) + v_mora,\n'
          || E'                                     greatest(v_anterior + v_mora + v_cond + v_directos - v_afavor, 0)), 0)));\n'),
      (7, 'public.simular_cierre(uuid)',
          E'        v_mora := round(greatest(v_capital + v_pago_tarde, 0) * v_mora_pct / 100, 4);\n',
          E'        -- Ronda 11 (B): sin las multas que seguían sin pagar el día del\n'
          || E'        -- vencimiento (deuda_por_orden, la misma que usa cerrar_periodo).\n'
          || E'        v_mora := round(greatest(v_capital + v_pago_tarde\n'
          || E'                                 - (select d.multas from deuda_por_orden(r.id, v_vence) d), 0)\n'
          || E'                        * v_mora_pct / 100, 4);\n'),
      (8, 'public.simular_cierre(uuid)',
          E'              select ''cargo'', concat_ws('' · '', cu.concepto, cu.referencia), cu.monto, cu.creado_en\n',
          E'              select case cu.tipo when ''multa'' then ''multa'' else ''cargo'' end,\n'
          || E'                     concat_ws('' · '', cu.concepto, cu.referencia), cu.monto, cu.creado_en\n')
    ) x(n, firma, a, b) order by firma, n loop
    if r.firma is distinct from v_fn then
      if v_fn <> '' then execute d; end if;
      v_fn := r.firma;
      d := pg_get_functiondef(to_regprocedure(r.firma));
    end if;
    if (length(d) - length(replace(d, r.b, ''))) / length(r.b) <> 1 then
      raise exception 'ABORTADO: el reemplazo % (%) no aparece exactamente una vez', r.n, r.firma;
    end if;
    d := replace(d, r.b, r.a);
  end loop;
  execute d;
end
$reemplazo$;

drop function public.deuda_por_orden(uuid, date);
alter table public.cortes_mensuales drop column multas_acumuladas;
alter table public.cargos_unidad drop column tipo;

do $despues$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'd52802ecfebd69c0ad488af6a44079d7' then
    raise exception 'ABORTADO: simular_cierre no volvió a la versión anterior (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from '2db1cb7be8c9a6d8330e29da8a6a7ac3' then
    raise exception 'ABORTADO: cerrar_periodo no volvió a la versión anterior (md5=%)', v;
  end if;
end
$despues$;

commit;
