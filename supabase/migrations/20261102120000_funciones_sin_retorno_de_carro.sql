-- Quita los retornos de carro (chr(13), el «\r» de los saltos de línea de
-- Windows) del cuerpo de las funciones de `public`.
--
-- POR QUÉ (02-nov, durante el paso a producción): los archivos 1 a 13 se
-- aplicaron en producción copiándolos desde VS Code y pegándolos en el SQL
-- Editor de Supabase. En ese camino cada salto de línea llegó como «\r\n», y
-- las funciones quedaron guardadas con un «\r» al final de cada línea. No
-- cambia lo que hacen, pero sí su md5(prosrc), y las guardas de los archivos
-- 14 a 46 comparan ese md5 contra el de pruebas (sin «\r»): el 14 abortó con
-- «ABORTADA: cambiaron: public.correo_recibo(uuid) … public.crear_invitacion
-- …». Además, varios archivos posteriores reescriben funciones buscando
-- trozos de texto con «\n», que con «\r\n» no aparecerían.
--
-- Leído en producción el 02-nov: 19 funciones con «\r», todas de los
-- archivos 1 a 13, y sin «\r» su md5 da exactamente el de pruebas.
--
-- QUÉ HACE: para cada función de `public` cuyo cuerpo tenga «\r», vuelve a
-- ejecutar su propia definición (`pg_get_functiondef`) sin esos caracteres.
-- Es un CREATE OR REPLACE con la misma firma, el mismo tipo de retorno y
-- los mismos atributos: Postgres conserva el dueño, los permisos (proacl),
-- los comentarios y los disparadores que la usan. Lo único que cambia es el
-- «\r» del cuerpo. Dentro de un texto de varias líneas (el HTML del correo,
-- por ejemplo) el salto pasa de «\r\n» a «\n», que es como está en pruebas.
--
-- En pruebas cambia una sola función, `aceptar_invitacion` (un «\r» que ya
-- tenía de antes). Ninguna guarda ni comprobación usa su md5.
--
-- Se aplica en producción ENTRE el archivo 13 y el 14, aunque su fecha sea
-- posterior: es una corrección del propio paso a producción.
--
-- APLICADA: en vecitap-produccion el 02-nov, por Nicolás con psql (corrigió
-- 19 funciones); en vecitap-pruebas el 02-nov, DESPUÉS, por el asistente con
-- execute_sql (corrigió 1: aceptar_invitacion). Es una excepción a «primero
-- pruebas», registrada en docs/estado-migracion.md. En las dos bases quedaron
-- 0 funciones con «\r», y los atributos (prosecdef, proconfig, provolatile,
-- proleakproof, proparallel) dan la misma huella en las dos:
-- ce41de201b078096b4fe2a4f1ff49651.
--
-- Rollback: supabase/rollbacks/20261102120000_funciones_sin_retorno_de_carro_rollback.sql

begin;

do $sin_cr$
declare
  r record;
  n int := 0;
  v_antes text;
  v_despues text;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as firma,
           md5(replace(p.prosrc, chr(13), '')) as md5_esperado,
           coalesce(array_to_string(p.proacl, ','), '') as acl,
           p.proowner
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and position(chr(13) in p.prosrc) > 0
     order by 2
  loop
    execute replace(pg_get_functiondef(r.oid), chr(13), '');
    n := n + 1;

    select md5(p.prosrc), coalesce(array_to_string(p.proacl, ','), '')
      into v_antes, v_despues
      from pg_proc p where p.oid = r.oid;
    if v_antes is distinct from r.md5_esperado then
      raise exception 'ABORTADA: % quedó con md5 % (se esperaba %). No se aplicó nada.',
        r.firma, v_antes, r.md5_esperado;
    end if;
    if v_despues is distinct from r.acl
       or (select proowner from pg_proc where oid = r.oid) <> r.proowner then
      raise exception 'ABORTADA: % cambió de permisos o de dueño. No se aplicó nada.', r.firma;
    end if;
  end loop;

  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and position(chr(13) in p.prosrc) > 0) then
    raise exception 'ABORTADA: todavía quedan funciones con retorno de carro. No se aplicó nada.';
  end if;

  raise notice 'Funciones corregidas: %', n;
end
$sin_cr$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
--   select count(*) from pg_proc
--    where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0;
--   -- Esperado: 0
--
--   select md5(prosrc) from pg_proc where oid = 'public.crear_invitacion(uuid,text,text,uuid,uuid,text)'::regprocedure;
--   -- Esperado en producción: d5807ae08c2fb3415f04056493b5e5a7
--   select md5(prosrc) from pg_proc where oid = 'public.correo_recibo(uuid)'::regprocedure;
--   -- Esperado en producción: 83afc196154108cf42d6fa594f36becd
