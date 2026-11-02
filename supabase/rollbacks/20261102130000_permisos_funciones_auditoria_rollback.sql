-- Rollback de 20261102130000_permisos_funciones_auditoria.sql (auditoría de
-- seguridad del 02-nov).
--
-- Devuelve todo a como estaba: EXECUTE para public en las 4 funciones de
-- consulta y las 14 de disparador, sin search_path en las 11 INVOKER, _entrar
-- de vuelta (mismo cuerpo, solo postgres, como la dejó la ronda 12) y
-- hay_secreto en sql y sin control.
--
-- Las funciones que antes no tenían permisos puestos (proacl nulo = EXECUTE
-- para PUBLIC) quedan con postgres=X/postgres,=X/postgres, que permite
-- exactamente lo mismo: un GRANT no puede dejar el proacl nulo.

begin;

do $guarda$
begin
  if to_regprocedure('public._entrar(text)') is not null then
    raise exception 'ABORTADO: _entrar existe: 20261102130000 no está aplicada';
  end if;
  if has_function_privilege('anon', 'public.cuota_mensual(uuid)', 'execute') then
    raise exception 'ABORTADO: anon ejecuta cuota_mensual: 20261102130000 no está aplicada';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.hay_secreto(text)'::regprocedure
                  and position('es_operador()' in prosrc) > 0) then
    raise exception 'ABORTADO: hay_secreto no es la de 20261102130000';
  end if;
end
$guarda$;

-- 1 y 2. EXECUTE para public otra vez.
grant execute on function public.cuota_mensual(uuid)       to public;
grant execute on function public.org_al_dia(uuid)          to public;
grant execute on function public.exigir_org_al_dia(uuid)   to public;
grant execute on function public.edificio_activo(uuid)     to public;
grant execute on function public.cierre_exige_activo()      to public;
grant execute on function public.cola_exige_modulo()        to public;
grant execute on function public.conceptos_por_omision()    to public;
grant execute on function public.edificio_dentro_del_tope() to public;
grant execute on function public.invitacion_exige_al_dia()  to public;
grant execute on function public.membresia_ultimo_admin()   to public;
grant execute on function public.org_campos_del_operador()  to public;
grant execute on function public.pago_autor()               to public;
grant execute on function public.pago_convierte()           to public;
grant execute on function public.pago_no_repetido()         to public;
grant execute on function public.pago_normaliza_origen()    to public;
grant execute on function public.registrar_auditoria()      to public;
grant execute on function public.rls_auto_enable()          to public;
grant execute on function public.servicio_exige_acta()      to public;

-- 3. Sin search_path.
alter function public.esc_html(text)                            reset search_path;
alter function public.fmt_monto(numeric)                        reset search_path;
alter function public.gastos_sin_categoria(uuid)                reset search_path;
alter function public.historial_unidad(uuid)                    reset search_path;
alter function public.impedir_tocar_ajuste_cerrado()            reset search_path;
alter function public.impedir_tocar_pago_cerrado()              reset search_path;
alter function public.libro_edificio(uuid, date, date)          reset search_path;
alter function public.mora_de(uuid)                             reset search_path;
alter function public.pagos_posible_duplicado(uuid, text, uuid) reset search_path;
alter function public.periodos_fuera_de_orden(uuid)             reset search_path;
alter function public.verificar_cortes(uuid)                    reset search_path;

-- 4. _entrar, como la dejó 20261031190000 (solo postgres).
CREATE OR REPLACE FUNCTION public._entrar(p_correo text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _usr(p_correo), 'email', p_correo,
                      'role', 'authenticated')::text, true);
end $function$;
revoke execute on function public._entrar(text) from public, anon, authenticated;

-- 5. hay_secreto, la de antes (sql, sin control).
CREATE OR REPLACE FUNCTION public.hay_secreto(p_nombre text)
 RETURNS TABLE(cargada boolean, actualizado timestamp with time zone, largo integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select true, s.actualizado, length(s.valor) from secretos s where s.nombre = p_nombre
  union all
  select false, null::timestamptz, 0
   where not exists (select 1 from secretos where nombre = p_nombre)
$function$;

do $despues$
declare r record; v text; n int;
begin
  for r in select * from (values
      ('public.hay_secreto(text)', '239cbf2d27824f864a4c4b0588daf0d5'),
      ('public._entrar(text)',     'eafe1854c2ae599a78d5159a632567f5')
    ) as t(firma, md5_esperado) loop
    select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      raise exception 'ABORTADO: % no volvió a su cuerpo (md5=%)', r.firma, v;
    end if;
  end loop;
  if (select array_to_string(proacl, ',') from pg_proc where oid = 'public._entrar(text)'::regprocedure)
     is distinct from 'postgres=X/postgres' then
    raise exception 'ABORTADO: _entrar no quedó solo para postgres';
  end if;
  if not has_function_privilege('anon', 'public.cuota_mensual(uuid)', 'execute')
     or not has_function_privilege('anon', 'public.registrar_auditoria()', 'execute') then
    raise exception 'ABORTADO: anon no recuperó EXECUTE';
  end if;
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and not prosecdef
     and not exists (select 1 from unnest(coalesce(proconfig, '{}')) c where c like 'search_path=%');
  if n <> 12 then
    raise exception 'ABORTADO: se esperaban 12 funciones INVOKER sin search_path (las 11 y _entrar) y hay %', n;
  end if;
end
$despues$;

commit;
