-- Cambio 1 del feedback de ING3: la tasa del BCV editable en un pago.
--
-- Aplicada en vecitap-pruebas el 17-nov, por Nicolás con psql (la herramienta
-- de SQL del asistente rechazó la escritura). Verificación y casos a–i en OK;
-- 0 funciones con «\r». Md5 en pruebas: pago_convierte e6df1eea…,
-- pagos_grupo_al_insertar 2ac067ed…, ajustar_tasa_pago 0d9001a2….
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo.
-- Rollback: supabase/rollbacks/20261117120000_tasa_editable_rollback.sql.
--
-- Decisiones (respuestas del 17-nov a las preguntas 1.1 a 1.7 de la propuesta
-- del 11-nov):
--   1.2 Se edita al registrar el pago y al confirmar uno reportado.
--   1.3 También en un pago ya confirmado, mientras no haya entrado en un cierre.
--   1.4 Solo la administración (puede_operar). Un residente que mande una tasa
--       propia recibe un error.
--   1.5 Vale solo para ese pago: tasas_bcv no se toca.
--   1.6 Motivo obligatorio, de una lista; «otro» exige el texto.
--   1.7 El residente no ve ninguna marca (eso es de la pantalla, no de acá).
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. pagos: tasa_manual, tasa_motivo, tasa_motivo_detalle, tasa_ajustada_por,
--    tasa_ajustada_en, con un CHECK de coherencia.
-- 2. pago_convierte(): si tasa_manual, respeta la tasa enviada —solo si quien
--    escribe administra la organización y la tasa es creíble (la misma regla
--    de completar_tasa: entre la mitad y el triple de la tasa conocida más
--    cercana)— y anota quién y cuándo. Si no, sigue igual que hoy: la tasa
--    del día de la fecha del pago. No deja cambiar la tasa de un pago que ya
--    entró en un cierre.
--    El disparador ahora también corre al cambiar las columnas de la tasa.
--    Antes, un UPDATE de tasa_aplicada sola no pasaba por la conversión.
-- 3. pagos_grupo_al_insertar(): todas las partes de una transferencia
--    agrupada tienen que llevar la misma tasa.
-- 4. ajustar_tasa_pago(pago, tasa, motivo, detalle): cambia (o devuelve a la
--    del BCV, con tasa null) la tasa de un pago ya registrado, con todo su
--    grupo, y reparte otra vez los dólares del grupo a centavos.
--
-- El registro de auditoría (aud_pagos) ya guarda cada cambio de la fila.

begin;

do $guarda$
declare v text;
begin
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.pago_convierte()'::regprocedure;
  if v is distinct from 'ae8b61bdfc9b8e2c360798a8901a04c2' then
    raise exception 'ABORTADA: pago_convierte() no es la esperada (md5=%). No se cambió nada.', v;
  end if;
  select md5(replace(prosrc, chr(13), '')) into v from pg_proc where oid = 'public.pagos_grupo_al_insertar()'::regprocedure;
  if v is distinct from '584fb1055a82a713857b633a761ab45f' then
    raise exception 'ABORTADA: pagos_grupo_al_insertar() no es la esperada (md5=%). No se cambió nada.', v;
  end if;
  if to_regprocedure('public.ajustar_tasa_pago(uuid,numeric,text,text)') is not null then
    raise exception 'ABORTADA: ajustar_tasa_pago ya existe. No se cambió nada.';
  end if;
end
$guarda$;

-- 1. Columnas ──────────────────────────────────────────────────────────────

alter table public.pagos
  add column tasa_manual boolean not null default false,
  add column tasa_motivo text,
  add column tasa_motivo_detalle text,
  add column tasa_ajustada_por uuid references auth.users(id) on delete set null,
  add column tasa_ajustada_en timestamptz,
  add constraint pago_tasa_manual_coherente check (
    (not tasa_manual and tasa_motivo is null and tasa_motivo_detalle is null
       and tasa_ajustada_por is null and tasa_ajustada_en is null)
    or (tasa_manual and moneda = 'VES'
        and tasa_motivo in ('noche_fin_de_semana', 'acuerdo_propietario', 'otro')
        and (tasa_motivo <> 'otro' or length(btrim(coalesce(tasa_motivo_detalle, ''))) > 0))
  );

comment on column public.pagos.tasa_manual is
  'La administración cambió la tasa de este pago. tasa_aplicada es la que escribió; la del BCV de ese día es tasa_del_dia(fecha).';
comment on column public.pagos.tasa_motivo is
  'Motivo del cambio de tasa: noche_fin_de_semana, acuerdo_propietario u otro.';
comment on column public.pagos.tasa_motivo_detalle is
  'Texto del motivo. Obligatorio cuando tasa_motivo = otro.';

-- 2. Conversión ────────────────────────────────────────────────────────────

create or replace function public.pago_convierte() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare v_tasa numeric(18,6); v_cerca numeric(18,6); v_pide boolean;
begin
  -- Cambio 1: la tasa de un pago que ya entró en un cierre no se toca.
  if tg_op = 'UPDATE' and old.periodo_cierre_id is not null
     and (new.tasa_aplicada is distinct from old.tasa_aplicada
          or new.tasa_manual is distinct from old.tasa_manual) then
    raise exception 'Ese pago ya está dentro de un cierre: su tasa no se puede cambiar. Registre un ajuste.';
  end if;

  if new.moneda = 'USD' then
    new.tasa_aplicada := null;
    new.tasa_manual := false;
    new.tasa_motivo := null;
    new.tasa_motivo_detalle := null;
    new.tasa_ajustada_por := null;
    new.tasa_ajustada_en := null;
    new.monto_usd := round(new.monto, 4);
    return new;
  end if;

  if coalesce(new.tasa_manual, false) then
    -- ¿Se está pidiendo una tasa (nueva o distinta), o es la que el pago ya
    -- tenía y lo que cambió es otra cosa (el monto, la fecha)?
    v_pide := tg_op = 'INSERT'
           or not old.tasa_manual
           or new.tasa_aplicada is distinct from old.tasa_aplicada
           or new.tasa_motivo is distinct from old.tasa_motivo
           or new.tasa_motivo_detalle is distinct from old.tasa_motivo_detalle;

    if v_pide then
      if auth.uid() is null or not puede_operar(new.org_id) then
        raise exception 'Solo la administración puede cambiar la tasa de un pago.';
      end if;
      if new.tasa_aplicada is null or new.tasa_aplicada <= 0 then
        raise exception 'La tasa debe ser mayor que cero.';
      end if;
      if new.tasa_motivo is null
         or new.tasa_motivo not in ('noche_fin_de_semana', 'acuerdo_propietario', 'otro') then
        raise exception 'Elija el motivo del cambio de tasa.';
      end if;
      new.tasa_motivo_detalle := nullif(btrim(new.tasa_motivo_detalle), '');
      if new.tasa_motivo = 'otro' and new.tasa_motivo_detalle is null then
        raise exception 'Escriba el motivo del cambio de tasa.';
      end if;

      -- La misma regla de completar_tasa contra errores de tipeo.
      select t.tasa into v_cerca
        from tasas_bcv t
       order by abs(t.fecha - new.fecha)
       limit 1;
      if v_cerca is not null and (new.tasa_aplicada < v_cerca / 2 or new.tasa_aplicada > v_cerca * 3) then
        raise exception 'Esa tasa no es creíble: la del BCV más cercana es %. Revise el número.', round(v_cerca, 2);
      end if;

      new.tasa_ajustada_por := auth.uid();
      new.tasa_ajustada_en := now();
    else
      new.tasa_ajustada_por := old.tasa_ajustada_por;
      new.tasa_ajustada_en := old.tasa_ajustada_en;
    end if;

    new.monto_usd := round(new.monto / new.tasa_aplicada, 4);
    return new;
  end if;

  -- Sin cambio de tasa: como siempre, la decide la fecha del pago.
  new.tasa_manual := false;
  new.tasa_motivo := null;
  new.tasa_motivo_detalle := null;
  new.tasa_ajustada_por := null;
  new.tasa_ajustada_en := null;

  v_tasa := tasa_del_dia(new.fecha);

  if v_tasa is null then
    raise exception 'No hay tasa del BCV cargada para el % ni antes. '
                    'Cárguela antes de registrar el pago.', new.fecha;
  end if;

  new.tasa_aplicada := v_tasa;
  new.monto_usd := round(new.monto / v_tasa, 4);
  return new;
end $function$;

drop trigger pagos_convierte on public.pagos;
create trigger pagos_convierte
  before insert or update of monto, moneda, fecha, tasa_aplicada, tasa_manual, tasa_motivo,
                             tasa_motivo_detalle, tasa_ajustada_por, tasa_ajustada_en
  on public.pagos
  for each row execute function public.pago_convierte();

-- 3. Una transferencia agrupada lleva una sola tasa ─────────────────────────

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
    -- Cambio 1: una sola transferencia, una sola tasa.
    if (select count(distinct p.tasa_aplicada) from pagos p where p.grupo_id = g.grupo_id) > 1 then
      raise exception 'Un pago agrupado es una sola transferencia: todas sus partes tienen que llevar la misma tasa.';
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

-- 4. Cambiar la tasa de un pago ya registrado ───────────────────────────────
-- SECURITY INVOKER: escribe con la política pagos_escribir de quien llama.

create function public.ajustar_tasa_pago(
  p_pago uuid,
  p_tasa numeric,
  p_motivo text default null,
  p_detalle text default null
) returns void
    language plpgsql
    set search_path to public, pg_temp
    as $function$
declare
  v_pago pagos%rowtype;
  v_ids uuid[];
  v_tasa numeric; v_total numeric; v_suma numeric; v_mayor uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;

  select * into v_pago from pagos where id = p_pago;
  if not found then
    raise exception 'Ese pago no existe.';
  end if;
  if not puede_operar(v_pago.org_id) then
    raise exception 'Solo la administración puede cambiar la tasa de un pago.';
  end if;
  if v_pago.moneda <> 'VES' then
    raise exception 'Ese pago es en dólares: no lleva tasa.';
  end if;
  if v_pago.estado = 'anulado' then
    raise exception 'Ese pago está anulado.';
  end if;

  -- El pago con todo su grupo, bloqueado mientras se cambia.
  select array_agg(x.id) into v_ids
    from (select p.id from pagos p
           where p.id = v_pago.id
              or (v_pago.grupo_id is not null and p.grupo_id = v_pago.grupo_id)
             for update) x;

  if exists (select 1 from pagos p where p.id = any(v_ids) and p.periodo_cierre_id is not null) then
    raise exception 'Ese pago ya está dentro de un cierre: su tasa no se puede cambiar. Registre un ajuste.';
  end if;

  if p_tasa is null then
    -- Volver a la del BCV de la fecha del pago.
    update pagos p
       set tasa_manual = false, tasa_motivo = null, tasa_motivo_detalle = null
     where p.id = any(v_ids);
  else
    update pagos p
       set tasa_manual = true,
           tasa_aplicada = p_tasa,
           tasa_motivo = p_motivo,
           tasa_motivo_detalle = p_detalle
     where p.id = any(v_ids);
  end if;

  -- Un grupo: cada parte a centavos y la diferencia a la más grande (la misma
  -- regla de pagos_grupo_al_insertar).
  if v_pago.grupo_id is not null then
    select max(p.tasa_aplicada), sum(p.monto) into v_tasa, v_total
      from pagos p where p.id = any(v_ids);
    if coalesce(v_tasa, 0) > 0 then
      update pagos p set monto_usd = round(p.monto / v_tasa, 2) where p.id = any(v_ids);
      select sum(p.monto_usd) into v_suma from pagos p where p.id = any(v_ids);
      select p.id into v_mayor from pagos p where p.id = any(v_ids)
       order by p.monto desc, p.id limit 1;
      update pagos p set monto_usd = p.monto_usd + (round(v_total / v_tasa, 2) - v_suma)
       where p.id = v_mayor;
    end if;
  end if;
end $function$;

comment on function public.ajustar_tasa_pago(uuid, numeric, text, text) is
  'Cambia la tasa de un pago en Bs (con todo su grupo) mientras no esté en un cierre. p_tasa null = volver a la del BCV.';

revoke all on function public.ajustar_tasa_pago(uuid, numeric, text, text) from public, anon;
grant execute on function public.ajustar_tasa_pago(uuid, numeric, text, text) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas y CHECK:
--    select count(*) from information_schema.columns
--     where table_schema = 'public' and table_name = 'pagos'
--       and column_name like 'tasa\_%' escape '\';                       → 6
--    select count(*) from pg_constraint where conname = 'pago_tasa_manual_coherente'; → 1
-- 2. Ningún pago existente quedó marcado:
--    select count(*) from pagos where tasa_manual;                          → 0
-- 3. El disparador corre con las columnas nuevas:
--    select pg_get_triggerdef(oid) from pg_trigger where tgname = 'pagos_convierte';
--    → … UPDATE OF monto, moneda, fecha, tasa_aplicada, tasa_manual, …
-- 4. Permisos de la función nueva:
--    select has_function_privilege('anon', 'public.ajustar_tasa_pago(uuid,numeric,text,text)', 'execute'); → f
--    select has_function_privilege('authenticated', 'public.ajustar_tasa_pago(uuid,numeric,text,text)', 'execute'); → t
-- 5. Sin «\r»:
--    select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--       and position(chr(13) in prosrc) > 0;                                 → 0
-- 6. Casos (en pruebas, dentro de begin; … rollback;, con la sesión de un
--    administrador y la de un residente de la organización de prueba):
--    a. Admin inserta un pago VES con tasa_manual, tasa_aplicada creíble y
--       motivo 'acuerdo_propietario' → tasa_aplicada es la enviada,
--       monto_usd = round(monto / tasa, 4), tasa_ajustada_por = su uid.
--    b. Igual con motivo 'otro' y sin detalle → error del CHECK.
--    c. Tasa menor que la mitad de la del BCV → «no es creíble».
--    d. Residente inserta con tasa_manual → «Solo la administración…».
--    e. Pago VES sin tasa_manual → igual que antes (tasa_del_dia(fecha)).
--    f. ajustar_tasa_pago sobre un pago conciliado sin cierre → cambia;
--       con null → vuelve a tasa_del_dia(fecha) y limpia el motivo.
--    g. ajustar_tasa_pago sobre un pago con periodo_cierre_id → error.
--    h. Grupo de 2 partes: ajustar_tasa_pago sobre una → las dos cambian y
--       la suma de monto_usd = round(total / tasa, 2).
--    i. Insertar un grupo con dos tasas distintas → error del grupo.
