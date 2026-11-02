-- Rollback de 20261102120000_funciones_sin_retorno_de_carro.sql
--
-- No hay nada que deshacer a mano. La migración solo quitó caracteres «\r»
-- (retorno de carro) del cuerpo de las funciones. No cambió qué hacen, ni
-- sus permisos, ni su dueño. Volver a ponerlos no tiene sentido: dejaría las
-- funciones distintas de pruebas y haría abortar las guardas de las
-- migraciones siguientes.
--
-- Si de verdad hiciera falta el estado exacto anterior, se restaura el
-- respaldo con pg_dump tomado antes del paso a producción
-- (docs/paso-produccion.md, paso 1 y paso 9).

select 'Nada que deshacer: ver el comentario de este archivo.' as rollback;
