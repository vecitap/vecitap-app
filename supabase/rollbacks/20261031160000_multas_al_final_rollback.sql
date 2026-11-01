-- Rollback de 20261031160000_multas_al_final.sql (ronda 12, A).
--
-- Vuelve deuda_por_orden() a la de la ronda 11 (e5d46aa2…: los abonos cubren
-- la mora, después las multas y al final lo demás). simular_cierre() y
-- cerrar_periodo() no se tocan. Los cortes ya guardados no cambian: sus
-- multas_acumuladas se calcularon con el orden de la ronda 12. Desde el
-- próximo cierre, las multas se vuelven a pagar antes que las cuotas.
-- Va antes que el rollback de 20261031150000 (su guarda exige e5d46aa2…).

begin;

do $guarda$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.deuda_por_orden(uuid, date)');
  if v is distinct from '766beca27abf363f4b78b3d21db6654e' then
    raise exception 'ABORTADO: deuda_por_orden no es la de 20261031160000 (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADO: deuda_por_orden tiene otros permisos (%)', a;
  end if;
end
$guarda$;

create or replace function public.deuda_por_orden(p_unidad uuid, p_hasta date default null)
  returns table(condominio numeric, mora numeric, multas numeric, resto numeric)
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v_anio int; v_mes int;
  v_cond numeric(18,4); v_mora numeric(18,4); v_multas numeric(18,4); v_abonos numeric(18,4);
begin
  -- El último corte (como saldo_unidad()); sin ninguno, el saldo inicial.
  select p.anio, p.mes, c.saldo_condominio, c.mora_acumulada, c.multas_acumuladas
    into v_anio, v_mes, v_cond, v_mora, v_multas
    from cortes_mensuales c
    join periodos p on p.id = c.periodo_id
   where c.unidad_id = p_unidad
   order by p.anio desc, p.mes desc
   limit 1;
  if v_anio is null then
    select coalesce(u.saldo_inicial, 0) into v_cond from unidades u where u.id = p_unidad;
    v_mora := 0; v_multas := 0; v_anio := -1; v_mes := 0;
  end if;
  v_cond := coalesce(v_cond, 0); v_mora := coalesce(v_mora, 0); v_multas := coalesce(v_multas, 0);

  -- Los recibos cerrados posteriores (normalmente ninguno: cada cierre deja su corte).
  select v_cond + coalesce(sum(r.cuota + r.directos + r.mora), 0),
         v_mora + coalesce(sum(r.mora), 0),
         v_multas + coalesce(sum((select coalesce(sum((x->>'monto')::numeric), 0)
                                    from jsonb_array_elements(r.cargos) x
                                   where x->>'tipo' = 'multa')), 0)
    into v_cond, v_mora, v_multas
    from recibos r
    join periodos p on p.id = r.periodo_id
   where r.unidad_id = p_unidad and p.estado = 'cerrado' and (p.anio, p.mes) > (v_anio, v_mes);

  -- Lo abonado a condominio desde el último cierre, hasta la fecha.
  v_abonos := coalesce((select sum(p.monto_usd) from pagos p
                         where p.unidad_id = p_unidad and p.estado = 'conciliado'
                           and p.periodo_cierre_id is null and p.destino = 'condominio'
                           and (p_hasta is null or p.fecha <= p_hasta)), 0)
            + coalesce((select sum(a.monto) from ajustes a
                         where a.unidad_id = p_unidad and a.periodo_cierre_id is null
                           and a.destino = 'condominio'
                           and (p_hasta is null or a.fecha <= p_hasta)), 0);
  v_cond := v_cond - v_abonos;

  -- El orden: primero la mora, después las multas, al final lo demás. Ninguna
  -- pasa de la deuda que la contiene.
  mora := least(greatest(v_mora - v_abonos, 0), greatest(v_cond, 0));
  multas := least(greatest(v_multas - greatest(v_abonos - v_mora, 0), 0), greatest(v_cond - mora, 0));
  condominio := v_cond;
  resto := greatest(v_cond - mora - multas, 0);
  return next;
end $function$;

comment on function public.deuda_por_orden(uuid, date) is
  'Ronda 11 (B): deuda de condominio a una fecha, con los abonos aplicados a mora, multas y resto, en ese orden. Uso interno de simular_cierre() y cerrar_periodo().';
comment on column public.cortes_mensuales.multas_acumuladas is
  'Ronda 11 (B): multas sin pagar al cierre (los pagos cubren primero la mora, después las multas). No generan mora.';

do $despues$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.deuda_por_orden(uuid, date)');
  if v is distinct from 'e5d46aa2bd52c3af12d827555dd52410' then
    raise exception 'ABORTADO: deuda_por_orden no volvió a la de 20261031150000 (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADO: deuda_por_orden tiene otros permisos (%)', a;
  end if;
end
$despues$;

commit;
