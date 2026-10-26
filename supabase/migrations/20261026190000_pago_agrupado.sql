-- Pago agrupado: una transferencia repartida entre varias unidades (ronda 7,
-- bloque 9; la «fase 2» de propietarios con varias unidades, caso 31).
--
-- Aplicada en vecitap-pruebas el 26-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va antes del primer pago real.** Independiente de las demás migraciones
-- de la ronda 7. Rollback:
-- supabase/rollbacks/20261026190000_pago_agrupado_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- `pagos.grupo_id`: los pagos de una misma transferencia comparten grupo. Uno
-- por unidad, cada uno con su parte; la app los inserta **en una sola
-- llamada** (un solo INSERT de N filas: o entran todos o ninguno). No cambia
-- nada para un pago suelto (grupo_id null).
--
-- Reglas que pone la base (disparadores por sentencia, con tabla de
-- transición):
--   1. Un grupo es **una** transferencia: todos sus pagos tienen la misma
--      organización, el mismo edificio, la misma fecha, la misma moneda, el
--      mismo método y la misma referencia, y unidades distintas.
--   2. **Pagos en Bs:** `pago_convierte` pasa cada parte a dólares con 4
--      decimales; la suma de las partes podía no dar exacto el total. Ahora,
--      en un grupo en Bs, cada parte se redondea a centavos y la diferencia
--      la absorbe la parte más grande, de modo que **la suma de los
--      monto_usd es exactamente round(total en Bs / tasa, 2)**.
--   3. **Se confirma o se anula el grupo completo:** si una sentencia cambia
--      el estado de un pago agrupado, todos los del grupo tienen que quedar
--      en el mismo estado (la app los cambia juntos, por grupo_id).
-- `pagos_posible_duplicado()` (que la app hoy no usa) ignora los pagos del
-- mismo grupo: comparten referencia a propósito. Devuelve además grupo_id.
-- La conciliación con el banco (lib/admin/conciliacion.ts) compara el
-- movimiento contra la **suma** del grupo.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.pagos_posible_duplicado(uuid,text)'::regprocedure;
  if v is distinct from 'af3373039b05ee7b2a425fe9c98d81ef' then
    raise exception 'ABORTADA: pagos_posible_duplicado() cambió (md5(prosrc)=%).', v;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'pagos' and column_name = 'grupo_id') then
    raise exception 'ABORTADA: pagos.grupo_id ya existe.';
  end if;
end
$guarda$;

alter table public.pagos add column grupo_id uuid;
create index pagos_por_grupo on public.pagos (grupo_id) where grupo_id is not null;
comment on column public.pagos.grupo_id is
  'Ronda 7: los pagos de una misma transferencia repartida entre varias unidades. '
  'Ver 20261026190000_pago_agrupado.sql.';

-- ── 1 y 2. Al insertar: coherencia del grupo y centavos que cuadran ─────
-- SECURITY DEFINER: corrige monto_usd de filas que el residente acaba de
-- insertar (él no tiene UPDATE sobre pagos). Solo toca los grupos de ESTA
-- sentencia.
create function public.pagos_grupo_al_insertar() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare g record; v_tasa numeric; v_total numeric; v_suma numeric; v_mayor uuid;
begin
  for g in select distinct n.grupo_id from nuevos n where n.grupo_id is not null loop
    if (select count(distinct (p.org_id, u.edificio_id, p.fecha, p.moneda,
                               coalesce(p.metodo, ''), coalesce(p.referencia, '')))
          from pagos p join unidades u on u.id = p.unidad_id
         where p.grupo_id = g.grupo_id) > 1 then
      raise exception 'Un pago agrupado es una sola transferencia: todas sus partes tienen que tener el mismo edificio, fecha, moneda, método y referencia.';
    end if;
    if (select count(*) - count(distinct p.unidad_id) from pagos p where p.grupo_id = g.grupo_id) > 0 then
      raise exception 'Un pago agrupado no puede repetir una unidad.';
    end if;

    -- En bolívares: cada parte a centavos y la diferencia a la más grande.
    select max(p.tasa_aplicada), sum(p.monto) into v_tasa, v_total
      from pagos p where p.grupo_id = g.grupo_id and p.moneda = 'VES';
    if coalesce(v_tasa, 0) > 0 then
      update pagos p set monto_usd = round(p.monto / v_tasa, 2)
       where p.grupo_id = g.grupo_id;
      select sum(p.monto_usd) into v_suma from pagos p where p.grupo_id = g.grupo_id;
      select p.id into v_mayor from pagos p where p.grupo_id = g.grupo_id
       order by p.monto desc, p.id limit 1;
      update pagos p set monto_usd = p.monto_usd + (round(v_total / v_tasa, 2) - v_suma)
       where p.id = v_mayor;
    end if;
  end loop;
  return null;
end $function$;

create trigger pagos_grupo_al_insertar
  after insert on public.pagos
  referencing new table as nuevos
  for each statement execute function public.pagos_grupo_al_insertar();

-- ── 3. Al cambiar el estado: el grupo entero ───────────────────────────
create function public.pagos_grupo_mismo_estado() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if exists (
    select 1
      from (select distinct n.grupo_id from nuevos n where n.grupo_id is not null) g
      join pagos p on p.grupo_id = g.grupo_id
     group by g.grupo_id
    having count(distinct p.estado) > 1) then
    raise exception 'Este pago es parte de una transferencia agrupada: se confirma o se anula el grupo completo.';
  end if;
  return null;
end $function$;

create trigger pagos_grupo_mismo_estado
  after update on public.pagos
  referencing new table as nuevos
  for each statement execute function public.pagos_grupo_mismo_estado();

revoke all on function public.pagos_grupo_al_insertar() from public, anon, authenticated;
revoke all on function public.pagos_grupo_mismo_estado() from public, anon, authenticated;

-- ── pagos_posible_duplicado(): ignora el mismo grupo ───────────────────
-- Cambia lo que devuelve (agrega grupo_id), así que va con drop + create.
drop function public.pagos_posible_duplicado(uuid, text);
create function public.pagos_posible_duplicado(p_org uuid, p_referencia text, p_grupo uuid default null)
  returns table(id uuid, unidad_id uuid, fecha date, monto_usd numeric, banco text, grupo_id uuid)
  language sql
  stable
  as $function$
  select p.id, p.unidad_id, p.fecha, p.monto_usd, p.banco, p.grupo_id
    from pagos p
   where p.org_id = p_org
     and p.referencia = p_referencia
     and p.estado <> 'anulado'
     -- Ronda 7: las partes de una misma transferencia comparten referencia.
     and (p_grupo is null or p.grupo_id is distinct from p_grupo)
   order by p.fecha desc
$function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- En una transacción deshecha, como un residente con dos unidades del mismo
-- edificio: insertar un grupo en Bs de 1.000,00 + 1.000,01 con una tasa que
-- no divida exacto, y mirar que la suma de monto_usd es round(2.000,01/tasa, 2):
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<residente>","role":"authenticated"}';
--   insert into public.pagos (org_id, unidad_id, fecha, monto, moneda, monto_usd, metodo, referencia, destino, estado, grupo_id)
--   values ('<org>', '<unidad 1>', current_date, 1000, 'VES', 0, 'Transferencia', '123', 'condominio', 'reportado', '<uuid>'),
--          ('<org>', '<unidad 2>', current_date, 1000.01, 'VES', 0, 'Transferencia', '123', 'condominio', 'reportado', '<uuid>');
--   select sum(monto_usd), round(sum(monto) / max(tasa_aplicada), 2) from public.pagos where grupo_id = '<uuid>';
--   rollback;
-- Y que confirmar uno solo de los dos da «se confirma o se anula el grupo completo».
