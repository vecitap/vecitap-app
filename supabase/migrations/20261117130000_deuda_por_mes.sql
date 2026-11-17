-- Cambio 2 del feedback de ING3: pagos parciales con varias oficinas.
--
-- Aplicada en vecitap-pruebas el 17-nov, por Nicolás con psql. Verificación en OK;
-- 0 funciones con «\r». Md5 en pruebas: cerrar_periodo d71adcb4…, deuda_partidas
-- 3ee5532b…, puede_ver_saldo 4fa85a08…, deuda_por_mes 657909fa…, repartir_pago
-- d70f633e…, deuda_meses_json 24e6b465….
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo.
-- Va después de 20261117120000_tasa_editable.sql (no depende de ella, pero es
-- el orden de las dos). Rollback:
-- supabase/rollbacks/20261117130000_deuda_por_mes_rollback.sql.
--
-- Decisiones (respuestas del 17-nov a las preguntas 2.1 a 2.8 de la propuesta
-- del 11-nov, con los valores por omisión de «Por confirmar»):
--   2.2 Reparto automático por antigüedad entre todas las unidades (opción A).
--       Quien paga puede cambiar el monto de cada unidad antes de guardar.
--   2.3 y 2.4 Orden de pago: 1° la mora, 2° las cuotas extraordinarias, 3° las
--       cuotas ordinarias y los cargos a una sola unidad, de la más antigua a
--       la más reciente, 4° las multas. Vale igual para una sola unidad.
--   2.5 Lo que sobra después de cubrir toda la deuda va en partes iguales; los
--       céntimos que no dividen exacto, a la unidad que recibe más.
--   2.6 El reparto se hace solo dentro de la cuenta de la transferencia.
--   Empate en un mismo mes entre unidades: primero la de código menor (el
--   ejemplo de la propuesta: 101 se lleva los $ 30 de septiembre).
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE NO CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- Cómo se guarda un pago (una fila por unidad, con grupo_id), el saldo de
-- cada unidad, la mora y los montos del cierre. deuda_por_orden() sigue
-- siendo la única copia de la fórmula: lo de acá parte de sus totales (mora,
-- multas y resto) y de los de saldo_unidad() (honorarios y servicio) y solo
-- dice a qué mes corresponde cada parte de lo que se debe.
-- La prioridad de las extraordinarias no mueve ningún monto: la mora se
-- calcula sobre todo el capital, ordinario o extraordinario, y las multas ya
-- eran lo último. Solo cambia qué mes figura pagado y cuál pendiente.
-- simular_cierre() no cambia. El correo del recibo (correo_recibo) tampoco:
-- no lleva desglose, manda al portal.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. deuda_partidas(unidad) — interna. Cada cargo de los recibos cerrados de
--    la unidad (mora, extraordinaria, cuota, cargo, multa, honorario,
--    servicio, más la «Deuda anterior»: el saldo inicial y lo pendiente que
--    ningún recibo explica) con lo que falta de cada uno. Lo pendiente se
--    asigna al revés del orden de pago: lo que se paga último es lo primero
--    que queda pendiente (multas; después cuotas y cargos de la más reciente
--    a la más antigua; después extraordinarias; al final la mora).
-- 2. puede_ver_saldo(unidad) — interna. Quién puede ver el saldo de una
--    unidad: la misma regla que saldo_unidad() para la sesión (su
--    administración, la junta de su edificio, su propietario o inquilino
--    salvo el inquilino con «Solo el recibo del mes», o el operador), sin la
--    excepción de current_user, que dentro de una SECURITY DEFINER es siempre
--    su dueño.
-- 3. deuda_por_mes(unidad) — RPC (authenticated). Por mes y por tipo: el
--    cargo, lo abonado y lo que falta. Para la ficha de la unidad y el portal.
-- 4. repartir_pago(unidades[], monto en dólares, cuenta) — RPC
--    (authenticated). Propone cuánto va a cada unidad de una transferencia, y
--    qué cubre en cada una. No guarda nada. Las unidades tienen que ser del
--    mismo edificio y quien llama tiene que poder ver el saldo de todas.
-- 5. recibos.deuda_meses (jsonb): lo que quedaba pendiente de los meses
--    anteriores al cerrar, mes por mes ({anio, mes, etiqueta, cargo, abonado,
--    falta}, solo los meses con algo pendiente). Lo llena cerrar_periodo()
--    antes de sumar el recibo nuevo, con los pagos que entran en ese cierre.
--    Los recibos anteriores a esta migración quedan en null (sin el bloque).
-- 6. cerrar_periodo(): solo eso, 4 reemplazos exactos.

begin;

do $guarda$
declare v text;
begin
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'cf6653ad5390d41bc5a4c579af0fd1a1' then
    raise exception 'ABORTADA: cerrar_periodo() no es la esperada (md5=%). No se cambió nada.', v;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.deuda_por_orden(uuid, date)'::regprocedure;
  if v is distinct from '766beca27abf363f4b78b3d21db6654e' then
    raise exception 'ABORTADA: deuda_por_orden() no es la esperada (md5=%). No se cambió nada.', v;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.saldo_unidad(uuid)'::regprocedure;
  if v is distinct from '497d819a42e0533a410dbb62155da7cb' then
    raise exception 'ABORTADA: saldo_unidad() no es la esperada (md5=%). No se cambió nada.', v;
  end if;
  if to_regprocedure('public.deuda_partidas(uuid)') is not null
     or to_regprocedure('public.puede_ver_saldo(uuid)') is not null
     or to_regprocedure('public.deuda_por_mes(uuid)') is not null
     or to_regprocedure('public.deuda_meses_json(uuid)') is not null
     or to_regprocedure('public.repartir_pago(uuid[], numeric, text)') is not null then
    raise exception 'ABORTADA: alguna de las funciones nuevas ya existe. No se cambió nada.';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'recibos' and column_name = 'deuda_meses') then
    raise exception 'ABORTADA: recibos.deuda_meses ya existe. No se cambió nada.';
  end if;
end
$guarda$;

-- 1. deuda_partidas ─────────────────────────────────────────────────────────
create function public.deuda_partidas(p_unidad uuid)
  returns table(destino text, anio integer, mes integer, etiqueta text, tipo text,
                prioridad integer, monto numeric, falta numeric)
  language sql
  stable
  set search_path to 'public'
as $function$
  with d as (
    select greatest(x.mora, 0) as mora, greatest(x.multas, 0) as multas, greatest(x.resto, 0) as resto
      from deuda_por_orden(p_unidad, null) x
  ),
  s as (
    select greatest(x.administracion, 0) as hon, greatest(x.servicio, 0) as serv
      from saldo_unidad(p_unidad) x
  ),
  -- Lo que se debe hoy, en cada bolsa. Cada bolsa se reparte entre sus cargos.
  bolsa as (
    select b.bolsa, b.pendiente
      from d, s,
           lateral (values ('mora', d.mora), ('multas', d.multas), ('resto', d.resto),
                           ('hon', s.hon), ('serv', s.serv)) b(bolsa, pendiente)
  ),
  rec as (
    select p.anio, p.mes, p.etiqueta, r.cuota, r.directos, r.mora, r.honorario, r.servicio,
           -- Cuota extraordinaria: la línea de un concepto con `cuotas` (cerrar_periodo
           -- le agrega 'cuota' y 'cuotas'), en el bolsillo de condominio.
           coalesce((select sum((x->>'monto')::numeric)
                       from jsonb_array_elements(case when jsonb_typeof(r.conceptos) = 'array'
                                                      then r.conceptos else '[]'::jsonb end) x
                      where x->>'bolsillo' = 'condominio' and x ? 'cuotas'), 0) as extra,
           coalesce((select sum((x->>'monto')::numeric)
                       from jsonb_array_elements(case when jsonb_typeof(r.cargos) = 'array'
                                                      then r.cargos else '[]'::jsonb end) x
                      where x->>'tipo' = 'multa'), 0) as multa
      from recibos r
      join periodos p on p.id = r.periodo_id
     where r.unidad_id = p_unidad and p.estado = 'cerrado'
  ),
  -- prioridad = el orden de pago (1 se paga primero). sub ordena dentro del mes.
  it as (
    select 'condominio' as destino, anio, mes, etiqueta, 'mora' as tipo, 1 as prioridad, 1 as sub, mora as monto, 'mora' as bolsa from rec
    union all select 'condominio', anio, mes, etiqueta, 'extraordinaria', 2, 1, extra, 'resto' from rec
    union all select 'condominio', anio, mes, etiqueta, 'cuota', 3, 1, cuota - extra, 'resto' from rec
    union all select 'condominio', anio, mes, etiqueta, 'cargo', 3, 2, directos - multa, 'resto' from rec
    union all select 'condominio', anio, mes, etiqueta, 'multa', 4, 1, multa, 'multas' from rec
    union all select 'honorarios', anio, mes, etiqueta, 'honorario', 3, 1, honorario, 'hon' from rec
    union all select 'servicio', anio, mes, etiqueta, 'servicio', 3, 1, servicio, 'serv' from rec
    union all select 'condominio', null, null, 'Deuda anterior', 'anterior', 3, 0, greatest(u.saldo_inicial, 0), 'resto'
                from unidades u where u.id = p_unidad
    union all select 'honorarios', null, null, 'Deuda anterior', 'anterior', 3, 0, greatest(u.saldo_inicial_hon, 0), 'hon'
                from unidades u where u.id = p_unidad
  ),
  -- Lo pendiente se asigna al revés del orden de pago: lo último que se paga
  -- es lo primero que queda pendiente.
  asignado as (
    select it.*, b.pendiente,
           coalesce(sum(it.monto) over (partition by it.bolsa
                                        order by it.prioridad desc, it.anio desc nulls last,
                                                 it.mes desc nulls last, it.sub desc
                                        rows between unbounded preceding and 1 preceding), 0) as antes
      from it
      join bolsa b on b.bolsa = it.bolsa
     where it.monto > 0.00005
  ),
  -- Lo pendiente que ningún recibo explica (saldos importados, ajustes que
  -- cargan): va a «Deuda anterior».
  sobra as (
    select b.bolsa, b.pendiente - coalesce((select sum(a.monto) from asignado a where a.bolsa = b.bolsa), 0) as extra
      from bolsa b
  )
  select a.destino, a.anio, a.mes, a.etiqueta, a.tipo, a.prioridad, a.monto,
         least(a.monto, greatest(a.pendiente - a.antes, 0))
    from asignado a
  union all
  select case x.bolsa when 'hon' then 'honorarios' when 'serv' then 'servicio' else 'condominio' end,
         null, null, 'Deuda anterior',
         case x.bolsa when 'mora' then 'mora' when 'multas' then 'multa' else 'anterior' end,
         case x.bolsa when 'mora' then 1 when 'multas' then 4 else 3 end,
         x.extra, x.extra
    from sobra x
   where x.extra > 0.00005
$function$;

revoke all on function public.deuda_partidas(uuid) from public, anon, authenticated;
comment on function public.deuda_partidas(uuid) is
  'Cambio 2 (ING3): cada cargo de los recibos cerrados de la unidad con lo que falta, a partir de los totales de deuda_por_orden() y saldo_unidad(). Uso interno.';

-- 2. puede_ver_saldo ────────────────────────────────────────────────────────
create function public.puede_ver_saldo(p_unidad uuid)
  returns boolean
  language sql
  stable
  set search_path to 'public'
as $function$
  select coalesce(es_operador(), false)
      or exists (
           select 1 from unidades u
             join membresias m on m.usuario_id = auth.uid() and m.activo
            where u.id = p_unidad
              and ((m.org_id = u.org_id and m.rol in ('propietario_cuenta', 'administrador', 'contador'))
                   or (m.edificio_id = u.edificio_id and m.rol = 'junta')
                   or (m.unidad_id = u.id and m.rol = 'residente'
                       and not (m.relacion = 'inquilino' and u.inquilino_ve = 'mes'))))
$function$;

revoke all on function public.puede_ver_saldo(uuid) from public, anon, authenticated;
comment on function public.puede_ver_saldo(uuid) is
  'Cambio 2 (ING3): la sesión puede ver el saldo de la unidad (la regla de saldo_unidad(), sin la excepción de current_user). Uso interno de deuda_por_mes() y repartir_pago().';

-- 3. deuda_por_mes ──────────────────────────────────────────────────────────
create function public.deuda_por_mes(p_unidad uuid)
  returns table(destino text, anio integer, mes integer, etiqueta text, tipo text,
                monto numeric, abonado numeric, falta numeric)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $function$
begin
  if p_unidad is null or not puede_ver_saldo(p_unidad) then
    raise exception 'Sin acceso a esa unidad' using errcode = '42501';
  end if;
  return query
    select x.destino, x.anio, x.mes, x.etiqueta, x.tipo,
           round(x.monto, 2), round(x.monto, 2) - round(x.falta, 2), round(x.falta, 2)
      from deuda_partidas(p_unidad) x
     order by x.destino, x.anio nulls first, x.mes nulls first, x.prioridad, x.tipo;
end $function$;

revoke all on function public.deuda_por_mes(uuid) from public, anon;
grant execute on function public.deuda_por_mes(uuid) to authenticated;
comment on function public.deuda_por_mes(uuid) is
  'Cambio 2 (ING3): por mes y por tipo de cargo, lo cobrado, lo abonado y lo que falta. Ver supabase/migrations/20261117130000_deuda_por_mes.sql.';

-- 4. repartir_pago ──────────────────────────────────────────────────────────
create function public.repartir_pago(p_unidades uuid[], p_monto numeric, p_destino text default 'condominio')
  returns table(unidad_id uuid, codigo text, monto numeric, detalle jsonb)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $function$
declare
  v_total numeric(18,2);
  v_n int; v_hay int; v_edificios int;
  v_u uuid;
begin
  if p_destino is null or p_destino not in ('condominio', 'honorarios', 'servicio') then
    raise exception 'Cuenta desconocida: %', p_destino;
  end if;
  v_total := round(p_monto, 2);
  if v_total is null or v_total <= 0 then
    raise exception 'Escriba el total de la transferencia.';
  end if;
  v_n := coalesce(cardinality(p_unidades), 0);
  if v_n = 0 or v_n > 100 then
    raise exception 'Elija entre 1 y 100 unidades.';
  end if;
  if array_position(p_unidades, null) is not null
     or (select count(distinct x) from unnest(p_unidades) x) <> v_n then
    raise exception 'Una unidad falta o aparece dos veces.';
  end if;
  select count(*), count(distinct u.edificio_id) into v_hay, v_edificios
    from unidades u where u.id = any (p_unidades);
  if v_hay <> v_n then
    raise exception 'Sin acceso a esa unidad' using errcode = '42501';
  end if;
  foreach v_u in array p_unidades loop
    if not puede_ver_saldo(v_u) then
      raise exception 'Sin acceso a esa unidad' using errcode = '42501';
    end if;
  end loop;
  if v_edificios <> 1 then
    raise exception 'Una transferencia reparte entre unidades de un mismo edificio.';
  end if;

  return query
  with it as (
    select u.id as uid, u.codigo as cod, x.anio as a, x.mes as m, x.etiqueta as et, x.tipo as ti,
           round(x.falta, 2) as fa,
           -- El orden de pago: prioridad, después el mes más antiguo («Deuda
           -- anterior» primero), después la unidad de código menor.
           row_number() over (order by x.prioridad, x.anio nulls first, x.mes nulls first,
                                       u.codigo, x.tipo) as n
      from unidades u
     cross join lateral deuda_partidas(u.id) x
     where u.id = any (p_unidades) and x.destino = p_destino and round(x.falta, 2) > 0
  ),
  cub as (
    select it.*,
           least(it.fa, greatest(v_total - coalesce(sum(it.fa) over (order by it.n
                                                    rows between unbounded preceding and 1 preceding), 0), 0)) as cubre
      from it
  ),
  pu as (
    select u.id as uid, u.codigo as cod,
           coalesce((select sum(c.cubre) from cub c where c.uid = u.id), 0) as cubierto
      from unidades u where u.id = any (p_unidades)
  ),
  -- Lo que sobra después de toda la deuda: partes iguales, y los céntimos
  -- que no dividen exacto a la unidad que recibe más.
  rep as (
    select pu.*,
           floor((v_total - t.cub) * 100 / v_n) / 100 as igual,
           (v_total - t.cub) - floor((v_total - t.cub) * 100 / v_n) / 100 * v_n as centimos
      from pu cross join (select sum(cubierto) as cub from pu) t
  ),
  fin as (
    select rep.*,
           rep.cubierto + rep.igual
           + case when row_number() over (order by rep.cubierto + rep.igual desc, rep.cod) = 1
                  then rep.centimos else 0 end as total_u
      from rep
  )
  select f.uid, f.cod, round(f.total_u, 2),
         coalesce((select jsonb_agg(jsonb_build_object('anio', c.a, 'mes', c.m, 'etiqueta', c.et,
                                                       'tipo', c.ti, 'falta', c.fa, 'cubre', c.cubre)
                                    order by c.n)
                     from cub c where c.uid = f.uid and c.cubre > 0), '[]'::jsonb)
         || case when f.total_u - f.cubierto > 0
                 then jsonb_build_array(jsonb_build_object('tipo', 'a_favor', 'cubre', round(f.total_u - f.cubierto, 2)))
                 else '[]'::jsonb end
    from fin f
   order by f.cod;
end $function$;

revoke all on function public.repartir_pago(uuid[], numeric, text) from public, anon;
grant execute on function public.repartir_pago(uuid[], numeric, text) to authenticated;
comment on function public.repartir_pago(uuid[], numeric, text) is
  'Cambio 2 (ING3): propone cuánto de una transferencia (en dólares) va a cada unidad, por antigüedad entre todas, y qué cubre en cada una. No guarda nada. Ver supabase/migrations/20261117130000_deuda_por_mes.sql.';

-- 5. recibos.deuda_meses ────────────────────────────────────────────────────
create function public.deuda_meses_json(p_unidad uuid)
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

revoke all on function public.deuda_meses_json(uuid) from public, anon, authenticated;
comment on function public.deuda_meses_json(uuid) is
  'Cambio 2 (ING3): los meses con algo pendiente, para recibos.deuda_meses. Uso interno de cerrar_periodo().';

alter table public.recibos add column deuda_meses jsonb;
comment on column public.recibos.deuda_meses is
  'Cambio 2 (ING3): lo que quedaba pendiente de los meses anteriores al cerrar este recibo, mes por mes: [{anio, mes, etiqueta, cargo, abonado, falta}]. null en los recibos anteriores a la migración.';

-- 6. cerrar_periodo(): los reemplazos ───────────────────────────────────────
do $reemplazo$
declare
  r record; d text;
begin
  d := pg_get_functiondef('public.cerrar_periodo(uuid)'::regprocedure);
  for r in select * from (values
      (1, E'      v_cargos jsonb;        -- Ronda 10 (C)\n',
          E'      v_cargos jsonb;        -- Ronda 10 (C)\n'
          || E'      v_deuda_meses jsonb;   -- Cambio 2 (ING3)\n'),
      (2, E'      insert into recibos (org_id, periodo_id, unidad_id, numero, alicuota, tasa_bcv,\n',
          E'      -- Cambio 2 (ING3): lo que quedaba pendiente de los meses anteriores,\n'
          || E'      -- mes por mes, con los pagos que entran en este cierre y antes de\n'
          || E'      -- sumar este recibo. Queda congelado en el recibo.\n'
          || E'      v_deuda_meses := deuda_meses_json(r.id);\n\n'
          || E'      insert into recibos (org_id, periodo_id, unidad_id, numero, alicuota, tasa_bcv,\n'),
      (3, E'                           total, detalle, conceptos, mora_base, vence_el, cargos)\n',
          E'                           total, detalle, conceptos, mora_base, vence_el, cargos, deuda_meses)\n'),
      (4, E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox, v_cargos);\n',
          E'              v_tot, v_detalle, v_lineas, v_base_mora, v_vence_prox, v_cargos, v_deuda_meses);\n')
    ) x(n, a, b) order by n loop
    if (length(d) - length(replace(d, r.a, ''))) / length(r.a) <> 1 then
      raise exception 'ABORTADA: el reemplazo % de cerrar_periodo no aparece exactamente una vez', r.n;
    end if;
    d := replace(d, r.a, r.b);
  end loop;
  execute d;
end
$reemplazo$;

do $despues$
declare v text; a text;
begin
  select md5(replace(prosrc, chr(13), '')), coalesce(array_to_string(proacl, ','), '') into v, a
    from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'd71adcb4251c0ceac7c4d7672d79ac77' then
    raise exception 'ABORTADA: cerrar_periodo() no quedó como se esperaba (md5=%)', v;
  end if;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: cerrar_periodo() cambió de permisos (%)', a;
  end if;
  select string_agg(p.proname || '=' || coalesce(array_to_string(p.proacl, ','), ''), ' ' order by p.proname) into a
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('deuda_partidas', 'puede_ver_saldo', 'deuda_por_mes', 'deuda_meses_json', 'repartir_pago');
  if a is distinct from 'deuda_meses_json=postgres=X/postgres deuda_partidas=postgres=X/postgres '
                        'deuda_por_mes=postgres=X/postgres,authenticated=X/postgres '
                        'puede_ver_saldo=postgres=X/postgres '
                        'repartir_pago=postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADA: permisos inesperados en las funciones nuevas (%)', a;
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
-- 1. select proname, md5(replace(prosrc, chr(13), '')), array_to_string(proacl, ',')
--      from pg_proc where pronamespace = 'public'::regnamespace
--       and proname in ('cerrar_periodo', 'simular_cierre', 'deuda_por_orden', 'deuda_partidas',
--                       'puede_ver_saldo', 'deuda_por_mes', 'deuda_meses_json', 'repartir_pago')
--     order by 1;
--    -- Esperado: cerrar_periodo d71adcb4251c0ceac7c4d7672d79ac77; simular_cierre 5bb826a852dd38de42cfc7ca78bb59a4 y
--    --   deuda_por_orden 766beca27abf363f4b78b3d21db6654e (sin cambios); deuda_por_mes y repartir_pago
--    --   postgres=X/postgres,authenticated=X/postgres; las otras tres postgres=X/postgres.
-- 2. select count(*) from pg_proc where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0;
--    -- Esperado: 0.
-- 3. Sin pagos de por medio, la previa no cambia: con el mes abierto de un edificio,
--      select md5(string_agg(concat_ws('|', codigo, condominio, administracion, servicio, anterior,
--                                      a_favor, mora, total, redondeo), ';' order by codigo))
--        from simular_cierre('<período>');
--    -- Esperado: la misma huella antes y después.
-- 4. El caso de la propuesta, en Administradora Baja / «Cambio 2 · prueba» (101 y 102, julio a
--    septiembre de $ 50, sin pagos), como admin.prueba o residente.prueba:
--      select * from repartir_pago(array['<101>', '<102>']::uuid[], 230, 'condominio');
--    -- Esperado: 101 → 130 (jul 50, ago 50, sep 30); 102 → 100 (jul 50, ago 50).
--      con 330: 101 → 165, 102 → 165 (cada una 150 + 15 a favor).
--    Con el pago 130/100 conciliado:
--      select * from deuda_por_mes('<101>');
--    -- Esperado: julio y agosto cuota 50 / abonado 50 / falta 0; septiembre 50 / 30 / 20.
--    Al cerrar octubre, el recibo de 101 trae deuda_meses
--      [{"anio": 2026, "mes": 9, "etiqueta": "Septiembre 2026", "cargo": 50, "abonado": 30, "falta": 20}].
-- 5. Acceso: como un usuario sin vínculo con la unidad, deuda_por_mes y repartir_pago dan
--    «Sin acceso a esa unidad»; como anon, permiso denegado. Unidades de dos edificios: «Una
--    transferencia reparte entre unidades de un mismo edificio».
