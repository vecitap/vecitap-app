-- Rollback de 20261118120000_copia_edificio.sql (cambio 3 de ING3, sin conexión).
--
-- Borra copia_edificio(). Ninguna tabla ni otra función cambia. Si la app ya
-- la usa, la copia sin conexión deja de poder bajar el historial y la deuda
-- por mes (el resto de la app no se entera).

begin;

drop function if exists public.copia_edificio(uuid);

commit;

-- Verificación:
--   select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'copia_edificio';
--   -- Esperado: 0.
