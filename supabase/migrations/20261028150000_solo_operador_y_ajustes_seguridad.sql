-- Seguridad de la verificación del 28-oct (ronda 9, bloque D: D1, D4, D5,
-- D6 y D7). Cinco cambios chicos en funciones SECURITY DEFINER, juntos
-- porque se revisan juntos; cada uno con su md5 en la guarda.
--
-- Aplicada en vecitap-pruebas el 28-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada
-- («Paso 8b»). No depende de las otras migraciones de la ronda 9. Rollback:
-- supabase/rollbacks/20261028150000_solo_operador_y_ajustes_seguridad_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- D1 · crear_organizacion(): solo el operador de Vecitap (decisión de
--      Gustavo del 28-oct: «Solo el operador crea administradoras»). Antes
--      cualquier cuenta con sesión podía crearse una administradora y quedar
--      de dueña. Las otras funciones que crean una organización: solo
--      crear_cliente(), que ya exigía es_operador(). Ninguna política deja
--      hacer INSERT directo en `organizaciones` (solo hay de lectura y de
--      UPDATE).
-- D4 · administra_algo(): solo cuenta membresías ACTIVAS, como tiene_rol().
--      Con una membresía de administración dada de baja, /destino mandaba a
--      /admin y ahí no aparecía nada.
-- D5 · org_campos_del_operador() (el disparador BEFORE UPDATE de
--      `organizaciones`): ya protegía `plan`, `tipo` y `max_edificios`; ahora
--      también `id` y `creada_en`. Con eso, de lo que maneja el operador,
--      a la dueña de la cuenta (política org_editar) solo le quedan nombre,
--      RIF, dirección, teléfono, correo, logo y color. Los campos de la
--      suscripción (estado, precio, vencimiento…) no están en
--      `organizaciones` sino en `suscripciones`, donde solo escribe el
--      operador (política susc_operador; la dueña solo lee, susc_propia).
--      Por eso alcanza con el disparador y no hace falta un WITH CHECK.
-- D6 · dar_de_baja_acceso(p_membresia) (nueva): «Dar de baja» en Accesos.
--      La pantalla hacía UPDATE directo a `membresias`, que la política
--      mem_admin solo le permite a la dueña de la cuenta: una
--      `administrador` tocaba el botón, se actualizaban 0 filas y no salía
--      ningún error. La función deja dar de baja **solo accesos de
--      residente** (propietario o inquilino) de una organización que la
--      persona administra (puede_operar), y nada más: no cambia roles ni
--      unidades. La política mem_admin no se toca.
-- D7 · traer_tasa_bcv(): `delete from tasa_pendiente` sin WHERE →
--      `where request_id = v_req`. Llamada por la API («Traer ahora» del
--      operador, vía correr_tasa_ahora()), Supabase rechaza un DELETE sin
--      WHERE («DELETE requires a WHERE clause»); por el cron sí andaba.
--      Nada más cambia.

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.crear_organizacion(text, text)', '443c0239b618fa4e6f3b086b5b8bc4ce'),
      ('public.administra_algo()', '80bd69fb8012e783c993595b9c988dfb'),
      ('public.org_campos_del_operador()', '1aa49bce2a1c43c59ba0285fcf629f3c'),
      ('public.traer_tasa_bcv()', '1a8f607ae0ab59cbce2cbb1547ba60b1')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if to_regprocedure('public.dar_de_baja_acceso(uuid)') is not null then
    malas := malas || ' dar_de_baja_acceso ya existe;';
  end if;
  if malas <> '' then raise exception 'ABORTADA:%', malas; end if;
end
$guarda$;

-- ── D1 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_organizacion(p_nombre text, p_rif text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  -- Ronda 9 (D1, decisión de Gustavo del 28-oct): solo el operador de
  -- Vecitap crea administradoras.
  if not es_operador() then
    raise exception 'Solo Vecitap crea administradoras. Para usar Vecitap como administradora, escríbale a Vecitap.'
      using errcode = '42501';
  end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Falta el nombre'; end if;

  insert into organizaciones (nombre, rif)
  values (trim(p_nombre), nullif(trim(coalesce(p_rif, '')), ''))
  returning id into v_id;

  insert into membresias (org_id, usuario_id, rol)
  values (v_id, auth.uid(), 'propietario_cuenta');

  return v_id;
end $function$;

-- ── D4 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.administra_algo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Ronda 9 (D4): solo membresías activas, como tiene_rol().
  select exists (
    select 1 from membresias m
     where m.usuario_id = auth.uid()
       and m.activo
       and m.rol in ('propietario_cuenta','administrador'))
$function$;

-- ── D5 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_campos_del_operador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if es_operador() then return new; end if;

  if new.tipo is distinct from old.tipo
     or new.max_edificios is distinct from old.max_edificios
     or new.plan is distinct from old.plan then
    raise exception 'El tipo de cuenta, el tope de edificios y el plan los '
                    'fija Vecitap. Escríbanos a hola@vecitap.com si necesita '
                    'cambiarlos.'
      using errcode = '42501';
  end if;
  -- Ronda 9 (D5): tampoco el identificador ni la fecha de alta.
  if new.id is distinct from old.id or new.creada_en is distinct from old.creada_en then
    raise exception 'Ese dato de la administradora no se puede cambiar.'
      using errcode = '42501';
  end if;
  return new;
end $function$;

-- ── D6 ──────────────────────────────────────────────────────────────────
create function public.dar_de_baja_acceso(p_membresia uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
  as $function$
declare v_org uuid; v_rol text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select m.org_id, m.rol into v_org, v_rol from membresias m where m.id = p_membresia;
  if v_org is null or not puede_operar(v_org) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  if v_rol <> 'residente' then
    raise exception 'Desde aquí solo se da de baja el acceso de un propietario o un inquilino.';
  end if;
  update membresias set activo = false where id = p_membresia and activo;
end $function$;

revoke all on function public.dar_de_baja_acceso(uuid) from public, anon;
grant execute on function public.dar_de_baja_acceso(uuid) to authenticated;

-- ── D7 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.traer_tasa_bcv()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
declare
  v_req bigint; v_status int; v_body text; v_json jsonb;
  v_tasa numeric(18,6); v_fecha date;
  v_res jsonb := '{}'::jsonb;
begin
  -- a) recoger lo que quedó pendiente de la corrida anterior
  select request_id into v_req from tasa_pendiente limit 1;

  if v_req is not null then
    select r.status_code, r.content into v_status, v_body
      from net._http_response r where r.id = v_req;

    if v_status = 200 and v_body is not null then
      v_json  := v_body::jsonb;
      v_tasa  := (v_json->>'promedio')::numeric;
      v_fecha := ((v_json->>'fechaActualizacion')::timestamptz
                    at time zone 'America/Caracas')::date;

      if v_tasa > 0 and v_fecha is not null then
        insert into tasas_bcv (fecha, tasa, fuente)
        values (v_fecha, v_tasa, 'dolarapi')
        on conflict (fecha) do update
           set tasa = excluded.tasa, cargada_en = now()
         where tasas_bcv.fuente = 'dolarapi';   -- respeta la carga manual

        v_res := jsonb_build_object('fecha', v_fecha, 'tasa', v_tasa);
      else
        v_res := jsonb_build_object('error', 'respuesta sin tasa usable');
      end if;
    elsif v_status is not null then
      v_res := jsonb_build_object('error', 'la API respondió ' || v_status);
    else
      v_res := jsonb_build_object('error', 'la API no respondió a tiempo');
    end if;

    -- Ronda 9 (D7): con WHERE. Llamada por la API («Traer ahora»), Supabase
    -- rechaza un DELETE sin WHERE.
    delete from tasa_pendiente where request_id = v_req;
  end if;

  -- b) si la de hoy ya está, no molestamos más a la API
  if exists (select 1 from tasas_bcv where fecha >= current_date) then
    v_res := v_res || jsonb_build_object('estado', 'al dia');
    insert into tareas_log (tarea, detalle) values ('tasa_bcv', v_res);
    return v_res;
  end if;

  -- c) pedir de nuevo
  select net.http_get(
           url := 'https://ve.dolarapi.com/v1/dolares/oficial',
           timeout_milliseconds := 8000)
    into v_req;

  insert into tasa_pendiente (request_id) values (v_req);
  v_res := v_res || jsonb_build_object('estado', 'pedida');
  insert into tareas_log (tarea, detalle) values ('tasa_bcv', v_res);
  return v_res;

exception when others then
  insert into tareas_log (tarea, detalle)
    values ('tasa_bcv', jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('error', sqlerrm);
end $function$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in
--      ('crear_organizacion','administra_algo','org_campos_del_operador','dar_de_baja_acceso','traer_tasa_bcv') order by 1;
--    -- Esperado: administra_algo 02553d8dc245667bfd14a16f25608401, crear_organizacion
--    --   5e4e1157102d48abc239c29fb2f5923b, dar_de_baja_acceso 80f189f60e790ea3ffd7fa3605f1d9cf,
--    --   org_campos_del_operador 0b28110290b22a2a5d3dd9170720f5be, traer_tasa_bcv 2a5a1433626ef394de2795f80719fcb2.
--    Permisos sin cambio: crear_organizacion y administra_algo, authenticated;
--    traer_tasa_bcv, nadie (la llama el cron y correr_tasa_ahora()); la nueva,
--    authenticated (no anon).
-- 2. En transacciones deshechas, con `set local role authenticated` y el sub
--    de cada cuenta en request.jwt.claims:
--    D1 · una cuenta común: select crear_organizacion('X', null);
--         → «Solo Vecitap crea administradoras…». El operador: devuelve un id.
--    D4 · una administradora con su membresía activo = false:
--         select administra_algo(); → false (antes, true).
--    D5 · la dueña: update organizaciones set creada_en = now() where id = '<su org>';
--         → «Ese dato de la administradora no se puede cambiar.»; set nombre = 'Otro' → 1 fila.
--    D6 · una `administrador` (no dueña): select dar_de_baja_acceso('<membresía de residente de su org>');
--         → la membresía queda activo = false. La misma con una membresía de
--         otra organización → «Sin permiso»; con la de un administrador → «Desde aquí solo…».
--    D7 · como el operador: select correr_tasa_ahora(); con una fila en
--         tasa_pendiente → no da «DELETE requires a WHERE clause» y la fila se va.
