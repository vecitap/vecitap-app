-- Cobro solo en dólares, por organización (ronda 7, bloque 4).
--
-- Aplicada en vecitap-pruebas el 26-oct, con `execute_sql`. El cuerpo de
-- cada función quedó verificado por md5(prosrc) contra este archivo. SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo
-- previo, después de la revisión cruzada. **Va después de
-- 20261026130000_invitacion_en_recibo.sql** (reescribe su `correo_recibo()`;
-- la guarda aborta si no). Rollback:
-- supabase/rollbacks/20261026140000_cobro_solo_usd_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabla `ajustes_cobro`: una fila por organización con cómo cobra.
--    Empieza con `solo_usd` (apagado por defecto: sin fila = apagado). El
--    bloque 6 le agrega el redondeo de cuotas.
--    · Escribe `puede_operar(org_id)` (propietario de la cuenta y
--      administrador). No es `organizaciones` porque ahí solo escribe la
--      propietaria de la cuenta (política org_editar) y la administradora
--      también tiene que poder cambiarlo.
--    · La lee cualquier miembro de la organización (`orgs_del_usuario()`),
--      residentes incluidos: el portal la necesita para ocultar los
--      bolívares. No tiene nada privado.
-- 2. Encendido, la base:
--    · no deja que un residente reporte un pago en bolívares (disparador
--      `pago_solo_usd`; la administradora sí puede registrarlo, por si
--      igual le llega una transferencia en Bs);
--    · el correo del recibo sale sin bolívares: ni el monto en Bs, ni la
--      frase de la tasa, ni los Bs de los datos para pagar.
--    El portal, el recibo impreso y el formulario los oculta la app.
-- 3. Apagado (o sin fila), todo sigue como hoy.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.correo_recibo(uuid)'::regprocedure;
  if v is distinct from '3ad164ea3c94e736f21e5b2ccf71bae9' then
    raise exception 'ABORTADA: correo_recibo() no es la de 20261026130000_invitacion_en_recibo.sql (md5(prosrc)=%). Aplique antes esa migración.', v;
  end if;
  if to_regclass('public.ajustes_cobro') is not null then
    raise exception 'ABORTADA: la tabla ajustes_cobro ya existe.';
  end if;
end
$guarda$;

-- ── 1. La tabla ─────────────────────────────────────────────────────────
create table public.ajustes_cobro (
  org_id          uuid primary key references public.organizaciones(id) on delete cascade,
  solo_usd        boolean not null default false,
  actualizado_en  timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
comment on table public.ajustes_cobro is
  'Cómo cobra cada organización (ronda 7): solo_usd. Sin fila = como siempre. '
  'Ver supabase/migrations/20261026140000_cobro_solo_usd.sql.';

alter table public.ajustes_cobro enable row level security;

create policy ajustes_cobro_ver on public.ajustes_cobro
  for select to authenticated
  using (org_id in (select public.orgs_del_usuario()) or public.es_operador());

create policy ajustes_cobro_escribir on public.ajustes_cobro
  for all to authenticated
  using (public.puede_operar(org_id))
  with check (public.puede_operar(org_id));

revoke all on public.ajustes_cobro from anon, authenticated;
grant select, insert, update, delete on public.ajustes_cobro to authenticated;

-- ── 2. El residente no reporta en bolívares si se cobra solo en dólares ─
-- SECURITY INVOKER: quien inserta es miembro de la organización (si no, RLS
-- de pagos ya lo rechaza) y por eso ve su fila de ajustes_cobro.
create function public.pago_solo_usd() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if new.moneda = 'VES'
     and coalesce((select a.solo_usd from public.ajustes_cobro a where a.org_id = new.org_id), false)
     and not public.puede_operar(new.org_id) then
    raise exception 'Su administración cobra solo en dólares: reporte el pago en dólares.';
  end if;
  return new;
end $function$;

revoke all on function public.pago_solo_usd() from public, anon, authenticated;

create trigger pagos_solo_usd
  before insert on public.pagos
  for each row execute function public.pago_solo_usd();

-- ── 3. El correo del recibo ─────────────────────────────────────────────
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
  -- Ronda 7 (bloque 3): el código de invitación de quien no tiene acceso.
  v_origen text; v_codigo text; v_link text; v_inv_html text; v_inv_txt text;
  -- Ronda 7 (bloque 4): la organización cobra solo en dólares.
  v_solo_usd boolean;
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
  -- https://vecitap.com/mi → https://vecitap.com (el enlace de crear usuario va a /entrar).
  v_origen := coalesce(substring(v_enlace from '^(https?://[^/]+)'), v_enlace);

  -- La última tasa cargada hasta hoy (día de Venezuela), con su fecha. No la
  -- del recibo: lo que se paga en bolívares se convierte con la del día.
  select t.tasa, t.fecha into v_tasa, v_tasa_fecha
    from tasas_bcv t where t.fecha <= hoy_local()
   order by t.fecha desc limit 1;
  v_solo_usd := coalesce((select a.solo_usd from ajustes_cobro a where a.org_id = r.org_id), false);
  -- Solo en dólares: sin el monto en bolívares (y sin la frase de la tasa).
  v_bs := case when coalesce(v_tasa, 0) > 0 and not v_solo_usd
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
  v_pago_html := datos_pago_html(r.edificio_id, v_cond, v_hon, v_tasa, not v_solo_usd);
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

    -- null: ya tiene acceso (o no hay invitación); '': tiene una pendiente
    -- sin el código guardado (anterior a la ronda 7).
    v_codigo := codigo_invitacion_vigente(r.unidad_id, d.correo);
    v_link := case when coalesce(v_codigo, '') <> ''
                   then v_origen || '/entrar?volver=%2Fmi%2Fagregar%3Fcodigo%3D' || v_codigo end;
    v_inv_html := case
      when v_codigo is null then ''
      when v_codigo = '' then
        '<div style="background:#EEF2F7;border-radius:10px;padding:13px 15px;margin-bottom:18px;font-size:13px;line-height:1.6;color:#111144">'
        'Para entrar a la app, use el código de invitación que le envió su administración.</div>'
      else format(
        '<div style="background:#EEF2F7;border-radius:10px;padding:13px 15px;margin-bottom:18px">'
        '<div style="font-size:14px;font-weight:700;color:#111144">Todavía no tiene usuario en la app</div>'
        '<div style="font-size:13px;line-height:1.6;color:#3D3D6B;margin-top:4px">Cree su usuario con este correo (%s) y pegue este código de invitación:</div>'
        '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:#fff;border:1px solid #E6E3EC;border-radius:8px;padding:8px 10px;margin:8px 0;word-break:break-all">%s</div>'
        '<a href="%s" style="color:#111144;font-weight:700;font-size:14px">Crear mi usuario</a></div>',
        esc_html(d.correo), esc_html(v_codigo), esc_html(v_link)) end;
    v_inv_txt := case
      when v_codigo is null then ''
      when v_codigo = '' then E'\nPara entrar a la app, use el código de invitación que le envió su administración.\n'
      else E'\nTodavía no tiene usuario en la app. Cree su usuario con este correo (' || d.correo
           || E') y pegue este código de invitación:\n' || v_codigo || E'\nCrear mi usuario: ' || v_link || E'\n' end;

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
      v_inv_html,
      esc_html(v_enlace), esc_html(r.org));

    texto := format($t$%s,

Ya está disponible el recibo de condominio de %s para la unidad %s.
%s
Total a pagar: %s%s
Recibo: %s%s
%s%s
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
      v_inv_txt,
      v_enlace, r.org);

    return next;
  end loop;
end $function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) select policyname, cmd from pg_policies where tablename = 'ajustes_cobro';
--    -- ajustes_cobro_escribir ALL, ajustes_cobro_ver SELECT
-- 2) En una transacción deshecha: encender solo_usd para una organización
--    con recibos y mirar el correo; tiene que salir sin «Bs »:
--      begin;
--      insert into public.ajustes_cobro (org_id, solo_usd) values ('<org>', true);
--      select destino, position('Bs ' in html) = 0 as sin_bs from public.correo_recibo('<recibo>');
--      rollback;
-- 3) En una transacción deshecha, como un residente de esa organización con
--    solo_usd encendido: insertar un pago en 'VES' da
--    «Su administración cobra solo en dólares…».
