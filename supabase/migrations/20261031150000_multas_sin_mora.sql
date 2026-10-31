-- Las multas no generan mora (ronda 11, B).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261031140000_cuotas_y_cargos_en_previa.sql** (la guarda exige su
-- simular_cierre(), d52802ec…) **y de 20261029160000_cargos_unidad.sql** (su
-- cerrar_periodo(), 2db1cb7b…, y la tabla cargos_unidad). Rollback:
-- supabase/rollbacks/20261031150000_multas_sin_mora_rollback.sql.
--
-- DECISIÓN DE GUSTAVO
-- Las multas no generan mora; las reparaciones, los consumos y las cuotas sí.
-- Todo va al bolsillo de condominio. Un pago cubre primero la mora, después las
-- multas y al final las cuotas y lo demás. Las multas solo se cargan desde
-- Cobros («Cargo a una sola unidad»); el gasto «Solo a una unidad» de Gastos
-- del mes no cambia (genera mora, como hoy).
--
-- QUÉ CAMBIA
-- 1. cargos_unidad.tipo: 'multa' u 'otro', NOT NULL, por omisión 'otro' (lo que
--    ya existe sigue como hoy: genera mora). La pantalla pregunta «¿Es una
--    multa?» sin respuesta por omisión.
-- 2. cortes_mensuales.multas_acumuladas: las multas que quedan sin pagar en cada
--    cierre, como `mora_acumulada`. Por omisión 0 (los cortes viejos no tenían
--    multas).
-- 3. deuda_por_orden(p_unidad, p_hasta): la deuda de condominio de la unidad a
--    una fecha, con los pagos y ajustes de condominio sin cierre **hasta esa
--    fecha** (p_hasta NULL = todos) aplicados en orden: primero la mora,
--    después las multas, al final lo demás. Devuelve condominio, mora, multas y
--    resto. Parte, como saldo_unidad(), del último corte y de los recibos
--    cerrados posteriores; las multas de esos recibos son las líneas de
--    `recibos.cargos` con tipo 'multa'. **La única copia de la fórmula**: la
--    usan simular_cierre() y cerrar_periodo(). Uso interno: sin EXECUTE para
--    nadie más que el dueño (las dos que la llaman son SECURITY DEFINER).
-- 4. simular_cierre() y cerrar_periodo(), la base de la mora:
--      antes:  capital + pagos hechos después del vencimiento
--      ahora:  lo mismo, menos las multas que seguían sin pagar el día del
--              vencimiento (deuda_por_orden(unidad, vencimiento).multas)
--    Sin multas, el resultado es idéntico al de hoy (se resta 0). No se cambió
--    el resto de la base a propósito: reescribirla entera con deuda_por_orden
--    cambiaría la mora en otro caso (mora previa + pago tardío), y eso no se pidió.
-- 5. cerrar_periodo() guarda en cada línea de `recibos.cargos` su tipo ('multa'
--    u 'otro'; un gasto directo, 'otro') y en el corte `multas_acumuladas` = las
--    multas sin pagar hoy + las multas de este recibo, sin pasar de la deuda de
--    condominio que queda después de la mora.
-- 6. simular_cierre(): en `detalle_cargos`, la multa sale con tipo 'multa'.
--
-- reabrir_periodo() no cambia: borra el recibo y el corte del mes, y al volver
-- a cerrar se calculan otra vez igual.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'd52802ecfebd69c0ad488af6a44079d7' then
    raise exception 'ABORTADA: simular_cierre cambió (md5=%). ¿Falta 20261031140000_cuotas_y_cargos_en_previa.sql?', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from '2db1cb7be8c9a6d8330e29da8a6a7ac3' then
    raise exception 'ABORTADA: cerrar_periodo cambió (md5=%). ¿Falta 20261029160000_cargos_unidad.sql?', v;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'cargos_unidad' and column_name = 'tipo') then
    raise exception 'ABORTADA: cargos_unidad.tipo ya existe';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'cortes_mensuales' and column_name = 'multas_acumuladas') then
    raise exception 'ABORTADA: cortes_mensuales.multas_acumuladas ya existe';
  end if;
  if to_regprocedure('public.deuda_por_orden(uuid, date)') is not null then
    raise exception 'ABORTADA: deuda_por_orden ya existe';
  end if;
end
$guarda$;

-- 1 y 2. Las columnas.
alter table public.cargos_unidad
  add column tipo text not null default 'otro'
  constraint cargos_unidad_tipo check (tipo in ('multa', 'otro'));
comment on column public.cargos_unidad.tipo is
  'Ronda 11 (B): ''multa'' no genera mora; ''otro'' (consumo u otro cobro) sí, como la cuota.';

alter table public.cortes_mensuales
  add column multas_acumuladas numeric(18,4) not null default 0;
comment on column public.cortes_mensuales.multas_acumuladas is
  'Ronda 11 (B): multas sin pagar al cierre (los pagos cubren primero la mora, después las multas). No generan mora.';

-- 3. La función compartida.
create function public.deuda_por_orden(p_unidad uuid, p_hasta date default null)
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

revoke all on function public.deuda_por_orden(uuid, date) from public, anon, authenticated;

comment on function public.deuda_por_orden(uuid, date) is
  'Ronda 11 (B): deuda de condominio a una fecha, con los abonos aplicados a mora, multas y resto, en ese orden. Uso interno de simular_cierre() y cerrar_periodo().';

-- 4, 5 y 6. Los reemplazos en simular_cierre() y cerrar_periodo().
do $reemplazo$
declare
  r record; d text; v_fn text := '';
begin
  for r in select * from (values
      -- cerrar_periodo, 1: la base de la mora sin las multas del día del vencimiento.
      (1, 'public.cerrar_periodo(uuid)',
          E'      v_base_mora := greatest(v_capital + v_pago_tarde, 0);\n',
          E'      -- Ronda 11 (B): las multas que seguían sin pagar el día del vencimiento\n'
          || E'      -- no generan mora (deuda_por_orden, la misma que usa simular_cierre).\n'
          || E'      v_base_mora := greatest(v_capital + v_pago_tarde\n'
          || E'                              - (select d.multas from deuda_por_orden(r.id, v_vence) d), 0);\n'),
      -- cerrar_periodo, 2: cada cargo del recibo con su tipo.
      (2, 'public.cerrar_periodo(uuid)',
          E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto)\n',
          E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto, ''tipo'', x.tipo)\n'),
      (3, 'public.cerrar_periodo(uuid)',
          E'        from (select g.concepto, g.referencia, g.monto, g.creado_en\n',
          E'        from (select g.concepto, g.referencia, g.monto, g.creado_en, ''otro'' as tipo\n'),
      (4, 'public.cerrar_periodo(uuid)',
          E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en\n',
          E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en, cu.tipo\n'),
      -- cerrar_periodo, 3: las multas sin pagar en el corte.
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
      -- simular_cierre, 1: la misma base de la mora.
      (7, 'public.simular_cierre(uuid)',
          E'        v_mora := round(greatest(v_capital + v_pago_tarde, 0) * v_mora_pct / 100, 4);\n',
          E'        -- Ronda 11 (B): sin las multas que seguían sin pagar el día del\n'
          || E'        -- vencimiento (deuda_por_orden, la misma que usa cerrar_periodo).\n'
          || E'        v_mora := round(greatest(v_capital + v_pago_tarde\n'
          || E'                                 - (select d.multas from deuda_por_orden(r.id, v_vence) d), 0)\n'
          || E'                        * v_mora_pct / 100, 4);\n'),
      -- simular_cierre, 2: la multa se distingue en el detalle.
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
    if (length(d) - length(replace(d, r.a, ''))) / length(r.a) <> 1 then
      raise exception 'ABORTADA: el reemplazo % (%) no aparece exactamente una vez', r.n, r.firma;
    end if;
    d := replace(d, r.a, r.b);
  end loop;
  execute d;
end
$reemplazo$;

do $despues$
declare v text; a text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from '5bb826a852dd38de42cfc7ca78bb59a4' then
    raise exception 'ABORTADA: simular_cierre no quedó como se esperaba (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'cf6653ad5390d41bc5a4c579af0fd1a1' then
    raise exception 'ABORTADA: cerrar_periodo no quedó como se esperaba (md5=%)', v;
  end if;
  select md5(prosrc), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.deuda_por_orden(uuid, date)'::regprocedure;
  if v is distinct from 'e5d46aa2bd52c3af12d827555dd52410' then
    raise exception 'ABORTADA: deuda_por_orden no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADA: deuda_por_orden tiene permisos de más (%)', a;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc), array_to_string(proacl, ',') from pg_proc
--     where proname in ('simular_cierre', 'cerrar_periodo', 'deuda_por_orden') order by 1;
--    -- Esperado: cerrar_periodo cf6653ad5390d41bc5a4c579af0fd1a1; deuda_por_orden e5d46aa2bd52c3af12d827555dd52410,
--    --   postgres=X/postgres (nadie más); simular_cierre 5bb826a852dd38de42cfc7ca78bb59a4,
--    --   postgres=X/postgres,authenticated=X/postgres.
-- 2. select column_name, is_nullable, column_default from information_schema.columns
--     where (table_name, column_name) in (('cargos_unidad','tipo'), ('cortes_mensuales','multas_acumuladas'));
--    -- Esperado: tipo NO 'otro'::text; multas_acumuladas NO 0.
-- 3. Sin multas, la previa no cambia: con el mes abierto de un edificio,
--      select md5(string_agg(concat_ws('|', codigo, condominio, administracion, servicio, anterior,
--                                      a_favor, mora, total, redondeo), ';' order by codigo))
--        from simular_cierre('<período>');
--    -- Esperado: la misma huella antes y después de la migración.
-- 4. Una unidad que debe $ 100 de cuota y $ 15 de multa, mora al 1 %, sin pagos:
--    simular_cierre → mora 1,00 (antes 1,15). Paga $ 10 antes del vencimiento → 1,00
--    (antes 1,05). Paga $ 50 antes → 0,65. Paga $ 50 después del vencimiento → 1,00
--    (antes 1,15). cerrar_periodo da lo mismo, y el corte guarda multas_acumuladas
--    15, 5, 0 y 0.
-- 5. reabrir_periodo() y volver a cerrar: multas_acumuladas igual.
