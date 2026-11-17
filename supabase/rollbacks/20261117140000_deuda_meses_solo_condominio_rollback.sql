-- Rollback de 20261117140000_deuda_meses_solo_condominio.sql.
--
-- Devuelve deuda_meses_json() a la de 20261117130000 (las tres cuentas,
-- 24e6b465…). Los recibos ya cerrados no cambian.

begin;

do $guarda$
declare v text;
begin
  select md5(replace(prosrc, chr(13), '')) into v
    from pg_proc where oid = to_regprocedure('public.deuda_meses_json(uuid)');
  if v is distinct from 'e2f43f670a25d59df0c47c836fe37e4e' then
    raise exception 'ABORTADA: deuda_meses_json() no es la de 20261117140000 (md5=%). No se cambió nada.', v;
  end if;
end
$guarda$;

create or replace function public.deuda_meses_json(p_unidad uuid)
  returns jsonb
  language sql
  stable
  set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('anio', t.anio, 'mes', t.mes, 'etiqueta', t.etiqueta,
                                               'cargo', round(t.cargo, 2),
                                               'abonado', round(t.cargo, 2) - round(t.falta, 2),
                                               'falta', round(t.falta, 2))
                            order by t.anio nulls first, t.mes nulls first), '[]'::jsonb)
    from (select x.anio, x.mes, min(x.etiqueta) as etiqueta, sum(x.monto) as cargo, sum(x.falta) as falta
            from deuda_partidas(p_unidad) x
           group by x.anio, x.mes
          having sum(x.falta) > 0.005) t
$function$;

comment on function public.deuda_meses_json(uuid) is
  'Cambio 2 (ING3): los meses con algo pendiente, para recibos.deuda_meses. Uso interno de cerrar_periodo().';
comment on column public.recibos.deuda_meses is
  'Cambio 2 (ING3): lo que quedaba pendiente de los meses anteriores al cerrar este recibo, mes por mes: [{anio, mes, etiqueta, cargo, abonado, falta}]. null en los recibos anteriores a la migración.';

do $despues$
declare v text; a text;
begin
  select md5(replace(prosrc, chr(13), '')), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.deuda_meses_json(uuid)'::regprocedure;
  if v is distinct from '24e6b4654936c8fdd273739fb8638fd4' then
    raise exception 'ABORTADA: deuda_meses_json() no volvió a 24e6b465… (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_meses_json() cambió de permisos (%)', a;
  end if;
end
$despues$;

commit;
