-- Reverso de 20261117120000_tasa_editable.sql (cambio 1: tasa editable).
--
-- Vuelve pago_convierte() y pagos_grupo_al_insertar() a sus cuerpos
-- anteriores, el disparador pagos_convierte a sus columnas de antes, borra
-- ajustar_tasa_pago y las columnas de la tasa manual.
--
-- ABORTA si hay algún pago con la tasa ajustada: al borrar las columnas se
-- perdería quién la cambió y por qué, y el pago quedaría con una tasa que no
-- es la del día sin ninguna marca. Si hace falta volver atrás igual, primero
-- se decide qué hacer con esos pagos (por ejemplo, devolverlos a la del BCV
-- con ajustar_tasa_pago(id, null) mientras su mes siga abierto).

begin;

do $guarda$
declare v text; n int;
begin
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.pago_convierte()'::regprocedure;
  if v is distinct from 'e6df1eea84091c8edd5e9ef49363c6d8' then
    raise exception 'ABORTADA: pago_convierte() no es la de 20261117120000 (md5=%). No se cambió nada.', v;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.pagos_grupo_al_insertar()'::regprocedure;
  if v is distinct from '2ac067ed5bc1aef76abca74c50fc717a' then
    raise exception 'ABORTADA: pagos_grupo_al_insertar() no es la de 20261117120000 (md5=%). No se cambió nada.', v;
  end if;
  select count(*) into n from public.pagos where tasa_manual;
  if n > 0 then
    raise exception 'ABORTADA: hay % pagos con la tasa ajustada. Ver el encabezado de este archivo. No se cambió nada.', n;
  end if;
end
$guarda$;

drop function public.ajustar_tasa_pago(uuid, numeric, text, text);

drop trigger pagos_convierte on public.pagos;
create trigger pagos_convierte
  before insert or update of monto, moneda, fecha
  on public.pagos
  for each row execute function public.pago_convierte();

create or replace function public.pago_convierte() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare v_tasa numeric(18,6);
begin
  if new.moneda = 'USD' then
    new.tasa_aplicada := null;
    new.monto_usd := round(new.monto, 4);
    return new;
  end if;

  -- VES: la tasa la decide la fecha del pago, no quien lo registra
  v_tasa := tasa_del_dia(new.fecha);

  if v_tasa is null then
    raise exception 'No hay tasa del BCV cargada para el % ni antes. '
                    'Cárguela antes de registrar el pago.', new.fecha;
  end if;

  new.tasa_aplicada := v_tasa;
  new.monto_usd := round(new.monto / v_tasa, 4);
  return new;
end $function$;

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

alter table public.pagos
  drop constraint pago_tasa_manual_coherente,
  drop column tasa_ajustada_en,
  drop column tasa_ajustada_por,
  drop column tasa_motivo_detalle,
  drop column tasa_motivo,
  drop column tasa_manual;

commit;

-- VERIFICACIÓN
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.pago_convierte()'::regprocedure;
--   → ae8b61bdfc9b8e2c360798a8901a04c2
-- select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.pagos_grupo_al_insertar()'::regprocedure;
--   → 584fb1055a82a713857b633a761ab45f
-- select to_regprocedure('public.ajustar_tasa_pago(uuid,numeric,text,text)'); → null
-- select count(*) from information_schema.columns where table_schema = 'public'
--    and table_name = 'pagos' and column_name like 'tasa\_%' escape '\';   → 1
