-- Rollback de 20261031130000_mora_activa_con_porcentaje.sql (ronda 11, A).
--
-- Quita la restricción. No toca datos: los edificios que hayan encendido la
-- mora la siguen teniendo encendida (y con porcentaje, porque la restricción
-- lo exigía). Si además se vuelve atrás el código, el interruptor desaparece de
-- Ajustes pero la mora sigue cobrándose donde esté encendida.

begin;

do $guarda$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.edificios'::regclass and conname = 'edificios_mora_con_porcentaje') then
    raise exception 'ABORTADO: edificios_mora_con_porcentaje no existe';
  end if;
end
$guarda$;

alter table public.edificios drop constraint edificios_mora_con_porcentaje;

do $despues$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.edificios'::regclass and conname = 'edificios_mora_con_porcentaje') then
    raise exception 'ABORTADO: la restricción sigue ahí';
  end if;
end
$despues$;

commit;
