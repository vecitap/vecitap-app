-- Cambio 2 de ING3, corrección de la revisión: el detalle del recibo, solo con
-- la cuenta de condominio.
--
-- Aplicada en vecitap-pruebas el 17-nov, por Nicolás con psql. Verificación en OK
-- (md5 e2f43f67…, 0 descuadres, 0 funciones con «\r»).
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo.
-- **Va después de 20261117130000_deuda_por_mes.sql** (la guarda
-- exige su deuda_meses_json(), 24e6b465…). Rollback:
-- supabase/rollbacks/20261117140000_deuda_meses_solo_condominio_rollback.sql.
--
-- QUÉ CAMBIA
-- deuda_meses_json() sumaba las tres cuentas (condominio, honorarios,
-- servicio). El recibo muestra ese detalle debajo de «Saldo del mes anterior»,
-- que es solo el saldo de condominio (recibos.anterior): en un edificio con
-- honorarios atrasados, las líneas no cuadraban con ese renglón. Ahora solo
-- condominio, y la suma de lo que falta es exactamente `anterior`.
-- Nada más cambia: deuda_por_mes() (la ficha y «Mi recibo») sigue mostrando
-- las tres cuentas, y cerrar_periodo() no se toca (llama a esta función).
-- Los recibos ya cerrados no cambian.

begin;

do $guarda$
declare v text; a text;
begin
  select md5(replace(prosrc, chr(13), '')), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.deuda_meses_json(uuid)');
  if v is distinct from '24e6b4654936c8fdd273739fb8638fd4' then
    raise exception 'ABORTADA: deuda_meses_json() no es la de 20261117130000 (md5=%). No se cambió nada.', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_meses_json() tiene otros permisos (%). No se cambió nada.', a;
  end if;
end
$guarda$;

create or replace function public.deuda_meses_json(p_unidad uuid)
  returns jsonb
  language sql
  stable
  set search_path to 'public'
as $function$
  -- Solo la cuenta de condominio (20261117140000): el bloque va debajo de
  -- «Saldo del mes anterior», que es el saldo de condominio.
  select coalesce(jsonb_agg(jsonb_build_object('anio', t.anio, 'mes', t.mes, 'etiqueta', t.etiqueta,
                                               'cargo', round(t.cargo, 2),
                                               'abonado', round(t.cargo, 2) - round(t.falta, 2),
                                               'falta', round(t.falta, 2))
                            order by t.anio nulls first, t.mes nulls first), '[]'::jsonb)
    from (select x.anio, x.mes, min(x.etiqueta) as etiqueta, sum(x.monto) as cargo, sum(x.falta) as falta
            from deuda_partidas(p_unidad) x
           where x.destino = 'condominio'
           group by x.anio, x.mes
          having sum(x.falta) > 0.005) t
$function$;

comment on function public.deuda_meses_json(uuid) is
  'Cambio 2 (ING3): los meses con algo pendiente en la cuenta de condominio, para recibos.deuda_meses (va debajo de «Saldo del mes anterior»). Uso interno de cerrar_periodo().';
comment on column public.recibos.deuda_meses is
  'Cambio 2 (ING3): lo que quedaba pendiente en condominio de los meses anteriores al cerrar este recibo, mes por mes: [{anio, mes, etiqueta, cargo, abonado, falta}]. La suma de falta es `anterior`. null en los recibos anteriores a la migración.';

do $despues$
declare v text; a text;
begin
  select md5(replace(prosrc, chr(13), '')), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.deuda_meses_json(uuid)'::regprocedure;
  if v is distinct from 'e2f43f670a25d59df0c47c836fe37e4e' then
    raise exception 'ABORTADA: deuda_meses_json() no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_meses_json() cambió de permisos (%)', a;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0) then
    raise exception 'ABORTADA: hay funciones con «\r»';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(replace(prosrc, chr(13), '')), array_to_string(proacl, ',')
--      from pg_proc where oid = 'public.deuda_meses_json(uuid)'::regprocedure;
--    -- Esperado: e2f43f670a25d59df0c47c836fe37e4e, postgres=X/postgres.
-- 2. En todas las unidades, lo que falta suma el saldo de condominio:
--      select count(*) from unidades u cross join lateral deuda_por_orden(u.id, null) d
--       where abs(coalesce((select sum((e->>'falta')::numeric)
--                             from jsonb_array_elements(deuda_meses_json(u.id)) e), 0)
--                 - greatest(d.condominio, 0)) > 0.02;
--    -- Esperado: 0 (en pruebas, el 17-nov, antes de aplicar: 0 con la versión nueva).
