-- `importar_unidades()` para la plantilla oficial de carga, y la nota de la
-- unidad (ronda 5, M4).
--
-- Aplicada en vecitap-pruebas el 25-oct; revisada por Nicolás y reaplicada el
-- 26-oct con lo que pidió (nota de la unidad, «s.n.» y «&» sin tratamiento):
-- primero su rollback y después este archivo, tal cual. SIN APLICAR en
-- vecitap-produccion: la aplica Nicolás, con respaldo previo, después de M2 y
-- M3. La función tiene la misma firma que M3 (`create or replace`). Crea una
-- tabla nueva, `notas_unidad`; no toca datos que existan.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ
-- ─────────────────────────────────────────────────────────────────────────
-- Gustavo mandó la plantilla oficial («Vecitap-plantilla-carga.xlsx», hoja
-- «Unidades»). Trae cosas que M3 no recibía (decisiones de Nicolás del 25-oct):
--
-- · SALDO ADMINISTRACION $ → `unidades.saldo_inicial_hon` (el «Saldo inicial
--   de administración» de Nueva unidad y de la ficha). La misma regla que el
--   saldo de condominio: solo si el edificio no tiene meses cerrados; si los
--   tiene y llega un número, se rechaza todo.
-- · CEDULA O RIF → `personas.documento`. Persona nueva: se guarda. Persona
--   existente: solo se completa si está vacía, como el resto de sus datos.
-- · RECIBE CORTE → `vinculos.enviar_corte`. Vínculo nuevo: el valor del
--   archivo, o «sí» si no trae (el valor por omisión de la columna). Vínculo
--   que ya existe con la misma persona: solo cambia si la fila es
--   'actualizar' (la administradora marcó «Actualizar» y vio el cambio).
-- · TRATAMIENTO → `personas.prefijo`. **El tratamiento que trae el archivo
--   manda**, incluido «Sin tratamiento» (null); uno que no está en la lista
--   también llega como null (la pantalla lo avisa). Solo cuando el archivo NO
--   trae tratamiento, una persona nueva queda sin tratamiento si su nombre
--   tiene C.A., S.A., S.R.L. o S.N. (como palabra suelta, con o sin puntos),
--   un «&», o empieza con «Junta»; si no, «Sr.». En M3 la regla de empresas
--   pisaba el tratamiento que venía, y no miraba «s.n.» ni «&».
-- · NOTA → `notas_unidad` (tabla nueva, abajo). Unidad nueva: se guarda.
--   Unidad que ya existe: la pantalla manda la nota solo si la fila es
--   'actualizar' (si la unidad no tenía nota, «se completa»; si tenía otra,
--   se muestra el cambio). Hasta 1.000 caracteres.
--
-- Todo lo demás es igual a M3 (20261018140000_importar_unidades.sql): la
-- seguridad, el todo o nada, no cambiar de propietario ni de inquilino, no
-- tocar accesos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LA NOTA, EN UNA TABLA APARTE (no una columna de `unidades`)
-- ─────────────────────────────────────────────────────────────────────────
-- La nota es solo para la administración. Un residente **puede leer la fila
-- de su unidad**: la política `unidades_ver` deja ver las de
-- `unidades_visibles()`, que incluye `membresias.unidad_id` (y la junta ve
-- todas las de su edificio, y el contador todas las de la organización).
-- Una columna en `unidades` quedaría a la vista de todos ellos con un
-- `select` directo. Por eso va en `notas_unidad`, con RLS:
--
-- · ver, crear, cambiar y borrar: solo `puede_operar(org_id)` (propietario de
--   la cuenta y administrador). Ni residentes, ni junta, ni contador, ni
--   vigilantes. Sin acceso para `anon`.
-- · `org_id` lo pone un disparador a partir de la unidad (nunca el cliente),
--   y la política vuelve a exigir `puede_operar` sobre esa organización.
-- · Ninguna función, vista ni pantalla del residente la lee (verificado:
--   `mis_unidades`, `saldos_actuales`, el recibo y /mi no la tocan).
--
-- ─────────────────────────────────────────────────────────────────────────
-- FORMA DE LOS PARÁMETROS (lo nuevo, marcado con *)
-- ─────────────────────────────────────────────────────────────────────────
-- p_personas: [{ ref, persona_id?, prefijo?*, nombre, documento?*,
--               telefono?, correo?, correo_respaldo? }]
--   * `prefijo`: con la clave, es el tratamiento del archivo y se usa tal
--     cual ('' o null = sin tratamiento). Sin la clave, el archivo no trae
--     tratamiento: regla de empresas, o «Sr.».
-- p_filas:    [{ accion, unidad_id?, codigo, tipo?, alicuota,
--               saldo_inicial?, saldo_inicial_hon?* (null = no tocar),
--               nota?* (null o vacía = no tocar),
--               paga?, propietario? (ref), inquilino? (ref),
--               propietario_corte?*, inquilino_corte?* (true/false;
--               null = no trae) }]
-- Devuelve lo de M3 más `vinculos_actualizados` (vínculos existentes a los
-- que se les cambió «recibe corte») y `notas_guardadas`.

begin;

-- ── La nota de la unidad ──────────────────────────────────────────────────
create table public.notas_unidad (
  unidad_id       uuid primary key references public.unidades(id) on delete cascade,
  org_id          uuid not null references public.organizaciones(id) on delete cascade,
  nota            text not null check (char_length(nota) between 1 and 1000),
  actualizada_en  timestamptz not null default now(),
  actualizada_por uuid
);

comment on table public.notas_unidad is
  'Nota de la unidad, solo para la administración (RLS: puede_operar). Aparte '
  'de unidades porque un residente puede leer la fila de su unidad. Ver '
  'supabase/migrations/20261025120000_importar_unidades_plantilla.sql.';

-- La organización sale de la unidad, nunca del cliente; la nota va sin
-- espacios de más; y queda quién y cuándo. SECURITY INVOKER: lee `unidades`
-- con los permisos de quien escribe (una administradora la ve).
create function public.notas_unidad_completar()
  returns trigger
  language plpgsql
  security invoker
  set search_path to 'public'
  as $function$
begin
  select u.org_id into new.org_id from public.unidades u where u.id = new.unidad_id;
  if new.org_id is null then
    raise exception 'No se encontró la unidad de la nota.';
  end if;
  new.nota := btrim(new.nota);
  new.actualizada_en := now();
  new.actualizada_por := auth.uid();
  return new;
end $function$;

revoke all on function public.notas_unidad_completar() from public, anon, authenticated;

create trigger notas_unidad_completar
  before insert or update on public.notas_unidad
  for each row execute function public.notas_unidad_completar();

alter table public.notas_unidad enable row level security;

create policy notas_unidad_administracion on public.notas_unidad
  for all to authenticated
  using (public.puede_operar(org_id))
  with check (public.puede_operar(org_id));

-- Los privilegios por omisión del esquema le dan a `authenticated` también
-- TRUNCATE (que no pasa por RLS), REFERENCES y TRIGGER: se quitan, y quedan
-- solo los cuatro que la política controla.
revoke all on public.notas_unidad from anon, authenticated;
grant select, insert, update, delete on public.notas_unidad to authenticated;

-- ── La carga ─────────────────────────────────────────────────────────────
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

-- `create or replace` conserva los permisos de M3; se repiten por si se
-- aplica sobre una base donde no estaban.
revoke all on function public.importar_unidades(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importar_unidades(uuid, jsonb, jsonb) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (todas en una transacción que se deshace; ids de pruebas)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Forma y permisos:
--   select prosecdef, proconfig, proacl from pg_proc where proname = 'importar_unidades';
--   -- Esperado: una sola fila; prosecdef = false, proconfig =
--   --   {search_path=public}, EXECUTE para authenticated (y el dueño), no
--   --   para anon ni PUBLIC.
--   select relrowsecurity from pg_class where oid = 'public.notas_unidad'::regclass;
--   select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid)
--     from pg_policy where polrelid = 'public.notas_unidad'::regclass;
--   select relacl from pg_class where oid = 'public.notas_unidad'::regclass;
--   -- Esperado: RLS activo; una política, «*», para authenticated, con
--   --   puede_operar(org_id). authenticated solo con arwd (sin TRUNCATE);
--   --   anon sin nada.
--
-- 2. Las de M3 siguen igual (sin sesión → «Sin permiso…»; mismo propietario
--    en tres unidades → una persona; todo o nada; persona existente solo se
--    completa; saldo con meses cerrados → error).
--
-- 3. Tratamiento (como la administradora, `set local role authenticated`):
--    personas nuevas «Comercial XYZ, C.A.» con prefijo 'Sres.'; «Inversiones
--    ABC, C.A.» con prefijo null («Sin tratamiento»); «Inversiones Uno,
--    C.A.», «Junta de Condominio Torre A», «Lebelavobotun Facotab, s.n.» y
--    «Rerozo, Ropopar & Vumulinog» sin la clave prefijo; «Juan Pérez» y
--    «Sonia Sn Prueba» sin la clave; «María Gómez» con 'Dra.'; «Pedro Ing» con
--    'Ing.'; «Firma & Hijos» con 'Sres.'.
--   -- Esperado: 'Sres.'; NULL; NULL; NULL; NULL; NULL; 'Sr.'; NULL ('Sn'
--   --   suelto cuenta como S.N., como 'Sa'/'Ca' en M3); 'Dra.'; 'Ing.';
--   --   'Sres.' (el del archivo manda).
--
-- 4. Cédula: persona nueva con documento 'V-12345678' → se guarda así.
--    Persona existente sin documento, mandada con 'V-1' → se completa
--    (personas_completadas 1). La misma ficha, ya con documento, mandada con
--    'V-2' → no cambia (personas_completadas 0).
--
-- 5. Saldo de administración: unidad nueva con saldo_inicial_hon 25 → 25;
--    sin la clave → 0. 'actualizar' con saldo_inicial_hon 10 → 10; con null
--    → no cambia. En un edificio con meses cerrados, un número → «El
--    edificio ya tiene meses cerrados: el saldo de administración…» y nada
--    se guarda.
--
-- 6. Recibe corte: unidad nueva con propietario_corte false e
--    inquilino_corte null → vínculos con enviar_corte false y true.
--    'actualizar' de esa unidad con la misma persona y propietario_corte
--    true → true, vinculos_actualizados 1. 'actualizar' con
--    propietario_corte null → no cambia (vinculos_actualizados 0).
--
-- 7. Nota: unidad nueva con nota → una fila en notas_unidad, con el org_id
--    de la unidad (aunque se mande otro). 'actualizar' con otra nota → se
--    reemplaza (notas_guardadas 1); con la misma → notas_guardadas 0; con
--    null → no cambia. Una nota de 1.001 caracteres → error y nada se guarda.
--
-- 8. La nota no la ve nadie más (como cada cuenta, con su sub y
--    `set local role authenticated`):
--    · la cuenta `+propietario` (residente de 02A del Edificio Gustavo), con
--      una nota en 02A: select en notas_unidad → 0 filas; insert → error de
--      RLS; select de su fila en unidades → sin columna de nota (no existe);
--      mis_unidades() y saldos_actuales sin la nota.
--    · anon: select → «permission denied».
--    · la administradora: ve la nota de 02A.
--
-- Corridas en vecitap-pruebas el 26-oct, en transacciones deshechas, con el
-- resultado esperado; también la carga exacta que arma la pantalla para
-- «Vecitap-plantilla-casos.xlsx» y el rollback. Ver docs/estado-migracion.md,
-- sección «Ronda 5».
