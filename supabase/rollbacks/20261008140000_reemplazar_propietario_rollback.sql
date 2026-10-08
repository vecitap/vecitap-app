-- Reverso de 20261008140000_reemplazar_propietario.sql.
--
-- Se borran la función y el disparador. Los datos que hayan escrito
-- (vínculos cerrados, personas nuevas, accesos apagados, invitaciones
-- anuladas) son datos normales y se quedan: no hay "deshacer" de un cambio
-- de propietario ya hecho.
--
-- OJO: con la función borrada, la ficha de Admin falla al cambiar el correo
-- de un propietario. Si se revierte la base, revertir también
-- components/admin/DatosUnidad.tsx.

begin;

drop trigger if exists vinculos_propietario_sale_accesos_upd on public.vinculos;
drop trigger if exists vinculos_propietario_sale_accesos_del on public.vinculos;
drop function if exists public.vinculos_propietario_sale_accesos();
drop function if exists public.reemplazar_propietario(uuid, text, text, text, text, text, boolean);

commit;

-- Verificación:
--   select count(*) from pg_proc
--    where proname in ('reemplazar_propietario', 'vinculos_propietario_sale_accesos');
--   -- Esperado: 0
--   select count(*) from pg_trigger where tgname like 'vinculos_propietario_sale_accesos%';
--   -- Esperado: 0
