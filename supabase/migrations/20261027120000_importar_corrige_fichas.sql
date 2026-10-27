-- Lo corregido en la previa de «Cargar datos» queda en la ficha que ya existe
-- (ronda 8, bloque A1; prueba 5 de Gustavo).
--
-- Aplicada en vecitap-pruebas el 27-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261025120000_importar_unidades_plantilla.sql (M4)**: la
-- guarda exige su importar_unidades(). Rollback:
-- supabase/rollbacks/20261027120000_importar_corrige_fichas_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA
-- ─────────────────────────────────────────────────────────────────────────
-- Gustavo corrigió en la previa el teléfono de 10C («corregido en la
-- previa»), cargó en un edificio nuevo, y la ficha seguía con el teléfono
-- viejo. La persona de 10C ya existía en su administradora: la carga usó esa
-- ficha y, como siempre, **solo completó lo vacío** (M3/M4: «nunca pisa
-- datos de una persona que ya existe»). La corrección se perdía en silencio.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LA REGLA NUEVA
-- ─────────────────────────────────────────────────────────────────────────
-- Lo que la administradora corrige en la previa es lo que queda. Cada
-- persona de `p_personas` que va a una ficha existente puede traer
-- `cambiar`: { nombre?, telefono?, correo?, correo_respaldo?, documento? }.
-- Solo lo arma la previa, y solo con los campos que se corrigieron a mano
-- en ella (lib/admin/cargar-datos/analisis.ts); la previa lo dice en la
-- misma fila («Cambia el teléfono de la ficha de …»). Esos campos
-- **reemplazan** el dato de la ficha. Lo que no se corrigió sigue igual que
-- antes: solo completa lo vacío.
--   · Un valor vacío no borra nada (la carga nunca borra datos de una ficha).
--   · El tratamiento no está en `cambiar`: se cambia desde la ficha.
--   · No cambia permisos: la función sigue SECURITY INVOKER, y la
--     administradora ya puede editar esa ficha (RLS de personas).
-- Devuelve además `personas_cambiadas` (fichas existentes con algún dato
-- reemplazado).

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.importar_unidades(uuid,jsonb,jsonb)'::regprocedure;
  if v is distinct from '467fadf95398b1ce1e99ed8bb6b85655' then
    raise exception 'ABORTADA: importar_unidades() cambió (md5(prosrc)=%). ¿Falta 20261025120000_importar_unidades_plantilla.sql?', v;
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
  v_cambia     jsonb;                   -- Ronda 8: lo corregido en la previa
  v_n_pcamb    integer := 0;
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
      -- Ronda 8: lo que la administradora corrigió en la previa es lo que
      -- queda. Esos campos (y solo esos, en `cambiar`) reemplazan el dato de
      -- la ficha, no solo lo completan. Nunca con un valor vacío: la carga no
      -- borra datos de una ficha.
      v_cambia := case when jsonb_typeof(v_p->'cambiar') = 'object' then v_p->'cambiar' end;
      if v_cambia is not null then
        update public.personas pe
           set nombre          = coalesce(nullif(btrim(v_cambia->>'nombre'), ''), pe.nombre),
               telefono        = coalesce(nullif(btrim(v_cambia->>'telefono'), ''), pe.telefono),
               correo          = coalesce(nullif(lower(btrim(v_cambia->>'correo')), ''), pe.correo),
               correo_respaldo = coalesce(nullif(lower(btrim(v_cambia->>'correo_respaldo')), ''), pe.correo_respaldo),
               documento       = coalesce(nullif(btrim(v_cambia->>'documento'), ''), pe.documento)
         where pe.id = v_persona
           and (pe.nombre, pe.telefono, pe.correo, pe.correo_respaldo, pe.documento) is distinct from
               (coalesce(nullif(btrim(v_cambia->>'nombre'), ''), pe.nombre),
                coalesce(nullif(btrim(v_cambia->>'telefono'), ''), pe.telefono),
                coalesce(nullif(lower(btrim(v_cambia->>'correo')), ''), pe.correo),
                coalesce(nullif(lower(btrim(v_cambia->>'correo_respaldo')), ''), pe.correo_respaldo),
                coalesce(nullif(btrim(v_cambia->>'documento'), ''), pe.documento));
        if found then v_n_pcamb := v_n_pcamb + 1; end if;
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
    'personas_cambiadas',    v_n_pcamb,
    'vinculos_nuevos',       v_n_vinc,
    'vinculos_actualizados', v_n_vact,
    'notas_guardadas',       v_n_notas);
end $function$;

comment on function public.importar_unidades(uuid, jsonb, jsonb) is
  'Carga de «Cargar datos» en una transacción: crea o actualiza unidades '
  '(saldos de condominio y de administración antes del primer cierre, y la '
  'nota de la unidad), crea o completa personas (sin pisar datos, salvo lo '
  'corregido en la previa, que viene en cambiar; el tratamiento del archivo '
  'manda) y crea los vínculos que falten, con «recibe corte». Nunca cambia al '
  'propietario/inquilino vigente ni toca accesos. SECURITY INVOKER. Ver '
  'supabase/migrations/20261027120000_importar_corrige_fichas.sql.';

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (en una transacción que se deshace)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), prosecdef from pg_proc where proname = 'importar_unidades';
--    -- Esperado: 64fac9ed0e225513035dfd6688715fc4, false (sigue SECURITY INVOKER).
-- 2. Como la administradora (set local role authenticated + sus claims), con
--    una ficha existente X de teléfono '0412-1111111' y correo 'a@x.com':
--      select public.importar_unidades('<edificio>',
--        '[{"ref":"p1","persona_id":"<X>","nombre":"…","telefono":"0414-2222222",
--           "cambiar":{"telefono":"0414-2222222"}}]',
--        '[{"accion":"crear","codigo":"ZZ-1","alicuota":1,"propietario":"p1"}]');
--      select telefono, correo from personas where id = '<X>';
--    -- Esperado: personas_cambiadas 1; teléfono 0414-2222222; correo a@x.com.
--    Lo mismo sin "cambiar" → personas_cambiadas 0 y el teléfono no cambia
--    (como antes). Con "cambiar":{"correo":""} → no cambia nada.
-- Corridas en vecitap-pruebas el 27-oct (ver docs/estado-migracion.md,
-- «Ronda 8»).
