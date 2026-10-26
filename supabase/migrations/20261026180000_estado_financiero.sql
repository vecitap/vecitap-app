-- Estado financiero del edificio por período (ronda 7, bloque 8).
--
-- Aplicada en vecitap-pruebas el 26-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- Independiente de las demás migraciones. Solo crea una función de lectura.
-- Rollback: supabase/rollbacks/20261026180000_estado_financiero_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ DEVUELVE
-- ─────────────────────────────────────────────────────────────────────────
-- `estado_financiero(edificio, desde, hasta)`, con `desde` y `hasta` fechas
-- (la pantalla manda el primer día del primer mes y el último del último):
--   · saldo_inicial: ingresos − egresos de todo lo anterior a `desde`;
--   · ingresos: los **pagos conciliados** del edificio con fecha en el rango
--     (los que no van a honorarios: condominio y servicio);
--   · egresos: los **gastos del mes** (comunes y cargados a una unidad) de
--     los meses del rango;
--   · saldo_final = saldo_inicial + ingresos − egresos;
--   · honorarios: lo cobrado para honorarios en el rango, aparte (es de la
--     administradora, no del edificio);
--   · el detalle de cada ingreso y de cada egreso, y los meses del rango que
--     siguen abiertos (sus gastos todavía pueden cambiar).
-- Todo en USD (`pagos.monto_usd`, `gastos.monto`).
--
-- SECURITY INVOKER: lo que se ve lo decide RLS, como en `libro_edificio()`.
-- Además, solo responde a la administración, al contador y a la junta de ese
-- edificio: un residente vería solo sus propios pagos, un estado a medias.

begin;

create function public.estado_financiero(p_edificio uuid, p_desde date, p_hasta date)
  returns jsonb
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v_mes_desde date := date_trunc('month', p_desde)::date;
  v_ing_antes numeric; v_egr_antes numeric; v_ing numeric; v_egr numeric; v_hon numeric;
  v_org uuid;
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El período no es válido.';
  end if;
  select e.org_id into v_org from edificios e where e.id = p_edificio;
  -- La administración, el contador y la junta de ese edificio. Un residente
  -- vería solo sus propios pagos (RLS): un estado a medias, no se le da.
  if v_org is null or not (
       tiene_rol(v_org, array['propietario_cuenta', 'administrador', 'contador'])
       or exists (select 1 from membresias m
                   where m.usuario_id = auth.uid() and m.activo and m.rol = 'junta'
                     and m.edificio_id = p_edificio)) then
    raise exception 'Sin acceso a ese edificio.';
  end if;

  select coalesce(sum(pg.monto_usd) filter (where pg.fecha < p_desde and pg.destino <> 'honorarios'), 0),
         coalesce(sum(pg.monto_usd) filter (where pg.fecha between p_desde and p_hasta and pg.destino <> 'honorarios'), 0),
         coalesce(sum(pg.monto_usd) filter (where pg.fecha between p_desde and p_hasta and pg.destino = 'honorarios'), 0)
    into v_ing_antes, v_ing, v_hon
    from pagos pg join unidades u on u.id = pg.unidad_id
   where u.edificio_id = p_edificio and pg.estado = 'conciliado';

  select coalesce(sum(g.monto) filter (where make_date(p.anio, p.mes, 1) < v_mes_desde), 0),
         coalesce(sum(g.monto) filter (where make_date(p.anio, p.mes, 1) between v_mes_desde and p_hasta), 0)
    into v_egr_antes, v_egr
    from gastos g join periodos p on p.id = g.periodo_id
   where p.edificio_id = p_edificio;

  return jsonb_build_object(
    'saldo_inicial', round(v_ing_antes - v_egr_antes, 2),
    'ingresos', round(v_ing, 2),
    'egresos', round(v_egr, 2),
    'saldo_final', round(v_ing_antes - v_egr_antes + v_ing - v_egr, 2),
    'honorarios', round(v_hon, 2),
    'detalle_ingresos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', pg.fecha, 'unidad', u.codigo, 'metodo', pg.metodo,
               'referencia', pg.referencia, 'monto', round(pg.monto_usd, 2))
             order by pg.fecha, u.codigo)
        from pagos pg join unidades u on u.id = pg.unidad_id
       where u.edificio_id = p_edificio and pg.estado = 'conciliado' and pg.destino <> 'honorarios'
         and pg.fecha between p_desde and p_hasta), '[]'::jsonb),
    'detalle_egresos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'mes', p.etiqueta, 'anio', p.anio, 'num_mes', p.mes,
               'categoria', coalesce(c.nombre, case when g.tipo = 'directo' then 'Cargos a una unidad' else 'Sin categoría' end),
               'concepto', g.concepto, 'referencia', g.referencia, 'monto', round(g.monto, 2))
             order by p.anio, p.mes, coalesce(c.orden, 9999), g.orden, g.creado_en)
        from gastos g
        join periodos p on p.id = g.periodo_id
        left join categorias c on c.id = g.categoria_id
       where p.edificio_id = p_edificio
         and make_date(p.anio, p.mes, 1) between v_mes_desde and p_hasta), '[]'::jsonb),
    'meses_abiertos', coalesce((
      select jsonb_agg(p.etiqueta order by p.anio, p.mes)
        from periodos p
       where p.edificio_id = p_edificio and p.estado = 'abierto'
         and make_date(p.anio, p.mes, 1) between v_mes_desde and p_hasta), '[]'::jsonb));
end $function$;

revoke all on function public.estado_financiero(uuid, date, date) from public, anon;
grant execute on function public.estado_financiero(uuid, date, date) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- Como la administradora de un edificio con meses cerrados (en una
-- transacción con `set local role authenticated` y sus claims):
--   select public.estado_financiero('<edificio>', '2026-10-01', '2026-10-31');
--   -- saldo_final = saldo_inicial + ingresos − egresos; egresos = la suma de
--   -- los gastos de octubre (Gastos del mes); ingresos = los pagos
--   -- confirmados de octubre que no son de honorarios.
-- Como un residente: «Sin acceso a ese edificio».
