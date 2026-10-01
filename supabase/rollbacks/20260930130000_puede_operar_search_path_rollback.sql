-- Rollback de 20260930130000_puede_operar_search_path.sql — ver ese archivo.
--
-- Le quita a `puede_operar` la configuración propia y la deja como en el
-- volcado del 27-sep: sin `SET`, resolviendo `tiene_rol` con la ruta de
-- quien llama. RESET solo borra `proconfig`; cuerpo, permisos, dueño y modo
-- de seguridad quedan como estaban.
--
-- Sin pérdida de datos. Devuelve la fragilidad original: un llamador sin
-- `public` en la ruta vuelve a hacer fallar las políticas que usan
-- `puede_operar`. Los disparadores de 20260930120000_unidades_paga.sql NO
-- dependen de esto (fijan su propia ruta en 'public').

begin;

alter function public.puede_operar(uuid) reset search_path;

commit;

-- Verificación después de revertir:
--
--   select proconfig, md5(prosrc) from pg_proc
--    where oid = 'public.puede_operar(uuid)'::regprocedure;
--   -- Esperado: proconfig NULL, md5 84d6594f56e8e4afaf028662cdcbe006.
