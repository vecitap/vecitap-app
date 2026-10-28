-- Reverso de 20261028170000_permisos_sobrantes.sql (ronda 9, D3).
--
-- Devuelve exactamente lo que tenía cada objeto antes de la migración, leído
-- del respaldo que ella guardó en `tareas_log` (tarea 'r9_permisos_sobrantes'),
-- y los privilegios por omisión de postgres para anon. Un objeto que ya no
-- existe se salta. Al final borra el respaldo, para que la migración se pueda
-- volver a aplicar.

begin;

do $volver$
declare v jsonb; o jsonb; v_def text;
begin
  select detalle into v from tareas_log where tarea = 'r9_permisos_sobrantes'
   order by corrida_en desc limit 1;
  if v is null then
    raise exception 'ABORTADA: no hay respaldo de permisos en tareas_log (¿no se aplicó la migración?)';
  end if;

  for o in select * from jsonb_array_elements(v -> 'objetos') loop
    continue when to_regclass(o ->> 'objeto') is null;
    execute format('grant %s on %s to %I', o ->> 'privilegios', o ->> 'objeto', o ->> 'rol');
  end loop;

  v_def := v ->> 'default_anon';
  if coalesce(v_def, '') <> '' then
    execute format('alter default privileges for role postgres in schema public grant %s on tables to anon', v_def);
  end if;

  delete from tareas_log where tarea = 'r9_permisos_sobrantes';
end
$volver$;

commit;

-- Verificación: el mismo conteo del punto 1 de la migración vuelve a dar lo de
-- antes (38 en producción, 20 en pruebas, si no se crearon tablas en medio).
