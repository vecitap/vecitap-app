-- Reverso de 20261028150000_solo_operador_y_ajustes_seguridad.sql (ronda 9,
-- D1, D4, D5, D6 y D7).
--
-- Vuelve crear_organizacion(), administra_algo(), org_campos_del_operador() y
-- traer_tasa_bcv() a como estaban (tal cual pg_get_functiondef en las dos
-- bases el 28-oct; md5 iguales en pruebas y producción) y borra
-- dar_de_baja_acceso(). Una membresía dada de baja con ella queda dada de
-- baja (es un dato). Después, «Dar de baja» de Accesos vuelve a fallar en
-- silencio para una `administrador`: hay que volver a dejar la pantalla con el
-- UPDATE directo (o dejar la función).

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.crear_organizacion(text, text)', '5e4e1157102d48abc239c29fb2f5923b'),
      ('public.administra_algo()', '02553d8dc245667bfd14a16f25608401'),
      ('public.org_campos_del_operador()', '0b28110290b22a2a5d3dd9170720f5be'),
      ('public.dar_de_baja_acceso(uuid)', '80f189f60e790ea3ffd7fa3605f1d9cf'),
      ('public.traer_tasa_bcv()', '2a5a1433626ef394de2795f80719fcb2')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no son las de la ronda 9:%', malas; end if;
end
$guarda$;

drop function public.dar_de_baja_acceso(uuid);

CREATE OR REPLACE FUNCTION public.crear_organizacion(p_nombre text, p_rif text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Falta el nombre'; end if;

  insert into organizaciones (nombre, rif)
  values (trim(p_nombre), nullif(trim(coalesce(p_rif, '')), ''))
  returning id into v_id;

  insert into membresias (org_id, usuario_id, rol)
  values (v_id, auth.uid(), 'propietario_cuenta');

  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.administra_algo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from membresias m
     where m.usuario_id = auth.uid()
       and m.rol in ('propietario_cuenta','administrador'))
$function$;

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
  return new;
end $function$;

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

    delete from tasa_pendiente;
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

-- Verificación: md5 de crear_organizacion → 443c0239b618fa4e6f3b086b5b8bc4ce,
-- administra_algo → 80bd69fb8012e783c993595b9c988dfb, org_campos_del_operador →
-- 1aa49bce2a1c43c59ba0285fcf629f3c, traer_tasa_bcv → 1a8f607ae0ab59cbce2cbb1547ba60b1;
-- select to_regprocedure('public.dar_de_baja_acceso(uuid)'); → null.
