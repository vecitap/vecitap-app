-- Lo pagado después del último recibo, para «Si paga hoy» (ronda 9, A1).
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). No depende de las otras migraciones de la ronda 9. Rollback:
-- supabase/rollbacks/20261028180000_pagos_desde_cierre_rollback.sql.
--
-- POR QUÉ: «Si paga hoy» tiene que descontar los pagos confirmados después
-- del recibo. Con el saldo visible, ya lo hace el saldo. Pero el inquilino con
-- «Solo el recibo del mes» no ve el saldo (saldo_visible() → NULL) y RLS no le
-- deja leer los pagos que no reportó él (pagos_ver → unidades_historico()): si
-- el propietario pagaba, al inquilino le seguía diciendo que pagara el recibo
-- entero. Lo encontró la validación de la ronda 9.
--
-- QUÉ HACE: pagos_desde_cierre(unidad) devuelve DOS SUMAS en dólares, nada
-- más: lo confirmado y lo reportado sin confirmar que todavía no entró en
-- ningún cierre (`periodo_cierre_id is null`). Sin filas, sin fechas, sin
-- quién pagó. Solo para quien ve esa unidad (unidades_visibles()). Al
-- inquilino con «Solo el recibo» le deja saber cuánto queda de su recibo, no
-- el saldo acumulado.

begin;

do $guarda$
begin
  if to_regprocedure('public.pagos_desde_cierre(uuid)') is not null then
    raise exception 'ABORTADA: pagos_desde_cierre ya existe';
  end if;
end
$guarda$;

create function public.pagos_desde_cierre(p_unidad uuid)
  returns table(confirmados numeric, en_revision numeric)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
  as $function$
begin
  if p_unidad not in (select unidades_visibles()) then
    raise exception 'Sin acceso a esa unidad' using errcode = '42501';
  end if;
  return query
    select coalesce(sum(p.monto_usd) filter (where p.estado = 'conciliado'), 0),
           coalesce(sum(p.monto_usd) filter (where p.estado = 'reportado'), 0)
      from pagos p
     where p.unidad_id = p_unidad and p.periodo_cierre_id is null;
end $function$;

revoke all on function public.pagos_desde_cierre(uuid) from public, anon;
grant execute on function public.pagos_desde_cierre(uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), prosecdef, array_to_string(proacl, ',') from pg_proc where proname = 'pagos_desde_cierre';
--    -- Esperado: 7b86d8acf44f957f57a87a45b1558c24, true, postgres=X/postgres,authenticated=X/postgres.
-- 2. Como el inquilino de una unidad con «Solo el recibo del mes» (sub en
--    request.jwt.claims, role authenticated), con un pago del propietario
--    confirmado después del cierre:
--      select * from pagos_desde_cierre('<unidad>');  → confirmados = ese pago
--      select count(*) from pagos where unidad_id = '<unidad>';  → 0 (RLS no cambia)
--    Con una unidad que no es suya → «Sin acceso a esa unidad». anon → permission denied.
