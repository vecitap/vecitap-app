-- ROLLBACK de 20260929120000_segunda_ronda_dia_local.sql
--
-- Deja las cinco funciones exactamente como estaban en
-- `esquema_inicial.sql` (27-sep), devuelve el default de `vinculos.desde` a
-- `CURRENT_DATE` y borra la auxiliar `dia_local(timestamptz)`.
--
-- ⚠ ORDEN, si también se va a revertir 20260928140000: **primero este**.
--    La migración de ida deja `vinculos.desde` con `default hoy_local()`,
--    así que la tabla pasa a depender de esa función y Postgres no va a
--    dejar borrarla hasta que este rollback quite el default.
--
-- ⚠ Esto vuelve a introducir el bug de zona horaria a propósito: las
--    fechas del libro contable, del estado de cuenta y de los ajustes de
--    redondeo vuelven a decidirse con la zona de la sesión (UTC). Úselo
--    solo si la migración rompió algo peor.
--
-- ⚠ Los datos escritos MIENTRAS la migración estuvo aplicada no se tocan y
--    no se pueden distinguir después: un `vinculos.desde` guardado con
--    `hoy_local()` y otro guardado con `current_date` son los dos un
--    `date`. Es información que se pierde, no un error de este archivo.
--
-- Las cinco definiciones de abajo son el texto del volcado, byte a byte —
-- se extrajeron con un script del propio `esquema_inicial.sql`, no se
-- transcribieron a mano.

begin;

alter table public.vinculos alter column desde set default CURRENT_DATE;

-- ── libro_edificio ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.libro_edificio(p_edificio uuid, p_desde date, p_hasta date)
 RETURNS TABLE(seccion text, categoria text, concepto text, fecha date, monto numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select 'Egresos'::text, coalesce(c.nombre, 'Sin categoría'), g.concepto,
         p.cerrado_en::date, g.monto
    from gastos g
    join periodos p on p.id = g.periodo_id
    left join categorias c on c.id = g.categoria_id
   where p.edificio_id = p_edificio and p.estado = 'cerrado'
     and p.cerrado_en::date between p_desde and p_hasta

  union all
  select 'Ingresos', 'Cobranza', 'Pago de ' || u.codigo, pg.fecha, pg.monto_usd
    from pagos pg
    join unidades u on u.id = pg.unidad_id
   where u.edificio_id = p_edificio and pg.estado = 'conciliado'
     and pg.fecha between p_desde and p_hasta

  order by 4, 1, 2
$function$;

-- ── historial_unidad ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.historial_unidad(p_unidad uuid)
 RETURNS TABLE(fecha date, orden integer, concepto text, detalle text, cargo numeric, abono numeric, saldo numeric)
 LANGUAGE sql
 STABLE
AS $function$
  with movimientos as (
    select null::date as fecha, 0 as orden, 'Saldo inicial'::text as concepto,
           'Traído del sistema anterior'::text as detalle,
           u.saldo_inicial + u.saldo_inicial_hon as cargo, 0::numeric as abono
      from unidades u where u.id = p_unidad
       and (u.saldo_inicial + u.saldo_inicial_hon) <> 0

    union all
    select p.cerrado_en::date, 1, 'Cuota de ' || p.etiqueta,
           r.numero || ' · alícuota ' || round(r.alicuota, 4) || '%',
           r.cuota, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.cuota <> 0

    union all
    select p.cerrado_en::date, 1, 'Gastos directos a su unidad',
           'Cargados solo a esta unidad', r.directos, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.directos <> 0

    union all
    select p.cerrado_en::date, 1, 'Interés de mora',
           'Sobre ' || round(r.anterior, 2), r.mora, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.mora <> 0

    union all
    select p.cerrado_en::date, 1, 'Honorario de administración',
           'IVA incluido', r.honorario, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.honorario <> 0

    union all
    select pg.fecha, 2, 'Pago recibido',
           concat_ws(' · ', pg.metodo,
             case when pg.referencia is not null then 'ref ' || pg.referencia end,
             case when pg.destino = 'honorarios' then 'a honorarios' end),
           0, pg.monto_usd
      from pagos pg
     where pg.unidad_id = p_unidad and pg.estado = 'conciliado'

    union all
    select a.fecha, 3, 'Exoneración o nota de crédito', a.motivo, 0, a.monto
      from ajustes a where a.unidad_id = p_unidad
  )
  select m.fecha, m.orden, m.concepto, m.detalle, m.cargo, m.abono,
         sum(m.cargo - m.abono) over (
           order by m.fecha nulls first, m.orden
           rows between unbounded preceding and current row) as saldo
    from movimientos m
   order by m.fecha nulls first, m.orden
$function$;

-- ── cerrar_periodo ──────────────────────────────────────────────────────

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
    raise exception 'Las alícuotas suman % y deben sumar 100 (tolerancia %)',
      round(v_alicuotas, 5), v_tolerancia;
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
    select v_org, u.id, current_date, round(s.condominio, 4),
           'Redondeo cambiario al cerrar ' || lpad(v_mes::text, 2, '0') || '/' || v_anio,
           'condominio'
      from unidades u
     cross join lateral saldo_unidad(u.id) s
     where u.edificio_id = v_edificio and u.activa
       and s.condominio > 0 and s.condominio <= v_redondeo;

    insert into ajustes (org_id, unidad_id, fecha, monto, motivo, destino)
    select v_org, u.id, current_date, round(s.administracion, 4),
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
        v_monto := round(v_base * (1 + c.iva / 100), 4);

        if c.bolsillo = 'condominio'      then v_cond := v_cond + v_monto;
        elsif c.bolsillo = 'administracion' then v_adm := v_adm + v_monto;
        else                                   v_serv := v_serv + v_monto;
        end if;

        v_lineas := v_lineas || jsonb_build_object(
          'nombre', c.nombre, 'bolsillo', c.bolsillo,
          'base', round(v_base, 4), 'iva', c.iva, 'monto', v_monto);
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

-- ── generar_cobros_vencidos ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generar_cobros_vencidos()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; v_generados int := 0; v_vencidas int := 0;
  v_montos numeric(18,4) := 0; v_lista jsonb := '[]'::jsonb; v_res jsonb;
begin
  -- 1 · Generar los cobros que tocan hoy o que ya se pasaron.
  --     La prueba no genera cobros: todavía no paga.
  for r in
    select s.org_id, o.nombre, s.proximo_cobro
      from suscripciones s
      join organizaciones o on o.id = s.org_id
     where s.estado in ('activa','vencida')
       and s.proximo_cobro is not null
       and s.proximo_cobro <= current_date
     order by o.nombre
  loop
    declare v_id uuid; v_monto numeric(18,4);
    begin
      v_id := generar_cobro_interno(r.org_id, r.proximo_cobro);
      select monto into v_monto from cobros_suscripcion where id = v_id;
      v_generados := v_generados + 1;
      v_montos := v_montos + coalesce(v_monto, 0);
      v_lista := v_lista || jsonb_build_object(
        'administradora', r.nombre, 'desde', r.proximo_cobro, 'monto', v_monto);
    exception when others then
      v_lista := v_lista || jsonb_build_object(
        'administradora', r.nombre, 'error', sqlerrm);
    end;
  end loop;

  -- 2 · Marcar vencida a quien tenga un cobro sin pagar pasado su plazo.
  --     Constatar un hecho, no cortarle el servicio a nadie.
  with morosas as (
    select distinct c.org_id
      from cobros_suscripcion c
      join suscripciones s on s.org_id = c.org_id
     where c.estado = 'pendiente'
       and c.desde + s.dias_gracia < current_date
       and s.estado = 'activa'
  )
  update suscripciones s set estado = 'vencida', actualizada_en = now()
    from morosas m where m.org_id = s.org_id;
  get diagnostics v_vencidas = row_count;

  v_res := jsonb_build_object(
    'cobros_generados', v_generados,
    'monto_total', v_montos,
    'marcadas_vencidas', v_vencidas,
    'detalle', v_lista);

  insert into tareas_log (tarea, detalle) values ('cobros_suscripcion', v_res);
  return v_res;
end $function$;

-- ── generar_cobro_interno ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generar_cobro_interno(p_org uuid, p_desde date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s suscripciones%rowtype; v_desde date; v_hasta date;
  v_meses int; v_uni int; v_monto numeric(18,4); v_id uuid;
begin
  select * into v_s from suscripciones where org_id = p_org;
  if not found then raise exception 'Esa administradora no tiene suscripción'; end if;

  v_meses := case v_s.plan when 'anual' then 12 when 'trimestral' then 3 else 1 end;
  v_desde := coalesce(p_desde, v_s.proximo_cobro, current_date);
  v_hasta := (v_desde + (v_meses || ' months')::interval - interval '1 day')::date;

  select count(*) into v_uni from unidades where org_id = p_org and activa;
  v_monto := cuota_mensual(p_org) * v_meses;

  insert into cobros_suscripcion (org_id, desde, hasta, unidades, monto)
  values (p_org, v_desde, v_hasta, v_uni, v_monto)
  on conflict (org_id, desde) do update
    set hasta = excluded.hasta, unidades = excluded.unidades, monto = excluded.monto
  returning id into v_id;

  update suscripciones
     set proximo_cobro = (v_hasta + interval '1 day')::date, actualizada_en = now()
   where org_id = p_org;

  return v_id;
end $function$;

-- ── La auxiliar que creó esta migración ──────────────────────────────────
--
-- Va al final: con las cinco funciones ya restauradas arriba, nadie la
-- referencia. Si aun así Postgres se niega, es porque algo POSTERIOR la
-- adoptó (el bloque 13, por ejemplo) — en ese caso deje la función donde
-- está: no molesta, solo hace aritmética de fechas.

drop function if exists public.dia_local(timestamp with time zone);

commit;

-- ═════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN DESPUÉS DE REVERTIR
-- ═════════════════════════════════════════════════════════════════════════
--
-- 1) Las cinco funciones volvieron exactamente al volcado del 27-sep.
--    Estos son los mismos md5 que usa la guarda de la migración de ida:
--
--      select p.proname, md5(p.prosrc) as md5_cuerpo
--        from pg_proc p
--       where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('libro_edificio','historial_unidad',
--                           'cerrar_periodo','generar_cobros_vencidos',
--                           'generar_cobro_interno')
--       order by p.proname;
--
--    Esperado, exactamente:
--      cerrar_periodo           374ad9f13bbb10b2c75b471837514bfc
--      generar_cobro_interno    0357eccd663e3de660c46c79f94d0900
--      generar_cobros_vencidos  a62a6621783b77e25971b493738399a6
--      historial_unidad         b0243caf2ccb0efc4409b75c33cbe8bd
--      libro_edificio           21ba3a6d8b9b2e877b329c5a0a270be2
--
--    Si los cinco coinciden, la reversión es exacta: no queda rastro.
--
-- 2) El default de `vinculos.desde` volvió:
--
--      select column_default from information_schema.columns
--       where table_schema = 'public' and table_name = 'vinculos'
--         and column_name = 'desde';
--
--    Esperado: `CURRENT_DATE`.
--
-- 3) `dia_local` ya no está, y las otras dos auxiliares siguen (este
--    rollback no toca 20260928140000):
--
--      select proname from pg_proc
--       where pronamespace = 'public'::regnamespace
--         and proname in ('hoy_local','inicio_dia_local','dia_local')
--       order by proname;
--
--    Esperado: `hoy_local` e `inicio_dia_local`, sin `dia_local`.
-- ═════════════════════════════════════════════════════════════════════════
