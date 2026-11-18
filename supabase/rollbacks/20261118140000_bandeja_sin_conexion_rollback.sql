-- Rollback de 20261118140000_bandeja_sin_conexion.sql (cambio 3, parte B).
-- Borra lo que agregó, nada más. Las columnas id_equipo / hecho_en se pierden
-- con sus valores (solo servían para no duplicar reintentos y para mostrar la
-- hora del equipo); las filas de pagos, gastos, cargos y ajustes quedan.

begin;

drop trigger if exists periodos_sin_equipos_en_riesgo on public.periodos;
drop function if exists public.periodos_sin_equipos_en_riesgo();

drop function if exists public.liberar_equipo(uuid, uuid);
drop function if exists public.equipos_en_riesgo(uuid);
drop function if exists public.latido_equipo(uuid, uuid, integer, text, text);
drop table if exists public.equipos_sin_conexion;

drop trigger if exists pagos_0_id_equipo on public.pagos;
drop trigger if exists gastos_0_id_equipo on public.gastos;
drop trigger if exists cargos_unidad_0_id_equipo on public.cargos_unidad;
drop trigger if exists ajustes_0_id_equipo on public.ajustes;
drop function if exists public.saltar_id_equipo_repetido();

alter table public.pagos         drop column if exists id_equipo, drop column if exists hecho_en;
alter table public.gastos        drop column if exists id_equipo, drop column if exists hecho_en;
alter table public.cargos_unidad drop column if exists id_equipo, drop column if exists hecho_en;
alter table public.ajustes       drop column if exists id_equipo, drop column if exists hecho_en;

commit;
