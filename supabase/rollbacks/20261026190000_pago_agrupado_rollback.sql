-- Reverso de 20261026190000_pago_agrupado.sql (ronda 7, bloque 9).
--
-- Borra los dos disparadores, vuelve `pagos_posible_duplicado()` a su forma
-- de antes (el cuerpo de abajo, tal cual) y borra `pagos.grupo_id`. **Los
-- pagos agrupados quedan como pagos sueltos**, cada uno con su parte y su
-- monto_usd ya cuadrado: no se pierde plata, solo la marca de que eran una
-- transferencia (conciliarlos contra el banco vuelve a ser uno por uno).

begin;

drop trigger if exists pagos_grupo_al_insertar on public.pagos;
drop trigger if exists pagos_grupo_mismo_estado on public.pagos;
drop function if exists public.pagos_grupo_al_insertar();
drop function if exists public.pagos_grupo_mismo_estado();

drop function if exists public.pagos_posible_duplicado(uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.pagos_posible_duplicado(p_org uuid, p_referencia text)
 RETURNS TABLE(id uuid, unidad_id uuid, fecha date, monto_usd numeric, banco text)
 LANGUAGE sql
 STABLE
AS $function$
  select p.id, p.unidad_id, p.fecha, p.monto_usd, p.banco
    from pagos p
   where p.org_id = p_org
     and p.referencia = p_referencia
     and p.estado <> 'anulado'
   order by p.fecha desc
$function$;

drop index if exists public.pagos_por_grupo;
alter table public.pagos drop column if exists grupo_id;

commit;

-- Verificación después de revertir:
--   select md5(prosrc) from pg_proc where oid = 'public.pagos_posible_duplicado(uuid,text)'::regprocedure;
--   -- af3373039b05ee7b2a425fe9c98d81ef
