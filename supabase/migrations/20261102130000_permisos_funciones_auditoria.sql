-- Permisos de funciones: ajustes de la auditoría de seguridad del 02-nov.
--
-- APLICADA: en vecitap-pruebas el 02-nov, por el asistente con execute_sql;
-- en vecitap-produccion el 02-nov, DESPUÉS, por Nicolás con psql, con
-- respaldo previo (pg_dump). En las dos bases quedaron 0 funciones con «\r»,
-- y la verificación del final de este archivo dio lo mismo en las dos.
-- Va después de 20261102120000_funciones_sin_retorno_de_carro.sql (las
-- guardas comparan md5 sin «\r»). Rollback:
-- supabase/rollbacks/20261102130000_permisos_funciones_auditoria_rollback.sql.
--
-- QUÉ CAMBIA
-- 1. cuota_mensual, org_al_dia, exigir_org_al_dia y edificio_activo: sin
--    EXECUTE para public ni anon. authenticated lo conserva.
-- 2. Las 14 funciones de disparador (13 de tabla y rls_auto_enable, de
--    evento): sin EXECUTE para public ni anon. Un disparador no comprueba
--    ese permiso al dispararse, solo al crearse, así que siguen funcionando
--    igual.
-- 3. search_path fijo (public, pg_temp) en 11 funciones SECURITY INVOKER que
--    no lo tenían. No cambia ningún cuerpo, así que tampoco su md5.
-- 4. Se borra _entrar(p_correo), una ayuda de pruebas que no usa nada.
-- 5. hay_secreto(p_nombre): solo el operador de Vecitap, o SQL sin sesión y
--    fuera de la API (el SQL Editor o psql, como postgres). Es el mismo
--    control que correo_recibo(). Cambia el cuerpo: pasa de sql a plpgsql.
--
-- No se toca crear_organizacion(): desde el 28-oct ya exige es_operador()
-- (20261028150000_solo_operador_y_ajustes_seguridad.sql), en las dos bases.
--
-- QUIÉN LAS LLAMA (revisado el 02-nov en pruebas, en producción y en el código)
-- - La app: ninguna de estas funciones (ni páginas con sesión ni sin ella).
-- - Ninguna política de RLS, vista, restricción, valor por omisión ni tarea
--   de cron las usa.
-- - Desde otras funciones: cuota_mensual (cartera_operador,
--   generar_cobro_interno), org_al_dia (exigir_org_al_dia, mi_organizacion)
--   y exigir_org_al_dia (abrir_periodo y tres disparadores) solo desde
--   SECURITY DEFINER de postgres. edificio_activo, además, desde
--   importar_unidades (INVOKER), que corre con authenticated, que conserva el
--   permiso.
-- - _entrar: nada (solo documentación y la migración y el rollback de la
--   ronda 12). hay_secreto: nada (solo documentación).
--
-- OJO con el rollback de 20261031190000_cerrar_funciones_expuestas: da
-- permisos a _entrar, así que después de esta migración solo funciona si
-- antes se revierte esta.

begin;

do $guarda$
declare r record; v text; n int;
begin
  -- Los cuerpos son los esperados (md5 sin «\r», iguales en las dos bases el 02-nov).
  for r in select * from (values
      ('public.cuota_mensual(uuid)',     '280c4e380471c87da5c8d4f9177abdf3'),
      ('public.org_al_dia(uuid)',        'c65d96fa117781244aeaa36101c0a1cd'),
      ('public.exigir_org_al_dia(uuid)', 'b9c832365abf7318944d6c15f29593d7'),
      ('public.edificio_activo(uuid)',   '10528dc464198427790c71a5d9937b0d'),
      ('public.hay_secreto(text)',       '239cbf2d27824f864a4c4b0588daf0d5'),
      ('public._entrar(text)',           'eafe1854c2ae599a78d5159a632567f5')
    ) as t(firma, md5_esperado) loop
    select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      raise exception 'ABORTADA: % no es la esperada (md5=%). No se cambió nada.', r.firma, v;
    end if;
  end loop;

  -- Las 14 son funciones de disparador.
  select count(*) into n from pg_proc p
   where p.oid in (select to_regprocedure(x) from unnest(array[
           'public.cierre_exige_activo()', 'public.cola_exige_modulo()', 'public.conceptos_por_omision()',
           'public.edificio_dentro_del_tope()', 'public.invitacion_exige_al_dia()', 'public.membresia_ultimo_admin()',
           'public.org_campos_del_operador()', 'public.pago_autor()', 'public.pago_convierte()',
           'public.pago_no_repetido()', 'public.pago_normaliza_origen()', 'public.registrar_auditoria()',
           'public.rls_auto_enable()', 'public.servicio_exige_acta()']) x)
     and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype);
  if n <> 14 then
    raise exception 'ABORTADA: se esperaban 14 funciones de disparador y hay %. No se cambió nada.', n;
  end if;

  -- Las 11 INVOKER no tienen search_path todavía.
  select count(*) into n from pg_proc p
   where p.oid in (select to_regprocedure(x) from unnest(array[
           'public.esc_html(text)', 'public.fmt_monto(numeric)', 'public.gastos_sin_categoria(uuid)',
           'public.historial_unidad(uuid)', 'public.impedir_tocar_ajuste_cerrado()', 'public.impedir_tocar_pago_cerrado()',
           'public.libro_edificio(uuid,date,date)', 'public.mora_de(uuid)', 'public.pagos_posible_duplicado(uuid,text,uuid)',
           'public.periodos_fuera_de_orden(uuid)', 'public.verificar_cortes(uuid)']) x)
     and not p.prosecdef and p.proconfig is null;
  if n <> 11 then
    raise exception 'ABORTADA: se esperaban 11 funciones INVOKER sin configuración y hay %. No se cambió nada.', n;
  end if;

  -- Ninguna política usa las cuatro de (1).
  if exists (select 1 from pg_policies
              where coalesce(qual, '') || coalesce(with_check, '')
                    ~ '\m(cuota_mensual|org_al_dia|exigir_org_al_dia|edificio_activo)\(') then
    raise exception 'ABORTADA: una política usa cuota_mensual, org_al_dia, exigir_org_al_dia o edificio_activo. No se cambió nada.';
  end if;

  -- Nadie llama a _entrar ni a hay_secreto.
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace
                and p.proname not in ('_entrar', 'hay_secreto')
                and p.prosrc ~ '\m(_entrar|hay_secreto)\s*\(') then
    raise exception 'ABORTADA: otra función llama a _entrar o a hay_secreto. No se cambió nada.';
  end if;
end
$guarda$;

-- 1. Cuatro funciones de consulta: sin public ni anon.
revoke execute on function public.cuota_mensual(uuid)     from public, anon;
revoke execute on function public.org_al_dia(uuid)        from public, anon;
revoke execute on function public.exigir_org_al_dia(uuid) from public, anon;
revoke execute on function public.edificio_activo(uuid)   from public, anon;

-- 2. Funciones de disparador: sin public ni anon.
revoke execute on function public.cierre_exige_activo()      from public, anon;
revoke execute on function public.cola_exige_modulo()        from public, anon;
revoke execute on function public.conceptos_por_omision()    from public, anon;
revoke execute on function public.edificio_dentro_del_tope() from public, anon;
revoke execute on function public.invitacion_exige_al_dia()  from public, anon;
revoke execute on function public.membresia_ultimo_admin()   from public, anon;
revoke execute on function public.org_campos_del_operador()  from public, anon;
revoke execute on function public.pago_autor()               from public, anon;
revoke execute on function public.pago_convierte()           from public, anon;
revoke execute on function public.pago_no_repetido()         from public, anon;
revoke execute on function public.pago_normaliza_origen()    from public, anon;
revoke execute on function public.registrar_auditoria()      from public, anon;
revoke execute on function public.rls_auto_enable()          from public, anon;
revoke execute on function public.servicio_exige_acta()      from public, anon;

-- 3. search_path fijo en las INVOKER.
alter function public.esc_html(text)                            set search_path = public, pg_temp;
alter function public.fmt_monto(numeric)                        set search_path = public, pg_temp;
alter function public.gastos_sin_categoria(uuid)                set search_path = public, pg_temp;
alter function public.historial_unidad(uuid)                    set search_path = public, pg_temp;
alter function public.impedir_tocar_ajuste_cerrado()            set search_path = public, pg_temp;
alter function public.impedir_tocar_pago_cerrado()              set search_path = public, pg_temp;
alter function public.libro_edificio(uuid, date, date)          set search_path = public, pg_temp;
alter function public.mora_de(uuid)                             set search_path = public, pg_temp;
alter function public.pagos_posible_duplicado(uuid, text, uuid) set search_path = public, pg_temp;
alter function public.periodos_fuera_de_orden(uuid)             set search_path = public, pg_temp;
alter function public.verificar_cortes(uuid)                    set search_path = public, pg_temp;

-- 4. _entrar, fuera.
drop function public._entrar(text);

-- 5. hay_secreto: solo el operador, o SQL sin sesión fuera de la API.
create or replace function public.hay_secreto(p_nombre text)
 returns table(cargada boolean, actualizado timestamp with time zone, largo integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not (es_operador()
          or (auth.uid() is null and session_user <> 'authenticator')) then
    raise exception 'Solo el operador de Vecitap puede consultar las claves'
      using errcode = '42501';
  end if;
  return query
    select true, s.actualizado, length(s.valor) from secretos s where s.nombre = p_nombre
    union all
    select false, null::timestamptz, 0
     where not exists (select 1 from secretos x where x.nombre = p_nombre);
end
$function$;

do $despues$
declare r record; n int;
begin
  -- anon no ejecuta ninguna de las 18; authenticated conserva las cuatro de (1).
  for r in select * from unnest(array[
      'public.cuota_mensual(uuid)', 'public.org_al_dia(uuid)', 'public.exigir_org_al_dia(uuid)', 'public.edificio_activo(uuid)',
      'public.cierre_exige_activo()', 'public.cola_exige_modulo()', 'public.conceptos_por_omision()',
      'public.edificio_dentro_del_tope()', 'public.invitacion_exige_al_dia()', 'public.membresia_ultimo_admin()',
      'public.org_campos_del_operador()', 'public.pago_autor()', 'public.pago_convierte()',
      'public.pago_no_repetido()', 'public.pago_normaliza_origen()', 'public.registrar_auditoria()',
      'public.rls_auto_enable()', 'public.servicio_exige_acta()']) as t(firma) loop
    if has_function_privilege('anon', r.firma, 'execute') then
      raise exception 'ABORTADA: anon todavía ejecuta %', r.firma;
    end if;
  end loop;
  for r in select * from unnest(array[
      'public.cuota_mensual(uuid)', 'public.org_al_dia(uuid)', 'public.exigir_org_al_dia(uuid)', 'public.edificio_activo(uuid)',
      'public.hay_secreto(text)']) as t(firma) loop
    if not has_function_privilege('authenticated', r.firma, 'execute') then
      raise exception 'ABORTADA: authenticated perdió %', r.firma;
    end if;
  end loop;

  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and not prosecdef
     and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%');
  if n <> 0 then
    raise exception 'ABORTADA: quedan % funciones INVOKER sin search_path', n;
  end if;

  if to_regprocedure('public._entrar(text)') is not null then
    raise exception 'ABORTADA: _entrar sigue existiendo';
  end if;

  if not exists (select 1 from pg_proc where oid = 'public.hay_secreto(text)'::regprocedure
                  and prosecdef and position('es_operador()' in prosrc) > 0) then
    raise exception 'ABORTADA: hay_secreto no quedó con el control del operador';
  end if;

  -- crear_organizacion sigue exigiendo el operador (no se toca, se comprueba).
  if not exists (select 1 from pg_proc where oid = 'public.crear_organizacion(text,text)'::regprocedure
                  and position('es_operador()' in prosrc) > 0) then
    raise exception 'ABORTADA: crear_organizacion no exige es_operador(): revisar antes de seguir';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select p.oid::regprocedure from pg_proc p
--     where p.pronamespace = 'public'::regnamespace and p.prosecdef
--       and has_function_privilege('anon', p.oid, 'execute') order by 1;
--    -- Esperado: 5 filas: edificios_del_vigilante, orgs_del_usuario, puede_garita,
--    --   registrar_evento_correo y tiene_rol (antes, 23).
-- 2. select count(*) from pg_proc
--     where pronamespace = 'public'::regnamespace and not prosecdef
--       and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%');
--    -- Esperado: 0.
-- 3. select to_regprocedure('public._entrar(text)');
--    -- Esperado: null.
-- 4. select * from hay_secreto('correo_enlace');      -- desde psql o el SQL Editor
--    -- Esperado: una fila (cargada = true). Con la sesión de una cuenta que no es
--    --   el operador, por la API: «Solo el operador de Vecitap puede consultar las claves».
-- 5. Por la API, sin sesión (clave anon): rpc('cuota_mensual'), rpc('org_al_dia'),
--    rpc('exigir_org_al_dia') y rpc('edificio_activo') → «permission denied» (42501).
-- 6. select count(*) from pg_proc
--     where pronamespace = 'public'::regnamespace and position(chr(13) in prosrc) > 0;
--    -- Esperado: 0.
