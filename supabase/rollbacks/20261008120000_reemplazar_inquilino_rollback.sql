-- Reverso de 20261008120000_reemplazar_inquilino.sql.
--
-- La función es nueva y no la usa nada de la base: se borra y listo. Los
-- datos que haya escrito (vínculos cerrados, personas nuevas, invitaciones
-- anuladas) son datos normales de la ficha y se quedan.
--
-- OJO: con la función borrada, la ficha de Admin de esta ronda falla al
-- cambiar el correo de un inquilino ("Could not find the function…"). Si se
-- revierte la base, revertir también components/admin/DatosUnidad.tsx.

begin;

drop function if exists public.reemplazar_inquilino(uuid, text, text, text, text, text, boolean);

commit;

-- Verificación:
--   select count(*) from pg_proc where proname = 'reemplazar_inquilino';
--   -- Esperado: 0
