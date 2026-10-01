-- `puede_operar(uuid)` con `search_path` fijado.
--
-- SIN APLICAR. Toca una función de seguridad: la usan las políticas de RLS
-- de casi todas las tablas y unas 20 funciones (`if not puede_operar(v_org)
-- then raise exception 'Sin permiso'`). La revisa y la aplica Nicolás:
-- primero en vecitap-pruebas, después en vecitap-produccion, con respaldo
-- previo (docs/respaldo.md). Independiente de las otras migraciones del
-- 30-sep: se puede aplicar antes o después de 20260930120000.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA (lo encontró la prueba de 20260930120000_unidades_paga.sql)
-- ─────────────────────────────────────────────────────────────────────────
-- Según el volcado del 27-sep, `puede_operar` es:
--
--   CREATE FUNCTION public.puede_operar(p_org uuid) RETURNS boolean
--       LANGUAGE sql STABLE
--       AS $$ select tiene_rol(p_org, array['propietario_cuenta','administrador']) $$;
--
-- Sin `SET search_path`. El nombre `tiene_rol` del cuerpo se resuelve con la
-- ruta de búsqueda de QUIEN LLAMA. Dos consecuencias:
--   · Un llamador con una ruta sin `public` (una función con
--     `search_path = ''`, por ejemplo) hace fallar cualquier política que use
--     `puede_operar`: "function tiene_rol(uuid, text[]) does not exist".
--   · Un llamador con un esquema propio ANTES de `public` en la ruta podría,
--     en teoría, interponer su propio `tiene_rol`. Hoy no hay ninguno (en
--     Supabase la ruta es `"$user", public, extensions` y no existen esquemas
--     con nombre de rol), pero es justo lo que el linter de Supabase marca
--     como `function_search_path_mutable`.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL CAMBIO: una sola propiedad, con ALTER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────
--   ALTER FUNCTION public.puede_operar(uuid) SET search_path TO 'public';
--
-- Se usa ALTER y no CREATE OR REPLACE a propósito: ALTER ... SET cambia SOLO
-- `proconfig`. No toca el cuerpo, la firma, el lenguaje, la volatilidad, el
-- dueño, los permisos ni el modo de seguridad. No hay nada que reescribir a
-- mano y equivocarse.
--
-- **Sobre SECURITY DEFINER:** el pedido decía "conservá SECURITY DEFINER",
-- pero según el volcado `puede_operar` **NO es SECURITY DEFINER** (es
-- `LANGUAGE sql STABLE`, de invocador; quien sí lo es es `tiene_rol`, que
-- es la que lee `membresias`). Se conserva tal cual esté —ALTER ... SET no
-- lo cambia— y la guarda de abajo imprime el valor real para que quede
-- registrado. Si en la base resultara ser SECURITY DEFINER, el razonamiento
-- de abajo sigue valiendo igual.
--
-- **Permisos:** el volcado muestra `GRANT ALL ... TO authenticated` y NINGÚN
-- `REVOKE ... FROM PUBLIC` (o sea, PUBLIC conserva EXECUTE, el default).
-- ALTER ... SET no los toca. La verificación 3 lo comprueba.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ NO CAMBIA QUIÉN PASA
-- ─────────────────────────────────────────────────────────────────────────
-- `puede_operar` no decide nada por sí misma: le pasa a `tiene_rol` el org y
-- la lista fija {propietario_cuenta, administrador}. Lo único que depende de
-- la ruta de búsqueda es QUÉ función se llama con el nombre `tiene_rol`:
--   · Para todo llamador cuya ruta ya resolvía `public.tiene_rol` —todos los
--     de hoy: PostgREST, las funciones SECURITY DEFINER con
--     `search_path TO 'public'`, el SQL Editor— la función llamada es la
--     MISMA, con los MISMOS argumentos. `tiene_rol` es SECURITY DEFINER con
--     su propio `search_path TO 'public'` y lee `auth.uid()` adentro, así que
--     su resultado no depende de nada del llamador más que de la sesión. Mismo
--     resultado, fila por fila.
--   · Para un llamador cuya ruta NO tenía `public`, antes la llamada fallaba
--     con error; ahora devuelve lo correcto. Pasa de "error" a "respuesta",
--     nunca de "no" a "sí".
--   · Para un llamador con un `tiene_rol` propio delante de `public`, antes
--     se usaba el suyo; ahora, el de `public`. Es el arreglo de seguridad.
-- El literal `array['propietario_cuenta','administrador']` toma su tipo del
-- parámetro (`text[]`) y no resuelve ningún nombre por la ruta.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL COSTO, para que no sorprenda: `puede_operar` deja de "inlinearse"
-- ─────────────────────────────────────────────────────────────────────────
-- Hoy, por ser `LANGUAGE sql`, de un solo SELECT, sin SECURITY DEFINER y sin
-- `SET`, el planificador la reemplaza por su cuerpo dentro de cada política:
-- `puede_operar(org_id)` se ejecuta como `tiene_rol(org_id, …)` directo. Una
-- función con `SET` no se puede inlinear (lo dice la documentación de
-- Postgres, y la prueba en PGlite lo mostró con EXPLAIN). Desde este cambio,
-- cada fila que evalúe una política con `puede_operar` hace una llamada más,
-- con su cambio de `search_path`.
--   · Orden de magnitud: microsegundos por fila. `tiene_rol` —que ya se
--     llama por fila y ya es SECURITY DEFINER con `SET`, y además hace una
--     consulta a `membresias`— cuesta bastante más que eso. Se espera un
--     aumento chico, no un cambio de escala.
--   · No se midió contra una base real (no se ejecuta nada contra ninguna
--     base). La verificación 5 da la consulta para medirlo en pruebas antes
--     de producción.
--   · Alternativa si el costo molestara: en vez de `SET`, calificar el
--     nombre en el cuerpo (`public.tiene_rol(...)`, con CREATE OR REPLACE).
--     Resuelve el mismo problema y conserva el inlining, pero no satisface
--     al linter y reescribe el cuerpo de una función de seguridad. Se eligió
--     lo pedido (ruta fijada) y queda anotada la alternativa.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- GUARDA · que `puede_operar` sea la del volcado del 27-sep
--
-- Compara md5(prosrc) (no md5(pg_get_functiondef): no es reproducible desde
-- un pg_dump; ver 20260929120000_segunda_ronda_dia_local.sql), lenguaje,
-- volatilidad, y que no tenga ya un `SET`. Si algo no coincide, aborta y no
-- se aplica nada.
-- md5 calculado sobre los bytes exactos del volcado:
--   " select tiene_rol(p_org, array['propietario_cuenta','administrador']) "
-- ═════════════════════════════════════════════════════════════════════════
do $guarda$
declare
  v_oid oid := to_regprocedure('public.puede_operar(uuid)');
  p     record;
begin
  if v_oid is null then
    raise exception 'ABORTADA: no existe public.puede_operar(uuid).'
      using errcode = 'undefined_function';
  end if;

  select pr.prosrc, l.lanname, pr.provolatile::text as vol, pr.prosecdef,
         pr.proconfig, pr.proacl::text as acl, pg_get_userbyid(pr.proowner) as dueno
    into p
    from pg_proc pr join pg_language l on l.oid = pr.prolang
   where pr.oid = v_oid;

  -- Queda registrado lo que había, para comparar con la verificación 3.
  raise notice 'puede_operar ANTES · security_definer=% · proconfig=% · acl=% · dueño=% · md5(prosrc)=%',
    p.prosecdef, p.proconfig, p.acl, p.dueno, md5(p.prosrc);

  if md5(p.prosrc) <> '84d6594f56e8e4afaf028662cdcbe006' then
    raise exception 'ABORTADA: el cuerpo de puede_operar no es el del volcado (md5 %). Revise antes de aplicar.', md5(p.prosrc);
  end if;
  if p.lanname <> 'sql' or p.vol <> 's' then
    raise exception 'ABORTADA: puede_operar ya no es LANGUAGE sql STABLE (es % / %).', p.lanname, p.vol;
  end if;
  if p.proconfig is not null then
    raise exception 'ABORTADA: puede_operar ya tiene configuración propia (%). Nada que hacer, o algo la cambió: revisar.', p.proconfig;
  end if;
end
$guarda$;

alter function public.puede_operar(uuid) set search_path to 'public';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) La ruta quedó fijada y nada más cambió:
--
--      select pr.prosecdef as security_definer, pr.provolatile, pr.proconfig,
--             md5(pr.prosrc) as md5_cuerpo, pr.proacl, pg_get_userbyid(pr.proowner) as dueno
--        from pg_proc pr
--       where pr.oid = 'public.puede_operar(uuid)'::regprocedure;
--
--    Esperado: proconfig = {search_path=public}; md5_cuerpo =
--    84d6594f56e8e4afaf028662cdcbe006; security_definer, provolatile ('s'),
--    proacl y dueño IGUALES a lo que imprimió el NOTICE de la guarda.
--
-- 2) Quién pasa, con sesión impersonada (como en la verificación de RLS del
--    vigilante, docs/estado-migracion.md). Una administradora de la org, un
--    residente de la misma org:
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario_id de la administradora>","role":"authenticated"}';
--      select puede_operar('<org_id>');                 -- esperado: true
--      set local search_path = '';
--      select public.puede_operar('<org_id>');          -- esperado: true (ANTES daba error)
--      rollback;
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario_id de un residente>","role":"authenticated"}';
--      select puede_operar('<org_id>');                 -- esperado: false
--      rollback;
--
-- 3) Permisos sin cambios:
--
--      select proacl from pg_proc where oid = 'public.puede_operar(uuid)'::regprocedure;
--
--    Esperado: el mismo valor que imprimió el NOTICE "ANTES".
--
-- 4) Las pantallas: entrar a Admin (Propietarios, Pagos, Cierre) y a /mi con
--    una cuenta de pruebas. Todo tiene que verse igual que antes.
--
-- 5) (Opcional, para medir el costo del inlining) en vecitap-pruebas,
--    ANTES y DESPUÉS de aplicar, con la sesión de la administradora:
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario_id de la administradora>","role":"authenticated"}';
--      explain (analyze, buffers) select count(*) from public.pagos;
--      rollback;
--
--    Comparar "Execution Time". Con pocos miles de filas la diferencia
--    tendría que ser de milisegundos.
-- ─────────────────────────────────────────────────────────────────────────
