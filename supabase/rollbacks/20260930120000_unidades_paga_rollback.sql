-- Rollback de 20260930120000_unidades_paga.sql — ver ese archivo.
--
-- Devuelve `mis_unidades()` exactamente a la versión que Nicolás sacó de las
-- dos bases con `pg_get_functiondef` el 30-sep, borra los dos disparadores
-- y sus funciones, y borra la columna `unidades.paga`.
--
-- **PIERDE DATOS:** lo que la administradora haya cargado en `paga` se
-- borra con la columna. Si ya se cargó, guardarlo antes:
--
--   select id, codigo, paga from public.unidades where paga <> 'propietario';
--
-- El orden importa:
--   1. Primero `mis_unidades()`, porque lee `u.paga`. (El cuerpo de una
--      función SQL no registra dependencias, así que el DROP de la columna
--      NO fallaría — dejaría la función rota en silencio hasta la próxima
--      llamada. Por eso va primero.)
--   2. Los disparadores antes que sus funciones (el DROP FUNCTION falla si
--      un disparador todavía la usa).
--   3. La columna al final.
--
-- La app tiene que volver a la versión que no lee `paga` ANTES de correr
-- esto, o el portal y la ficha de la unidad van a fallar.

begin;

-- 1) mis_unidades(), byte por byte como estaba.
drop function public.mis_unidades();

CREATE FUNCTION public.mis_unidades()
 RETURNS TABLE(unidad_id uuid, codigo text, alicuota numeric, edificio_id uuid, edificio text, org_id uuid, organizacion text, relacion text, nivel text, saldo numeric, recibo_numero text, recibo_total numeric, recibo_periodo text, recibo_anio integer, recibo_mes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select u.id, u.codigo, u.alicuota,
         e.id, e.nombre, o.id, o.nombre,
         coalesce(m.relacion, 'propietario'),
         u.inquilino_ve,
         saldo_visible(u.id),
         r.numero, r.total, p.etiqueta, p.anio, p.mes
    from membresias m
    join unidades u    on u.id = m.unidad_id
    join edificios e   on e.id = u.edificio_id
    join organizaciones o on o.id = u.org_id
    left join lateral (
      select r2.numero, r2.total, r2.periodo_id
        from recibos r2
        join periodos p2 on p2.id = r2.periodo_id
       where r2.unidad_id = u.id and p2.estado = 'cerrado'
       order by p2.anio desc, p2.mes desc
       limit 1) r on true
    left join periodos p on p.id = r.periodo_id
   where m.usuario_id = auth.uid() and m.activo and m.rol = 'residente'
   order by o.nombre, e.nombre, u.codigo
$function$;

revoke all on function public.mis_unidades() from public;
revoke all on function public.mis_unidades() from anon;
grant execute on function public.mis_unidades() to authenticated;

-- 2) Disparadores y sus funciones (incluida la 3b, la de los accesos).
--    Las membresías de inquilino que 3b ya desactivó QUEDAN desactivadas:
--    el rollback no las reactiva (no hay forma segura de distinguirlas de
--    las que se apagaron a mano). Para verlas, en `auditoria`, los UPDATE de
--    `membresias` que pasaron `activo` de true a false desde que se aplicó.
drop trigger if exists vinculos_inquilino_sale_accesos_del on public.vinculos;
drop trigger if exists vinculos_inquilino_sale_accesos_upd on public.vinculos;
drop trigger if exists vinculos_inquilino_sale_del on public.vinculos;
drop trigger if exists vinculos_inquilino_sale_upd on public.vinculos;
drop trigger if exists unidades_paga_exige_inquilino on public.unidades;

drop function if exists public.vinculos_inquilino_sale_accesos();
drop function if exists public.vinculos_inquilino_sale();
drop function if exists public.unidades_paga_exige_inquilino();

-- 3) La columna (se lleva el CHECK y el comentario con ella).
alter table public.unidades drop column if exists paga;

commit;

-- Verificación después de revertir:
--
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'unidades' and column_name = 'paga';
--   -- 0 filas esperadas
--
--   select tgname from pg_trigger
--    where tgname in ('unidades_paga_exige_inquilino',
--                     'vinculos_inquilino_sale_upd', 'vinculos_inquilino_sale_del',
--                     'vinculos_inquilino_sale_accesos_upd', 'vinculos_inquilino_sale_accesos_del');
--   -- 0 filas esperadas
--
--   select proname from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('unidades_paga_exige_inquilino', 'vinculos_inquilino_sale',
--                      'vinculos_inquilino_sale_accesos');
--   -- 0 filas esperadas
--
--   select pg_get_functiondef(oid), proacl from pg_proc
--    where proname = 'mis_unidades' and pronamespace = 'public'::regnamespace;
--   -- Esperado: sin `paga` en el RETURNS TABLE, y el mismo proacl que se
--   -- anotó en el paso 0 de la migración.
--
-- Después: regenerar types/supabase.ts.
