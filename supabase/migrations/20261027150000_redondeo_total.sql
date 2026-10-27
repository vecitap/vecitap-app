-- Redondeo sobre el total a pagar (ronda 8, bloque C4; corrige el bloque 6
-- de la ronda 7, 20261026160000_redondeo_cuotas.sql) y el aviso de alícuotas
-- con coma decimal (bloque A6).
--
-- Aplicada en vecitap-pruebas el 27-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261026160000_redondeo_cuotas.sql** (la guarda exige sus
-- cerrar_periodo() y simular_cierre()). Rollback:
-- supabase/rollbacks/20261027150000_redondeo_total_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Redondeo (decisión de Gustavo): se redondea el **total a pagar** del
--    recibo —lo del mes, la deuda anterior, la mora, lo de administración y
--    el saldo a favor—, no solo lo emitido en el mes. El redondeo es para
--    pagar en efectivo. Siempre hacia arriba; la diferencia (menos de $ 5, o
--    menos de $ 1 al dólar entero) va en la línea «Fondo de reserva por
--    redondeo» de ese mes, en el bolsillo de condominio. Si el total es 0, o
--    un saldo a favor lo deja en 0, no se redondea. Diferencias de menos de
--    medio centavo no hacen línea.
-- 2. simular_cierre() hace el mismo cálculo, y ahora también la **misma
--    mora** que cerrar_periodo() (solo sobre capital, con el pago hecho tarde
--    y solo si el edificio la tiene activa): antes la previa la calculaba
--    distinto, y con el redondeo sobre el total la diferencia se notaría.
--    Devuelve una columna más, `redondeo` (lo que suma el fondo de reserva
--    en esa unidad), para que el aviso de «cuota de condominio en $ 0,00» no
--    la cuente como cuota. Cambia lo que devuelve: va con drop + create.
--    (Sigue igual una diferencia anotada para después del piloto: la previa
--    reparte los gastos directos por bolsillo y cerrar_periodo() los suma
--    todos a condominio. El total es el mismo.)
-- 3. El aviso de alícuotas al cerrar: «Las alícuotas suman 111,99 %; deben
--    sumar 100 %. Revise las unidades en Propietarios.»
-- No cambia meses ya cerrados.

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.cerrar_periodo(uuid)', 'f66ee0ad4fe97ac0be046bf13ab4751e'),
      ('public.simular_cierre(uuid)', '6f06cc3e42184a36ff82ace505e59dc8')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: cambiaron:%  ¿Falta 20261026160000_redondeo_cuotas.sql?', malas; end if;
end
$guarda$;

CREATE OR REPLACE FUNCTION public.cerrar_periodo(p_periodo uuid)
 RETURNS TABLE(recibos_emitidos integer, total_facturado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid; v_edificio uuid; v_mes int; v_anio int;
  v_prefijo text; v_tasa numeric(18,6); v_mora_pct numeric(6,3);
  v_tolerancia numeric(8,5);
  v_redondeo numeric(8,4);
  v_mora_activa boolean; v_dia_venc smallint;
  v_vence date; v_vence_prox date;
  v_post_anio int; v_post_mes int;
  v_gasto numeric(18,4); v_presu numeric(18,4);
  v_alicuotas numeric(14,7); v_unidades int;
  v_usa_presu boolean; v_usa_gasto boolean;
  v_n int := 0; v_total numeric(18,4) := 0;
  r record;
  v_paso numeric := 0;   -- Ronda 7 (bloque 6)
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;

  select p.org_id, p.edificio_id, p.mes, p.anio, p.tasa_bcv, p.presupuesto,
         e.prefijo_recibo, e.interes_mora, e.tolerancia_alicuota,
         e.tolerancia_redondeo, e.mora_activa, e.dia_vencimiento
    into v_org, v_edificio, v_mes, v_anio, v_tasa, v_presu,
         v_prefijo, v_mora_pct, v_tolerancia, v_redondeo,
         v_mora_activa, v_dia_venc
    from periodos p
    join edificios e on e.id = p.edificio_id
   where p.id = p_periodo and p.estado = 'abierto'
   for update of p;

  if v_org is null then
    raise exception 'El período no existe o ya está cerrado';
  end if;

  -- Un mes no se puede cerrar si ya hay uno posterior cerrado.
  --
  -- Sin esta línea el sistema aceptaba cerrar agosto después de
  -- septiembre y el recibo de agosto quedaba fuera de todos los saldos:
  -- facturaba 200 y el estado de cuenta decía 100. El dinero no
  -- desaparecía de la base, desaparecía de la vista, que es peor.
  select p2.anio, p2.mes into v_post_anio, v_post_mes
    from periodos p2
   where p2.edificio_id = v_edificio and p2.estado = 'cerrado'
     and (p2.anio, p2.mes) > (v_anio, v_mes)
   order by p2.anio desc, p2.mes desc
   limit 1;

  if v_post_anio is not null then
    raise exception 'No se puede cerrar %/% porque %/% ya está cerrado. Los saldos se calculan en orden de calendario: reabra primero el mes más reciente.',
      lpad(v_mes::text,2,'0'), v_anio, lpad(v_post_mes::text,2,'0'), v_post_anio;
  end if;
  if not puede_operar(v_org) then
    raise exception 'Sin permiso para cerrar el período';
  end if;

  -- Vencimientos: el recibo del mes ANTERIOR venció el día v_dia_venc de
  -- este mes; el que se emite ahora vence ese mismo día del mes que viene.
  v_vence      := make_date(v_anio, v_mes, v_dia_venc);
  v_vence_prox := (make_date(v_anio, v_mes, 1) + interval '1 month')::date
                    + (v_dia_venc - 1);

  select coalesce(sum(alicuota), 0), count(*)
    into v_alicuotas, v_unidades
    from unidades where edificio_id = v_edificio and activa;

  if v_unidades = 0 then
    raise exception 'El edificio no tiene unidades activas';
  end if;
  if abs(v_alicuotas - 100) > v_tolerancia then
    -- Ronda 8: con coma decimal, y dónde se corrige.
    raise exception 'Las alícuotas suman % %%; deben sumar 100 %%. Revise las unidades en Propietarios.',
      replace(to_char(round(v_alicuotas, 2), 'FM9999990.00'), '.', ',');
  end if;
  -- La tasa del período: si no se cargó a mano, sale de tasas_bcv
  -- (la del último día del mes, que es la que corresponde al recibo)
  if coalesce(v_tasa, 0) <= 0 then
    v_tasa := tasa_del_dia(
      (make_date(v_anio, v_mes, 1) + interval '1 month - 1 day')::date);
    if v_tasa is null then
      raise exception 'Falta la tasa del BCV del período y no hay ninguna cargada';
    end if;
    update periodos set tasa_bcv = v_tasa where id = p_periodo;
  end if;

  select coalesce(sum(monto), 0) into v_gasto
    from gastos where periodo_id = p_periodo and tipo = 'comun';

  -- Ronda 7 (bloque 6): redondeo de la cuota, de la organización. Siempre
  -- hacia arriba; la diferencia va al fondo de reserva.
  v_paso := case (select a.redondeo from ajustes_cobro a where a.org_id = v_org)
              when 'entero' then 1 when 'cinco' then 5 else 0 end;

  -- Qué necesita este edificio según sus conceptos
  select bool_or(modo like 'presupuesto%'), bool_or(modo like 'gasto%')
    into v_usa_presu, v_usa_gasto
    from conceptos_cobro
   where activo and org_id = v_org
     and (edificio_id = v_edificio or edificio_id is null);

  if coalesce(v_usa_presu, false) and coalesce(v_presu, 0) <= 0 then
    raise exception 'Este edificio cobra por presupuesto: falta el presupuesto del período';
  end if;
  if coalesce(v_usa_gasto, false) and v_gasto = 0 then
    raise exception 'No hay gastos comunes que repartir en este período';
  end if;
  if v_usa_presu is null then
    raise exception 'El edificio no tiene conceptos de cobro configurados';
  end if;

  -- Perdón de centavos: restos por debajo del umbral del edificio.
  -- Queda como ajuste, con su motivo. No desaparece nada en silencio.
  if coalesce(v_redondeo, 0) > 0 then
    insert into ajustes (org_id, unidad_id, fecha, monto, motivo, destino)
    -- CAMBIO: hoy_local() en vez de current_date. La fecha del ajuste de
    -- redondeo es el día de Venezuela, no el de la sesión (UTC).
    select v_org, u.id, hoy_local(), round(s.condominio, 4),
           'Redondeo cambiario al cerrar ' || lpad(v_mes::text, 2, '0') || '/' || v_anio,
           'condominio'
      from unidades u
     cross join lateral saldo_unidad(u.id) s
     where u.edificio_id = v_edificio and u.activa
       and s.condominio > 0 and s.condominio <= v_redondeo;

    insert into ajustes (org_id, unidad_id, fecha, monto, motivo, destino)
    -- CAMBIO: ídem, para el ajuste de honorarios.
    select v_org, u.id, hoy_local(), round(s.administracion, 4),
           'Redondeo cambiario al cerrar ' || lpad(v_mes::text, 2, '0') || '/' || v_anio,
           'honorarios'
      from unidades u
     cross join lateral saldo_unidad(u.id) s
     where u.edificio_id = v_edificio and u.activa
       and s.administracion > 0 and s.administracion <= v_redondeo;
  end if;

  for r in
    select u.id, u.codigo, u.alicuota,
           s.condominio     as previo_cond,
           s.administracion as previo_adm,
           s.servicio       as previo_serv,
           s.mora           as previo_mora
      from unidades u
     cross join lateral saldo_unidad(u.id) s
     where u.edificio_id = v_edificio and u.activa
     order by u.codigo
  loop
    declare
      v_cond numeric(18,4) := 0;
      v_adm  numeric(18,4) := 0;
      v_serv numeric(18,4) := 0;
      v_directos numeric(18,4);
      v_anterior numeric(18,4); v_afavor numeric(18,4);
      v_mora numeric(18,4); v_tot numeric(18,4);
      v_capital numeric(18,4); v_pago_tarde numeric(18,4);
      v_base_mora numeric(18,4);
      v_lineas jsonb := '[]'::jsonb;
      v_base numeric(18,4); v_monto numeric(18,4);
      v_detalle jsonb;
      c record;
      -- Ronda 7 (bloque 5): cuotas extraordinarias en N cuotas.
      v_nombre text; v_cuota int; v_hechas int;
      v_dif numeric(18,4);   -- Ronda 7 (bloque 6)
    begin
      -- Primera pasada: todo menos los porcentajes sobre el condominio
      for c in
        select * from conceptos_cobro
         where activo and org_id = v_org
           and (edificio_id = v_edificio or edificio_id is null)
           and modo <> 'porcentaje_condominio'
         order by orden, nombre
      loop
        v_base := case c.modo
          when 'presupuesto_alicuota'       then v_presu * r.alicuota / 100
          when 'presupuesto_partes_iguales' then v_presu / v_unidades
          when 'gasto_alicuota'             then v_gasto * r.alicuota / 100
          when 'gasto_partes_iguales'       then v_gasto / v_unidades
          when 'monto_por_unidad'           then c.monto
          when 'monto_por_alicuota'         then c.monto * r.alicuota / 100
          when 'monto_fijo_repartido'       then c.monto / v_unidades
        end;
        -- Ronda 7 (bloque 5): un cobro con `cuotas` es una cuota extraordinaria
        -- dividida en N meses. Cuántas ya se emitieron sale de los recibos de
        -- los meses cerrados de este edificio (así reabrir un mes la devuelve);
        -- completas todas, ya no se cobra. La última cuota se lleva el resto del
        -- redondeo, para que la suma de las N dé el monto exacto.
        v_nombre := c.nombre; v_cuota := null;
        if c.cuotas is not null then
          select count(distinct r2.periodo_id) into v_hechas
            from recibos r2 join periodos p3 on p3.id = r2.periodo_id
           where p3.edificio_id = v_edificio and p3.estado = 'cerrado'
             and r2.conceptos @> jsonb_build_array(jsonb_build_object('concepto_id', c.id));
          continue when v_hechas >= c.cuotas;
          v_cuota := v_hechas + 1;
          if c.cuotas > 1 then
            v_base := case when v_cuota < c.cuotas then round(v_base / c.cuotas, 4)
                           else v_base - round(v_base / c.cuotas, 4) * (c.cuotas - 1) end;
            v_nombre := format('%s (cuota %s de %s)', c.nombre, v_cuota, c.cuotas);
          end if;
        end if;
        v_monto := round(v_base * (1 + c.iva / 100), 4);

        if c.bolsillo = 'condominio'      then v_cond := v_cond + v_monto;
        elsif c.bolsillo = 'administracion' then v_adm := v_adm + v_monto;
        else                                   v_serv := v_serv + v_monto;
        end if;

        v_lineas := v_lineas || (jsonb_build_object(
          'nombre', v_nombre, 'bolsillo', c.bolsillo,
          'base', round(v_base, 4), 'iva', c.iva, 'monto', v_monto,
          'concepto_id', c.id)
          || case when v_cuota is null then '{}'::jsonb
                  else jsonb_build_object('cuota', v_cuota, 'cuotas', c.cuotas) end);
      end loop;

      -- Segunda pasada: los que se calculan sobre la cuota de condominio
      for c in
        select * from conceptos_cobro
         where activo and org_id = v_org
           and (edificio_id = v_edificio or edificio_id is null)
           and modo = 'porcentaje_condominio'
         order by orden, nombre
      loop
        v_base  := v_cond * c.monto / 100;
        v_monto := round(v_base * (1 + c.iva / 100), 4);

        if c.bolsillo = 'condominio'      then v_cond := v_cond + v_monto;
        elsif c.bolsillo = 'administracion' then v_adm := v_adm + v_monto;
        else                                   v_serv := v_serv + v_monto;
        end if;

        v_lineas := v_lineas || jsonb_build_object(
          'nombre', c.nombre, 'bolsillo', c.bolsillo,
          'base', round(v_base, 4), 'iva', c.iva, 'monto', v_monto);
      end loop;

      -- Gastos cargados solo a esta unidad
      select coalesce(sum(monto), 0) into v_directos
        from gastos
       where periodo_id = p_periodo and tipo = 'directo' and unidad_id = r.id;

      -- (Ronda 8: el redondeo va más abajo, sobre el total a pagar.)

      v_anterior := greatest(r.previo_cond, 0);
      v_afavor   := greatest(-r.previo_cond, 0);
      -- Mora legal: SOLO sobre capital, nunca sobre mora ya cobrada.
      -- La base es lo que seguía debiendo el día del vencimiento, de modo
      -- que un pago hecho tarde tampoco se libra del recargo.
      v_capital := greatest(v_anterior - greatest(coalesce(r.previo_mora, 0), 0), 0);

      select coalesce(sum(p2.monto_usd), 0) into v_pago_tarde
        from pagos p2
       where p2.unidad_id = r.id and p2.estado = 'conciliado'
         and p2.periodo_cierre_id is null and p2.destino = 'condominio'
         and p2.fecha > v_vence;

      v_base_mora := greatest(v_capital + v_pago_tarde, 0);

      if coalesce(v_mora_activa, false) and coalesce(v_mora_pct, 0) > 0 then
        v_mora := round(v_base_mora * v_mora_pct / 100, 4);
      else
        v_mora := 0;
      end if;

      -- Ronda 8 (corrige el bloque 6 de la ronda 7): se redondea el TOTAL A
      -- PAGAR —con la deuda anterior, la mora, lo de administración y el
      -- saldo a favor—, no solo lo del mes: el redondeo es para pagar en
      -- efectivo. Siempre hacia arriba. La diferencia (menos de $ 5, o menos
      -- de $ 1 al dólar entero) es la línea «Fondo de reserva por redondeo»
      -- de este mes, en el bolsillo de condominio. Si el total es 0 (o un
      -- saldo a favor lo deja en 0), no se redondea. El mismo cálculo en
      -- cerrar_periodo() y en simular_cierre().
      if v_paso > 0 then
        v_tot := v_anterior + v_mora + v_cond + v_directos - v_afavor
                 + greatest(r.previo_adm, 0)  + v_adm
                 + greatest(r.previo_serv, 0) + v_serv;
        if v_tot > 0.005 then
          v_dif := ceil(round(v_tot, 2) / v_paso) * v_paso - v_tot;
          if v_dif >= 0.005 then
            v_cond := v_cond + v_dif;
            v_lineas := v_lineas || jsonb_build_object(
              'nombre', 'Fondo de reserva por redondeo', 'bolsillo', 'condominio',
              'base', v_dif, 'iva', 0, 'monto', v_dif, 'redondeo', true);
          end if;
        end if;
      end if;

      -- Desglose de los gastos del mes, congelado en el recibo
      select coalesce(jsonb_agg(jsonb_build_object(
               'categoria', cat.nombre, 'lineas', cat.lineas) order by cat.orden), '[]'::jsonb)
        into v_detalle
        from (
          select coalesce(c2.nombre, 'Sin categoría') as nombre,
                 coalesce(c2.orden, 9999) as orden,
                 jsonb_agg(jsonb_build_object(
                   'concepto', g.concepto, 'referencia', g.referencia,
                   'monto', g.monto,
                   'parte', round(g.monto * r.alicuota / 100, 4))
                   order by g.creado_en) as lineas
            from gastos g
            left join categorias c2 on c2.id = g.categoria_id
           where g.periodo_id = p_periodo and g.tipo = 'comun'
           group by coalesce(c2.nombre, 'Sin categoría'),
                    coalesce(c2.orden, 9999)
        ) cat;

      v_tot := greatest(
                 v_anterior + v_mora + v_cond + v_directos - v_afavor
                 + greatest(r.previo_adm, 0)  + v_adm
                 + greatest(r.previo_serv, 0) + v_serv, 0);

      insert into recibos (org_id, periodo_id, unidad_id, numero, alicuota, tasa_bcv,
                           cuota, directos, anterior, a_favor, mora, honorario,
                           servicio, anterior_hon, anterior_serv,
                           total, detalle, conceptos, mora_base, vence_el)
      values (v_org, p_periodo, r.id,
              v_prefijo || '-' || replace(upper(r.codigo), ' ', '') || '-' ||
                lpad(v_mes::text, 2, '0') || right(v_anio::text, 2),
              r.alicuota, v_tasa,
              v_cond, v_directos, v_anterior, v_afavor, v_mora, v_adm,
              v_serv, greatest(r.previo_adm, 0), greatest(r.previo_serv, 0),
              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox);

      insert into cortes_mensuales (org_id, edificio_id, unidad_id, periodo_id,
                                    saldo_condominio, saldo_honorarios, saldo_servicio,
                                    emitido, cobrado, ajustado, tasa_bcv,
                                    mora_acumulada)
      values (v_org, v_edificio, r.id, p_periodo,
              v_anterior + v_mora + v_cond + v_directos - v_afavor,
              r.previo_adm  + v_adm,
              r.previo_serv + v_serv,
              v_cond + v_directos + v_mora + v_adm + v_serv,
              coalesce((select sum(monto_usd) from pagos
                         where unidad_id = r.id and estado = 'conciliado'
                           and periodo_cierre_id is null), 0),
              coalesce((select sum(monto) from ajustes
                         where unidad_id = r.id and periodo_cierre_id is null), 0),
              v_tasa,
              least(greatest(coalesce(r.previo_mora, 0), 0) + v_mora,
                    greatest(v_anterior + v_mora + v_cond + v_directos - v_afavor, 0)));

      update pagos set periodo_cierre_id = p_periodo
       where unidad_id = r.id and estado = 'conciliado' and periodo_cierre_id is null;
      update ajustes set periodo_cierre_id = p_periodo
       where unidad_id = r.id and periodo_cierre_id is null;

      v_n := v_n + 1;
      v_total := v_total + v_cond + v_directos + v_mora + v_adm + v_serv;
    end;
  end loop;

  update periodos
     set estado = 'cerrado', total_gastos = v_gasto,
         cerrado_en = now(), cerrado_por = auth.uid()
   where id = p_periodo;

  return query select v_n, v_total;
end $function$;

drop function public.simular_cierre(uuid);
create function public.simular_cierre(p_periodo uuid)
  RETURNS TABLE(codigo text, alicuota numeric, condominio numeric, administracion numeric, servicio numeric,
                anterior numeric, a_favor numeric, mora numeric, total numeric, redondeo numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_org uuid; v_edificio uuid; v_mes int; v_anio int;
  v_mora_pct numeric(6,3); v_mora_activa boolean; v_dia_venc smallint; v_vence date;
  v_gasto numeric(18,4); v_presu numeric(18,4);
  v_unidades int; r record; c record;
  v_paso numeric := 0; v_dif numeric(18,4);   -- Ronda 7 (bloque 6)
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;

  select p.org_id, p.edificio_id, p.mes, p.anio, p.presupuesto, e.interes_mora, e.mora_activa, e.dia_vencimiento
    into v_org, v_edificio, v_mes, v_anio, v_presu, v_mora_pct, v_mora_activa, v_dia_venc
    from periodos p join edificios e on e.id = p.edificio_id
   where p.id = p_periodo;

  if v_org is null then raise exception 'El período no existe'; end if;
  if not puede_operar(v_org) then raise exception 'Sin permiso'; end if;

  select count(*) into v_unidades from unidades
   where edificio_id = v_edificio and activa;
  if v_unidades = 0 then return; end if;

  select coalesce(sum(monto), 0) into v_gasto
    from gastos where periodo_id = p_periodo and tipo = 'comun';

  -- Ronda 8: el mismo vencimiento que cerrar_periodo() (el recibo anterior
  -- venció el día de vencimiento de este mes), para la misma mora.
  v_vence := make_date(v_anio, v_mes, v_dia_venc);

  -- Ronda 7 (bloque 6): redondeo de la organización. Siempre hacia arriba;
  -- la diferencia va al fondo de reserva.
  v_paso := case (select a.redondeo from ajustes_cobro a where a.org_id = v_org)
              when 'entero' then 1 when 'cinco' then 5 else 0 end;

  for r in
    select u.id, u.codigo, u.alicuota,
           s.condominio as previo_cond, s.administracion as previo_adm,
           s.servicio as previo_serv, s.mora as previo_mora
      from unidades u cross join lateral saldo_unidad(u.id) s
     where u.edificio_id = v_edificio and u.activa
     order by u.codigo
  loop
    declare
      v_cond numeric(18,4) := 0; v_adm numeric(18,4) := 0; v_serv numeric(18,4) := 0;
      v_dir_cond numeric(18,4); v_dir_adm numeric(18,4); v_dir_serv numeric(18,4);
      v_anterior numeric(18,4); v_afavor numeric(18,4); v_mora numeric(18,4);
      v_capital numeric(18,4); v_pago_tarde numeric(18,4); v_tot numeric(18,4);
      v_base numeric(18,4); v_monto numeric(18,4);
      v_hechas int; -- Ronda 7 (bloque 5)
    begin
      v_dif := 0;
      for c in
        select * from conceptos_cobro
         where activo and org_id = v_org
           and (edificio_id = v_edificio or edificio_id is null)
           and modo <> 'porcentaje_condominio'
         order by orden, nombre
      loop
        v_base := case c.modo
          when 'presupuesto_alicuota'       then coalesce(v_presu,0) * r.alicuota / 100
          when 'presupuesto_partes_iguales' then coalesce(v_presu,0) / v_unidades
          when 'gasto_alicuota'             then v_gasto * r.alicuota / 100
          when 'gasto_partes_iguales'       then v_gasto / v_unidades
          when 'monto_por_unidad'           then c.monto
          when 'monto_por_alicuota'         then c.monto * r.alicuota / 100
          when 'monto_fijo_repartido'       then c.monto / v_unidades
        end;
        -- Ronda 7 (bloque 5): la misma regla de cuotas que cerrar_periodo().
        if c.cuotas is not null then
          select count(distinct r2.periodo_id) into v_hechas
            from recibos r2 join periodos p3 on p3.id = r2.periodo_id
           where p3.edificio_id = v_edificio and p3.estado = 'cerrado'
             and r2.conceptos @> jsonb_build_array(jsonb_build_object('concepto_id', c.id));
          continue when v_hechas >= c.cuotas;
          if c.cuotas > 1 then
            v_base := case when v_hechas + 1 < c.cuotas then round(v_base / c.cuotas, 4)
                           else v_base - round(v_base / c.cuotas, 4) * (c.cuotas - 1) end;
          end if;
        end if;
        v_monto := round(v_base * (1 + c.iva / 100), 4);
        if c.bolsillo = 'condominio' then v_cond := v_cond + v_monto;
        elsif c.bolsillo = 'administracion' then v_adm := v_adm + v_monto;
        else v_serv := v_serv + v_monto; end if;
      end loop;

      for c in
        select * from conceptos_cobro
         where activo and org_id = v_org
           and (edificio_id = v_edificio or edificio_id is null)
           and modo = 'porcentaje_condominio'
         order by orden, nombre
      loop
        v_base := v_cond * c.monto / 100;
        v_monto := round(v_base * (1 + c.iva / 100), 4);
        if c.bolsillo = 'condominio' then v_cond := v_cond + v_monto;
        elsif c.bolsillo = 'administracion' then v_adm := v_adm + v_monto;
        else v_serv := v_serv + v_monto; end if;
      end loop;

      select coalesce(sum(monto) filter (where bolsillo = 'condominio'), 0),
             coalesce(sum(monto) filter (where bolsillo = 'administracion'), 0),
             coalesce(sum(monto) filter (where bolsillo = 'servicio'), 0)
        into v_dir_cond, v_dir_adm, v_dir_serv
        from gastos
       where periodo_id = p_periodo and tipo = 'directo' and unidad_id = r.id;

      v_adm  := v_adm  + v_dir_adm;
      v_serv := v_serv + v_dir_serv;

      v_anterior := greatest(r.previo_cond, 0);
      v_afavor   := greatest(-r.previo_cond, 0);
      -- Ronda 8: la misma mora que cerrar_periodo() (solo sobre capital, con
      -- el pago hecho tarde, y solo si el edificio la tiene activa). Antes la
      -- previa la calculaba sobre todo lo anterior y siempre.
      v_capital := greatest(v_anterior - greatest(coalesce(r.previo_mora, 0), 0), 0);
      select coalesce(sum(p2.monto_usd), 0) into v_pago_tarde
        from pagos p2
       where p2.unidad_id = r.id and p2.estado = 'conciliado'
         and p2.periodo_cierre_id is null and p2.destino = 'condominio'
         and p2.fecha > v_vence;
      if coalesce(v_mora_activa, false) and coalesce(v_mora_pct, 0) > 0 then
        v_mora := round(greatest(v_capital + v_pago_tarde, 0) * v_mora_pct / 100, 4);
      else
        v_mora := 0;
      end if;

      -- Ronda 8 (corrige el bloque 6 de la ronda 7): se redondea el TOTAL A
      -- PAGAR —con la deuda anterior, la mora, lo de administración y el
      -- saldo a favor—, no solo lo del mes: el redondeo es para pagar en
      -- efectivo. Siempre hacia arriba. La diferencia (menos de $ 5, o menos
      -- de $ 1 al dólar entero) es la línea «Fondo de reserva por redondeo»
      -- de este mes, en el bolsillo de condominio. Si el total es 0 (o un
      -- saldo a favor lo deja en 0), no se redondea. El mismo cálculo en
      -- cerrar_periodo() y en simular_cierre().
      if v_paso > 0 then
        v_tot := v_anterior + v_mora + v_cond + v_dir_cond - v_afavor
                 + greatest(r.previo_adm, 0)  + v_adm
                 + greatest(r.previo_serv, 0) + v_serv;
        if v_tot > 0.005 then
          v_dif := ceil(round(v_tot, 2) / v_paso) * v_paso - v_tot;
          if v_dif >= 0.005 then
            v_cond := v_cond + v_dif;
          else
            v_dif := 0;
          end if;
        end if;
      end if;

      codigo := r.codigo;
      alicuota := r.alicuota;
      condominio := v_cond + v_dir_cond;
      administracion := v_adm;
      servicio := v_serv;
      anterior := v_anterior + greatest(r.previo_adm,0) + greatest(r.previo_serv,0);
      a_favor := v_afavor;
      mora := v_mora;
      redondeo := greatest(v_dif, 0);
      total := greatest(v_anterior + v_mora + v_cond + v_dir_cond - v_afavor
                        + greatest(r.previo_adm, 0)  + v_adm
                        + greatest(r.previo_serv, 0) + v_serv, 0);
      return next;
    end;
  end loop;
end $$;

revoke all on function public.simular_cierre(uuid) from public, anon;
grant execute on function public.simular_cierre(uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in ('cerrar_periodo','simular_cierre');
--    -- Esperado: cerrar_periodo c2fcede6ac32b3fe25b74b48abbd44c4, simular_cierre 69144d1e27642caf18a8a264ffa382f8.
-- 2. En una transacción deshecha, como la administradora, con redondeo
--    'cinco' y un mes abierto con gastos que no den redondo, en un edificio
--    con deuda anterior:
--      select codigo, total, redondeo from public.simular_cierre('<mes>');
--      select * from public.cerrar_periodo('<mes>');
--      select u.codigo, r.total, r.conceptos from recibos r join unidades u on u.id = r.unidad_id
--       where r.periodo_id = '<mes>';
--    -- Esperado: cada total (con la deuda anterior) es múltiplo de 5; la
--    --   línea «Fondo de reserva por redondeo» es la diferencia (< 5); los
--    --   totales de la previa son los mismos del recibo; una unidad con
--    --   saldo a favor que la deja en 0 no tiene la línea.
-- 3. Con alícuotas que no suman 100: cerrar_periodo → «Las alícuotas suman
--    111,99 %; deben sumar 100 %. Revise las unidades en Propietarios.»
