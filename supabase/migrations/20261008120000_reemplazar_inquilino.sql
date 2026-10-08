-- `reemplazar_inquilino`: cambiar el inquilino de una unidad desde la ficha
-- hace lo mismo que "El inquilino ya no ocupa la unidad" + cargar uno nuevo,
-- en una sola transacción.
--
-- Aplicada en vecitap-pruebas el 08-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo (docs/respaldo.md), junto con las
-- de la fase 1 y 20261005120000 — depende de los disparadores de
-- 20260930120000_unidades_paga.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA (ronda 2 del tramo 2, punto 3 — prueba de Gustavo, 07-oct)
-- ─────────────────────────────────────────────────────────────────────────
-- En la ficha de la unidad (Admin → Propietarios → Datos), escribir el
-- correo de OTRO inquilino encima del que había y guardar sobrescribía la
-- misma fila de `personas`: el inquilino viejo "se convertía" en el nuevo,
-- sin pedir confirmación, con su historia y su `desde`. Y si el viejo tenía
-- cuenta en la app, su acceso a la unidad seguía activo: los disparadores
-- 3b solo actúan cuando se cierra un vínculo, y acá no se cerraba ninguno.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL CAMBIO
-- ─────────────────────────────────────────────────────────────────────────
-- Una función nueva, `reemplazar_inquilino(p_unidad, datos del nuevo)`, que
-- la ficha llama después de que la administradora confirma. En orden y en
-- la misma transacción:
--   1. Bloquea la fila de la unidad y recuerda `paga`.
--   2. Cierra los vínculos de inquilino vigentes de la unidad
--      (`hasta = hoy_local()`), exactamente como el botón "El inquilino ya
--      no ocupa la unidad". Eso dispara lo que ya existe:
--        · vinculos_inquilino_sale → `paga` vuelve a propietario;
--        · vinculos_inquilino_sale_accesos → se apagan los accesos de
--          inquilino de la unidad (era el último vigente).
--   3. Anula las invitaciones PENDIENTES de residente de esa unidad para
--      el correo (o los correos) del inquilino que se fue, igual que
--      revocar_invitacion (`expira_en` un segundo atrás). Sin esto, un
--      código ya entregado al inquilino viejo le devolvería el acceso.
--   4. Crea la persona nueva y su vínculo de inquilino desde hoy.
--   5. Si la unidad estaba en paga = 'inquilino', la vuelve a poner: el
--      paso 2 la bajó a propietario, pero quien paga no cambió —cambió la
--      persona—. La guarda B lo permite porque ya hay inquilino vigente.
--   Devuelve cuántos accesos se apagaron, para que la ficha diga "también
--   se le quitó el acceso a la app" solo si de verdad pasó.
--
-- SECURITY INVOKER, a propósito: no amplía ningún permiso. Corre con los de
-- quien la llama, así que cada escritura pasa por las mismas políticas que
-- hoy pasa la ficha (`vinculos_escribir`, `personas_escribir`,
-- `unidades_escribir`: puede_operar; `invitaciones_admin`: tiene_rol
-- propietario_cuenta/administrador). Lo único con privilegios es el
-- disparador 3b, que ya existía y no cambia. Igual se comprueba
-- `puede_operar` al principio, para devolver un error legible en vez de
-- "0 filas".
--
-- Fuera de alcance: una unidad con DOS inquilinos vigentes (la ficha
-- muestra uno solo; "varias personas por unidad" quedó fuera de esta
-- ronda). Si pasara, se cierran los dos, que es lo que significa
-- "reemplazar al inquilino".

begin;

create function public.reemplazar_inquilino(
  p_unidad    uuid,
  p_prefijo   text,
  p_nombre    text,
  p_documento text,
  p_telefono  text,
  p_correo    text,
  p_enviar    boolean default true
) returns integer
    language plpgsql
    security invoker
    set search_path to 'public'
    as $function$
declare
  v_org     uuid;
  v_codigo  text;
  v_paga    text;
  v_correos text[];
  v_antes   integer;
  v_despues integer;
  v_persona uuid;
begin
  select u.org_id, u.codigo, u.paga
    into v_org, v_codigo, v_paga
    from public.unidades u
   where u.id = p_unidad
     for update;
  if not found then
    raise exception 'No se encontró la unidad.';
  end if;
  if not public.puede_operar(v_org) then
    raise exception 'Sin permiso para cambiar el inquilino de %.', v_codigo;
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Falta el nombre del inquilino nuevo.';
  end if;

  select array_agg(lower(trim(p.correo))) filter (where coalesce(trim(p.correo), '') <> '')
    into v_correos
    from public.vinculos v
    join public.personas p on p.id = v.persona_id
   where v.unidad_id = p_unidad
     and v.org_id    = v_org
     and v.tipo      = 'inquilino'
     and v.hasta is null;

  if not exists (
       select 1 from public.vinculos v
        where v.unidad_id = p_unidad and v.org_id = v_org
          and v.tipo = 'inquilino' and v.hasta is null) then
    raise exception 'La unidad % no tiene un inquilino registrado para reemplazar.', v_codigo;
  end if;

  select count(*) into v_antes
    from public.membresias m
   where m.unidad_id = p_unidad and m.org_id = v_org
     and m.rol = 'residente' and m.relacion = 'inquilino' and m.activo;

  -- 2. Igual que "El inquilino ya no ocupa la unidad".
  update public.vinculos v
     set hasta = public.hoy_local()
   where v.unidad_id = p_unidad
     and v.org_id    = v_org
     and v.tipo      = 'inquilino'
     and v.hasta is null;

  -- 3. Los códigos pendientes del que se fue dejan de servir.
  if v_correos is not null then
    update public.invitaciones i
       set expira_en = now() - interval '1 second'
     where i.org_id    = v_org
       and i.unidad_id = p_unidad
       and i.rol       = 'residente'
       and i.correo    = any (v_correos)
       and i.usada_en is null
       and i.expira_en > now();
  end if;

  -- 4. El nuevo.
  insert into public.personas (org_id, prefijo, nombre, documento, telefono, correo)
  values (v_org,
          nullif(trim(coalesce(p_prefijo, '')), ''),
          trim(p_nombre),
          nullif(trim(coalesce(p_documento, '')), ''),
          nullif(trim(coalesce(p_telefono, '')), ''),
          nullif(lower(trim(coalesce(p_correo, ''))), ''))
  returning id into v_persona;

  insert into public.vinculos (org_id, unidad_id, persona_id, tipo, desde, enviar_corte)
  values (v_org, p_unidad, v_persona, 'inquilino', public.hoy_local(), coalesce(p_enviar, true));

  -- 5. Quien paga no cambió.
  if v_paga = 'inquilino' then
    update public.unidades u set paga = 'inquilino' where u.id = p_unidad;
  end if;

  select count(*) into v_despues
    from public.membresias m
   where m.unidad_id = p_unidad and m.org_id = v_org
     and m.rol = 'residente' and m.relacion = 'inquilino' and m.activo;

  return greatest(v_antes - v_despues, 0);
end $function$;

comment on function public.reemplazar_inquilino(uuid, text, text, text, text, text, boolean) is
  'Cambia el inquilino de una unidad: cierra el vigente (como "ya no ocupa '
  'la unidad", con sus disparadores), anula sus invitaciones pendientes, '
  'carga al nuevo y conserva paga. SECURITY INVOKER. Devuelve cuántos '
  'accesos de inquilino se apagaron. Ver '
  'supabase/migrations/20261008120000_reemplazar_inquilino.sql.';

revoke all on function public.reemplazar_inquilino(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.reemplazar_inquilino(uuid, text, text, text, text, text, boolean) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Existe, es INVOKER y solo la ejecuta `authenticated`:
--
--   select prosecdef, proconfig, proacl::text
--     from pg_proc
--    where oid = 'public.reemplazar_inquilino(uuid,text,text,text,text,text,boolean)'::regprocedure;
--   -- Esperado: false | {search_path=public}
--   --           | {postgres=X/postgres,authenticated=X/postgres}
--   --   (puede listar también service_role, según los privilegios por
--   --    omisión del esquema; lo que no tiene que aparecer es anon ni =X/)
--
-- 2. Sin sesión (como el SQL Editor, auth.uid() nulo) no hace nada:
--
--   select public.reemplazar_inquilino('<id de una unidad con inquilino>',
--          'Sr.', 'Prueba', null, null, 'x@ejemplo.com');
--   -- Esperado: ERROR "Sin permiso para cambiar el inquilino de …"
--
-- 3. Desde la app (Preview de dev, como administradora), en una unidad con
--    inquilino que tiene cuenta: Datos → cambiar el correo del inquilino →
--    Guardar → confirmar. Después, por SQL, para esa unidad:
--
--   select v.tipo, v.desde, v.hasta, p.nombre, p.correo
--     from public.vinculos v join public.personas p on p.id = v.persona_id
--    where v.unidad_id = '<id>' and v.tipo = 'inquilino' order by v.desde, v.hasta nulls last;
--   -- Esperado: el viejo con hasta = hoy; el nuevo con hasta null.
--
--   select activo from public.membresias
--    where unidad_id = '<id>' and rol = 'residente' and relacion = 'inquilino';
--   -- Esperado: false para la membresía del inquilino viejo.
--
--   select paga from public.unidades where id = '<id>';
--   -- Esperado: la misma que antes del cambio.
