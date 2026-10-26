-- Reverso de 20261025120000_importar_unidades_plantilla.sql (M4).
--
-- 1. Borra la nota de la unidad: la tabla `notas_unidad`, con su política y
--    su disparador. **Las notas se pierden**: si hay que conservarlas,
--    copiarlas antes con `select unidad_id, nota from notas_unidad`.
-- 2. Vuelve a dejar `importar_unidades()` exactamente como en M3
--    (20261018140000_importar_unidades.sql): el cuerpo de abajo es el de M3,
--    con `create or replace` en vez de `create`. La firma no cambió, así que
--    los permisos se conservan (igual se repiten al final).
--
-- No toca otros datos: lo que se haya cargado con M4 (saldos de
-- administración, cédulas, «recibe corte», tratamientos) queda, como
-- cualquier dato cargado a mano. Después de esto, «Cargar datos» sigue
-- mandando esos campos y la función de M3 los ignora (no da error), pero la
-- pantalla lee `notas_unidad` y la ficha la escribe: para volver del todo
-- atrás hay que volver también la pantalla.

begin;

drop table if exists public.notas_unidad;
drop function if exists public.notas_unidad_completar();

create or replace function public.importar_unidades(
  p_edificio uuid,
  p_personas jsonb,
  p_filas    jsonb
) returns jsonb
    language plpgsql
    security invoker
    set search_path to 'public'
    as $function$
declare
  v_org        uuid;
  v_nombre_ed  text;
  v_cierres    boolean;
  v_refs       jsonb := '{}'::jsonb;    -- ref → persona_id
  v_p          jsonb;
  v_f          jsonb;
  v_id         uuid;
  v_unidad     uuid;
  v_codigo     text;
  v_tipo_v     text;
  v_ref        text;
  v_persona    uuid;
  v_vigente    uuid;
  v_nombre     text;
  v_tel        text;                    -- lo que la ficha existente no tiene
  v_cor        text;                    -- y el archivo trae (null = nada que
  v_resp       text;                    -- completar en ese campo)
  v_n_creadas  integer := 0;
  v_n_act      integer := 0;
  v_n_pnuevas  integer := 0;
  v_n_pcompl   integer := 0;
  v_n_vinc     integer := 0;
  v_filas_ok   integer;
begin
  -- 1. El edificio, y la organización sale de él.
  select e.org_id, e.nombre into v_org, v_nombre_ed
    from public.edificios e where e.id = p_edificio;
  if v_org is null then
    raise exception 'No se encontró el edificio.';
  end if;
  if not public.puede_operar(v_org) then
    raise exception 'Sin permiso para cargar datos en %.', v_nombre_ed;
  end if;
  if not public.edificio_activo(p_edificio) then
    raise exception 'El edificio "%" está dado de baja. Reactívelo desde Ajustes antes de cargarle datos.', v_nombre_ed;
  end if;
  if jsonb_typeof(p_filas) is distinct from 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'No hay filas para cargar.';
  end if;
  if jsonb_typeof(coalesce(p_personas, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de personas no tiene la forma esperada.';
  end if;

  select exists (select 1 from public.periodos p
                  where p.edificio_id = p_edificio and p.estado = 'cerrado')
    into v_cierres;

  -- 2. Personas: las existentes se completan (solo lo vacío); las nuevas se crean.
  for v_p in select * from jsonb_array_elements(coalesce(p_personas, '[]'::jsonb)) loop
    v_ref := nullif(trim(v_p->>'ref'), '');
    if v_ref is null or v_refs ? v_ref then
      raise exception 'Persona sin referencia, o repetida, en la carga.';
    end if;

    if nullif(v_p->>'persona_id', '') is not null then
      v_persona := (v_p->>'persona_id')::uuid;
      -- Qué le falta a la ficha y trae el archivo, campo por campo.
      select case when nullif(trim(pe.telefono), '') is null
                  then nullif(trim(coalesce(v_p->>'telefono', '')), '') end,
             case when nullif(trim(pe.correo), '') is null
                  then nullif(lower(trim(coalesce(v_p->>'correo', ''))), '') end,
             case when nullif(trim(pe.correo_respaldo), '') is null
                  then nullif(lower(trim(coalesce(v_p->>'correo_respaldo', ''))), '') end
        into v_tel, v_cor, v_resp
        from public.personas pe
       where pe.id = v_persona and pe.org_id = v_org
         for update;
      if not found then
        raise exception 'Una de las personas elegidas no es de esta administradora.';
      end if;
      -- Solo se escribe, y solo se cuenta, si de verdad se llena algo vacío.
      if coalesce(v_tel, v_cor, v_resp) is not null then
        update public.personas pe
           set telefono        = coalesce(v_tel,  pe.telefono),
               correo          = coalesce(v_cor,  pe.correo),
               correo_respaldo = coalesce(v_resp, pe.correo_respaldo)
         where pe.id = v_persona;
        v_n_pcompl := v_n_pcompl + 1;
      end if;
    else
      v_nombre := trim(coalesce(v_p->>'nombre', ''));
      if v_nombre = '' then
        raise exception 'Una persona nueva de la carga no tiene nombre.';
      end if;
      insert into public.personas (org_id, prefijo, nombre, telefono, correo, correo_respaldo)
      values (v_org,
              case
                -- Empresa o junta: sin tratamiento. C.A., S.A., S.R.L. como
                -- palabra suelta, con o sin puntos ("c.a.", "CA", "S. A.");
                -- no dentro de otra palabra ("Casa", "Rosa", "(ZACA)").
                when v_nombre ~* '(^|[^[:alnum:]áéíóúüñ])(c(\.\s?)?a|s(\.\s?)?a|s(\.\s?)?r(\.\s?)?l)\.?($|[^[:alnum:]áéíóúüñ])'
                  or v_nombre ~* '^junta($|[^[:alnum:]áéíóúüñ])'
                  then null
                -- Si no, el que mande la pantalla, o el mismo "Sr." que pone
                -- la base por omisión.
                else coalesce(nullif(trim(coalesce(v_p->>'prefijo', '')), ''), 'Sr.')
              end,
              v_nombre,
              nullif(trim(coalesce(v_p->>'telefono', '')), ''),
              nullif(lower(trim(coalesce(v_p->>'correo', ''))), ''),
              nullif(lower(trim(coalesce(v_p->>'correo_respaldo', ''))), ''))
      returning id into v_persona;
      v_n_pnuevas := v_n_pnuevas + 1;
    end if;
    v_id := null;
    v_refs := v_refs || jsonb_build_object(v_ref, v_persona);
  end loop;

  -- 3. Unidades: crear o actualizar.
  for v_f in select * from jsonb_array_elements(p_filas) loop
    v_codigo := trim(coalesce(v_f->>'codigo', ''));
    if (v_f ? 'saldo_inicial') and jsonb_typeof(v_f->'saldo_inicial') <> 'null' and v_cierres then
      raise exception 'El edificio ya tiene meses cerrados: el saldo inicial de % no se puede cargar (después del primer cierre no se usa).', v_codigo;
    end if;
    if (v_f->>'alicuota') is not null and (v_f->>'alicuota')::numeric < 0 then
      raise exception 'La alícuota de % no puede ser negativa.', v_codigo;
    end if;

    if v_f->>'accion' = 'crear' then
      if v_codigo = '' then
        raise exception 'Una fila de la carga no tiene código de unidad.';
      end if;
      begin
        insert into public.unidades (org_id, edificio_id, codigo, alicuota, saldo_inicial, tipo)
        values (v_org, p_edificio, v_codigo,
                coalesce((v_f->>'alicuota')::numeric, 0),
                coalesce((v_f->>'saldo_inicial')::numeric, 0),
                coalesce(nullif(v_f->>'tipo', ''), 'apartamento'))
        returning id into v_unidad;
      exception when unique_violation then
        raise exception 'La unidad % ya existe en este edificio. Vuelva a leer el archivo.', v_codigo;
      end;
      v_n_creadas := v_n_creadas + 1;

    elsif v_f->>'accion' = 'actualizar' then
      v_unidad := nullif(v_f->>'unidad_id', '')::uuid;
      update public.unidades u
         set alicuota      = coalesce((v_f->>'alicuota')::numeric, u.alicuota),
             tipo          = coalesce(nullif(v_f->>'tipo', ''), u.tipo),
             saldo_inicial = coalesce((v_f->>'saldo_inicial')::numeric, u.saldo_inicial)
       where u.id = v_unidad and u.edificio_id = p_edificio and u.activa
      returning u.id into v_id;
      if v_id is null then
        raise exception 'La unidad % no está en este edificio o está dada de baja.', v_codigo;
      end if;
      v_id := null;
      v_n_act := v_n_act + 1;

    else
      raise exception 'Fila de % con una acción desconocida.', v_codigo;
    end if;

    -- 4. Vínculos: se crean si faltan; nunca se cambia a la persona vigente.
    for v_tipo_v in select unnest(array['propietario', 'inquilino']) loop
      v_ref := nullif(trim(coalesce(v_f->>v_tipo_v, '')), '');
      continue when v_ref is null;
      if not (v_refs ? v_ref) then
        raise exception 'La fila de % apunta a una persona que no está en la carga.', v_codigo;
      end if;
      v_persona := (v_refs->>v_ref)::uuid;

      select v.persona_id into v_vigente
        from public.vinculos v
       where v.unidad_id = v_unidad and v.tipo = v_tipo_v and v.hasta is null
       limit 1;

      if v_vigente is null then
        insert into public.vinculos (org_id, unidad_id, persona_id, tipo)
        values (v_org, v_unidad, v_persona, v_tipo_v);
        v_n_vinc := v_n_vinc + 1;
      elsif v_vigente <> v_persona then
        raise exception 'La unidad % ya tiene otro % registrado. El importador no lo cambia: hágalo desde la ficha de la unidad.', v_codigo, v_tipo_v;
      end if;
      v_vigente := null;
    end loop;

    -- 5. Quién paga, al final de la fila (los inquilinos ya existen).
    if nullif(v_f->>'paga', '') is not null then
      update public.unidades u set paga = v_f->>'paga' where u.id = v_unidad;
    end if;
  end loop;

  return jsonb_build_object(
    'unidades_creadas',      v_n_creadas,
    'unidades_actualizadas', v_n_act,
    'personas_nuevas',       v_n_pnuevas,
    'personas_completadas',  v_n_pcompl,
    'vinculos_nuevos',       v_n_vinc);
end $function$;

comment on function public.importar_unidades(uuid, jsonb, jsonb) is
  'Carga de «Cargar datos» en una transacción: crea o actualiza unidades, '
  'crea o completa personas (sin pisar datos) y crea los vínculos que falten. '
  'Nunca cambia al propietario/inquilino vigente ni toca accesos. SECURITY '
  'INVOKER. Ver supabase/migrations/20261018140000_importar_unidades.sql.';

revoke all on function public.importar_unidades(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importar_unidades(uuid, jsonb, jsonb) to authenticated;

commit;

-- Verificación:
--   select to_regclass('public.notas_unidad');
--   -- Esperado: null.
--   select pg_get_functiondef('public.importar_unidades'::regproc) ~ 'saldo_inicial_hon';
--   -- Esperado: false (el cuerpo de M3 no lo usa).
--   select prosecdef, proconfig, proacl from pg_proc where proname = 'importar_unidades';
--   -- Esperado: una fila, prosecdef = false, search_path=public, EXECUTE solo authenticated.
