-- Cambio 3 del feedback de ING3: trabajar sin internet (parte A).
-- Plan: docs/plan-sin-conexion.md, 1.1 g. Rollback:
-- supabase/rollbacks/20261118120000_copia_edificio_rollback.sql.
--
-- Aplicada en vecitap-pruebas el 18-nov (asistente, execute_sql con el texto
-- del archivo). Verificación OK: SECURITY INVOKER, acl solo authenticated,
-- 0 funciones con «\r», md5 6081ff3e…; en «Cambio 2 · prueba» devuelve las
-- mismas filas que las llamadas una por una (6 y 6), y un edificio ajeno sale
-- vacío. En el Edificio Gustavo (53 unidades, 9 meses): 519 + 664 filas,
-- ~250 KB, ~2,4 s en el servidor (lo más caro es deuda_por_mes).
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo,
-- junto con el resto del cambio 3.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- copia_edificio(p_edificio) devuelve, en UNA llamada, lo que la copia sin
-- conexión de un edificio necesita por unidad:
--   {"historial": [ {unidad_id, n, fecha, orden, concepto, detalle, cargo, abono, saldo}, … ],
--    "deuda":     [ {unidad_id, destino, anio, mes, etiqueta, tipo, monto, abonado, falta}, … ]}
-- Sin ella, el navegador tendría que llamar a historial_unidad() y a
-- deuda_por_mes() una vez por unidad: ~2 llamadas por unidad (≈ 120 para 53
-- unidades). El resto de la copia (unidades, saldos, pagos, periodos…) ya se
-- baja con las mismas consultas que usan las páginas.
--
-- NO copia ninguna lógica: llama a historial_unidad() y deuda_por_mes() tal
-- como están, y solo junta lo que devuelven. Si esas funciones cambian, la
-- copia cambia con ellas.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER: corre con los permisos del usuario. Las unidades salen
-- de un select a `unidades` con la RLS de quien llama, así que solo recorre
-- las que ya puede ver; historial_unidad() es INVOKER (RLS) y deuda_por_mes()
-- hace su propio control (puede_ver_saldo). Una unidad cuyo detalle por mes
-- no puede ver (42501) se salta, igual que en la pantalla, donde el bloque
-- no aparece. No agrega ningún permiso: devuelve lo mismo que hoy se obtiene
-- con ~2 llamadas por unidad. search_path fijo. Ejecutable solo por
-- authenticated (no anon, no public).
--
-- No cambia ninguna función existente: no hay md5 que guardar.

begin;

do $antes$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'copia_edificio') then
    raise exception 'ABORTADA: copia_edificio() ya existe. No se cambió nada.';
  end if;
end
$antes$;

create function public.copia_edificio(p_edificio uuid)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path to 'public'
as $$
declare
  u record;
  v_historial jsonb := '[]'::jsonb;
  v_deuda jsonb := '[]'::jsonb;
begin
  if p_edificio is null then
    raise exception 'Falta el edificio' using errcode = '22004';
  end if;

  for u in select x.id from unidades x where x.edificio_id = p_edificio order by x.codigo loop
    -- El orden de las filas es el que devuelve historial_unidad() (n).
    v_historial := v_historial || coalesce((
      select jsonb_agg(jsonb_build_object(
               'unidad_id', u.id, 'n', h.n, 'fecha', h.fecha, 'orden', h.orden, 'concepto', h.concepto,
               'detalle', h.detalle, 'cargo', h.cargo, 'abono', h.abono, 'saldo', h.saldo) order by h.n)
        from historial_unidad(u.id) with ordinality as h(fecha, orden, concepto, detalle, cargo, abono, saldo, n)
    ), '[]'::jsonb);

    begin
      v_deuda := v_deuda || coalesce((
        select jsonb_agg(jsonb_build_object(
                 'unidad_id', u.id, 'destino', d.destino, 'anio', d.anio, 'mes', d.mes, 'etiqueta', d.etiqueta,
                 'tipo', d.tipo, 'monto', d.monto, 'abonado', d.abonado, 'falta', d.falta) order by d.n)
          from deuda_por_mes(u.id) with ordinality as d(destino, anio, mes, etiqueta, tipo, monto, abonado, falta, n)
      ), '[]'::jsonb);
    exception when insufficient_privilege then
      -- «Sin acceso a esa unidad»: la pantalla tampoco muestra el bloque.
      null;
    end;
  end loop;

  return jsonb_build_object('historial', v_historial, 'deuda', v_deuda);
end
$$;

comment on function public.copia_edificio(uuid) is
  'Cambio 3 (sin conexión): historial_unidad() y deuda_por_mes() de todas las unidades visibles de un edificio, en una llamada. SECURITY INVOKER, no copia lógica.';

revoke all on function public.copia_edificio(uuid) from public, anon;
grant execute on function public.copia_edificio(uuid) to authenticated;

do $despues$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0) then
    raise exception 'ABORTADA: hay funciones con «\r»';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, prosecdef, array_to_string(proacl, ','), md5(replace(prosrc, chr(13), ''))
--      from pg_proc where pronamespace = 'public'::regnamespace and proname = 'copia_edificio';
--    -- Esperado: prosecdef = false; proacl postgres=X/postgres,authenticated=X/postgres.
-- 2. select count(*) from pg_proc where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0;
--    -- Esperado: 0.
-- 3. Como admin.prueba (en una transacción que se deshace):
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', json_build_object('sub', '<id de admin.prueba>', 'role', 'authenticated')::text, true);
--      select jsonb_array_length(c->'historial'), jsonb_array_length(c->'deuda')
--        from copia_edificio('00ab5b91-d9f2-4d0c-b931-646e77a6749c') c;   -- «Cambio 2 · prueba»
--      rollback;
--    -- Esperado: la suma de filas de historial_unidad() y de deuda_por_mes() de 101 y 102, llamadas
--    --   una por una con la misma sesión.
-- 4. Lo mismo con un usuario sin vínculo con ese edificio → {"historial": [], "deuda": []}
--    (la RLS de unidades no le muestra ninguna). Como anon → permiso denegado.
