-- Cambio 3 del feedback de ING3: trabajar sin internet (parte D, Garita).
-- Plan: docs/plan-sin-conexion.md, 10.5 (aprobado por Nicolás el 18-nov:
-- «al final son visitas… sí podríamos guardar de forma resumida los códigos
-- del día»). Rollback:
-- supabase/rollbacks/20261118150000_garita_sin_conexion_rollback.sql.
--
-- SIN APLICAR en vecitap-produccion: la aplica Nicolás, con respaldo previo,
-- junto con el resto del cambio 3 (después de 20261118140000).
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
-- 1. garita_lista_del_dia(p_edificio): las invitaciones de ese edificio que
--    valen hoy (o empiezan en las próximas 24 h), para que el equipo de la
--    garita pueda validar sin conexión. El código NO viaja: va su resumen
--    (sha256 en hexadecimal). La garita comprueba un código que le muestran
--    calculando el mismo resumen; no puede leer la lista de códigos. Los
--    códigos son 16 caracteres hexadecimales al azar (64 bits): no se pueden
--    adivinar probando a partir del resumen.
-- 2. visitas.id_equipo (unique) y visitas.hecho_en: como en la parte B, para
--    que un reintento no duplique y para guardar la hora real.
-- 3. garita_entrada_diferida(): la entrada hecha sin conexión, al llegar.
--    Misma lógica que garita_entrada(), con tres diferencias:
--      · la invitación se juzga a la hora en que la persona entró (hecho_en),
--        no a la hora de llegada;
--      · si al llegar la invitación ya no vale (la anularon, venció o ya se
--        usó en otra puerta), la entrada se registra igual —la persona ya
--        entró— y queda una novedad en la bitácora para la administración;
--      · con el mismo id_equipo devuelve la visita que ya estaba.
-- 4. garita_salida_diferida(): la salida hecha sin conexión, con su hora. La
--    visita se busca por id o, si la entrada también se hizo sin conexión,
--    por su id_equipo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD (familia de revisión cuidadosa de Garita, AGENTS.md)
-- ─────────────────────────────────────────────────────────────────────────
-- · Las tres funciones nuevas autorizan con permitir_garita(), igual que las
--   de hoy. NO se toca permitir_garita, puede_garita, edificios_del_vigilante
--   ni garita_entrada/garita_salida: sus md5 no cambian.
-- · SECURITY DEFINER con search_path fijo (como el resto del módulo: el
--   vigilante no ve las tablas por RLS). Ejecutables solo por authenticated.
-- · hecho_en no puede estar en el futuro (más de 10 min) ni tener más de 7
--   días: un equipo con el reloj mal no reescribe la historia.

begin;

do $antes$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'visitas' and column_name = 'id_equipo') then
    raise exception 'ABORTADA: visitas.id_equipo ya existe. No se cambió nada.';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('garita_lista_del_dia', 'garita_entrada_diferida', 'garita_salida_diferida')) then
    raise exception 'ABORTADA: alguna función de la garita sin conexión ya existe. No se cambió nada.';
  end if;
end
$antes$;

alter table public.visitas add column id_equipo uuid, add column hecho_en timestamptz;
alter table public.visitas add constraint visitas_id_equipo_key unique (id_equipo);

-- ── 1. La lista del día, resumida ──────────────────────────────────────

create function public.garita_lista_del_dia(p_edificio uuid)
  returns table (invitacion_id uuid, codigo_resumen text, nombre text, documento text, placa text,
                 unidad_id uuid, unidad text, desde timestamptz, hasta timestamptz,
                 usos integer, usos_max integer, estado text)
  language plpgsql
  stable
  security definer
  set search_path to 'public'
as $$
begin
  perform permitir_garita(p_edificio);
  return query
  select i.id, encode(sha256(convert_to(i.codigo, 'UTF8')), 'hex'), i.nombre, i.documento, i.placa,
         i.unidad_id, u.codigo, i.desde, i.hasta, i.usos, i.usos_max, i.estado
    from invitaciones_visita i
    join unidades u on u.id = i.unidad_id
   where i.edificio_id = p_edificio
     and i.hasta >= now()
     and i.desde <= now() + interval '24 hours'
   order by i.desde;
end $$;

-- ── 2. La entrada hecha sin conexión ───────────────────────────────────

create function public.garita_entrada_diferida(
  p_id_equipo uuid, p_hecho_en timestamptz, p_edificio uuid, p_unidad uuid, p_nombre text,
  p_documento text default null, p_placa text default null, p_invitacion uuid default null, p_nota text default null)
  returns uuid
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_org uuid; v_vis uuid; v_vt uuid; v_doc text; v_nom text; v_cod text; v_invalida boolean := false;
begin
  v_org := permitir_garita(p_edificio);

  if p_id_equipo is null then raise exception 'Falta el identificador del equipo'; end if;
  if p_hecho_en is null or p_hecho_en > now() + interval '10 minutes' or p_hecho_en < now() - interval '7 days' then
    raise exception 'La hora de la entrada no es válida (¿el reloj del equipo está bien?)';
  end if;

  -- Ya llegó antes (un reintento): la misma visita.
  select v.id into v_vis from visitas v where v.id_equipo = p_id_equipo and v.edificio_id = p_edificio;
  if v_vis is not null then return v_vis; end if;

  v_nom := nullif(btrim(coalesce(p_nombre, '')), '');
  if v_nom is null then raise exception 'Falta el nombre de quien entra'; end if;

  if p_unidad is not null and not exists (
       select 1 from unidades u where u.id = p_unidad and u.edificio_id = p_edificio) then
    raise exception 'Esa unidad no es de este edificio';
  end if;

  v_doc := nullif(upper(regexp_replace(coalesce(p_documento, ''), '[^0-9A-Za-z]', '', 'g')), '');

  if v_doc is not null then
    insert into visitantes (org_id, documento, nombre)
    values (v_org, v_doc, v_nom)
    on conflict (org_id, documento) do update set nombre = excluded.nombre
    returning id into v_vt;
  end if;

  if p_invitacion is not null then
    if not exists (select 1 from invitaciones_visita i where i.id = p_invitacion and i.edificio_id = p_edificio) then
      raise exception 'Esa invitación no es de este edificio';
    end if;
    -- Se juzga a la hora en que la persona entró.
    update invitaciones_visita
       set usos = usos + 1
     where id = p_invitacion and edificio_id = p_edificio
       and estado = 'activa' and usos < usos_max
       and p_hecho_en between desde and hasta;
    v_invalida := not found;
  end if;

  insert into visitas (org_id, edificio_id, unidad_id, visitante_id, invitacion_id,
                       nombre, documento, placa, tipo, estado, nota, vigilante_id,
                       entrada_en, id_equipo, hecho_en)
  values (v_org, p_edificio, p_unidad, v_vt, p_invitacion,
          v_nom, v_doc, nullif(upper(btrim(coalesce(p_placa, ''))), ''),
          case when p_invitacion is null then 'espontanea' else 'anunciada' end,
          'dentro', nullif(btrim(coalesce(p_nota, '')), ''), auth.uid(),
          p_hecho_en, p_id_equipo, p_hecho_en)
  returning id into v_vis;

  select u.codigo into v_cod from unidades u where u.id = p_unidad;

  insert into bitacora (org_id, edificio_id, tipo, texto, visita_id, vigilante_id, creado_en)
  values (v_org, p_edificio, 'entrada',
          format('Entra %s%s%s · registrada sin conexión', v_nom,
                 case when v_cod is null then '' else ' a ' || v_cod end,
                 case when p_placa is null or btrim(p_placa) = '' then ''
                      else ' · vehículo ' || upper(btrim(p_placa)) end),
          v_vis, auth.uid(), p_hecho_en);

  if v_invalida then
    insert into bitacora (org_id, edificio_id, tipo, texto, visita_id, vigilante_id)
    values (v_org, p_edificio, 'novedad',
            format('%s entró sin conexión con una invitación que, al enviarse, ya no valía (anulada, vencida o ya usada en otra puerta).', v_nom),
            v_vis, auth.uid());
  end if;

  return v_vis;
end $$;

-- ── 3. La salida hecha sin conexión ────────────────────────────────────

create function public.garita_salida_diferida(p_hecho_en timestamptz, p_visita uuid default null, p_id_equipo uuid default null)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_org uuid; r record;
begin
  if p_hecho_en is null or p_hecho_en > now() + interval '10 minutes' or p_hecho_en < now() - interval '7 days' then
    raise exception 'La hora de la salida no es válida (¿el reloj del equipo está bien?)';
  end if;
  if p_visita is not null then
    select v.* into r from visitas v where v.id = p_visita;
  elsif p_id_equipo is not null then
    select v.* into r from visitas v where v.id_equipo = p_id_equipo;
  end if;
  if r.id is null then raise exception 'Esa visita no existe (o su entrada todavía no llegó)'; end if;
  v_org := permitir_garita(r.edificio_id);

  if r.estado <> 'dentro' then return; end if;

  update visitas set estado = 'salio', salida_en = greatest(p_hecho_en, r.entrada_en) where id = r.id;
  insert into bitacora (org_id, edificio_id, tipo, texto, visita_id, vigilante_id, creado_en)
  values (v_org, r.edificio_id, 'salida', format('Sale %s · registrada sin conexión', r.nombre), r.id, auth.uid(),
          greatest(p_hecho_en, r.entrada_en));
end $$;

revoke all on function public.garita_lista_del_dia(uuid) from public, anon;
revoke all on function public.garita_entrada_diferida(uuid, timestamptz, uuid, uuid, text, text, text, uuid, text) from public, anon;
revoke all on function public.garita_salida_diferida(timestamptz, uuid, uuid) from public, anon;
grant execute on function public.garita_lista_del_dia(uuid) to authenticated;
grant execute on function public.garita_entrada_diferida(uuid, timestamptz, uuid, uuid, text, text, text, uuid, text) to authenticated;
grant execute on function public.garita_salida_diferida(timestamptz, uuid, uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (después de aplicar)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas y funciones (esperado: 2, 3 definer con acl solo authenticated, 0 con «\r»):
--    select count(*) from information_schema.columns where table_name='visitas' and column_name in ('id_equipo','hecho_en');
--    select proname, prosecdef, proacl from pg_proc where pronamespace='public'::regnamespace
--      and proname in ('garita_lista_del_dia','garita_entrada_diferida','garita_salida_diferida');
--    select count(*) from pg_proc where pronamespace='public'::regnamespace and position(chr(13) in prosrc) > 0;
-- 2. Los md5 de permitir_garita, puede_garita, garita_entrada y garita_salida no cambian
--    (compararlos antes y después: md5(replace(prosrc, chr(13), ''))).
-- 3. En una transacción que se deshace, como el vigilante de un edificio:
--    · garita_lista_del_dia trae el resumen y no el código; el resumen de un código es
--      encode(sha256(convert_to(codigo,'UTF8')),'hex');
--    · como vigilante de otro edificio → «Sin permiso para la garita de este edificio»;
--    · garita_entrada_diferida dos veces con el mismo id_equipo → 1 visita, el mismo id;
--      entrada_en = hecho_en; la invitación suma 1 uso, no 2;
--    · con una invitación ya usada → entra igual y hay una novedad en la bitácora;
--    · hecho_en de mañana → error;
--    · garita_salida_diferida por id_equipo → salio, con salida_en = hecho_en.
