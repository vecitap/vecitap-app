-- Corrige el día de `garita_bitacora`: hoy decide el día en la zona de la
-- SESIÓN (UTC en PostgREST), no en la de Venezuela.
--
-- SIN APLICAR. Toca una función SECURITY DEFINER en la base compartida — la
-- revisa y la aplica Nicolás, avisándole antes a Gustavo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL BUG, confirmado en la validación de Garita
-- ─────────────────────────────────────────────────────────────────────────
-- Una nota registrada a las 22:59 hora de Venezuela del 28-sep (02:59 UTC del
-- 29) no aparece en la Bitácora del 28: aparece en la del 29.
--
-- Son DOS expresiones, y conviene no confundirlas porque solo la segunda
-- explica el caso reportado:
--
--   1. `v_f := coalesce(p_fecha, current_date)`
--      `current_date` es el día en la zona de la sesión. Afecta solo cuando
--      el cliente NO manda `p_fecha`. **No es la causa de este caso**:
--      `VistaBitacora.tsx` y `garita.html` mandan siempre `p_fecha`.
--
--   2. `b.creado_en >= v_f::timestamptz and b.creado_en < (v_f + 1)::timestamptz`
--      **Esta es la causa.** Castear `date` → `timestamptz` interpreta la
--      medianoche en la zona de la SESIÓN. Con la sesión en UTC, pedir el
--      día 2026-09-28 abre la ventana
--         [2026-09-28 00:00 UTC, 2026-09-29 00:00 UTC)
--      que en Venezuela es
--         [2026-09-27 20:00, 2026-09-28 20:00)
--      — o sea, el "día" del vigilante arranca a las 8 de la noche anterior y
--      se corta a las 8 de la noche. Todo lo que pase entre las 20:00 y la
--      medianoche cae en el día siguiente. Cuatro horas de cada turno de
--      noche quedaban en el día equivocado.
--
-- Se corrigen las dos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ DOS FUNCIONES AUXILIARES (`hoy_local`, `inicio_dia_local`)
-- ─────────────────────────────────────────────────────────────────────────
-- Nicolás pidió evaluar si conviene que la zona viva en un solo lugar. Sí,
-- por cuatro razones:
--
--   · Ya hay un segundo consumidor planificado: el **bloque 13** (vista de
--     Garita dentro de Admin) tiene que decidir el día con el mismo criterio,
--     o las dos pantallas van a mostrar bitácoras distintas del mismo día.
--   · La auditoría de esta sesión encontró más candidatos con el mismo
--     patrón (`libro_edificio`/`historial_unidad` con `cerrado_en::date`, los
--     `DEFAULT CURRENT_DATE` de `pagos`/`ajustes`) — ver
--     docs/estado-migracion.md. Si alguno se corrige después, reusa esto.
--   · `AT TIME ZONE` significa **dos cosas distintas** según el tipo de la
--     izquierda (`timestamptz AT TIME ZONE z` → timestamp local;
--     `timestamp AT TIME ZONE z` → instante absoluto). Ese es el verdadero
--     pie de banana. Encerrarlo acá evita que cada call site lo reescriba.
--   · El día que Vecitap tenga un cliente fuera de Venezuela, hay **un**
--     lugar que cambiar en vez de N.
--
-- **La simplificación que esto asume, explícitamente:** una zona única y
-- escrita a mano. Es correcto mientras todos los clientes estén en Venezuela
-- (premisa que confirmó Nicolás). El modelo correcto a largo plazo es una
-- columna de zona por organización o por edificio; queda anotado en
-- docs/estado-migracion.md como decisión a revisar, no como olvido.
--
-- Se usa el nombre de zona **`America/Caracas`**, no el desplazamiento fijo
-- `-04:00`, aunque hoy sean lo mismo: Venezuela ya cambió de offset una vez
-- (estuvo en -04:30 entre 2007 y 2016), así que el nombre sobrevive a un
-- cambio de política y el número no. Hay precedente en la propia base:
-- `traer_tasa_bcv` ya usa `at time zone 'America/Caracas'`.
--
-- **Las dos auxiliares NO son SECURITY DEFINER, a propósito.** No leen
-- ninguna tabla, así que no hay nada que escalar; `AGENTS.md` advierte que
-- las SECURITY DEFINER son el punto único de falla del aislamiento
-- multi-tenant y no conviene sumar una sin necesidad. Quedan `STABLE`
-- (dependen de `now()` y de las reglas de zona, que pueden cambiar), lo que
-- alcanza: una función STABLE se evalúa una vez por consulta y el
-- `where creado_en >= … and creado_en < …` sigue pudiendo usar índice sobre
-- `creado_en`, porque los dos extremos se calculan sin mirar la columna.
--
-- **`SET search_path = ''` en las dos, aunque no sean SECURITY DEFINER**
-- (pedido de Nicolás, y es lo correcto): así el cuerpo no depende de qué
-- `search_path` traiga quien las llame, y nada que alguien cree en `public`
-- puede interponerse en la resolución de nombres.
--
-- **No hace falta calificar nada**, y conviene saber por qué: `pg_catalog`
-- está **siempre** en la ruta de búsqueda de forma implícita — si no aparece
-- nombrado, Postgres lo busca *antes* que los esquemas de la ruta. Con la
-- ruta vacía eso deja a `pg_catalog` como lo único visible, así que `now()`,
-- el operador `AT TIME ZONE` (que es `pg_catalog.timezone()`) y los tipos
-- `date`/`timestamp` resuelven igual, y no hay ningún esquema de usuario
-- desde donde ensombrecerlos. Calificar a mano (`pg_catalog.now()`,
-- `::pg_catalog.date`) no agregaría protección y sí riesgo de un error de
-- sintaxis al aplicar, así que los cuerpos quedan sin calificar.
--
-- Efecto secundario de tener una cláusula `SET`, para que no sorprenda: una
-- función SQL con `SET` **no se puede inlinear** en la consulta que la llama.
-- Acá no importa: los dos extremos de la ventana se siguen calculando una
-- sola vez por consulta (son `STABLE` con argumentos constantes), así que el
-- índice sobre `creado_en` sigue sirviendo; lo único que se agrega es una
-- llamada a función por consulta.
--
-- Quedan con EXECUTE para PUBLIC (el default de Postgres). Es inocuo: no
-- acceden a datos, solo hacen aritmética de fechas.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE SE CONSERVA TAL CUAL, como pidió Nicolás
-- ─────────────────────────────────────────────────────────────────────────
-- Firma completa (nombres, tipos y DEFAULT de los 3 parámetros y el
-- RETURNS TABLE), `LANGUAGE plpgsql`, `STABLE`, `SECURITY DEFINER`,
-- `SET search_path TO 'public'`, y `perform permitir_garita(p_edificio)`
-- como primera sentencia. El `select` del correo del vigilante desde
-- `auth.users` (el arreglo de Gustavo) queda idéntico.
--
-- Base tomada del `pg_get_functiondef` que Nicolás sacó de vecitap-pruebas
-- hoy, no de `esquema_inicial.sql`. (Dato útil: se compararon y **coinciden**
-- — el dump del 27-sep ya traía el arreglo de Gustavo. Aun así la referencia
-- es el CSV de hoy.)

begin;

-- ── Auxiliares de zona ───────────────────────────────────────────────────

-- "Hoy" en Venezuela, sin depender de la zona de la sesión.
CREATE OR REPLACE FUNCTION public.hoy_local() RETURNS date
    LANGUAGE sql
    STABLE
    SET search_path = ''
    AS $function$
  select (now() at time zone 'America/Caracas')::date
$function$;

COMMENT ON FUNCTION public.hoy_local() IS
  'El día de hoy en America/Caracas. Usar en vez de current_date para '
  'decidir "hoy": current_date depende de la zona de la sesión (UTC en '
  'PostgREST). Ver supabase/migrations/20260928140000_garita_bitacora_dia_local.sql.';

-- El instante en que arranca un día de Venezuela. Con este y el del día
-- siguiente se arma la ventana [inicio, fin) de un día local.
CREATE OR REPLACE FUNCTION public.inicio_dia_local(p_dia date) RETURNS timestamp with time zone
    LANGUAGE sql
    STABLE
    SET search_path = ''
    AS $function$
  select (p_dia::timestamp) at time zone 'America/Caracas'
$function$;

COMMENT ON FUNCTION public.inicio_dia_local(date) IS
  'Instante absoluto en que empieza ese día en America/Caracas. Usar en vez '
  'de castear date::timestamptz, que interpreta la medianoche en la zona de '
  'la sesión. Para la ventana de un día: creado_en >= inicio_dia_local(d) '
  'and creado_en < inicio_dia_local(d + 1).';

-- ── La corrección ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.garita_bitacora(p_edificio uuid, p_fecha date DEFAULT NULL::date, p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, creado_en timestamp with time zone, tipo text, texto text, vigilante text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_f date;
begin
  perform permitir_garita(p_edificio);
  -- CAMBIO 1: hoy_local() en vez de current_date — el día del vigilante, no
  -- el de Greenwich. Solo aplica cuando el cliente no manda p_fecha.
  v_f := coalesce(p_fecha, hoy_local());
  return query
  select b.id, b.creado_en, b.tipo, b.texto,
         coalesce((select au.email::text from auth.users au   -- ← el arreglo
                    where au.id = b.vigilante_id), '—')
    from bitacora b
   where b.edificio_id = p_edificio
     -- CAMBIO 2 (la causa del caso reportado): la ventana del día se abre y
     -- se cierra a la medianoche de Venezuela. Antes era
     -- `v_f::timestamptz`, que la abría a la medianoche de la sesión (UTC),
     -- o sea a las 20:00 del día anterior en Venezuela.
     and b.creado_en >= inicio_dia_local(v_f)
     and b.creado_en <  inicio_dia_local(v_f + 1)
   order by b.creado_en desc
   limit greatest(coalesce(p_limite, 200), 1);
end $function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) Las auxiliares, y de paso se ve el desfase que causaba el bug. Después
--    de las 20:00 de Venezuela, `hoy_caracas` y `hoy_utc` van a diferir —
--    eso es correcto, es justo lo que antes rompía la bitácora:
--
--      select hoy_local()                        as hoy_caracas,
--             current_date                       as hoy_utc,
--             inicio_dia_local(hoy_local())      as arranca_el_dia,
--             inicio_dia_local(hoy_local() + 1)  as termina_el_dia;
--
--    Esperado: `arranca_el_dia` a las 04:00Z (= 00:00 en Venezuela), no a
--    las 00:00Z.
--
-- 2) El caso reportado, sin necesidad de sesión (consulta directa a la
--    tabla, con la misma ventana que ahora usa la función). Torre Ida es
--    f51676d7-80ff-4812-8830-6307267baecf. La nota de las 22:59 del 28-sep
--    tiene que contar en el 28 y NO en el 29:
--
--      select '28-sep' as dia, count(*) from bitacora
--       where edificio_id = 'f51676d7-80ff-4812-8830-6307267baecf'
--         and creado_en >= inicio_dia_local('2026-09-28')
--         and creado_en <  inicio_dia_local('2026-09-29')
--      union all
--      select '29-sep', count(*) from bitacora
--       where edificio_id = 'f51676d7-80ff-4812-8830-6307267baecf'
--         and creado_en >= inicio_dia_local('2026-09-29')
--         and creado_en <  inicio_dia_local('2026-09-30');
--
-- 3) La función completa, de punta a punta. Necesita sesión porque
--    `permitir_garita` mira `auth.uid()`, que en el SQL Editor es NULL — hay
--    que impersonar, igual que en la verificación de RLS del vigilante
--    (ver docs/estado-migracion.md, "Verificación de RLS del vigilante"):
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario_id del vigilante>","role":"authenticated"}';
--      select count(*) from garita_bitacora('f51676d7-80ff-4812-8830-6307267baecf', '2026-09-28');
--      rollback;
--
-- 4) Que las auxiliares quedaron con la ruta de búsqueda vacía y sin
--    SECURITY DEFINER:
--
--      select p.proname, p.prosecdef as security_definer, p.provolatile,
--             p.proconfig
--        from pg_proc p
--       where p.pronamespace = 'public'::regnamespace
--         and p.proname in ('hoy_local', 'inicio_dia_local');
--
--    Esperado en las dos: `security_definer = false`, `provolatile = 's'`
--    (STABLE) y `proconfig = {search_path=}` — con el `=` y nada después,
--    que es como se ve una ruta vacía.
--
-- 5) Que la firma y los atributos de garita_bitacora no se movieron:
--
--      select pg_get_functiondef(oid) from pg_proc
--       where proname = 'garita_bitacora'
--         and pronamespace = 'public'::regnamespace;
--
--    Esperado: sigue `plpgsql`, `STABLE`, `SECURITY DEFINER`,
--    `SET search_path TO 'public'`, y la primera sentencia sigue siendo
--    `perform permitir_garita(p_edificio)`.
-- ─────────────────────────────────────────────────────────────────────────
