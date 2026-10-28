-- Reverso de 20261028130000_avisos_resend.sql (ronda 9, A3).
--
-- Borra registrar_evento_correo() y el índice por proveedor_id. Los eventos
-- ya guardados en cola_correo y las direcciones anotadas en correos_malos se
-- quedan (son datos, y la pantalla los sigue mostrando). La fila
-- 'webhook_resend_sha256' de secretos también queda: se borra a mano si se
-- quiere (`delete from secretos where nombre = 'webhook_resend_sha256';`).
-- Después de esto, la ruta /api/resend contesta 500 a cada aviso y Resend
-- los reintenta: conviene apagar el webhook en Resend antes.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc
   where oid = to_regprocedure('public.registrar_evento_correo(text, text, text, timestamptz)');
  if v is distinct from 'feb53cdc2d8cc0ad3c7319d5cd04ce7c' then
    raise exception 'ABORTADA: registrar_evento_correo no es la de la ronda 9 (md5=%)', v;
  end if;
end
$guarda$;

drop function public.registrar_evento_correo(text, text, text, timestamptz);
drop index public.cola_por_proveedor;

commit;
