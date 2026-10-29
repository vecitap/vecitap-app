-- Reverso de 20261029130000_estado_envio_periodo.sql (ronda 10, B1 y B2).
--
-- Borra estado_envio_periodo(). Antes, la app tiene que volver a la versión
-- que no la llama (Cortes vuelve a resumen_correos() y no avisa al reenviar).

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = to_regprocedure('public.estado_envio_periodo(uuid)');
  if v is distinct from '1ffdc2eba5960fa1d868b676ffe69136' then
    raise exception 'ABORTADA: estado_envio_periodo no es la de la ronda 10 (md5=%)', v;
  end if;
end
$guarda$;

drop function public.estado_envio_periodo(uuid);

commit;
