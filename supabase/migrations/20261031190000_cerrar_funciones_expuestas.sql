-- Tres funciones que cualquiera podía ejecutar dejan de estar expuestas
-- (ronda 12, cierre de permisos).
--
-- Aplicada en vecitap-pruebas el 01-nov. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261031120000_correcciones_revision_r9_r10.sql** (la guarda exige su
-- destinatarios_de(), 2558c045…). Rollback:
-- supabase/rollbacks/20261031190000_cerrar_funciones_expuestas_rollback.sql.
--
-- EL PROBLEMA (revisión de la ronda 12, F)
-- - destinatarios_de(p_unidad): SECURITY DEFINER, authenticated la ejecuta y
--   no controla nada: nombre, correo, teléfono y «recibe corte» del
--   propietario y el inquilino de cualquier unidad. Probado por la API:
--   residente.prueba leía los de una unidad de otra organización.
-- - _usr(p_correo): SECURITY DEFINER sin permisos puestos (PUBLIC, también
--   anon): el id de usuario de cualquier correo registrado.
-- - _entrar(p_correo): ayuda de pruebas (pone los claims de cualquier
--   usuario), PUBLIC.
--
-- QUIÉN LAS LLAMA (revisado el 01-nov en pruebas y en el código)
-- - La app: ninguna de las tres (solo un comentario en lib/admin/cargar-datos).
-- - destinatarios_de: solo garita_avisar(), SECURITY DEFINER y de postgres:
--   corre como su dueño, así que sigue pudiendo llamarla.
-- - _usr: solo _entrar (SECURITY INVOKER), que también se cierra.
-- - Ninguna vista, regla ni política las usa.
--
-- QUÉ CAMBIA
-- Solo los permisos: se quita EXECUTE a public, anon y authenticated; queda
-- solo postgres (el dueño). Ninguna función cambia de cuerpo.

begin;

do $guarda$
declare v text; a text; r record;
begin
  for r in select * from (values
      ('public.destinatarios_de(uuid)', '2558c045144a6e72adfbd5b8632f4255', 'postgres=X/postgres,authenticated=X/postgres'),
      ('public._usr(text)',             '23416ac5863df63995529920f32951bb', '(PUBLIC)'),
      ('public._entrar(text)',          'eafe1854c2ae599a78d5159a632567f5', '(PUBLIC)')
    ) as t(firma, md5_esperado, acl_esperada) loop
    select md5(prosrc), coalesce(array_to_string(proacl, ','), '(PUBLIC)') into v, a
      from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      raise exception 'ABORTADA: % cambió (md5=%). ¿Falta 20261031120000_correcciones_revision_r9_r10.sql?', r.firma, v;
    end if;
    if a is distinct from r.acl_esperada then
      raise exception 'ABORTADA: % tiene otros permisos (%), se esperaba %', r.firma, a, r.acl_esperada;
    end if;
  end loop;
  -- Nadie más las llama: solo garita_avisar() a destinatarios_de y _entrar a _usr.
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname not in ('destinatarios_de', 'garita_avisar', '_usr', '_entrar')
                and p.prosrc ~ '\m(destinatarios_de|_usr|_entrar)\s*\(') then
    raise exception 'ABORTADA: otra función llama a destinatarios_de, _usr o _entrar: revisar antes de quitar el permiso';
  end if;
end
$guarda$;

revoke execute on function public.destinatarios_de(uuid) from public, anon, authenticated;
revoke execute on function public._usr(text) from public, anon, authenticated;
revoke execute on function public._entrar(text) from public, anon, authenticated;

do $despues$
declare r record; a text;
begin
  for r in select * from (values ('public.destinatarios_de(uuid)'), ('public._usr(text)'), ('public._entrar(text)')) as t(firma) loop
    select coalesce(array_to_string(proacl, ','), '(PUBLIC)') into a from pg_proc where oid = r.firma::regprocedure;
    if a is distinct from 'postgres=X/postgres' then
      raise exception 'ABORTADA: % quedó con permisos %', r.firma, a;
    end if;
    if has_function_privilege('anon', r.firma, 'execute') or has_function_privilege('authenticated', r.firma, 'execute') then
      raise exception 'ABORTADA: % todavía la ejecuta anon o authenticated', r.firma;
    end if;
  end loop;
  -- garita_avisar() no cambia y sigue siendo de postgres y SECURITY DEFINER.
  if not exists (select 1 from pg_proc p where p.oid = 'public.garita_avisar(uuid)'::regprocedure
                  and p.prosecdef and p.proowner = 'postgres'::regrole) then
    raise exception 'ABORTADA: garita_avisar() ya no es SECURITY DEFINER de postgres: dejaría de poder avisar';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, coalesce(array_to_string(proacl, ','), '(PUBLIC)') from pg_proc
--     where proname in ('destinatarios_de', '_usr', '_entrar') order by 1;
--    -- Esperado: las tres con postgres=X/postgres.
-- 2. Por la API: sin sesión, rpc('_usr') y rpc('_entrar') → «permission denied»; con la
--    sesión de un residente, rpc('destinatarios_de') → «permission denied».
-- 3. El aviso de garita sigue encolando: como el vigilante (o la administradora) del
--    edificio, en un bloque que se deshace,
--      select garita_avisar('<visita de una unidad con correo>');
--    -- Esperado: 1 o más (los correos encolados), igual que antes.
