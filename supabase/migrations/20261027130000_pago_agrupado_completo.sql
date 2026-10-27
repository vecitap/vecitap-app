-- Pago agrupado: el grupo se crea completo en una sola inserción (ronda 8,
-- bloque B1; corrige 20261026190000_pago_agrupado.sql en la revisión cruzada).
--
-- Aplicada en vecitap-pruebas el 27-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261026190000_pago_agrupado.sql** (la guarda exige su
-- pagos_grupo_al_insertar()). Rollback:
-- supabase/rollbacks/20261027130000_pago_agrupado_completo_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL HUECO
-- ─────────────────────────────────────────────────────────────────────────
-- `pagos_grupo_al_insertar()` es SECURITY DEFINER y, después de cada
-- INSERT, recalcula el monto_usd de TODAS las filas de cada grupo_id que
-- trae la sentencia. Un residente podía insertar un pago con un grupo_id
-- que ya existía (por ejemplo, uno ya confirmado, o de otra persona si
-- conocía el uuid): la coherencia (misma fecha, referencia…) lo frenaba
-- casi siempre, pero si coincidía, su fila se sumaba a un grupo ajeno y el
-- disparador reescribía el monto_usd de pagos que no son suyos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LA REGLA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Un grupo nace completo en una sola sentencia (así lo inserta la app:
--    un INSERT de N filas). Si un pago trae un grupo_id que ya tenía filas
--    ANTES de esa sentencia, se rechaza con un mensaje claro. Así el
--    recálculo solo toca filas recién insertadas por quien inserta.
-- 2. grupo_id no cambia después (disparador BEFORE UPDATE): nadie mueve un
--    pago a otro grupo ni lo saca del suyo. La administración sigue
--    confirmando y anulando el grupo entero, que no toca grupo_id.
-- Un pago suelto (grupo_id null) no cambia en nada.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.pagos_grupo_al_insertar()'::regprocedure;
  if v is distinct from '968d25e15a4d349314ed935627b73c1d' then
    raise exception 'ABORTADA: pagos_grupo_al_insertar() cambió (md5(prosrc)=%). ¿Falta 20261026190000_pago_agrupado.sql?', v;
  end if;
end
$guarda$;

create or replace function public.pagos_grupo_al_insertar() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare g record; v_tasa numeric; v_total numeric; v_suma numeric; v_mayor uuid;
begin
  for g in select distinct n.grupo_id from nuevos n where n.grupo_id is not null loop
    -- Ronda 8 (revisión cruzada): un grupo se crea completo en UNA sentencia.
    -- Si el grupo ya tenía pagos antes de esta inserción, se rechaza: nadie
    -- puede sumarle una parte a un grupo existente (por ejemplo, a uno ya
    -- confirmado), ni hacer que esta función —SECURITY DEFINER— recalcule el
    -- monto_usd de pagos que no son suyos.
    if exists (select 1 from pagos p
                where p.grupo_id = g.grupo_id
                  and not exists (select 1 from nuevos n where n.id = p.id)) then
      raise exception 'Ese pago agrupado ya existe: no se le pueden agregar partes. Reporte la transferencia completa de una sola vez.';
    end if;
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

create function public.pagos_grupo_inmutable() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if new.grupo_id is distinct from old.grupo_id then
    raise exception 'Un pago no se puede pasar a otra transferencia agrupada ni sacar de la suya.';
  end if;
  return new;
end $function$;

create trigger pagos_grupo_inmutable
  before update of grupo_id on public.pagos
  for each row execute function public.pagos_grupo_inmutable();

revoke all on function public.pagos_grupo_inmutable() from public, anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (en transacciones que se deshacen; ver «Ronda 8» en
-- docs/estado-migracion.md para los ids de pruebas)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc) from pg_proc where proname = 'pagos_grupo_al_insertar';
--    -- Esperado: 584fb1055a82a713857b633a761ab45f
--    select count(*) from pg_trigger where tgname = 'pagos_grupo_inmutable';  -- 1
-- 2. Como un residente con dos unidades del mismo edificio:
--    a) un INSERT de dos filas con un grupo_id nuevo → entra (los dos).
--    b) otro INSERT de una fila con ESE grupo_id → «Ese pago agrupado ya
--       existe: no se le pueden agregar partes…».
--    c) un pago suelto (grupo_id null) → entra como siempre.
-- 3. Lo mismo como la administradora (Pagos recibidos → registrar): (a) y
--    (c) entran, (b) se rechaza; y `update pagos set grupo_id = null` de
--    una parte → «Un pago no se puede pasar a otra transferencia…».
