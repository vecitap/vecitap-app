-- Rollback de 20261118150000_garita_sin_conexion.sql (cambio 3, parte D).
-- Borra lo que agregó. Las visitas que llegaron sin conexión se quedan (con
-- su hora de entrada real); solo se pierden sus columnas id_equipo/hecho_en.

begin;

drop function if exists public.garita_salida_diferida(timestamptz, uuid, uuid);
drop function if exists public.garita_entrada_diferida(uuid, timestamptz, uuid, uuid, text, text, text, uuid, text);
drop function if exists public.garita_lista_del_dia(uuid);

alter table public.visitas drop constraint if exists visitas_id_equipo_key;
alter table public.visitas drop column if exists id_equipo, drop column if exists hecho_en;

commit;
