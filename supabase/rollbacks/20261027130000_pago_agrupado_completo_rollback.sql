-- Reverso de 20261027130000_pago_agrupado_completo.sql (ronda 8, bloque B1).
--
-- Vuelve pagos_grupo_al_insertar() al cuerpo de 20261026190000_pago_agrupado.sql
-- y borra el disparador que impide cambiar grupo_id. No toca pagos.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.pagos_grupo_al_insertar()'::regprocedure;
  if v is distinct from '584fb1055a82a713857b633a761ab45f' then
    raise exception 'ABORTADA: pagos_grupo_al_insertar() no es la de la ronda 8 (md5(prosrc)=%).', v;
  end if;
end
$guarda$;

drop trigger if exists pagos_grupo_inmutable on public.pagos;
drop function if exists public.pagos_grupo_inmutable();

create or replace function public.pagos_grupo_al_insertar() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare g record; v_tasa numeric; v_total numeric; v_suma numeric; v_mayor uuid;
begin
  for g in select distinct n.grupo_id from nuevos n where n.grupo_id is not null loop
    if (select count(distinct (p.org_id, u.edificio_id, p.fecha, p.moneda,
                               coalesce(p.metodo, ''), coalesce(p.referencia, '')))
          from pagos p join unidades u on u.id = p.unidad_id
         where p.grupo_id = g.grupo_id) > 1 then
      raise exception 'Un pago agrupado es una sola transferencia: todas sus partes tienen que tener el mismo edificio, fecha, moneda, método y referencia.';
    end if;
    if (select count(*) - count(distinct p.unidad_id) from pagos p where p.grupo_id = g.grupo_id) > 0 then
      raise exception 'Un pago agrupado no puede repetir una unidad.';
    end if;

    -- En bolívares: cada parte a centavos y la diferencia a la más grande.
    select max(p.tasa_aplicada), sum(p.monto) into v_tasa, v_total
      from pagos p where p.grupo_id = g.grupo_id and p.moneda = 'VES';
    if coalesce(v_tasa, 0) > 0 then
      update pagos p set monto_usd = round(p.monto / v_tasa, 2)
       where p.grupo_id = g.grupo_id;
      select sum(p.monto_usd) into v_suma from pagos p where p.grupo_id = g.grupo_id;
      select p.id into v_mayor from pagos p where p.grupo_id = g.grupo_id
       order by p.monto desc, p.id limit 1;
      update pagos p set monto_usd = p.monto_usd + (round(v_total / v_tasa, 2) - v_suma)
       where p.id = v_mayor;
    end if;
  end loop;
  return null;
end $function$;

commit;

-- Verificación: md5(prosrc) de pagos_grupo_al_insertar → 968d25e15a4d349314ed935627b73c1d; y
-- select count(*) from pg_trigger where tgname = 'pagos_grupo_inmutable' → 0.
