-- Rollback de 20261031170000_multa_con_fundamento.sql (ronda 12, B).
--
-- Quita la restricción: la base vuelve a aceptar una multa sin referencia. No
-- se pierde ningún dato (las referencias escritas se quedan). **Volver atrás
-- también el código** si se quiere que la pantalla deje de exigir el
-- fundamento (si no, lo sigue pidiendo, solo que la base ya no).
-- Va antes que el rollback de 20261031150000 (ese borra cargos_unidad.tipo,
-- que esta restricción usa).

begin;

do $guarda$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.cargos_unidad'::regclass and conname = 'cargos_unidad_multa_con_fundamento') then
    raise exception 'ABORTADO: la restricción cargos_unidad_multa_con_fundamento no existe';
  end if;
end
$guarda$;

alter table public.cargos_unidad drop constraint cargos_unidad_multa_con_fundamento;

do $despues$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.cargos_unidad'::regclass and conname = 'cargos_unidad_multa_con_fundamento') then
    raise exception 'ABORTADO: la restricción sigue';
  end if;
end
$despues$;

commit;
