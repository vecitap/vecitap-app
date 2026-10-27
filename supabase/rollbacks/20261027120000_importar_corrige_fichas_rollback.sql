-- Reverso de 20261027120000_importar_corrige_fichas.sql (ronda 8, bloque A1).
--
-- Vuelve importar_unidades() al cuerpo de M4 (20261025120000_importar_unidades_plantilla.sql),
-- tal cual: la carga vuelve a solo completar lo vacío de una ficha existente
-- (`cambiar` se ignora). No toca datos: lo que ya se cambió en las fichas queda.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.importar_unidades(uuid,jsonb,jsonb)'::regprocedure;
  if v is distinct from '64fac9ed0e225513035dfd6688715fc4' then
    raise exception 'ABORTADA: importar_unidades() no es la de la ronda 8 (md5(prosrc)=%).', v;
  end if;
end
$guarda$;

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
  v_vinculo    uuid;
  v_corte      boolean;                 -- «recibe corte» del archivo
  v_corte_hoy  boolean;                 -- el del vínculo que ya existe
  v_nombre     text;
  v_tel        text;                    -- lo que la ficha existente no tiene
  v_cor        text;                    -- y el archivo trae (null = nada que
  v_resp       text;                    -- completar en ese campo)
  v_doc        text;
  v_nota       text;
  v_n_creadas  integer := 0;
  v_n_act      integer := 0;
  v_n_pnuevas  integer := 0;
  v_n_pcompl   integer := 0;
  v_n_vinc     integer := 0;
  v_n_vact     integer := 0;
  v_n_notas    integer := 0;
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
                  then nullif(lower(trim(coalesce(v_p->>'correo_respaldo', ''))), '') end,
             case when nullif(trim(pe.documento), '') is null
                  then nullif(trim(coalesce(v_p->>'documento', '')), '') end
        into v_tel, v_cor, v_resp, v_doc
        from public.personas pe
       where pe.id = v_persona and pe.org_id = v_org
         for update;
      if not found then
        raise exception 'Una de las personas elegidas no es de esta administradora.';
      end if;
      -- Solo se escribe, y solo se cuenta, si de verdad se llena algo vacío.
      if coalesce(v_tel, v_cor, v_resp, v_doc) is not null then
        update public.personas pe
           set telefono        = coalesce(v_tel,  pe.telefono),
               correo          = coalesce(v_cor,  pe.correo),
               correo_respaldo = coalesce(v_resp, pe.correo_respaldo),
               documento       = coalesce(v_doc,  pe.documento)
         where pe.id = v_persona;
        v_n_pcompl := v_n_pcompl + 1;
      end if;
    else
      v_nombre := trim(coalesce(v_p->>'nombre', ''));
      if v_nombre = '' then
        raise exception 'Una persona nueva de la carga no tiene nombre.';
      end if;
      insert into public.personas (org_id, prefijo, nombre, documento, telefono, correo, correo_respaldo)
      values (v_org,
              case
                -- El tratamiento que trae el archivo manda, también «Sin
                -- tratamiento» ('' o null → null).
                when v_p ? 'prefijo'
                  then nullif(trim(coalesce(v_p->>'prefijo', '')), '')
                -- Sin tratamiento en el archivo: empresa, firma o junta, sin
                -- tratamiento. C.A., S.A., S.R.L. o S.N. como palabra suelta,
                -- con o sin puntos ("c.a.", "CA", "S. A.", "s.n."); no dentro
                -- de otra palabra ("Casa", "Rosa", "(ZACA)", "Sonia"). Un
                -- «&» («Rerozo, Ropopar & Vumulinog»). O empieza con «Junta».
                when v_nombre ~* '(^|[^[:alnum:]áéíóúüñ])(c(\.\s?)?a|s(\.\s?)?a|s(\.\s?)?r(\.\s?)?l|s(\.\s?)?n)\.?($|[^[:alnum:]áéíóúüñ])'
                  or position('&' in v_nombre) > 0
                  or v_nombre ~* '^junta($|[^[:alnum:]áéíóúüñ])'
                  then null
                -- Si no, el mismo "Sr." que pone la base por omisión.
                else 'Sr.'
              end,
              v_nombre,
              nullif(trim(coalesce(v_p->>'documento', '')), ''),
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
    if (v_f ? 'saldo_inicial_hon') and jsonb_typeof(v_f->'saldo_inicial_hon') <> 'null' and v_cierres then
      raise exception 'El edificio ya tiene meses cerrados: el saldo de administración de % no se puede cargar (después del primer cierre no se usa).', v_codigo;
    end if;
    if (v_f->>'alicuota') is not null and (v_f->>'alicuota')::numeric < 0 then
      raise exception 'La alícuota de % no puede ser negativa.', v_codigo;
    end if;
    v_nota := nullif(btrim(coalesce(v_f->>'nota', '')), '');
    if char_length(v_nota) > 1000 then
      raise exception 'La nota de % tiene más de 1.000 caracteres.', v_codigo;
    end if;

    if v_f->>'accion' = 'crear' then
      if v_codigo = '' then
        raise exception 'Una fila de la carga no tiene código de unidad.';
      end if;
      begin
        insert into public.unidades (org_id, edificio_id, codigo, alicuota, saldo_inicial, saldo_inicial_hon, tipo)
        values (v_org, p_edificio, v_codigo,
                coalesce((v_f->>'alicuota')::numeric, 0),
                coalesce((v_f->>'saldo_inicial')::numeric, 0),
                coalesce((v_f->>'saldo_inicial_hon')::numeric, 0),
                coalesce(nullif(v_f->>'tipo', ''), 'apartamento'))
        returning id into v_unidad;
      exception when unique_violation then
        raise exception 'La unidad % ya existe en este edificio. Vuelva a leer el archivo.', v_codigo;
      end;
      v_n_creadas := v_n_creadas + 1;

    elsif v_f->>'accion' = 'actualizar' then
      v_unidad := nullif(v_f->>'unidad_id', '')::uuid;
      update public.unidades u
         set alicuota          = coalesce((v_f->>'alicuota')::numeric, u.alicuota),
             tipo              = coalesce(nullif(v_f->>'tipo', ''), u.tipo),
             saldo_inicial     = coalesce((v_f->>'saldo_inicial')::numeric, u.saldo_inicial),
             saldo_inicial_hon = coalesce((v_f->>'saldo_inicial_hon')::numeric, u.saldo_inicial_hon)
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
      v_corte := case when jsonb_typeof(v_f->(v_tipo_v || '_corte')) = 'boolean'
                      then (v_f->>(v_tipo_v || '_corte'))::boolean end;

      select v.id, v.persona_id, v.enviar_corte into v_vinculo, v_vigente, v_corte_hoy
        from public.vinculos v
       where v.unidad_id = v_unidad and v.tipo = v_tipo_v and v.hasta is null
       limit 1;

      if v_vigente is null then
        insert into public.vinculos (org_id, unidad_id, persona_id, tipo, enviar_corte)
        values (v_org, v_unidad, v_persona, v_tipo_v, coalesce(v_corte, true));
        v_n_vinc := v_n_vinc + 1;
      elsif v_vigente <> v_persona then
        raise exception 'La unidad % ya tiene otro % registrado. El importador no lo cambia: hágalo desde la ficha de la unidad.', v_codigo, v_tipo_v;
      elsif v_f->>'accion' = 'actualizar' and v_corte is not null and v_corte is distinct from v_corte_hoy then
        -- La misma persona: solo cambia «recibe corte», y solo al actualizar.
        update public.vinculos v set enviar_corte = v_corte where v.id = v_vinculo;
        v_n_vact := v_n_vact + 1;
      end if;
      v_vigente := null;
      v_vinculo := null;
    end loop;

    -- 5. La nota de la unidad (crea o reemplaza; nunca la borra).
    if v_nota is not null then
      insert into public.notas_unidad (unidad_id, org_id, nota)
      values (v_unidad, v_org, v_nota)
      on conflict (unidad_id) do update set nota = excluded.nota
        where public.notas_unidad.nota is distinct from excluded.nota;
      if found then v_n_notas := v_n_notas + 1; end if;
    end if;

    -- 6. Quién paga, al final de la fila (los inquilinos ya existen).
    if nullif(v_f->>'paga', '') is not null then
      update public.unidades u set paga = v_f->>'paga' where u.id = v_unidad;
    end if;
  end loop;

  return jsonb_build_object(
    'unidades_creadas',      v_n_creadas,
    'unidades_actualizadas', v_n_act,
    'personas_nuevas',       v_n_pnuevas,
    'personas_completadas',  v_n_pcompl,
    'vinculos_nuevos',       v_n_vinc,
    'vinculos_actualizados', v_n_vact,
    'notas_guardadas',       v_n_notas);
end $function$;

comment on function public.importar_unidades(uuid, jsonb, jsonb) is
  'Carga de «Cargar datos» en una transacción: crea o actualiza unidades '
  '(saldos de condominio y de administración antes del primer cierre, y la '
  'nota de la unidad), crea o '
  'completa personas (sin pisar datos; el tratamiento del archivo manda) y '
  'crea los vínculos que falten, con «recibe corte». Nunca cambia al '
  'propietario/inquilino vigente ni toca accesos. SECURITY INVOKER. Ver '
  'supabase/migrations/20261025120000_importar_unidades_plantilla.sql.';

commit;

-- Verificación: select md5(prosrc) from pg_proc where proname = 'importar_unidades';
-- → 467fadf95398b1ce1e99ed8bb6b85655
