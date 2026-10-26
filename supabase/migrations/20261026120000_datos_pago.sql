-- Datos para pagar, por edificio (ronda 7, bloque 2), y el correo del recibo
-- con esos datos, el monto en Bs a la tasa del día y la fecha de esa tasa.
--
-- Aplicada en vecitap-pruebas el 26-oct, con `execute_sql`. El cuerpo de
-- cada función quedó verificado por md5(prosrc) contra este archivo. SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo
-- previo (docs/respaldo.md), después de la revisión cruzada. Es la primera de
-- las migraciones de la ronda 7; no depende de las pendientes de rondas
-- anteriores. Rollback: supabase/rollbacks/20261026120000_datos_pago_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabla `datos_pago`: las cuentas donde se le paga a un edificio.
--    destino  'condominio' | 'honorarios' (a qué cuenta va cada parte)
--    tipo     'transferencia' | 'pago_movil' | 'otro'
--    banco, titular, documento (RIF o cédula), cuenta (número de cuenta o
--    teléfono del pago móvil), nota, orden.
--    · Escribe solo `puede_operar(org_id)` (propietario de la cuenta y
--      administrador), y lo ve también el operador de Vecitap.
--    · El residente NO lee la tabla: lee los datos de SU edificio con
--      `datos_pago_de(p_unidad)` (SECURITY DEFINER, acotada a
--      `unidades_visibles()`), que además le dice cuánto va a cada cuenta.
--    · Disparador de coherencia: el edificio tiene que ser de la misma
--      organización que la fila (mismo patrón que
--      20260930140000_vinculos_org_coherente.sql, sin SECURITY DEFINER). Y
--      del otro lado, un edificio con datos para pagar no cambia de
--      organización.
-- 2. `datos_pago_html()` / `datos_pago_texto()`: el bloque «Datos para pagar»
--    del correo, armado en un solo lugar.
-- 3. `correo_recibo()` (con guarda md5 sobre el cuerpo de antes):
--    · el total en USD;
--    · el monto en Bs calculado con la tasa del día en que se encola, tomada
--      de `tasas_bcv` con su fecha (la última cargada hasta hoy, hora de
--      Venezuela), redondeado hacia arriba al céntimo como en «Reportar un
--      pago» (lib/residente/monto-exacto.ts), con la frase «Calculado a la
--      tasa oficial BCV del dólar del [fecha]. Si paga en bolívares, use la
--      tasa BCV del día en que pague.». Antes usaba la tasa del recibo;
--    · los datos para pagar;
--    · sin desglose y sin PDF (como antes).
--    Todo lo demás queda igual: destinatarios, asunto, la nota de la
--    administración, el vencimiento y el botón.
--
-- ─────────────────────────────────────────────────────────────────────────
-- A QUÉ CUENTA VA CADA PARTE (decisión por defecto de Nicolás, 26-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- `honorario` y `anterior_hon` van a la cuenta de honorarios; todo lo demás,
-- servicio incluido, va a la de condominio. Si el edificio no tiene cuenta
-- de honorarios, todo va a la de condominio.
--   En el recibo: honorarios = least(greatest(honorario + anterior_hon, 0),
--   total); condominio = total − honorarios.
--   En el saldo de hoy (`datos_pago_de`): honorarios = least(greatest(
--   administracion, 0), total); condominio = total − honorarios.
-- La misma regla está en lib/datos-pago.ts para el recibo impreso.

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- GUARDA · `correo_recibo()` tiene que ser la de antes
-- ═════════════════════════════════════════════════════════════════════════
do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.correo_recibo(uuid)'::regprocedure;
  if v is distinct from '343c43e80fcefb7c62f9f3b728e19e6b' then
    raise exception 'ABORTADA: correo_recibo() cambió (md5(prosrc)=%). Esta migración la reescribe entera a partir del cuerpo del 26-oct: rehaga el cambio sobre la versión actual.', v;
  end if;
  if to_regclass('public.datos_pago') is not null then
    raise exception 'ABORTADA: la tabla datos_pago ya existe.';
  end if;
end
$guarda$;

-- ── 1. La tabla ─────────────────────────────────────────────────────────
create table public.datos_pago (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizaciones(id) on delete cascade,
  edificio_id uuid not null references public.edificios(id) on delete cascade,
  destino     text not null default 'condominio' check (destino in ('condominio', 'honorarios')),
  tipo        text not null default 'transferencia' check (tipo in ('transferencia', 'pago_movil', 'otro')),
  banco       text check (banco is null or char_length(banco) <= 120),
  titular     text check (titular is null or char_length(titular) <= 160),
  documento   text check (documento is null or char_length(documento) <= 40),
  cuenta      text check (cuenta is null or char_length(cuenta) <= 60),
  nota        text check (nota is null or char_length(nota) <= 300),
  orden       integer not null default 0,
  creado_en   timestamptz not null default now(),
  -- Una fila sin nada que decir no sirve en un recibo.
  constraint datos_pago_con_algo check (coalesce(btrim(cuenta), '') <> '' or coalesce(btrim(nota), '') <> '')
);

create index datos_pago_edificio on public.datos_pago (edificio_id, destino, orden);

comment on table public.datos_pago is
  'Cuentas donde se le paga a un edificio (ronda 7). Escribe puede_operar; el '
  'residente lee las de su edificio con datos_pago_de(). Ver '
  'supabase/migrations/20261026120000_datos_pago.sql.';

-- El edificio tiene que ser de la misma organización (SECURITY INVOKER: quien
-- escribe pasa puede_operar(new.org_id) y por eso ve todos los edificios de
-- esa organización; si el edificio es de otra, no lo encuentra y se rechaza).
create function public.datos_pago_edificio_misma_org() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if not exists (
       select 1 from public.edificios e
        where e.id = new.edificio_id
          and e.org_id = new.org_id) then
    raise exception 'El edificio de estos datos para pagar no pertenece a la misma organización.'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $function$;

create trigger datos_pago_edificio_misma_org
  before insert or update of edificio_id, org_id on public.datos_pago
  for each row execute function public.datos_pago_edificio_misma_org();

create function public.edificios_org_con_datos_pago() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if exists (
       select 1 from public.datos_pago d
        where d.edificio_id = new.id
          and d.org_id <> new.org_id) then
    raise exception 'El edificio % tiene datos para pagar de su organización: no se puede pasar a otra.', new.nombre
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $function$;

create trigger edificios_org_con_datos_pago
  before update of org_id on public.edificios
  for each row
  when (new.org_id is distinct from old.org_id)
  execute function public.edificios_org_con_datos_pago();

revoke all on function public.datos_pago_edificio_misma_org() from public, anon, authenticated;
revoke all on function public.edificios_org_con_datos_pago() from public, anon, authenticated;

alter table public.datos_pago enable row level security;

create policy datos_pago_ver on public.datos_pago
  for select to authenticated
  using (public.puede_operar(org_id) or public.es_operador());

create policy datos_pago_escribir on public.datos_pago
  for all to authenticated
  using (public.puede_operar(org_id))
  with check (public.puede_operar(org_id));

-- Igual que notas_unidad: sin TRUNCATE/REFERENCES/TRIGGER para authenticated.
revoke all on public.datos_pago from anon, authenticated;
grant select, insert, update, delete on public.datos_pago to authenticated;

-- ── 2. Lo que ve el residente ───────────────────────────────────────────
-- Las cuentas del edificio de la unidad y, en `monto`, cuánto va a cada una
-- según el saldo de hoy. `monto` es null si la base no le muestra el saldo a
-- quien pregunta (saldo_visible() = null: inquilino en una unidad con
-- inquilino_ve = 'mes').
create function public.datos_pago_de(p_unidad uuid)
  returns table(destino text, tipo text, banco text, titular text, documento text,
                cuenta text, nota text, orden integer, monto numeric)
  language plpgsql
  stable security definer
  set search_path to 'public'
  as $function$
declare
  v_edificio uuid; v_total numeric; v_adm numeric; v_hon numeric; v_hay_hon boolean;
begin
  if p_unidad not in (select unidades_visibles()) then
    raise exception 'Sin acceso a esa unidad';
  end if;
  select u.edificio_id into v_edificio from unidades u where u.id = p_unidad;

  v_total := saldo_visible(p_unidad);
  select exists (select 1 from datos_pago d where d.edificio_id = v_edificio and d.destino = 'honorarios')
    into v_hay_hon;
  if v_total is not null then
    select s.administracion into v_adm from saldo_unidad(p_unidad) s;
    v_total := greatest(v_total, 0);
    v_hon := case when v_hay_hon then least(greatest(coalesce(v_adm, 0), 0), v_total) else 0 end;
  end if;

  return query
    select d.destino, d.tipo, d.banco, d.titular, d.documento, d.cuenta, d.nota, d.orden,
           case when v_total is null then null
                when d.destino = 'honorarios' then round(v_hon, 2)
                else round(v_total - v_hon, 2) end
      from datos_pago d
     where d.edificio_id = v_edificio
     order by case d.destino when 'condominio' then 1 else 2 end, d.orden, d.creado_en;
end $function$;

revoke all on function public.datos_pago_de(uuid) from public, anon;
grant execute on function public.datos_pago_de(uuid) to authenticated;

-- ── 3. El bloque del correo ─────────────────────────────────────────────
-- p_cond / p_hon: cuánto va a cada cuenta (USD). p_tasa: Bs por dólar (null =
-- sin bolívares). p_con_bs: false oculta los bolívares (lo usa el bloque 4).
create function public.datos_pago_html(p_edificio uuid, p_cond numeric, p_hon numeric,
                                       p_tasa numeric, p_con_bs boolean)
  returns text
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v_html text := ''; v_cuentas text; v_dest text; v_monto numeric; v_hay_hon boolean; d record;
begin
  select exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'honorarios')
    into v_hay_hon;
  if not exists (select 1 from datos_pago x where x.edificio_id = p_edificio) then
    return '';
  end if;

  foreach v_dest in array array['condominio', 'honorarios'] loop
    continue when v_dest = 'honorarios' and not v_hay_hon;
    v_cuentas := '';
    for d in select * from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest
              order by x.orden, x.creado_en loop
      v_cuentas := v_cuentas || format(
        '<div style="border-top:1px solid #E6E3EC;padding:8px 0;font-size:13px;line-height:1.55;color:#111144">'
        '<b>%s</b>%s%s%s%s%s</div>',
        case d.tipo when 'pago_movil' then 'Pago móvil' when 'otro' then 'Otro' else 'Transferencia' end,
        case when coalesce(btrim(d.banco), '') <> '' then ' · ' || esc_html(d.banco) else '' end,
        case when coalesce(btrim(d.titular), '') <> '' then '<br>Titular: ' || esc_html(d.titular) else '' end,
        case when coalesce(btrim(d.documento), '') <> '' then '<br>RIF/CI: ' || esc_html(d.documento) else '' end,
        case when coalesce(btrim(d.cuenta), '') <> '' then
          '<br>' || case d.tipo when 'pago_movil' then 'Teléfono' else 'Cuenta' end
          || ': <span style="font-family:ui-monospace,Menlo,Consolas,monospace">' || esc_html(d.cuenta) || '</span>'
          else '' end,
        case when coalesce(btrim(d.nota), '') <> '' then
          '<br><span style="color:#66668A">' || esc_html(d.nota) || '</span>' else '' end);
    end loop;
    continue when v_cuentas = '';

    v_monto := case when v_dest = 'honorarios' then p_hon
                    when v_hay_hon then p_cond else p_cond + p_hon end;
    v_html := v_html || format(
      '<div style="margin-top:10px"><div style="font-size:12px;color:#3D3D6B;font-weight:700">%s%s</div>%s</div>',
      case when v_hay_hon then case v_dest when 'honorarios' then 'Honorarios de administración'
                                           else 'Condominio' end
           else 'Cuenta del condominio' end,
      case when v_monto is null then ''
           else ': $ ' || fmt_monto(v_monto)
                || case when p_con_bs and coalesce(p_tasa, 0) > 0
                        then ' (Bs ' || fmt_monto(ceil(v_monto * p_tasa * 100) / 100) || ')' else '' end end,
      v_cuentas);
  end loop;

  return format(
    '<div style="border:1px solid #E6E3EC;border-radius:10px;padding:12px 14px;margin-bottom:18px">'
    '<div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#66668A;font-weight:700">Datos para pagar</div>'
    '%s</div>', v_html);
end $function$;

create function public.datos_pago_texto(p_edificio uuid, p_cond numeric, p_hon numeric)
  returns text
  language plpgsql
  stable
  set search_path to 'public'
  as $function$
declare
  v text := ''; v_dest text; v_hay_hon boolean; v_monto numeric; d record;
begin
  select exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = 'honorarios')
    into v_hay_hon;
  foreach v_dest in array array['condominio', 'honorarios'] loop
    continue when v_dest = 'honorarios' and not v_hay_hon;
    continue when not exists (select 1 from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest);
    v_monto := case when v_dest = 'honorarios' then p_hon
                    when v_hay_hon then p_cond else p_cond + p_hon end;
    v := v || E'\n' || case when v_hay_hon then case v_dest when 'honorarios' then 'Honorarios de administración'
                                                         else 'Condominio' end
                            else 'Cuenta del condominio' end
           || case when v_monto is null then '' else ': $ ' || fmt_monto(v_monto) end || E'\n';
    for d in select * from datos_pago x where x.edificio_id = p_edificio and x.destino = v_dest
              order by x.orden, x.creado_en loop
      v := v || '- ' || concat_ws(' · ',
             case d.tipo when 'pago_movil' then 'Pago móvil' when 'otro' then 'Otro' else 'Transferencia' end,
             nullif(btrim(coalesce(d.banco, '')), ''),
             case when coalesce(btrim(d.titular), '') <> '' then 'Titular: ' || btrim(d.titular) end,
             case when coalesce(btrim(d.documento), '') <> '' then 'RIF/CI: ' || btrim(d.documento) end,
             case when coalesce(btrim(d.cuenta), '') <> '' then
               case d.tipo when 'pago_movil' then 'Teléfono: ' else 'Cuenta: ' end || btrim(d.cuenta) end,
             nullif(btrim(coalesce(d.nota, '')), '')) || E'\n';
    end loop;
  end loop;
  return case when v = '' then '' else E'\nDatos para pagar:' || v end;
end $function$;

revoke all on function public.datos_pago_html(uuid, numeric, numeric, numeric, boolean) from public, anon, authenticated;
revoke all on function public.datos_pago_texto(uuid, numeric, numeric) from public, anon, authenticated;

-- ── 4. El correo del recibo ─────────────────────────────────────────────
create or replace function public.correo_recibo(p_recibo uuid)
 RETURNS TABLE(rol text, destino text, responder_a text, asunto text, html text, texto text, org_id uuid, unidad_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record; d record;
  v_enlace text; v_total text; v_bs text; v_vence text;
  v_nota text; v_nota_html text; v_nota_txt text;
  -- Ronda 7 (bloque 2): la tasa del día en que se encola, con su fecha, y
  -- cuánto va a cada cuenta.
  v_tasa numeric; v_tasa_fecha date; v_frase text;
  v_hon numeric; v_cond numeric; v_pago_html text; v_pago_txt text;
begin
  select rc.id, rc.numero, rc.total, rc.org_id, rc.unidad_id, rc.vence_el,
         rc.honorario, rc.anterior_hon, u.edificio_id,
         u.codigo, o.nombre as org, e.nombre as edificio,
         p.etiqueta, p.tasa_bcv,
         ac.remitente, ac.responder_a, ac.enlace_base, ac.nota, ac.nota_hasta
    into r
    from recibos rc
    join unidades u        on u.id = rc.unidad_id
    join edificios e       on e.id = u.edificio_id
    join organizaciones o  on o.id = rc.org_id
    join periodos p        on p.id = rc.periodo_id
    left join ajustes_correo ac on ac.org_id = rc.org_id
   where rc.id = p_recibo;

  if r.id is null then raise exception 'Ese recibo no existe'; end if;

  v_enlace := coalesce(r.enlace_base,
                       (select valor from secretos where nombre = 'correo_enlace'));
  v_total  := '$ ' || fmt_monto(r.total);

  -- La última tasa cargada hasta hoy (día de Venezuela), con su fecha. No la
  -- del recibo: lo que se paga en bolívares se convierte con la del día.
  select t.tasa, t.fecha into v_tasa, v_tasa_fecha
    from tasas_bcv t where t.fecha <= hoy_local()
   order by t.fecha desc limit 1;
  v_bs := case when coalesce(v_tasa, 0) > 0
               then 'Bs ' || fmt_monto(ceil(r.total * v_tasa * 100) / 100) else null end;
  v_frase := case when v_bs is null then null else format(
    'Calculado a la tasa oficial BCV del dólar del %s. Si paga en bolívares, use la tasa BCV del día en que pague.',
    to_char(v_tasa_fecha, 'DD/MM/YYYY')) end;

  v_vence  := case when r.vence_el is not null
                   then to_char(r.vence_el, 'DD/MM/YYYY') else null end;

  -- A qué cuenta va cada parte (ver la cabecera de la migración).
  v_hon  := case when exists (select 1 from datos_pago x where x.edificio_id = r.edificio_id and x.destino = 'honorarios')
                 then least(greatest(coalesce(r.honorario, 0) + coalesce(r.anterior_hon, 0), 0), greatest(r.total, 0))
                 else 0 end;
  v_cond := greatest(r.total, 0) - v_hon;
  v_pago_html := datos_pago_html(r.edificio_id, v_cond, v_hon, v_tasa, true);
  v_pago_txt  := datos_pago_texto(r.edificio_id, v_cond, v_hon);

  -- La nota caduca sola si le pusieron fecha
  v_nota := nullif(btrim(coalesce(r.nota, '')), '');
  if v_nota is not null and r.nota_hasta is not null and r.nota_hasta < current_date then
    v_nota := null;
  end if;

  v_nota_html := case when v_nota is null then '' else format(
    '<div style="background:#FDEDDC;border-radius:10px;padding:13px 15px;margin-bottom:18px">'
    '<div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;'
    'color:#8A5A00;font-weight:700;margin-bottom:4px">De su administración</div>'
    '<div style="font-size:13.5px;line-height:1.6;color:#111144">%s</div></div>',
    replace(esc_html(v_nota), E'\n', '<br>')) end;

  v_nota_txt := case when v_nota is null then ''
                     else E'\n--\n' || v_nota || E'\n--\n' end;

  for d in
    select * from destinatarios_de(r.unidad_id)
     where enviar and correo is not null
  loop
    rol := d.rol;
    destino := d.correo;
    responder_a := r.responder_a;
    asunto := format('Su recibo de condominio · %s · %s', r.codigo, r.etiqueta);
    org_id := r.org_id;
    unidad_id := r.unidad_id;

    html := format($h$<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F1EC;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111144">
<div style="max-width:560px;margin:0 auto;padding:24px 18px">
  <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#66668A;font-weight:700">%s</div>
  <div style="font-size:19px;font-weight:700;margin:2px 0 18px">%s</div>
  <div style="background:#fff;border:1px solid #E6E3EC;border-radius:14px;padding:20px">
    <p style="margin:0 0 6px;font-size:15px">%s,</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3D3D6B">
      Ya está disponible el recibo de condominio de <b>%s</b> para la unidad <b>%s</b>.</p>
    %s
    <div style="background:#F4F1EC;border-radius:10px;padding:14px 16px;margin-bottom:18px">
      <div style="font-size:12px;color:#3D3D6B">Total a pagar</div>
      <div style="font-size:26px;font-weight:700">%s</div>
      %s
      %s
      <div style="font-size:12px;color:#66668A;margin-top:6px">Recibo %s</div>
    </div>
    %s
    <a href="%s" style="display:block;text-align:center;background:#F98513;color:#111144;
      text-decoration:none;font-weight:700;font-size:15px;padding:14px 18px;border-radius:10px">
      Ver mi recibo y reportar mi pago</a>
    <p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:#66668A">
      Desde ahí ve el desglose completo, su saldo al día de hoy, y puede reportar su pago
      con la foto del comprobante. Si es la primera vez que entra, use este mismo correo
      para crear su clave.</p>
  </div>
  <p style="font-size:11.5px;color:#66668A;line-height:1.6;margin-top:16px">
    Este aviso lo envía %s a través de Vecitap.</p>
</div></body></html>$h$,
      esc_html(r.org), esc_html(r.edificio),
      esc_html(coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino')),
      esc_html(r.etiqueta), esc_html(r.codigo),
      v_nota_html,
      v_total,
      case when v_bs is null then ''
           else format('<div style="font-size:15px;font-weight:700;margin-top:2px">%s</div>'
                       '<div style="font-size:12px;color:#66668A;line-height:1.5;margin-top:2px">%s</div>',
                       v_bs, esc_html(v_frase)) end,
      case when v_vence is null then ''
           else format('<div style="font-size:12.5px;color:#8A5A00;margin-top:6px">Vence el %s</div>', v_vence) end,
      esc_html(r.numero),
      v_pago_html,
      esc_html(v_enlace), esc_html(r.org));

    texto := format($t$%s,

Ya está disponible el recibo de condominio de %s para la unidad %s.
%s
Total a pagar: %s%s
Recibo: %s%s
%s
Véalo y reporte su pago aquí:
%s

%s$t$,
      coalesce(nullif(btrim(d.nombre), ''), 'Estimado vecino'), r.etiqueta, r.codigo,
      v_nota_txt,
      v_total,
      case when v_bs is null then '' else E'\n' || v_bs || E'\n' || v_frase end,
      r.numero,
      case when v_vence is null then '' else E'\nVence el ' || v_vence end,
      v_pago_txt,
      v_enlace, r.org);

    return next;
  end loop;
end $function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) La tabla, con RLS y sus dos políticas; los dos disparadores:
--      select relrowsecurity from pg_class where oid = 'public.datos_pago'::regclass;  -- true
--      select policyname, cmd from pg_policies where tablename = 'datos_pago';
--      -- datos_pago_escribir ALL, datos_pago_ver SELECT
--      select tgname from pg_trigger
--       where tgname in ('datos_pago_edificio_misma_org', 'edificios_org_con_datos_pago');  -- 2 filas
--
-- 2) La guarda de coherencia, sin dejar rastro (un edificio de la org A con
--    el org_id de la org B):
--      begin;
--      insert into public.datos_pago (org_id, edificio_id, cuenta)
--      values ('<org B>', '<edificio de la org A>', '0102-0000');
--      rollback;
--      -- ERROR: El edificio de estos datos para pagar no pertenece a la misma organización.
--
-- 3) El correo, en una transacción deshecha: cargar una cuenta de condominio
--    y una de honorarios a un edificio con recibos y mirar el correo:
--      begin;
--      insert into public.datos_pago (org_id, edificio_id, destino, tipo, banco, titular, documento, cuenta)
--      select e.org_id, e.id, 'condominio', 'transferencia', 'Banco Prueba', 'Junta Prueba', 'J-00000000-0', '0102-0000-00-0000000000'
--        from public.edificios e where e.id = '<edificio>';
--      insert into public.datos_pago (org_id, edificio_id, destino, tipo, banco, titular, documento, cuenta)
--      select e.org_id, e.id, 'honorarios', 'pago_movil', 'Banco Prueba', 'Admin Prueba', 'J-11111111-1', '0414-0000000'
--        from public.edificios e where e.id = '<edificio>';
--      select destino, position('Datos para pagar' in html) > 0 as con_datos,
--             position('Calculado a la tasa oficial BCV del dólar del' in html) > 0 as con_frase
--        from public.correo_recibo('<recibo de ese edificio>');
--      rollback;
--      -- con_datos y con_frase = true en cada destinatario.
--
-- 4) El md5 nuevo, para la próxima guarda:
--      select md5(prosrc) from pg_proc where oid = 'public.correo_recibo(uuid)'::regprocedure;
