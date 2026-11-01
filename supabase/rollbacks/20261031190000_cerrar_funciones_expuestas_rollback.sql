-- Rollback de 20261031190000_cerrar_funciones_expuestas.sql (ronda 12).
--
-- Devuelve los permisos de antes. **Ojo:** vuelve a exponer los datos de
-- cualquier unidad (destinatarios_de, a authenticated) y el id de cualquier
-- correo (_usr, a cualquiera, también sin sesión). Revertir solo si hace falta.
--
-- _usr y _entrar no tenían permisos puestos (proacl nulo = EXECUTE para
-- PUBLIC). Un GRANT no puede dejarlo nulo: quedan con
-- postgres=X/postgres,=X/postgres (EXECUTE para PUBLIC, dicho explícito), que
-- permite exactamente lo mismo. Probado en seco el 01-nov.

begin;

do $guarda$
declare r record; a text;
begin
  for r in select * from (values ('public.destinatarios_de(uuid)'), ('public._usr(text)'), ('public._entrar(text)')) as t(firma) loop
    select coalesce(array_to_string(proacl, ','), '(PUBLIC)') into a from pg_proc where oid = to_regprocedure(r.firma);
    if a is distinct from 'postgres=X/postgres' then
      raise exception 'ABORTADO: % no tiene los permisos de 20261031190000 (%)', r.firma, a;
    end if;
  end loop;
end
$guarda$;

grant execute on function public.destinatarios_de(uuid) to authenticated;
grant execute on function public._usr(text) to public;
grant execute on function public._entrar(text) to public;

do $despues$
declare a text;
begin
  select array_to_string(proacl, ',') into a from pg_proc where oid = 'public.destinatarios_de(uuid)'::regprocedure;
  if a is distinct from 'postgres=X/postgres,authenticated=X/postgres' then
    raise exception 'ABORTADO: destinatarios_de quedó con %', a;
  end if;
  if not (has_function_privilege('anon', 'public._usr(text)', 'execute')
          and has_function_privilege('anon', 'public._entrar(text)', 'execute')) then
    raise exception 'ABORTADO: _usr o _entrar no volvieron a quedar abiertas';
  end if;
end
$despues$;

commit;
