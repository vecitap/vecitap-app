-- Permisos sobrantes en las tablas de `public` (ronda 9, bloque D3;
-- pendiente de la verificación del 28-oct).
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). No depende de las otras migraciones de la ronda 9. **Sirve
-- igual en las dos bases**: no nombra tablas, recorre las que haya. Rollback:
-- supabase/rollbacks/20261028170000_permisos_sobrantes_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HABÍA (leído el 28-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- · `anon` tenía TRUNCATE, REFERENCES, TRIGGER y MAINTAIN («Dxtm») en 38
--   objetos de producción (37 tablas y la vista saldos_actuales) y en 20 de
--   pruebas. Ninguno lo necesita, y TRUNCATE no pasa por RLS. PostgREST no
--   hace TRUNCATE, así que no era explotable por la API; se quita igual.
-- · `secretos`: en producción también anon y authenticated con «Dxtm»; en
--   pruebas, ninguno de los dos.
-- · Los privilegios por omisión del rol postgres en `public` le dan «Dxtm» a
--   anon, authenticated y service_role en cada tabla nueva: por eso volvían.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN a anon en todas las
--    tablas, vistas, vistas materializadas y tablas foráneas de `public`.
-- 2. Lo mismo a authenticated en `secretos`.
-- 3. ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public: las tablas
--    nuevas ya no le dan esos cuatro a anon.
-- 4. Antes de quitar nada, guarda en `tareas_log` (tarea
--    'r9_permisos_sobrantes') qué tenía cada objeto, para que el rollback
--    devuelva exactamente eso y no más.
-- No se tocan: SELECT/INSERT/UPDATE/DELETE de nadie; service_role; los
-- privilegios por omisión de supabase_admin (no se pueden cambiar como
-- postgres; solo afectan objetos que crea Supabase); authenticated en las
-- demás tablas (tiene TRUNCATE y los otros tres en casi todas: anotado en
-- docs/estado-migracion.md como siguiente paso, no se pidió en esta ronda);
-- las secuencias.

begin;

do $guarda$
begin
  if exists (select 1 from tareas_log where tarea = 'r9_permisos_sobrantes') then
    raise exception 'ABORTADA: ya se aplicó (hay un respaldo de permisos en tareas_log)';
  end if;
end
$guarda$;

-- 4. El respaldo de lo que había.
insert into tareas_log (tarea, detalle)
select 'r9_permisos_sobrantes', jsonb_build_object(
  'objetos', coalesce(jsonb_agg(jsonb_build_object('objeto', x.objeto, 'rol', x.rol, 'privilegios', x.privilegios)), '[]'::jsonb),
  'default_anon', (select string_agg(p, ',') from (
        select unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p) q
      where exists (
        select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
         where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace
           and d.defaclobjtype = 'r' and a.grantee = 'anon'::regrole and a.privilege_type = q.p)))
  from (
    select c.oid::regclass::text as objeto, r.rol,
           string_agg(p.p, ',' order by p.p) as privilegios
      from pg_class c
     cross join (values ('anon'), ('authenticated')) r(rol)
     cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) p(p)
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and (r.rol = 'anon' or c.relname = 'secretos')
       and has_table_privilege(r.rol, c.oid, p.p)
     group by c.oid, r.rol) x;

-- 1 y 2.
do $quitar$
declare r record;
begin
  for r in select c.oid::regclass as objeto, c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke truncate, references, trigger, maintain on %s from anon', r.objeto);
    if r.relname = 'secretos' then
      execute format('revoke truncate, references, trigger, maintain on %s from authenticated', r.objeto);
    end if;
  end loop;
end
$quitar$;

-- 3.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Ningún objeto de public le da esos cuatro a anon:
--      select count(*) from pg_class c
--       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f')
--         and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('anon', c.oid, 'REFERENCES')
--              or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('anon', c.oid, 'MAINTAIN'));
--    -- Esperado: 0 (antes: 38 en producción, 20 en pruebas).
-- 2. select array_to_string(relacl, ' ') from pg_class where oid = 'public.secretos'::regclass;
--    -- Esperado: solo postgres y service_role.
-- 3. select defaclacl from pg_default_acl
--     where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
--    -- Esperado: sin «anon=…» (authenticated y service_role siguen con Dxtm).
-- 4. Una tabla nueva de prueba, en una transacción deshecha:
--      begin; create table public.zz_prueba (x int);
--      select has_table_privilege('anon', 'public.zz_prueba', 'TRUNCATE'); -- false
--      rollback;
-- 5. La app sigue igual: anon no tenía SELECT en ninguna tabla por estos
--    permisos; el residente, la administradora y el operador leen y escriben
--    como antes (son SELECT/INSERT/UPDATE/DELETE, que no se tocan).
-- 6. select detalle from tareas_log where tarea = 'r9_permisos_sobrantes';  -- el respaldo
