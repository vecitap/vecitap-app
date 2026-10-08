-- `mis_cuotas()`: cuántas cuotas debe cada unidad del portal, para decir
-- "Al día" / "Debe N cuotas" sin mostrar montos.
--
-- Aplicada en vecitap-pruebas el 08-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo (docs/respaldo.md).
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA (ronda 2 del tramo 2 — mejora de Gustavo, 07-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- Un propietario cuya unidad paga el inquilino ve esa unidad sin montos
-- (decisión del 01-oct, caso 31 de docs/casos-de-uso-mejorados.md). Hoy dice
-- solo "Debe" o "Al día", y "Debe" a secas es vago. Lo acordado era "al
-- día" o "debe N cuotas". `saldos_actuales` y `mis_unidades()` dan el saldo
-- acumulado, no cuántos meses representa, y el cálculo no se hace en el
-- navegador (criterio del proyecto: las cuentas las hace la base).
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL CÁLCULO
-- ─────────────────────────────────────────────────────────────────────────
-- Saldo: el mismo de `mis_unidades()` (saldo_visible → saldo_unidad).
-- Cuota de un mes: lo que ese recibo le CARGÓ a la unidad —
-- cuota + directos + mora + honorario + servicio—, que es exactamente lo
-- que saldo_unidad() suma por cada recibo de un mes cerrado. No se usa
-- `recibos.total`, que arrastra la deuda anterior.
--
-- Se recorren los recibos de meses CERRADOS de la unidad, del más reciente
-- hacia atrás, restando cada cargo del saldo hasta cubrirlo. Los pagos
-- cubren primero lo más viejo, así que lo que se debe son los últimos
-- meses: cada recibo que hizo falta recorrer es una cuota pendiente.
--
-- Casos borde (criterio pensado para que lo lea un propietario):
--   · Saldo de 0,009 o menos (cero, centavos de redondeo): 0 cuotas, "Al
--     día". Mismo umbral que lib/estados-unidad.ts (UMBRAL_SALDO).
--   · Saldo a favor: 0 cuotas, "Al día". El monto a favor no se muestra en
--     la sección sin montos.
--   · Saldo parcial (por ejemplo 1,3 cuotas): se cuenta el mes que está
--     pagado en parte, así que 1,3 → "Debe 2 cuotas". Es lo que el
--     propietario va a ver en los recibos: dos meses con algo pendiente.
--   · El saldo es mayor que todos los recibos cerrados (deuda anterior al
--     primer mes en Vecitap, cargada como saldo inicial): `mas_de = true`,
--     "Debe más de N cuotas".
--   · Sin ningún recibo cerrado y con deuda: cuotas = 0 y mas_de = true; la
--     pantalla dice "Con deuda" (no hay ninguna cuota con la que medirla).
--   · Saldo que la base no muestra (inquilino con inquilino_ve = 'mes'):
--     cuotas NULL, la pantalla dice lo mismo que hoy ("ver recibo").
--   · Un recibo con cargo 0 o negativo (un mes sin cuota) no cuenta.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER con search_path fijo, igual que mis_unidades(): mismo
-- WHERE (las membresías de residente activas de la sesión) y el saldo pasa
-- por saldo_visible(), que vuelve a comprobar unidades_visibles() e
-- inquilino_ve. Devuelve menos información que mis_unidades() (un conteo,
-- no el saldo), así que no amplía lo que ve nadie.

begin;

create function public.mis_cuotas()
 returns table(unidad_id uuid, cuotas integer, mas_de boolean)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_unidad   uuid;
  v_saldo    numeric;
  v_restante numeric;
  v_n        integer;
  v_cargo    numeric;
begin
  for v_unidad in
    select distinct m.unidad_id
      from membresias m
     where m.usuario_id = auth.uid() and m.activo and m.rol = 'residente'
       and m.unidad_id is not null
  loop
    v_saldo := saldo_visible(v_unidad);

    if v_saldo is null then
      unidad_id := v_unidad; cuotas := null; mas_de := false;
      return next;
      continue;
    end if;

    if v_saldo <= 0.009 then
      unidad_id := v_unidad; cuotas := 0; mas_de := false;
      return next;
      continue;
    end if;

    v_restante := v_saldo;
    v_n := 0;
    for v_cargo in
      select r.cuota + r.directos + r.mora + r.honorario + r.servicio
        from recibos r
        join periodos p on p.id = r.periodo_id
       where r.unidad_id = v_unidad
         and p.estado = 'cerrado'
       order by p.anio desc, p.mes desc
    loop
      continue when v_cargo <= 0.009;
      v_n := v_n + 1;
      v_restante := v_restante - v_cargo;
      exit when v_restante <= 0.009;
    end loop;

    unidad_id := v_unidad; cuotas := v_n; mas_de := v_restante > 0.009;
    return next;
  end loop;
end $function$;

comment on function public.mis_cuotas() is
  'Cuotas pendientes de cada unidad del portal (residente activo): recorre '
  'los recibos cerrados del más nuevo al más viejo hasta cubrir el saldo de '
  'saldo_visible(). mas_de = el saldo supera a todos los recibos. Ver '
  'supabase/migrations/20261008130000_mis_cuotas.sql.';

revoke all on function public.mis_cuotas() from public, anon;
grant execute on function public.mis_cuotas() to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Existe, es DEFINER con search_path fijo y solo la ejecuta
--    `authenticated`:
--
--   select prosecdef, proconfig, proacl::text
--     from pg_proc where oid = 'public.mis_cuotas()'::regprocedure;
--   -- Esperado: true | {search_path=public}
--   --           | {postgres=X/postgres,authenticated=X/postgres}
--   --   (puede listar también service_role; no tiene que aparecer anon ni =X/)
--
-- 2. Sin sesión no devuelve nada:
--   select count(*) from public.mis_cuotas();
--   -- Esperado: 0
--
-- 3. El cálculo, por unidad, sin sesión (mismo recorrido, con saldo_unidad
--    en lugar de saldo_visible). Para las unidades del propietario de
--    prueba del tramo 1:
--
--   select u.codigo, s.total,
--          (select count(*) from recibos r join periodos p on p.id = r.periodo_id
--            where r.unidad_id = u.id and p.estado = 'cerrado') as recibos_cerrados
--     from unidades u, saldo_unidad(u.id) s
--    where u.id in ('<ids>');
--   -- Comparar a mano con lo que muestra /mi: saldo 0 o a favor → "Al día";
--   -- saldo = una cuota → "Debe 1 cuota"; saldo entre una y dos → "Debe 2
--   -- cuotas"; saldo mayor que todos los recibos → "Debe más de N cuotas".
