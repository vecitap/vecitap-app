-- Reverso de 20261028180000_pagos_desde_cierre.sql (ronda 9, A1).
--
-- Borra pagos_desde_cierre(). Antes de aplicarlo, la app tiene que volver a
-- la versión que no la llama (lib/residente/a-pagar.ts): sin la función,
-- «Mi recibo» no puede calcular lo que se debe hoy y cae al total del recibo.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = to_regprocedure('public.pagos_desde_cierre(uuid)');
  if v is distinct from '7b86d8acf44f957f57a87a45b1558c24' then
    raise exception 'ABORTADA: pagos_desde_cierre no es la de la ronda 9 (md5=%)', v;
  end if;
end
$guarda$;

drop function public.pagos_desde_cierre(uuid);

commit;
