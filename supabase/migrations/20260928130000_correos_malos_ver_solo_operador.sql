-- Pendiente de seguridad de la Fase 5 (ver docs/estado-migracion.md,
-- "Fase 5 — Endurecimiento multi-tenant y de escala"): la política de SELECT
-- de `correos_malos` deja ver la tabla a CUALQUIER usuario logueado, mientras
-- que la de DELETE ya pide `es_operador()`. Se unifican las dos en
-- `es_operador()`.
--
-- SIN APLICAR — la corre Nicolás, en las dos bases (vecitap-pruebas y la de
-- producción del piloto). No hay nada en el frontend que la necesite.
--
-- Qué es esta tabla: la lista de correos que rebotaron de verdad
-- (`despachar_correos` inserta ahí cuando el proveedor responde 422 con
-- "invalid", es decir una dirección que no existe). Es un dato operativo de
-- Vecitap, no del condominio: hoy un residente logueado puede leer las
-- direcciones rebotadas de TODAS las organizaciones, porque la política no
-- filtra por org ni por rol, solo pide que haya sesión.
--
--   Antes:  CREATE POLICY correos_malos_ver ON public.correos_malos
--             FOR SELECT USING ((auth.uid() IS NOT NULL));
--   Ya está: CREATE POLICY correos_malos_borrar ON public.correos_malos
--             FOR DELETE USING (public.es_operador());
--
-- **Por qué no rompe nada.** Las tres funciones que tocan `correos_malos`
-- son `SECURITY DEFINER`, así que no pasan por RLS y siguen funcionando
-- igual para todos los roles:
--   · `encolar_recibos(p_periodo)`  — lee (saltea los correos rebotados)
--   · `resumen_correos(p_org)`      — lee (el contador `malos` del panel)
--   · `despachar_correos(p_tanda)`  — escribe (anota el rebote)
-- Y del lado del cliente no hay ninguna consulta directa: verificado por
-- grep sobre `app/`, `components/`, `lib/`, `hooks/` y los cuatro HTML de
-- `main` — `correos_malos` solo aparece en `types/supabase.ts`, que es el
-- tipo generado, no una llamada. Nadie pierde acceso a nada que use hoy.
--
-- No se toca ningún GRANT: `authenticated` conserva `SELECT` sobre la tabla
-- (el GRANT es el permiso de SQL, la política es el filtro de filas). Con
-- esta política, un `select` de alguien que no es operador devuelve 0 filas
-- en silencio, igual que ya hacen `operadores`/`secretos`/`tasa_pendiente`
-- (ver AGENTS.md, "Seguridad").

begin;

-- DROP + CREATE y no ALTER POLICY: `ALTER POLICY ... USING` existe, pero el
-- DROP explícito falla fuerte si la política no se llama así en esta base,
-- en vez de crear una segunda en silencio. Las políticas de SELECT se suman
-- con OR: dejar la vieja viva anularía el cambio por completo.
DROP POLICY IF EXISTS correos_malos_ver ON public.correos_malos;

CREATE POLICY correos_malos_ver ON public.correos_malos
    FOR SELECT USING (public.es_operador());

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- Verificación DESPUÉS de aplicar (en cada una de las dos bases).
-- Esperado: 2 filas, las dos con `es_operador()` en su expresión —
-- `correos_malos_borrar` con qual en `DELETE` y `correos_malos_ver` en
-- `SELECT`. Si `correos_malos_ver` sigue diciendo `auth.uid() IS NOT NULL`,
-- el DROP no encontró la política por nombre y hay dos: revisar antes de
-- seguir.
--
--   select policyname, cmd, qual
--     from pg_policies
--    where schemaname = 'public' and tablename = 'correos_malos'
--    order by policyname;
--
-- Y que RLS siga activo en la tabla (esperado: true):
--
--   select relrowsecurity
--     from pg_class
--    where oid = 'public.correos_malos'::regclass;
-- ─────────────────────────────────────────────────────────────────────────
