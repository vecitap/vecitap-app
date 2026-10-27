-- ═════════════════════════════════════════════════════════════════════════
-- ANEXO DEL PASO 9 — Vaciar una organización antes de recargarla con la
-- plantilla (ronda 8, bloque E; decisión de Gustavo para GRUPO ING3)
-- ═════════════════════════════════════════════════════════════════════════
--
-- **PREPARADO, NO EJECUTADO.** Lo corre Nicolás en vecitap-produccion, en el
-- SQL Editor, **después** del respaldo (docs/respaldo.md) y **después** del
-- Paso 8 (las migraciones), y antes de cargar la plantilla. Es un script de
-- datos de una sola vez, no una migración: no va en supabase/migrations.
-- Sin datos reales: la organización se elige por su nombre exacto en la
-- línea marcada «← AQUÍ».
--
-- Todo va en UNA transacción: o se borra todo, o nada. Si una verificación
-- falla, el script se detiene con «ABORTADO: …» y no se borra nada.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ANTES DE BORRAR, VERIFICA Y ABORTA SI:
-- ─────────────────────────────────────────────────────────────────────────
--   · el nombre no da exactamente una organización;
--   · algún propietario o inquilino **tiene acceso** a la app (membresía de
--     residente, activa o no): borrar su unidad le dejaría una cuenta
--     colgando;
--   · hay **pagos** (cualquier estado): son plata reportada o recibida;
--   · hay **meses cerrados** (recibos emitidos).
-- Al 27-oct (lectura de producción): GRUPO ING3 no tiene ninguno de los
-- tres. Tiene 1 edificio, 53 unidades, 55 personas, 55 vínculos, 1 cobro
-- configurado y la membresía de su administradora.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ BORRA (solo de esa organización)
-- ─────────────────────────────────────────────────────────────────────────
--   unidades (todas, activas o dadas de baja) y lo que cuelga de ellas:
--     vínculos (propietario/inquilino), notas de la unidad, vehículos,
--     visitas, invitaciones de visita y bitácora de la garita;
--   personas (las fichas) y visitantes;
--   meses abiertos (periodos) con sus gastos; recibos y cortes (no hay, por
--     la verificación); ajustes de saldo; movimientos del banco;
--   la cola de correos de la organización y los mensajes masivos;
--   las invitaciones de residente que no se usaron (y su código guardado).
--
-- QUÉ CONSERVA
-- ─────────────────────────────────────────────────────────────────────────
--   la organización y su suscripción; la membresía de la administradora (y
--   cualquier otra que no sea de residente) y sus invitaciones de
--   administración o vigilante; los edificios, con sus ajustes (prefijo,
--   vencimiento, mora, tolerancias); los cobros (conceptos_cobro),
--   categorías y partidas fijas; los datos para pagar; los ajustes de
--   correo y de cobro (solo dólares, redondeo); los módulos; la auditoría
--   (el borrado queda registrado ahí).
-- ═════════════════════════════════════════════════════════════════════════

begin;

create temporary table vaciar_org on commit drop as
  select o.id from public.organizaciones o
   where o.nombre = 'GRUPO ING3';                         -- ← AQUÍ, el nombre exacto

do $vaciar$
declare
  v_org uuid; n int;
  r text; t text;
begin
  -- 1. Las verificaciones: si algo falla, no se borra nada.
  select count(*) into n from vaciar_org;
  if n <> 1 then
    raise exception 'ABORTADO: el nombre da % organizaciones (tiene que ser exactamente una).', n;
  end if;
  select id into v_org from vaciar_org;

  select count(*) into n from public.membresias m where m.org_id = v_org and m.rol = 'residente';
  if n > 0 then
    raise exception 'ABORTADO: % propietarios o inquilinos tienen acceso a la app (membresías de residente). Quíteselos desde Accesos antes de vaciar.', n;
  end if;
  select count(*) into n from public.pagos p where p.org_id = v_org;
  if n > 0 then
    raise exception 'ABORTADO: la organización tiene % pagos. No se vacía una organización con pagos.', n;
  end if;
  select count(*) into n from public.periodos p where p.org_id = v_org and p.estado = 'cerrado';
  if n > 0 then
    raise exception 'ABORTADO: la organización tiene % meses cerrados (recibos emitidos).', n;
  end if;

  -- 2. El borrado, de las hojas hacia la raíz. Las tablas que agregan las
  --    migraciones de la ronda 7 se saltan si todavía no existen.
  foreach t in array array[
      'cola_correo', 'mensajes', 'comprobantes', 'movimientos_banco', 'ajustes',
      'cortes_mensuales', 'recibos', 'gastos', 'periodos',
      'bitacora', 'visitas', 'invitaciones_visita', 'vehiculos', 'visitantes',
      'notas_unidad', 'vinculos'] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where org_id = $1', t) using v_org;
      get diagnostics n = row_count;
      raise notice '% filas borradas de %', n, t;
    end if;
  end loop;

  -- Invitaciones de residente sin usar (su código en invitaciones_codigo se
  -- borra solo, en cascada). Las de administración y vigilante se quedan.
  delete from public.invitaciones i where i.org_id = v_org and i.rol = 'residente';
  get diagnostics n = row_count;
  raise notice '% invitaciones de residente borradas', n;

  delete from public.unidades u where u.org_id = v_org;
  get diagnostics n = row_count;
  raise notice '% unidades borradas', n;

  delete from public.personas p where p.org_id = v_org;
  get diagnostics n = row_count;
  raise notice '% personas borradas', n;

  -- 3. Comprobación antes de confirmar: si queda algo de lo que se borra, o
  --    falta algo de lo que se conserva, se deshace todo.
  select (select count(*) from public.unidades  where org_id = v_org)
       + (select count(*) from public.personas  where org_id = v_org)
       + (select count(*) from public.vinculos  where org_id = v_org)
       + (select count(*) from public.periodos  where org_id = v_org)
       + (select count(*) from public.recibos   where org_id = v_org)
       + (select count(*) from public.cola_correo where org_id = v_org)
    into n;
  if n <> 0 then raise exception 'ABORTADO: después de borrar quedan % filas. No se borró nada.', n; end if;
  if not exists (select 1 from public.organizaciones where id = v_org)
     or not exists (select 1 from public.edificios where org_id = v_org)
     or not exists (select 1 from public.membresias where org_id = v_org and rol in ('propietario_cuenta', 'administrador') and activo) then
    raise exception 'ABORTADO: falta la organización, su edificio o su administradora. No se borró nada.';
  end if;
end
$vaciar$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. VERIFICACIÓN — se corre aparte, DESPUÉS del script de arriba
-- ─────────────────────────────────────────────────────────────────────────
-- with o as (select id from public.organizaciones where nombre = 'GRUPO ING3')
-- select 'organizaciones' as tabla, count(*) from public.organizaciones where id in (select id from o)
-- union all select 'edificios',       count(*) from public.edificios       where org_id in (select id from o)
-- union all select 'membresias',      count(*) from public.membresias      where org_id in (select id from o)
-- union all select 'conceptos_cobro', count(*) from public.conceptos_cobro where org_id in (select id from o)
-- union all select 'unidades',        count(*) from public.unidades        where org_id in (select id from o)
-- union all select 'personas',        count(*) from public.personas        where org_id in (select id from o)
-- union all select 'vinculos',        count(*) from public.vinculos        where org_id in (select id from o)
-- union all select 'periodos',        count(*) from public.periodos        where org_id in (select id from o)
-- union all select 'recibos',         count(*) from public.recibos         where org_id in (select id from o)
-- union all select 'pagos',           count(*) from public.pagos           where org_id in (select id from o)
-- union all select 'cola_correo',     count(*) from public.cola_correo     where org_id in (select id from o)
-- union all select 'invitaciones de residente', count(*) from public.invitaciones where rol = 'residente' and org_id in (select id from o);
-- Esperado en GRUPO ING3: organizaciones 1 · edificios 1 · membresias 1 ·
-- conceptos_cobro 1 · todo lo demás 0.
--
-- Para probarlo sin borrar nada, cambiar el «commit;» de arriba por
-- «rollback;»: corre las verificaciones y el borrado, avisa cuántas filas
-- borraría (en los mensajes) y lo deshace.
--
-- Después, en la app: Propietarios → Cargar datos → la plantilla. Como el
-- edificio queda sin unidades, todas las filas salen como «nuevas» y no hace
-- falta «Actualizar todas».
