-- saldo_unidad() con control propio y sin EXECUTE para anon ni PUBLIC (ronda
-- 9, bloque D2; pendiente de la verificación del 28-oct).
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). No depende de las otras migraciones de la ronda 9. Rollback:
-- supabase/rollbacks/20261028160000_saldo_unidad_control_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUIÉN LA LLAMA (leído en pruebas y producción el 28-oct; iguales)
-- ─────────────────────────────────────────────────────────────────────────
-- · La app, nunca directo. Indirectamente:
--     - la vista `saldos_actuales` (security_invoker): Admin → Inicio,
--       Propietarios y la ficha de una unidad. Corre como la sesión → pasa
--       por el control nuevo (la administradora la ve; igual que hoy por RLS).
--     - mis_unidades() → saldo_visible(); datos_pago_de(): SECURITY DEFINER.
-- · Funciones SECURITY DEFINER (corren como su dueño, postgres: el control
--   nuevo no las frena; cada una tiene el suyo): saldo_visible,
--   datos_pago_de, cerrar_periodo, simular_cierre, cartera_operador,
--   edificios_operador, morosidad_edificio, garita_avisar (la llama el
--   vigilante: por eso el control no puede exigir ver la unidad cuando la
--   llama una función de confianza).
-- · Funciones SECURITY INVOKER (pasan por el control): mora_de y
--   periodos_fuera_de_orden. Ninguna pantalla las llama hoy.
-- · El cron: no la llama.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Sin EXECUTE para PUBLIC ni anon (tenía la ACL vacía: la ejecutaba
--    cualquiera, también sin sesión; sin sesión devolvía ceros por RLS, pero
--    no tenía por qué responder). Queda para authenticated.
-- 2. Control propio, salvo cuando la llama una función de confianza
--    (current_user = postgres, el dueño de las SECURITY DEFINER; también
--    supabase_admin y service_role): puede quien ve esa unidad —su
--    administración (dueña, administrador o contador de la organización; la
--    junta, de su edificio), su propietario o su inquilino, el operador—, con
--    la misma regla que saldo_visible(): el inquilino con «Solo el recibo del
--    mes» no ve el saldo acumulado. Antes podía pedirlo llamándola directo.
-- 3. `search_path` fijo en 'public' (no lo tenía).
-- El cálculo no cambia una línea.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.saldo_unidad(uuid)'::regprocedure;
  if v is distinct from '1396d4083c6be0e3902f0814a3de0e44' then
    raise exception 'ABORTADA: saldo_unidad cambió (md5=%)', v;
  end if;
end
$guarda$;

CREATE OR REPLACE FUNCTION public.saldo_unidad(p_unidad uuid)
 RETURNS TABLE(condominio numeric, administracion numeric, servicio numeric, total numeric, mora numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_anio int; v_mes int;
  v_cond numeric(18,4); v_adm numeric(18,4); v_serv numeric(18,4);
  v_mora numeric(18,4); v_abonos numeric(18,4);
begin
  -- Ronda 9 (D2): control propio. Antes no tenía ninguno: la ejecutaban anon
  -- y authenticated, y un inquilino con «Solo el recibo del mes» podía pedir
  -- el saldo acumulado que saldo_visible() le esconde.
  -- Llamada desde una función SECURITY DEFINER (saldo_visible, datos_pago_de,
  -- cerrar_periodo, simular_cierre, garita_avisar, morosidad_edificio, las del
  -- operador…), current_user es el dueño de esa función y el control lo hace
  -- ella; igual desde el cron. Llamada como la sesión (la vista
  -- saldos_actuales, mora_de, periodos_fuera_de_orden o directo por la API),
  -- tiene que poder verla: su administración (dueña, administrador o
  -- contador de la organización; la junta, de su edificio), su propietario o
  -- su inquilino —salvo el inquilino con «Solo el recibo del mes»—, o el
  -- operador.
  if current_user not in ('postgres', 'supabase_admin', 'service_role') and not (
       es_operador()
       or exists (
         select 1 from unidades u
           join membresias m on m.usuario_id = auth.uid() and m.activo
          where u.id = p_unidad
            and ((m.org_id = u.org_id and m.rol in ('propietario_cuenta', 'administrador', 'contador'))
                 or (m.edificio_id = u.edificio_id and m.rol = 'junta')
                 or (m.unidad_id = u.id and m.rol = 'residente'
                     and not (m.relacion = 'inquilino' and u.inquilino_ve = 'mes'))))) then
    raise exception 'Sin acceso a esa unidad' using errcode = '42501';
  end if;

  select p.anio, p.mes, c.saldo_condominio, c.saldo_honorarios,
         c.saldo_servicio, c.mora_acumulada
    into v_anio, v_mes, v_cond, v_adm, v_serv, v_mora
    from cortes_mensuales c
    join periodos p on p.id = c.periodo_id
   where c.unidad_id = p_unidad
   order by p.anio desc, p.mes desc
   limit 1;

  if v_anio is null then
    select u.saldo_inicial, u.saldo_inicial_hon, 0, 0
      into v_cond, v_adm, v_serv, v_mora
      from unidades u where u.id = p_unidad;
    if v_cond is null then
      return query select 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric;
      return;
    end if;
    v_anio := -1; v_mes := 0;
  end if;

  v_mora := coalesce(v_mora, 0);

  -- Recibos de meses cerrados posteriores por calendario
  select v_cond + coalesce(sum(r.cuota + r.directos + r.mora), 0),
         v_adm  + coalesce(sum(r.honorario), 0),
         v_serv + coalesce(sum(r.servicio), 0),
         v_mora + coalesce(sum(r.mora), 0)
    into v_cond, v_adm, v_serv, v_mora
    from recibos r
    join periodos p on p.id = r.periodo_id
   where r.unidad_id = p_unidad
     and p.estado = 'cerrado'
     and (p.anio, p.mes) > (v_anio, v_mes);

  select v_cond - coalesce(sum(p.monto_usd) filter (where p.destino = 'condominio'), 0),
         v_adm  - coalesce(sum(p.monto_usd) filter (where p.destino = 'honorarios'), 0),
         v_serv - coalesce(sum(p.monto_usd) filter (where p.destino = 'servicio'), 0),
         coalesce(sum(p.monto_usd) filter (where p.destino = 'condominio'), 0)
    into v_cond, v_adm, v_serv, v_abonos
    from pagos p
   where p.unidad_id = p_unidad
     and p.estado = 'conciliado'
     and p.periodo_cierre_id is null;

  v_mora := greatest(v_mora - coalesce(v_abonos, 0), 0);

  select v_cond - coalesce(sum(a.monto) filter (where a.destino = 'condominio'), 0),
         v_adm  - coalesce(sum(a.monto) filter (where a.destino = 'honorarios'), 0),
         v_serv - coalesce(sum(a.monto) filter (where a.destino = 'servicio'), 0),
         coalesce(sum(a.monto) filter (where a.destino = 'condominio'), 0)
    into v_cond, v_adm, v_serv, v_abonos
    from ajustes a
   where a.unidad_id = p_unidad
     and a.periodo_cierre_id is null;

  v_mora := greatest(v_mora - coalesce(v_abonos, 0), 0);
  -- La mora nunca puede ser mayor que la deuda que la contiene
  v_mora := least(v_mora, greatest(v_cond, 0));

  return query select v_cond, v_adm, v_serv, v_cond + v_adm + v_serv, v_mora;
end $function$;

revoke all on function public.saldo_unidad(uuid) from public, anon;
grant execute on function public.saldo_unidad(uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), proconfig, array_to_string(proacl, ',') from pg_proc where proname = 'saldo_unidad';
--    -- Esperado: 497d819a42e0533a410dbb62155da7cb, {search_path=public},
--    --   postgres=X/postgres,authenticated=X/postgres (sin anon, sin =X/ de PUBLIC).
-- 2. En transacciones deshechas, con `set local role` y el sub de cada cuenta:
--    · anon: select * from saldo_unidad('<unidad>');  → permission denied
--    · la administradora de esa org: el saldo (igual que saldos_actuales).
--    · una administradora de OTRA org: «Sin acceso a esa unidad».
--    · su propietario: el saldo. Su inquilino con inquilino_ve = 'saldo': el
--      saldo; con 'mes': «Sin acceso a esa unidad» (saldo_visible() sigue
--      devolviendo NULL, como antes).
--    · el operador: el saldo.
--    · select count(*) from saldos_actuales; como la administradora → todas
--      sus unidades activas, sin error; mis_unidades() del residente → igual
--      que antes.
