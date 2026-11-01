-- Un pago cubre las multas al final (ronda 12, A).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261031150000_multas_sin_mora.sql** (la guarda exige su deuda_por_orden(),
-- e5d46aa2…). Rollback:
-- supabase/rollbacks/20261031160000_multas_al_final_rollback.sql.
--
-- DECISIÓN DE GUSTAVO (cambia la de la ronda 11)
-- Un pago cubre 1° la mora, 2° las cuotas y demás cargos (de la más antigua a
-- la más reciente) y 3° las multas, al final. Las multas siguen sin generar
-- mora. (Gastos de cobranza y honorarios, primeros en el orden de la ley, no
-- existen en la app: anotado para después del piloto.)
--
-- QUÉ CAMBIA
-- Solo deuda_por_orden(), la única copia de la fórmula: la línea de las
-- multas. Antes los abonos que sobraban de la mora iban a las multas; ahora
-- van a las cuotas y cargos, y las multas quedan sin pagar mientras quede
-- deuda: multas = menor(multas, deuda de condominio − mora).
-- simular_cierre() y cerrar_periodo() no cambian (sus md5 siguen 5bb826a8… y
-- cf6653ad…): la base de la mora sigue siendo «capital + pagos tardíos − multas
-- sin pagar el día del vencimiento», y el corte guarda las multas sin pagar
-- con el orden nuevo. Sin multas, el resultado es idéntico (se resta 0).
--
-- Los ejemplos (mora al 1 %, $ 100 de cuota y $ 15 de multa, pago antes del
-- vencimiento): paga 0 → base 100; 10 → 90; 50 → 50; 110 → 0 y quedan $ 5 de
-- multa. Con $ 5 de mora previa, paga 10 → mora previa 0, base 95, multas 15.

begin;

do $guarda$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.deuda_por_orden(uuid, date)');
  if v is distinct from 'e5d46aa2bd52c3af12d827555dd52410' then
    raise exception 'ABORTADA: deuda_por_orden cambió (md5=%). ¿Falta 20261031150000_multas_sin_mora.sql?', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_por_orden tiene otros permisos (%)', a;
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

  -- Ronda 12 (A, decisión de Gustavo): el orden es primero la mora, después
  -- las cuotas y demás cargos (de la más antigua a la más reciente) y al final
  -- las multas. Las multas son lo último que se paga: quedan sin pagar las
  -- últimas, hasta lo que queda de la deuda después de la mora.
  mora := least(greatest(v_mora - v_abonos, 0), greatest(v_cond, 0));
  multas := least(v_multas, greatest(v_cond - mora, 0));
  condominio := v_cond;
  resto := greatest(v_cond - mora - multas, 0);
  return next;
end $function$;

comment on function public.deuda_por_orden(uuid, date) is
  'Ronda 12 (A): deuda de condominio a una fecha, con los abonos aplicados a mora, cuotas y cargos, y multas, en ese orden. Uso interno de simular_cierre() y cerrar_periodo().';
comment on column public.cortes_mensuales.multas_acumuladas is
  'Ronda 12 (A): multas sin pagar al cierre (los pagos cubren primero la mora, después las cuotas y cargos, y al final las multas). No generan mora.';

do $despues$
declare v text; a text;
begin
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = to_regprocedure('public.deuda_por_orden(uuid, date)');
  if v is distinct from '766beca27abf363f4b78b3d21db6654e' then
    raise exception 'ABORTADA: deuda_por_orden no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_por_orden tiene otros permisos (%)', a;
  end if;
end
$despues$;

do $otras$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from '5bb826a852dd38de42cfc7ca78bb59a4' then
    raise exception 'ABORTADA: simular_cierre no es el de 20261031150000 (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'cf6653ad5390d41bc5a4c579af0fd1a1' then
    raise exception 'ABORTADA: cerrar_periodo no es el de 20261031150000 (md5=%)', v;
  end if;
end
$otras$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc), array_to_string(proacl, ',') from pg_proc
--     where proname in ('simular_cierre', 'cerrar_periodo', 'deuda_por_orden') order by 1;
--    -- Esperado: cerrar_periodo cf6653ad5390d41bc5a4c579af0fd1a1; deuda_por_orden 766beca27abf363f4b78b3d21db6654e,
--    --   postgres=X/postgres; simular_cierre 5bb826a852dd38de42cfc7ca78bb59a4 (estas dos, sin cambios).
-- 2. Sin multas, la previa no cambia: con el mes abierto de un edificio,
--      select md5(string_agg(concat_ws('|', codigo, condominio, administracion, servicio, anterior,
--                                      a_favor, mora, total, redondeo), ';' order by codigo))
--        from simular_cierre('<período>');
--    -- Esperado: la misma huella antes y después.
-- 3. Una unidad que debe $ 100 de cuota y $ 15 de multa, mora al 1 %, pago antes del
--    vencimiento: paga 0 → mora 1,00; 10 → 0,90; 50 → 0,50; 110 → 0,00 y el corte
--    guarda multas_acumuladas 5. Con $ 5 de mora previa y pago de 10 → mora 0,95 y
--    multas_acumuladas 15. simular_cierre() y cerrar_periodo() dan lo mismo.
