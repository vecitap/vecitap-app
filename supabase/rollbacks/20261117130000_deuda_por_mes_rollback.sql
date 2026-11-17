-- Rollback de 20261117130000_deuda_por_mes.sql (cambio 2 de ING3).
--
-- Devuelve cerrar_periodo() a cf6653ad… (los 4 reemplazos al revés), borra
-- deuda_por_mes, repartir_pago, deuda_meses_json, deuda_partidas y
-- puede_ver_saldo, y la columna recibos.deuda_meses.
--
-- OJO: la columna guarda el detalle «lo que quedó pendiente» de los recibos
-- cerrados después de la migración. Al borrarla, esos recibos dejan de
-- mostrar el bloque; los montos no cambian. Ninguna otra tabla se toca.

begin;

do $guarda$
declare v text;
begin
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'd71adcb4251c0ceac7c4d7672d79ac77' then
    raise exception 'ABORTADA: cerrar_periodo() no es la de 20261117130000_deuda_por_mes (md5=%). No se cambió nada.', v;
  end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text;
begin
  d := pg_get_functiondef('public.cerrar_periodo(uuid)'::regprocedure);
  for r in select * from (values
      (1, E'      v_cargos jsonb;        -- Ronda 10 (C)\n'
          || E'      v_deuda_meses jsonb;   -- Cambio 2 (ING3)\n',
          E'      v_cargos jsonb;        -- Ronda 10 (C)\n'),
      (2, E'      -- Cambio 2 (ING3): lo que quedaba pendiente de los meses anteriores,\n'
          || E'      -- mes por mes, con los pagos que entran en este cierre y antes de\n'
          || E'      -- sumar este recibo. Queda congelado en el recibo.\n'
          || E'      v_deuda_meses := deuda_meses_json(r.id);\n\n'
          || E'      insert into recibos (org_id, periodo_id, unidad_id, numero, alicuota, tasa_bcv,\n',
          E'      insert into recibos (org_id, periodo_id, unidad_id, numero, alicuota, tasa_bcv,\n'),
      (3, E'                           total, detalle, conceptos, mora_base, vence_el, cargos, deuda_meses)\n',
          E'                           total, detalle, conceptos, mora_base, vence_el, cargos)\n'),
      (4, E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox, v_cargos, v_deuda_meses);\n',
          E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox, v_cargos);\n')
    ) x(n, a, b) order by n loop
    if (length(d) - length(replace(d, r.a, ''))) / length(r.a) <> 1 then
      raise exception 'ABORTADA: el reemplazo % de cerrar_periodo no aparece exactamente una vez', r.n;
    end if;
    d := replace(d, r.a, r.b);
  end loop;
  execute d;
end
$reemplazo$;

drop function public.repartir_pago(uuid[], numeric, text);
drop function public.deuda_por_mes(uuid);
drop function public.deuda_meses_json(uuid);
drop function public.deuda_partidas(uuid);
drop function public.puede_ver_saldo(uuid);
alter table public.recibos drop column deuda_meses;

do $despues$
declare v text; a text;
begin
  select md5(replace(prosrc, chr(13), '')), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'cf6653ad5390d41bc5a4c579af0fd1a1' then
    raise exception 'ABORTADA: cerrar_periodo() no volvió a cf6653ad… (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: cerrar_periodo() cambió de permisos (%)', a;
  end if;
end
$despues$;

commit;

-- VERIFICACIÓN
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
--   -- Esperado: cf6653ad5390d41bc5a4c579af0fd1a1.
-- select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--    and proname in ('deuda_partidas', 'puede_ver_saldo', 'deuda_por_mes', 'deuda_meses_json', 'repartir_pago');
--   -- Esperado: 0.
-- select count(*) from information_schema.columns where table_name = 'recibos' and column_name = 'deuda_meses';
--   -- Esperado: 0.
