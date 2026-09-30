-- Segunda ronda de zona horaria: las cinco funciones de la base que deciden
-- un día con la zona de la SESIÓN (UTC en PostgREST) en vez de la de
-- Venezuela.
--
-- SIN APLICAR. La revisa y la aplica Nicolás, en el SQL Editor, primero en
-- vecitap-pruebas y después en vecitap-produccion (AGENTS.md, "Producción").
-- **Respaldo antes de aplicarla en producción** (docs/respaldo.md).
--
-- Depende de 20260928140000_garita_bitacora_dia_local.sql, que crea
-- `hoy_local()` e `inicio_dia_local(date)`. La guarda 1 aborta si faltan.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ ARREGLA, Y CON QUÉ CONSECUENCIA
-- ─────────────────────────────────────────────────────────────────────────
-- Todas las funciones corren con la sesión en UTC (así conecta PostgREST).
-- Ahí `current_date` es el día de Greenwich y `timestamptz::date` reduce un
-- instante al día de Greenwich. Venezuela está en -04:00, así que **entre
-- las 20:00 y la medianoche hora local la base cree que ya es mañana**. Son
-- cuatro horas de cada día; el otro 83 % del tiempo el código equivocado da
-- el resultado correcto, que es exactamente por qué nadie lo vio antes.
--
-- Las cinco, en orden de consecuencia:
--
--   1. `libro_edificio` — `p.cerrado_en::date between p_desde and p_hasta`.
--      **La más grave.** Un mes cerrado después de las 20:00 del último día
--      del mes se asienta en el libro contable con la fecha del día
--      siguiente, o sea **en el mes que no es**. Un cierre hecho el 30 de
--      septiembre a las 21:00 aparece en octubre.
--   2. `historial_unidad` — cuatro `p.cerrado_en::date`. El estado de cuenta
--      del residente muestra la cuota con la fecha de un día después.
--   3. `cerrar_periodo` — dos `current_date` al insertar los ajustes de
--      redondeo. La fecha del ajuste queda un día adelante.
--   4. `generar_cobros_vencidos` — dos comparaciones contra `current_date`.
--      Corre por cron: un cobro puede dispararse hasta 4 h antes de lo
--      previsto, y una administradora puede quedar marcada "vencida" un día
--      antes de que se le acabe el plazo de gracia.
--   5. `generar_cobro_interno` — `coalesce(p_desde, …, current_date)`. Solo
--      pesa si nadie manda `p_desde`; la app siempre lo manda.
--
-- El lado del cliente ya está corregido desde el 28-sep (`hoyLocalISO()`
-- fijada a America/Caracas en `lib/formato.ts`, y `hoyISO()` eliminada).
-- Esto cierra la otra punta.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LAS DOS GUARDAS, Y POR QUÉ md5(prosrc) Y NO md5(pg_get_functiondef)
-- ─────────────────────────────────────────────────────────────────────────
-- Esta migración reescribe cada función ENTERA, con el cuerpo tomado de
-- `esquema_inicial.sql`, que es del **27-sep**. Si alguien tocó alguna de
-- las cinco después de esa fecha, aplicarla borraría ese cambio en silencio.
-- Por eso arranca comparando el cuerpo actual contra el del volcado y
-- aborta la transacción entera si alguno no coincide.
--
-- Nicolás pidió comparar `md5(pg_get_functiondef(oid))`. **No se puede
-- precalcular ese valor desde un volcado, y usarlo daría un falso aborto
-- garantizado**, así que la guarda usa `md5(prosrc)`:
--
--   · `pg_get_functiondef()` no devuelve el texto que está en el dump: lo
--     reimprime. Escribe `CREATE OR REPLACE`, reformatea la cabecera con un
--     espacio de sangría por cláusula, cambia el delimitador a `$function$`
--     y agrega un salto de línea final. Todo eso cambia el md5, así que el
--     valor "del volcado" nunca coincidiría con el de la base ni aunque la
--     función fuera idéntica.
--   · `prosrc` sí: `pg_dump` lo escribe **verbatim** entre los delimitadores
--     de dollar-quoting. Lo que hay entre `AS $$` y `$$` en
--     `esquema_inicial.sql` es byte a byte lo que guarda `pg_proc.prosrc`.
--     Los md5 de abajo se calcularon sobre esos bytes.
--   · Lo que `prosrc` no cubre —lenguaje, volatilidad, SECURITY DEFINER— se
--     comprueba aparte, en el mismo bucle, con columnas de `pg_proc`. Entre
--     las dos cosas queda cubierto todo lo que verificaría comparar el
--     `pg_get_functiondef` completo, sin la fragilidad del formato.
--   · De todas formas la guarda **imprime** el `md5(pg_get_functiondef)` de
--     cada función con un `raise notice`, para dejarlo registrado y para
--     comparar las dos bases entre sí. La comparación pruebas ↔ producción
--     está en `docs/consultas-produccion.sql`, bloque (a).
--
-- ─────────────────────────────────────────────────────────────────────────
-- LA TERCERA AUXILIAR: `dia_local(timestamptz)`
-- ─────────────────────────────────────────────────────────────────────────
-- `hoy_local()` e `inicio_dia_local(date)` no alcanzan para estas cinco.
-- `libro_edificio` e `historial_unidad` no preguntan "qué día es hoy" sino
-- "de qué día es este instante guardado", y para eso hace falta la
-- conversión inversa. Las dos opciones eran escribir
-- `(x at time zone 'America/Caracas')::date` inline en los cinco lugares, o
-- agregar una tercera auxiliar.
--
-- Se agrega la auxiliar, por el mismo motivo por el que existen las otras
-- dos (20260928140000): que la zona viva en **un** lugar. Escribirla inline
-- cinco veces más sería empezar a desarmar esa decisión justo en la
-- migración que la aprovecha.
--
-- Cuidado con la asimetría, que es el pie de banana de todo esto:
--   · `timestamptz AT TIME ZONE z` → devuelve un `timestamp` local.
--   · `timestamp   AT TIME ZONE z` → devuelve un instante absoluto.
-- `dia_local` usa la primera; `inicio_dia_local` usa la segunda. Son
-- inversas, y es la razón de encerrarlas en funciones.
--
-- ─────────────────────────────────────────────────────────────────────────
-- `vinculos.desde`: SÍ se cambia el DEFAULT, y por qué se revierte la
-- decisión del 28-sep
-- ─────────────────────────────────────────────────────────────────────────
-- Es el único `DEFAULT CURRENT_DATE` de la base que la app usa de verdad:
-- `AltaUnidad.tsx:79`, `DatosUnidad.tsx:81` e `ImportarUnidades.tsx:97`
-- insertan vínculos **sin** `desde` (auditado el 28-sep, insert por insert).
-- Los otros tres (`pagos.fecha`, `ajustes.fecha`, `suscripciones.inicio`)
-- nunca se disparan: la app siempre manda la fecha.
--
-- La severidad, dicha con precisión para no inflarla: dar de alta un
-- propietario después de las 20:00 guarda un `desde` un día adelante, y
-- **nada en la app filtra por esa columna** — `vigente()`
-- (`lib/admin/personas.ts:8-10`) mira solo `!v.hasta`. El único uso real es
-- un `order by v.desde desc` dentro de `destinatarios_de`, que podría
-- reordenar dos vínculos del mismo tipo creados la misma noche. Es un dato
-- de registro corrido, no un cambio de comportamiento.
--
-- El 28-sep se decidió NO tocarlo ("DDL de tabla sobre la base compartida
-- por un beneficio cosmético"). **Acá se revierte esa decisión**, con
-- motivo:
--
--   · `hoy_local()` va a existir en producción igual, por esta misma
--     migración. El costo marginal es **una línea**, más una en el rollback.
--   · La alternativa (mandar `desde: hoyLocalISO()` desde el cliente) toca
--     tres componentes y deja el agujero abierto para el próximo `insert`
--     que se olvide de la columna. El default lo cierra de una vez.
--   · La objeción original era el riesgo de DDL sobre una base compartida
--     con Gustavo trabajando en vivo. Cambiar un DEFAULT **no reescribe la
--     tabla ni toca una sola fila existente**: es una actualización del
--     catálogo, instantánea, con un lock que se toma y se suelta. No es el
--     tipo de DDL que motivaba la cautela.
--
-- Efecto secundario que conviene saber: a partir de acá `hoy_local()` queda
-- **referenciada por la tabla**, así que Postgres no va a dejar borrarla
-- sin quitar antes el default. Por eso el rollback de ESTA migración tiene
-- que correr **antes** que el de 20260928140000.
--
-- Las filas ya guardadas no se tocan: no se migran datos viejos, igual que
-- con el formato de `pagos.documento_origen`.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- GUARDA 1 · Dependencia: 20260928140000 (las auxiliares de zona)
-- GUARDA 2 · Que la base sea la del volcado `esquema_inicial.sql` (27-sep)
--
-- Las dos abortan la transacción entera. Nada se aplica a medias.
-- ═════════════════════════════════════════════════════════════════════════
do $guarda$
declare
  r        record;
  v_oid    oid;
  v_src    text;
  v_faltan text[] := '{}';
  v_drift  text[] := '{}';
  v_attr   text[] := '{}';
begin
  ---------------------------------------------------------------------------
  -- GUARDA 1 · sin las auxiliares no hay nada que hacer
  ---------------------------------------------------------------------------
  if to_regprocedure('public.hoy_local()') is null
     or to_regprocedure('public.inicio_dia_local(date)') is null then
    raise exception
      'ABORTADA: faltan las funciones auxiliares de zona. Aplique primero supabase/migrations/20260928140000_garita_bitacora_dia_local.sql (crea hoy_local() e inicio_dia_local(date)) y vuelva a correr esta migración.'
      using errcode = 'undefined_function';
  end if;

  ---------------------------------------------------------------------------
  -- GUARDA 2 · el cuerpo de las 5 funciones tiene que ser el del volcado
  --
  -- Se compara md5(prosrc), no md5(pg_get_functiondef(oid)), y el motivo
  -- está explicado en la cabecera de este archivo: pg_get_functiondef NO es
  -- reproducible desde un pg_dump (reformatea la cabecera, cambia el
  -- delimitador a $function$ y agrega un salto final), así que un valor
  -- precalculado desde el volcado daría un falso aborto garantizado.
  -- prosrc, en cambio, pg_dump lo escribe VERBATIM entre los delimitadores
  -- de dollar-quoting: es byte a byte el mismo texto que guarda la base.
  --
  -- Los atributos que pg_get_functiondef aporta de más (lenguaje,
  -- volatilidad, SECURITY DEFINER) se comprueban aparte, en el mismo bucle.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('public.libro_edificio(uuid,date,date)', '21ba3a6d8b9b2e877b329c5a0a270be2', 'sql', 's', false),
      ('public.historial_unidad(uuid)', 'b0243caf2ccb0efc4409b75c33cbe8bd', 'sql', 's', false),
      ('public.cerrar_periodo(uuid)', '374ad9f13bbb10b2c75b471837514bfc', 'plpgsql', 'v', true),
      ('public.generar_cobros_vencidos()', 'a62a6621783b77e25971b493738399a6', 'plpgsql', 'v', true),
      ('public.generar_cobro_interno(uuid,date)', '0357eccd663e3de660c46c79f94d0900', 'plpgsql', 'v', true)
    ) as t(firma, md5_volcado, lenguaje, volatilidad, definer)
  loop
    v_oid := to_regprocedure(r.firma);

    if v_oid is null then
      v_faltan := v_faltan || r.firma;
      continue;
    end if;

    select p.prosrc into v_src from pg_proc p where p.oid = v_oid;

    if md5(v_src) <> r.md5_volcado then
      v_drift := v_drift || format(
        '%s → en la base md5=%s, en el volcado md5=%s',
        r.firma, md5(v_src), r.md5_volcado);
    end if;

    -- Deja constancia del md5 que pidió Nicolás, ya que acá sí se puede
    -- calcular (la base lo tiene); sirve para pegarlo en el registro de la
    -- migración y para comparar las dos bases entre sí.
    raise notice '% · md5(prosrc)=%  md5(pg_get_functiondef)=%',
      r.firma, md5(v_src), md5(pg_get_functiondef(v_oid));

    if not exists (
      select 1 from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = v_oid
         and l.lanname     = r.lenguaje
         -- provolatile es de tipo "char", que no tiene operador = contra
         -- text: sin el cast explícito esto falla al aplicar.
         and p.provolatile::text = r.volatilidad
         and p.prosecdef   = r.definer
    ) then
      v_attr := v_attr || format(
        '%s → se esperaba %s / volatilidad %s / security definer %s',
        r.firma, r.lenguaje, r.volatilidad, r.definer);
    end if;
  end loop;

  if array_length(v_faltan, 1) > 0 then
    raise exception
      'ABORTADA: estas funciones no existen con esa firma exacta en public: %. La base no es la que describe esquema_inicial.sql — revise antes de aplicar nada.',
      array_to_string(v_faltan, ' | ')
      using errcode = 'undefined_function';
  end if;

  if array_length(v_attr, 1) > 0 then
    raise exception
      'ABORTADA: cambiaron los atributos (lenguaje / volatilidad / SECURITY DEFINER) de: %. Esta migración los reescribe con los valores del volcado, así que pisaría un cambio hecho a propósito. Revise antes de aplicar.',
      array_to_string(v_attr, ' | ')
      using errcode = 'feature_not_supported';
  end if;

  if array_length(v_drift, 1) > 0 then
    raise exception
      'ABORTADA: el cuerpo de estas funciones cambió después del volcado del 27-sep: %. Esta migración reescribe la función ENTERA a partir del volcado, así que aplicarla borraría ese cambio. Traiga el pg_get_functiondef actual (docs/consultas-produccion.sql, bloque a), rehaga la corrección sobre esa versión y actualice el md5 esperado de este archivo.',
      array_to_string(v_drift, ' | ')
      using errcode = 'feature_not_supported';
  end if;

  raise notice 'Guardas OK: las 5 funciones coinciden con esquema_inicial.sql y las auxiliares de zona existen.';
end
$guarda$;

-- ── La tercera auxiliar de zona ──────────────────────────────────────────
--
-- La inversa de `inicio_dia_local`: de qué día local es un instante
-- guardado. Mismo criterio que las otras dos auxiliares:
--   · NO es SECURITY DEFINER — no lee ninguna tabla, no hay nada que
--     escalar, y AGENTS.md advierte no sumar una sin necesidad.
--   · `STABLE` y no `IMMUTABLE`, aunque el resultado no dependa de `now()`:
--     las reglas de la zona salen de `pg_timezone_names`, que puede cambiar
--     con una actualización de tzdata. Marcarla IMMUTABLE permitiría
--     indexarla y congelaría un resultado que puede dejar de ser cierto.
--
-- `SET search_path = ''` por la misma razón que en 20260928140000: el
-- cuerpo no depende de la ruta de quien la llame. `pg_catalog` está siempre
-- implícito, así que `at time zone` y el tipo `date` resuelven igual sin
-- calificar nada.

CREATE OR REPLACE FUNCTION public.dia_local(p_instante timestamp with time zone) RETURNS date
    LANGUAGE sql
    STABLE
    SET search_path = ''
    AS $function$
  select (p_instante at time zone 'America/Caracas')::date
$function$;

COMMENT ON FUNCTION public.dia_local(timestamp with time zone) IS
  'De qué día de America/Caracas es ese instante. Usar en vez de '
  'castear timestamptz::date, que usa la zona de la sesión (UTC en '
  'PostgREST) y corre el día 4 horas. Inversa de inicio_dia_local(date). '
  'Ver supabase/migrations/20260929120000_segunda_ronda_dia_local.sql.';

-- ── libro_edificio ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.libro_edificio(p_edificio uuid, p_desde date, p_hasta date)
 RETURNS TABLE(seccion text, categoria text, concepto text, fecha date, monto numeric)
 LANGUAGE sql
 STABLE
AS $function$
  -- CAMBIO 1: dia_local(p.cerrado_en) en vez de p.cerrado_en::date, para
  -- que la fecha que se muestra en el libro sea la de Venezuela.
  select 'Egresos'::text, coalesce(c.nombre, 'Sin categoría'), g.concepto,
         dia_local(p.cerrado_en), g.monto
    from gastos g
    join periodos p on p.id = g.periodo_id
    left join categorias c on c.id = g.categoria_id
   where p.edificio_id = p_edificio and p.estado = 'cerrado'
     -- CAMBIO 2, el de mayor consecuencia: el rango se resuelve como una
     -- ventana de instantes sobre la columna, no casteando la columna a
     -- date con la zona de la sesión. Es exactamente equivalente a
     -- `between p_desde and p_hasta` en días de Venezuela, y además sigue
     -- pudiendo usar índice sobre cerrado_en (la columna queda desnuda a
     -- la izquierda del operador). Antes, un mes cerrado después de las
     -- 20:00 del último día del mes se asentaba en el MES siguiente del
     -- libro contable.
     and p.cerrado_en >= inicio_dia_local(p_desde)
     and p.cerrado_en <  inicio_dia_local(p_hasta + 1)

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
  -- CAMBIO (x4, en las cuatro ramas de recibos): dia_local(p.cerrado_en)
  -- en vez de p.cerrado_en::date. El cast usa la zona de la sesión (UTC en
  -- PostgREST), así que un mes cerrado después de las 20:00 de Venezuela
  -- aparecía en el estado de cuenta con la fecha del día siguiente.
  with movimientos as (
    select null::date as fecha, 0 as orden, 'Saldo inicial'::text as concepto,
           'Traído del sistema anterior'::text as detalle,
           u.saldo_inicial + u.saldo_inicial_hon as cargo, 0::numeric as abono
      from unidades u where u.id = p_unidad
       and (u.saldo_inicial + u.saldo_inicial_hon) <> 0

    union all
    select dia_local(p.cerrado_en), 1, 'Cuota de ' || p.etiqueta,
           r.numero || ' · alícuota ' || round(r.alicuota, 4) || '%',
           r.cuota, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.cuota <> 0

    union all
    select dia_local(p.cerrado_en), 1, 'Gastos directos a su unidad',
           'Cargados solo a esta unidad', r.directos, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.directos <> 0

    union all
    select dia_local(p.cerrado_en), 1, 'Interés de mora',
           'Sobre ' || round(r.anterior, 2), r.mora, 0
      from recibos r join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and r.mora <> 0

    union all
    select dia_local(p.cerrado_en), 1, 'Honorario de administración',
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
       -- CAMBIO: hoy_local() en vez de current_date. Esta función la
       -- dispara un cron, y de qué hora sea ese cron depende si el bug se
       -- manifiesta siempre o casi nunca: si corre entre las 00:00 y las
       -- 04:00 UTC cae justo en la franja donde current_date ya pasó al
       -- día siguiente en Venezuela, y los cobros salen un día antes.
       -- El horario real está sin confirmar — se saca con el bloque (d) de
       -- docs/consultas-produccion.sql. Con hoy_local() deja de importar.
       and s.proximo_cobro <= hoy_local()
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
       -- CAMBIO: hoy_local(), mismo motivo — marcar vencida a una
       -- administradora un día antes de lo que dice su plazo de gracia.
       and c.desde + s.dias_gracia < hoy_local()
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
  -- CAMBIO: hoy_local() en vez de current_date. Solo pesa cuando no se
  -- manda p_desde y la suscripción no tiene proximo_cobro; la app siempre
  -- manda p_desde, pero generar_cobros_vencidos (el cron) no siempre.
  v_desde := coalesce(p_desde, v_s.proximo_cobro, hoy_local());
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

-- ── vinculos.desde ───────────────────────────────────────────────────────
--
-- El único DEFAULT CURRENT_DATE que la app dispara de verdad (ver la
-- cabecera). No reescribe la tabla ni toca ninguna fila existente: es un
-- cambio de catálogo.

alter table public.vinculos alter column desde set default hoy_local();

COMMENT ON COLUMN public.vinculos.desde IS
  'Desde cuándo rige el vínculo. El default es hoy_local() y no '
  'current_date: la app inserta vínculos sin esta columna (AltaUnidad, '
  'DatosUnidad, ImportarUnidades) y current_date daría el día de la sesión '
  '(UTC), un día adelante después de las 20:00 de Venezuela.';

commit;

-- ═════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN DESPUÉS DE APLICAR
--
-- Todo lo de abajo es de SOLO LECTURA salvo el punto 6, que está envuelto
-- en begin/rollback y no deja nada escrito.
-- ═════════════════════════════════════════════════════════════════════════
--
-- 1) Las tres auxiliares existen, ninguna es SECURITY DEFINER y las tres
--    tienen la ruta de búsqueda vacía:
--
--      select p.proname,
--             p.prosecdef  as security_definer,
--             p.provolatile,
--             p.proconfig
--        from pg_proc p
--       where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('hoy_local', 'inicio_dia_local', 'dia_local')
--       order by p.proname;
--
--    Esperado: 3 filas; `security_definer = false` en las tres,
--    `provolatile = 's'` en las tres, `proconfig = {search_path=}` (con el
--    `=` y nada después, que es como se ve una ruta vacía).
--
-- 2) Las tres son consistentes entre sí — ida y vuelta sin perder el día:
--
--      select hoy_local()                              as hoy_caracas,
--             current_date                             as hoy_utc,
--             inicio_dia_local(hoy_local())            as arranca_hoy,
--             dia_local(inicio_dia_local(hoy_local())) as vuelta,
--             dia_local(now())                         as hoy_desde_ahora;
--
--    Esperado: `vuelta` = `hoy_caracas` y `hoy_desde_ahora` = `hoy_caracas`,
--    SIEMPRE, a cualquier hora. `arranca_hoy` a las 04:00Z (= 00:00 en
--    Venezuela), no a las 00:00Z. Entre las 20:00 y la medianoche hora de
--    Venezuela, `hoy_utc` va a ir un día adelante que `hoy_caracas` — eso
--    es correcto, es exactamente el bug que se está arreglando.
--
-- 3) No quedó ningún `current_date` ni ningún `cerrado_en::date` en las
--    cinco funciones (fuera de los comentarios `--` que explican el cambio):
--
--      select p.proname,
--             (p.prosrc ~ '(?<!-- )current_date')      as usa_current_date,
--             (p.prosrc like '%cerrado_en::date%')     as castea_cerrado_en
--        from pg_proc p
--       where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('libro_edificio','historial_unidad',
--                           'cerrar_periodo','generar_cobros_vencidos',
--                           'generar_cobro_interno')
--       order by p.proname;
--
--    Esperado: `castea_cerrado_en = false` en las cinco. Para
--    `usa_current_date` la expresión regular es aproximada (los
--    comentarios del cuerpo mencionan `current_date` al explicar el
--    cambio); si alguna da `true`, mirar el cuerpo a ojo:
--
--      select prosrc from pg_proc
--       where proname = 'libro_edificio'
--         and pronamespace = 'public'::regnamespace;
--
-- 4) El default de `vinculos.desde` quedó en la función, no en
--    `current_date`:
--
--      select column_name, column_default
--        from information_schema.columns
--       where table_schema = 'public' and table_name = 'vinculos'
--         and column_name = 'desde';
--
--    Esperado: `hoy_local()`.
--
-- 5) `libro_edificio` da lo mismo que antes para un rango donde no hay
--    cierres en la franja de las 20:00 a la medianoche, y **distinto**
--    donde sí los hay. Esta es la comparación que importa, porque muestra
--    a la vez que no rompió nada y que arregló algo. Torre Ida es
--    f51676d7-80ff-4812-8830-6307267baecf:
--
--      -- qué cierres caen en la franja peligrosa (los que pueden moverse)
--      select p.id, p.anio, p.mes, p.cerrado_en,
--             p.cerrado_en::date  as dia_viejo_utc,
--             dia_local(p.cerrado_en) as dia_nuevo_caracas
--        from periodos p
--       where p.edificio_id = 'f51676d7-80ff-4812-8830-6307267baecf'
--         and p.estado = 'cerrado'
--         and p.cerrado_en::date <> dia_local(p.cerrado_en)
--       order by p.cerrado_en;
--
--    Esperado: las filas que devuelva son exactamente los cierres cuya
--    fecha cambia en el libro. Si devuelve 0 filas, ningún cierre histórico
--    de ese edificio se hizo después de las 20:00 y el libro no se mueve —
--    la corrección igual queda puesta para los cierres futuros.
--
-- 6) Las cinco funciones corren sin error. `cerrar_periodo` NO se ejecuta
--    (cierra un mes de verdad); las otras cuatro son de lectura o quedan
--    dentro de un rollback. Reemplace los uuid por los suyos:
--
--      begin;
--        select count(*) from libro_edificio(
--                 'f51676d7-80ff-4812-8830-6307267baecf',
--                 date '2026-01-01', date '2026-12-31');
--        select count(*) from historial_unidad('<uuid de una unidad>');
--        -- genera cobros de verdad: por eso va dentro del rollback
--        select generar_cobros_vencidos();
--      rollback;
--
--    Esperado: las tres devuelven sin error, y el `rollback` deshace lo que
--    haya generado la tercera. **Confirme con
--    `select count(*) from cobros_suscripcion;` antes y después** de que el
--    conteo no cambió.
--
-- 7) `cerrar_periodo` se verifica con el primer cierre de mes real que
--    toque, mirando la fecha de los ajustes de redondeo que inserte:
--
--      select fecha, monto, motivo from ajustes
--       where motivo like 'Redondeo cambiario al cerrar%'
--       order by fecha desc limit 10;
--
--    Esperado: la `fecha` coincide con el día de Venezuela en que se hizo
--    el cierre, también si se cerró después de las 20:00.
--
-- 8) Dejar registrados los md5 nuevos, para la próxima comparación entre
--    las dos bases (es el mismo bloque (a) de docs/consultas-produccion.sql):
--
--      select p.proname,
--             md5(p.prosrc)                  as md5_cuerpo,
--             md5(pg_get_functiondef(p.oid)) as md5_definicion
--        from pg_proc p
--       where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('libro_edificio','historial_unidad',
--                           'cerrar_periodo','generar_cobros_vencidos',
--                           'generar_cobro_interno','hoy_local',
--                           'inicio_dia_local','dia_local')
--       order by p.proname;
--
--    Esperado: los mismos ocho pares en vecitap-pruebas y en
--    vecitap-produccion una vez aplicada en las dos.
-- ═════════════════════════════════════════════════════════════════════════
