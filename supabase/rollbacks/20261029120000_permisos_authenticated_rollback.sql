-- Reverso de 20261029120000_permisos_authenticated.sql (ronda 10, A2).
--
-- Devuelve exactamente lo que tenía cada objeto, leído del respaldo que la
-- migración guardó en `tareas_log` (tarea 'r10_permisos_authenticated'), y
-- los privilegios por omisión de postgres para authenticated. Un objeto que
-- ya no existe se salta. Al final borra el respaldo.

begin;

do $volver$
declare v jsonb; o jsonb; v_def text;
begin
  select detalle into v from tareas_log where tarea = 'r10_permisos_authenticated'
   order by corrida_en desc limit 1;
  if v is null then
    raise exception 'ABORTADA: no hay respaldo de permisos en tareas_log (¿no se aplicó la migración?)';
  end if;

  for o in select * from jsonb_array_elements(v -> 'objetos') loop
    continue when to_regclass(o ->> 'objeto') is null;
    execute format('grant %s on %s to %I', o ->> 'privilegios', o ->> 'objeto', o ->> 'rol');
  end loop;

  v_def := v ->> 'default_authenticated';
  if coalesce(v_def, '') <> '' then
    execute format('alter default privileges for role postgres in schema public grant %s on tables to authenticated', v_def);
  end if;

  delete from tareas_log where tarea = 'r10_permisos_authenticated';
end
$volver$;

commit;

-- Verificación: el conteo del punto 1 de la migración vuelve a dar lo de antes
-- (37 en pruebas, 38 en producción, si no se crearon tablas en medio).
