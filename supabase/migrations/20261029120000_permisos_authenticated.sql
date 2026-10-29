-- TRUNCATE (y REFERENCES, TRIGGER, MAINTAIN) fuera de `authenticated` en las
-- tablas de `public` (ronda 10, bloque A2; lo que dejó anotado la ronda 9).
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261028170000_permisos_sobrantes.sql** (la misma limpieza
-- para anon). Sirve igual en las dos bases: no nombra tablas. Rollback:
-- supabase/rollbacks/20261029120000_permisos_authenticated_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HABÍA (leído el 29-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- `authenticated` tenía TRUNCATE, REFERENCES, TRIGGER y MAINTAIN («Dxtm») en
-- 37 objetos de pruebas y 38 de producción (las tablas y la vista
-- saldos_actuales), y los privilegios por omisión de postgres se los daban a
-- cada tabla nueva. TRUNCATE no pasa por RLS: una sesión de cualquier
-- residente podía vaciar una tabla si alguna vez llegaba a ejecutar SQL
-- (PostgREST no hace TRUNCATE, así que por la API no era posible).
--
-- **Nada lo usa:** ninguna función de `public` contiene TRUNCATE (leído en
-- las dos bases), ninguna tarea de cron tampoco, y las funciones que
-- escriben corren como su dueño (SECURITY DEFINER) o hacen INSERT/UPDATE/
-- DELETE, que no se tocan. REFERENCES (crear una clave foránea), TRIGGER
-- (crear un disparador) y MAINTAIN (VACUUM/ANALYZE…) son de quien crea
-- tablas, nunca de una sesión de la app: se quitan los cuatro, como a anon.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN a authenticated en todas
--    las tablas, vistas, vistas materializadas y tablas foráneas de `public`.
-- 2. ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public: las tablas
--    nuevas ya no se los dan.
-- 3. Antes, guarda en `tareas_log` (tarea 'r10_permisos_authenticated') qué
--    tenía cada objeto, para que el rollback devuelva exactamente eso.
-- No se tocan SELECT/INSERT/UPDATE/DELETE, service_role ni las secuencias.

begin;

do $guarda$
begin
  if exists (select 1 from tareas_log where tarea = 'r10_permisos_authenticated') then
    raise exception 'ABORTADA: ya se aplicó (hay un respaldo de permisos en tareas_log)';
  end if;
  if not exists (select 1 from tareas_log where tarea = 'r9_permisos_sobrantes') then
    raise exception 'ABORTADA: falta 20261028170000_permisos_sobrantes.sql';
  end if;
end
$guarda$;

-- 3. El respaldo de lo que había.
insert into tareas_log (tarea, detalle)
select 'r10_permisos_authenticated', jsonb_build_object(
  'objetos', coalesce(jsonb_agg(jsonb_build_object('objeto', x.objeto, 'rol', 'authenticated', 'privilegios', x.privilegios)), '[]'::jsonb),
  'default_authenticated', (select string_agg(p, ',') from (
        select unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p) q
      where exists (
        select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
         where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
           and d.defaclobjtype = 'r' and a.grantee = 'authenticated'::regrole and a.privilege_type = q.p)))
  from (
    select c.oid::regclass::text as objeto, string_agg(p.p, ',' order by p.p) as privilegios
      from pg_class c
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p(p)
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and has_table_privilege('authenticated', c.oid, p.p)
     group by c.oid) x;

-- 1.
do $quitar$
declare r record;
begin
  for r in select c.oid::regclass as objeto from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke truncate, references, trigger, maintain on %s from authenticated', r.objeto);
  end loop;
end
$quitar$;

-- 2.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select count(*) from pg_class c
--     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
--       and (has_table_privilege('authenticated', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'REFERENCES')
--            or has_table_privilege('authenticated', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'MAINTAIN'));
--    -- Esperado: 0 (antes: 37 en pruebas, 38 en producción).
-- 2. select defaclacl from pg_default_acl
--     where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
--    -- Esperado: sin «authenticated=…» ni «anon=…» (queda service_role).
-- 3. La app igual: SELECT/INSERT/UPDATE/DELETE de authenticated no cambian
--    (p. ej. select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
--     and has_table_privilege('authenticated', c.oid, 'SELECT');  -- el mismo número antes y después).
-- 4. select detalle from tareas_log where tarea = 'r10_permisos_authenticated';  -- el respaldo
