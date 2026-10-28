-- Reverso de 20261028160000_saldo_unidad_control.sql (ronda 9, D2).
--
-- Vuelve saldo_unidad() a como estaba (sin control, sin search_path) y le
-- devuelve EXECUTE a PUBLIC (la ACL vacía de antes: la ejecutaba cualquiera).

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.saldo_unidad(uuid)'::regprocedure;
  if v is distinct from '497d819a42e0533a410dbb62155da7cb' then
    raise exception 'ABORTADA: saldo_unidad no es la de la ronda 9 (md5=%)', v;
  end if;
end
$guarda$;

CREATE OR REPLACE FUNCTION public.saldo_unidad(p_unidad uuid)
 RETURNS TABLE(condominio numeric, administracion numeric, servicio numeric, total numeric, mora numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_anio int; v_mes int;
  v_cond numeric(18,4); v_adm numeric(18,4); v_serv numeric(18,4);
  v_mora numeric(18,4); v_abonos numeric(18,4);
begin
  select p.anio, p.mes, c.saldo_condominio, c.saldo_honorarios,
         c.saldo_servicio, c.mora_acumulada
    into v_anio, v_mes, v_cond, v_adm, v_serv, v_mora
    from cortes_mensuales c
    join periodos p on p.id = c.periodo_id
   where c.unidad_id = p_unidad
   order by p.anio desc, p.mes desc
   limit 1;

  if v_anio is null then
    select u.saldo_inicial, u.saldo_inicial_hon, 0, 0
      into v_cond, v_adm, v_serv, v_mora
      from unidades u where u.id = p_unidad;
    if v_cond is null then
      return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
      return;
    end if;
    v_anio := -1; v_mes := 0;
  end if;

  v_mora := coalesce(v_mora, 0);

  -- Recibos de meses cerrados posteriores por calendario
  select v_cond + coalesce(sum(r.cuota + r.directos + r.mora), 0),
         v_adm  + coalesce(sum(r.honorario), 0),
         v_serv + coalesce(sum(r.servicio), 0),
         v_mora + coalesce(sum(r.mora), 0)
    into v_cond, v_adm, v_serv, v_mora
    from recibos r
    join periodos p on p.id = r.periodo_id
   where r.unidad_id = p_unidad
     and p.estado = 'cerrado'
     and (p.anio, p.mes) > (v_anio, v_mes);

  select v_cond - coalesce(sum(p.monto_usd) filter (where p.destino = 'condominio'), 0),
         v_adm  - coalesce(sum(p.monto_usd) filter (where p.destino = 'honorarios'), 0),
         v_serv - coalesce(sum(p.monto_usd) filter (where p.destino = 'servicio'), 0),
         coalesce(sum(p.monto_usd) filter (where p.destino = 'condominio'), 0)
    into v_cond, v_adm, v_serv, v_abonos
    from pagos p
   where p.unidad_id = p_unidad
     and p.estado = 'conciliado'
     and p.periodo_cierre_id is null;

  v_mora := greatest(v_mora - coalesce(v_abonos, 0), 0);

  select v_cond - coalesce(sum(a.monto) filter (where a.destino = 'condominio'), 0),
         v_adm  - coalesce(sum(a.monto) filter (where a.destino = 'honorarios'), 0),
         v_serv - coalesce(sum(a.monto) filter (where a.destino = 'servicio'), 0),
         coalesce(sum(a.monto) filter (where a.destino = 'condominio'), 0)
    into v_cond, v_adm, v_serv, v_abonos
    from ajustes a
   where a.unidad_id = p_unidad
     and a.periodo_cierre_id is null;

  v_mora := greatest(v_mora - coalesce(v_abonos, 0), 0);
  -- La mora nunca puede ser mayor que la deuda que la contiene
  v_mora := least(v_mora, greatest(v_cond, 0));

  return query select v_cond, v_adm, v_serv, v_cond + v_adm + v_serv, v_mora;
end $function$;

-- CREATE OR REPLACE ya deja la función sin search_path; esto lo asegura.
alter function public.saldo_unidad(uuid) reset search_path;
grant execute on function public.saldo_unidad(uuid) to public;

commit;

-- Verificación: md5 → 1396d4083c6be0e3902f0814a3de0e44; proconfig → null;
-- has_function_privilege('anon', 'public.saldo_unidad(uuid)', 'execute') → true.
