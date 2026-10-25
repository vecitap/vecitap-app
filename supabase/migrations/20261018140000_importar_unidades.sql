-- `importar_unidades()`: la carga de «Cargar datos» en una sola transacción
-- (ronda 5, M3).
--
-- Aplicada en vecitap-pruebas el 18-oct; revisada por Nicolás el 24-oct y
-- reaplicada en pruebas el 25-oct con sus ajustes (drop + create: no tenía
-- commit ni estaba en producción). SIN APLICAR en vecitap-produccion: la
-- aplica Nicolás, con respaldo previo. Escribe en `unidades`, `personas` y
-- `vinculos`.
--
-- Ajustes de la revisión del 24-oct:
-- · `personas_completadas` cuenta solo las fichas donde de verdad se llenó
--   un campo vacío (antes contaba toda ficha existente que llegara con algún
--   dato, aunque ya lo tuviera).
-- · Persona nueva cuyo nombre es de una empresa o una junta (contiene C.A.,
--   S.A. o S.R.L., o empieza con «Junta») se guarda **sin tratamiento**
--   (`prefijo` null), aunque la pantalla mande uno. Null y no '': así
--   `concat_ws` (destinatarios_de) y `nombreDe` (pantallas, recibos, PDF) no
--   dejan un espacio de más.
-- · Propietario o inquilino distinto del vigente: la base lo sigue
--   rechazando (red de seguridad), pero la pantalla ya no lo manda nunca.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ
-- ─────────────────────────────────────────────────────────────────────────
-- El importador viejo ("Importar unidades") escribía desde el navegador en
-- tres o cuatro pasos seguidos: unidades, después propietarios, después
-- inquilinos, después "quién paga". Si fallaba uno del medio, quedaba la
-- mitad cargada y había que arreglarlo a mano unidad por unidad. Gustavo pidió
-- que "nada se guarde hasta que la administradora confirme": con esta
-- función, al confirmar se guarda **todo o nada**.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SEGURIDAD
-- ─────────────────────────────────────────────────────────────────────────
-- · SECURITY INVOKER: corre con los permisos de quien la llama. Cada INSERT y
--   UPDATE pasa por las mismas políticas de RLS que ya pasaba el importador
--   viejo (`unidades_escribir`, `personas_escribir`, `vinculos_escribir`:
--   todas `puede_operar(org_id)`) y por los mismos disparadores
--   (`vinculos_unidad_misma_org`, `unidades_paga_exige_inquilino`…). No da
--   ningún permiso nuevo: es lo mismo que el navegador ya podía hacer, en una
--   transacción.
-- · Además comprueba `puede_operar` al principio, para devolver un mensaje
--   claro en vez de un error de RLS a mitad de camino.
-- · La organización sale del edificio, nunca de lo que mande el cliente.
--   Una persona existente (`persona_id`) tiene que ser de esa organización.
--   Una unidad a actualizar tiene que ser de ese edificio.
-- · EXECUTE solo para `authenticated`.
--
-- ─────────────────────────────────────────────────────────────────────────
-- REGLAS (las de Nicolás del 18-oct; la pantalla ya las aplica y la base las
-- vuelve a exigir, para que no dependan del navegador)
-- ─────────────────────────────────────────────────────────────────────────
-- · Unidad nueva: se crea. Unidad que ya existe: solo si la fila viene con
--   accion = 'actualizar' (por omisión la pantalla las omite y no las manda).
--   Se actualizan alícuota y tipo; el código nunca. Una unidad dada de baja
--   no se actualiza.
-- · Saldo inicial: solo si el edificio no tiene ningún mes cerrado (después
--   del primer cierre el saldo sale de la instantánea y este número no se
--   usa). Con meses cerrados la pantalla manda `saldo_inicial` null; si
--   llega un número, se rechaza todo.
-- · Persona existente: se usa esa ficha. Solo se **completan** los datos
--   vacíos (teléfono, correo, correo de respaldo); nunca se pisa un dato que
--   ya tiene, ni el nombre.
-- · Persona nueva: el tratamiento que mande la pantalla, o «Sr.» (el valor
--   por omisión de la columna) si no manda ninguno; **sin tratamiento** si el
--   nombre contiene C.A., S.A. o S.R.L. (con o sin puntos, mayúsculas o
--   minúsculas, como palabra suelta) o empieza con «Junta».
-- · **El importador no cambia de propietario ni de inquilino.** La pantalla
--   no manda el vínculo cuando la unidad ya tiene otra persona vigente (carga
--   la fila sin él y avisa «cámbielo desde la ficha»). Si igual llega, se
--   rechaza todo (eso va por la ficha, que pide confirmación y le quita el
--   acceso al anterior). Si es la misma persona, no se toca. Si no tiene, se
--   crea el vínculo.
-- · Nunca crea, apaga ni cambia accesos a la app (`membresias`).
-- · "Quién paga" se fija al final, cuando los inquilinos ya existen (guarda
--   B de 20260930120000_unidades_paga.sql).
--
-- ─────────────────────────────────────────────────────────────────────────
-- FORMA DE LOS PARÁMETROS
-- ─────────────────────────────────────────────────────────────────────────
-- p_personas: [{ ref, persona_id?, prefijo?, nombre, telefono?, correo?,
--               correo_respaldo? }]
--   `ref` es un nombre interno del archivo (p. ej. "p3"): las filas apuntan a
--   la persona por su `ref`, así un propietario de seis unidades es UNA
--   persona. Con `persona_id`, es una ficha que ya existe.
-- p_filas:    [{ accion: 'crear'|'actualizar', unidad_id? (si actualiza),
--               codigo, tipo?, alicuota, saldo_inicial? (null = no tocar),
--               paga? ('propietario'|'inquilino'; null = no tocar),
--               propietario? (ref), inquilino? (ref) }]
-- Devuelve: { unidades_creadas, unidades_actualizadas, personas_nuevas,
--             personas_completadas, vinculos_nuevos }.

begin;

create function public.importar_unidades(
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

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (todas en transacciones que se deshacen; ids de pruebas)
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Forma y permisos:
--   select prosecdef, proconfig, proacl from pg_proc where proname = 'importar_unidades';
--   -- Esperado: prosecdef = false, proconfig = {search_path=public},
--   --   EXECUTE para authenticated (y el dueño), no para anon ni PUBLIC.
--
-- 2. Sin sesión: "Sin permiso para cargar datos en …".
--   select public.importar_unidades('<edificio>', '[]', '[{"accion":"crear","codigo":"X"}]');
--
-- 3. Como la administradora (request.jwt.claims con su sub y
--    `set local role authenticated`, para que RLS aplique), en un edificio
--    sin meses cerrados: 1A y 1B con el MISMO propietario (ref p1), y EST
--    (estacionamiento) con ese propietario más una inquilina que paga.
--   -- Esperado: unidades_creadas 3, personas_nuevas 2 (una sola ficha para
--   --   el propietario de tres unidades), vinculos_nuevos 4, EST con
--   --   paga = 'inquilino', tipos guardados, correo en minúsculas.
--
-- 4. Todo o nada: una carga con 2C nueva + 1A con OTRO propietario.
--   -- Esperado: "La unidad 1A ya tiene otro propietario registrado. El
--   --   importador no lo cambia…" y 2C NO queda creada.
--
-- 5. Persona existente (persona_id de una ficha con teléfono y sin correo),
--    mandando otro nombre, otro teléfono y un correo.
--   -- Esperado: personas_completadas 1; el teléfono y el nombre NO cambian;
--   --   el correo se completa.
--
-- 5b. (24-oct) La misma ficha, mandada otra vez con otro teléfono y el
--    correo que ya tiene (no le falta nada que el archivo traiga).
--   -- Esperado: personas_completadas 0 y la ficha no cambia.
--
-- 5c. (24-oct) Personas nuevas «Inversiones Uno, C.A.», «Beganu, s.a.»,
--    «Comercial SRL», «Junta de Condominio Torre A» (con prefijo 'Sr.'
--    mandado a propósito), «Rosa Casanova» y «Pedro Sa Ca» (sin prefijo),
--    y «Dra. Gil» con prefijo 'Dra.'.
--   -- Esperado: las cuatro primeras con prefijo NULL (no ''); Rosa Casanova
--   --   con 'Sr.'; Dra. Gil con 'Dra.'. (Pedro Sa Ca: 'Sa' y 'Ca' sueltos sí
--   --   cuentan como S.A./C.A. → NULL; es el precio de aceptarlos sin
--   --   puntos, y no aparece en la planilla del piloto.)
--
-- 6. Saldo inicial en un edificio con meses cerrados.
--   -- Esperado: "El edificio ya tiene meses cerrados…" y nada se guarda.
--
-- 7. Una cuenta que no administra el edificio (un residente).
--   -- Esperado: "No se encontró el edificio." (RLS no le deja ver el edificio).
--
-- Las siete se corrieron en vecitap-pruebas el 18-oct, en una transacción
-- deshecha, con el resultado esperado. Después de reaplicarla (25-oct) se
-- corrieron de nuevo, más 5b y 5c, con el resultado esperado. Ver
-- docs/estado-migracion.md, sección «Ronda 5».
