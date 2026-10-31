-- Correcciones de la revisión cruzada de las rondas 9 y 10 (ronda 10b).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. **Va después de
-- 20261028180000_pagos_desde_cierre.sql** (la guarda exige su
-- pagos_desde_cierre()), **de 20261028150000_solo_operador_y_ajustes_seguridad.sql**
-- (exige su org_campos_del_operador()) **y de 20261027140000_recibo_titulares_sin_bs.sql**
-- (desde ahí la única que llama a destinatarios_de() es garita_avisar(): la
-- guarda lo comprueba). Es la última del Paso 8. Rollback:
-- supabase/rollbacks/20261031120000_correcciones_revision_r9_r10_rollback.sql.
--
-- QUÉ CAMBIA (reemplazos exactos dentro de cada función, con md5 antes y
-- después; nada más):
--
-- A1 · pagos_desde_cierre(uuid): el control de acceso deja de usar NOT IN.
--   `x not in (subconsulta)` da NULL si la subconsulta trae algún NULL, o si x
--   es NULL, y un IF con NULL no entra: la función no avisaba «Sin acceso».
--   Hoy unidades_visibles() (SETOF uuid) no devuelve NULL en ninguna de las dos
--   bases: las dos primeras ramas sacan unidades.id (clave primaria) y la
--   tercera filtra `m.unidad_id is not null`. El único NULL posible era
--   p_unidad = NULL, que devolvía 0 y 0 (filtra `unidad_id = NULL`: ninguna
--   fila), sin datos ajenos. Se cambia igual: el control no tiene que depender
--   de cómo esté escrita otra función. Con NULL ahora responde «Sin acceso a
--   esa unidad».
--
-- A2 · «hola@vecitap.com» → «info@vecitap.com» (el contacto acordado con
--   Gustavo), solo ese texto, en los tres mensajes de la base que lo traían:
--   org_campos_del_operador() (1 vez), exigir_org_al_dia(uuid) (1 vez, «Esta
--   cuenta está suspendida…») y edificio_dentro_del_tope() (2 veces, el tope
--   de edificios del plan). Después de esta migración no queda ninguno en
--   `public` (la verificación lo cuenta).
--
-- A3 · destinatarios_de(uuid): el correo sale en minúsculas
--   (`lower(btrim(…))`), como lo encola todo lo demás. Su única llamada es
--   garita_avisar(), que lo usa solo como `destino` de cola_correo: en
--   producción había 1 persona con el correo sin normalizar, y su aviso de
--   visita iba a la cola tal cual. Ninguna comparación dependía de las
--   mayúsculas (correos_malos y la cola guardan la forma normalizada).
--
-- A4 · esc_html(text): escapa también la comilla doble (&quot;) y la simple
--   (&#39;). Lo usan correo_recibo(), datos_pago_html(), enviar_mensaje() y
--   garita_avisar(), siempre dentro del HTML del correo (texto o atributo
--   entre comillas dobles), donde la entidad se ve igual que el carácter. El
--   motivo: `ajustes_correo.enlace_base` entra en `href="%s"`, y con una
--   comilla doble cortaba el atributo.

begin;

do $guarda$
declare v text; r record; malas text := ''; llaman text;
begin
  for r in select * from (values
      ('public.pagos_desde_cierre(uuid)',     '7b86d8acf44f957f57a87a45b1558c24', '20261028180000_pagos_desde_cierre.sql'),
      ('public.org_campos_del_operador()',    '0b28110290b22a2a5d3dd9170720f5be', '20261028150000_solo_operador_y_ajustes_seguridad.sql'),
      ('public.exigir_org_al_dia(uuid)',      '61529947264f7088ce8d2da7187ea44e', 'esquema_inicial.sql'),
      ('public.edificio_dentro_del_tope()',   'f1f555e84ab8fe93cf5ca445ed32c048', 'esquema_inicial.sql'),
      ('public.destinatarios_de(uuid)',       '2be2e76b2ed4f1102ab8081b0b870776', 'esquema_inicial.sql'),
      ('public.esc_html(text)',               'a5f0a43bf349fe7139e9702fe789c6d1', 'esquema_inicial.sql')
    ) x(firma, md5, origen) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5 then
      malas := malas || format(' %s (md5=%s; se espera el de %s)', r.firma, coalesce(v, 'no existe'), r.origen);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: cambiaron:%', malas; end if;

  -- A3: solo garita_avisar() llama a destinatarios_de() (desde 20261027140000).
  select string_agg(p.oid::regprocedure::text, ', ' order by 1) into llaman
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname <> 'destinatarios_de'
     and p.prosrc ~ 'destinatarios_de\s*\(';
  if llaman is distinct from 'garita_avisar(uuid)' then
    raise exception 'ABORTADA: destinatarios_de() la llaman: %. Se espera solo garita_avisar(uuid): ¿falta 20261027140000_recibo_titulares_sin_bs.sql?', llaman;
  end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text;
begin
  for r in select * from (values
      -- A1: pagos_desde_cierre, sin NOT IN.
      (1, 'public.pagos_desde_cierre(uuid)',
          E'  if p_unidad not in (select unidades_visibles()) then\n',
          E'  -- Revisión cruzada r9/r10: sin NOT IN, que con un NULL da NULL y no entra al IF.\n'
          || E'  if p_unidad is null\n'
          || E'     or not exists (select 1 from unidades_visibles() v where v = p_unidad) then\n'),
      -- A2: el correo de contacto.
      (2, 'public.org_campos_del_operador()',
          $a$'fija Vecitap. Escríbanos a hola@vecitap.com si necesita '$a$,
          $b$'fija Vecitap. Escríbanos a info@vecitap.com si necesita '$b$),
      (3, 'public.exigir_org_al_dia(uuid)',
          $a$'mandar correos. Escríbanos a hola@vecitap.com.'$a$,
          $b$'mandar correos. Escríbanos a info@vecitap.com.'$b$),
      (4, 'public.edificio_dentro_del_tope()',
          $a$'de uno, escríbanos a hola@vecitap.com y le ampliamos '$a$,
          $b$'de uno, escríbanos a info@vecitap.com y le ampliamos '$b$),
      (5, 'public.edificio_dentro_del_tope()',
          $a$'hola@vecitap.com para ampliarlo.', v_tope;$a$,
          $b$'info@vecitap.com para ampliarlo.', v_tope;$b$),
      -- A3: destinatarios_de, el correo en minúsculas.
      (6, 'public.destinatarios_de(uuid)',
          $a$         nullif(btrim(coalesce(pe.correo, '')), ''),$a$ || E'\n',
          $b$         nullif(lower(btrim(coalesce(pe.correo, ''))), ''),   -- Ronda 10b: en minúsculas, como la cola$b$ || E'\n'),
      -- A4: esc_html, también las comillas.
      (7, 'public.esc_html(text)',
          $a$  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')$a$ || E'\n',
          $b$  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')$b$ || E'\n')
    ) x(n, firma, a, b) order by n loop
    d := pg_get_functiondef(to_regprocedure(r.firma));
    if (length(d) - length(replace(d, r.a, ''))) / length(r.a) <> 1 then
      raise exception 'ABORTADA: el reemplazo % (%) no aparece exactamente una vez', r.n, r.firma;
    end if;
    execute replace(d, r.a, r.b);
  end loop;
end
$reemplazo$;

do $despues$
declare v text; r record; malas text := '';
begin
  for r in select * from (values
      ('public.pagos_desde_cierre(uuid)',   'c17eb556849fb630e4f2e43b83318d2f'),
      ('public.org_campos_del_operador()',  'c43fde43b1187e0c8894da9773f2d07c'),
      ('public.exigir_org_al_dia(uuid)',    'b9c832365abf7318944d6c15f29593d7'),
      ('public.edificio_dentro_del_tope()', 'dcdd9fecaaf51552794b5a0fa2d18268'),
      ('public.destinatarios_de(uuid)',     '2558c045144a6e72adfbd5b8632f4255'),
      ('public.esc_html(text)',             'dc4d15f24644035a3580d97ef58f5b67')
    ) x(firma, md5) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5 then malas := malas || format(' %s (md5=%s)', r.firma, v); end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no quedaron como se esperaba:%', malas; end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select p.oid::regprocedure, md5(p.prosrc), p.prosecdef, array_to_string(p.proacl, ',')
--      from pg_proc p where p.pronamespace = 'public'::regnamespace
--       and p.proname in ('pagos_desde_cierre', 'org_campos_del_operador', 'exigir_org_al_dia',
--                         'edificio_dentro_del_tope', 'destinatarios_de', 'esc_html') order by 1;
--    -- Esperado (md5, prosecdef, permisos: los permisos no cambian):
--    --   pagos_desde_cierre(uuid)    c17eb556849fb630e4f2e43b83318d2f  true   postgres=X/postgres,authenticated=X/postgres
--    --   org_campos_del_operador()   c43fde43b1187e0c8894da9773f2d07c  true   (null)
--    --   exigir_org_al_dia(uuid)     b9c832365abf7318944d6c15f29593d7  true   =X/postgres,postgres=X/postgres,authenticated=X/postgres
--    --   edificio_dentro_del_tope()  dcdd9fecaaf51552794b5a0fa2d18268  true   (null)
--    --   destinatarios_de(uuid)      2558c045144a6e72adfbd5b8632f4255  true   postgres=X/postgres,authenticated=X/postgres
--    --   esc_html(text)              dc4d15f24644035a3580d97ef58f5b67  false  (null)
-- 2. select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--      and prosrc like '%hola@vecitap.com%';
--    -- Esperado: 0.
-- 3. select esc_html($$<a href="x">O'Brien & co</a>$$);
--    -- Esperado: &lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; co&lt;/a&gt;
-- 4. Como una administradora de OTRA organización (sub en request.jwt.claims,
--    role authenticated), con una unidad de un edificio ajeno:
--      select * from pagos_desde_cierre('<unidad ajena>');
--    -- Esperado: «Sin acceso a esa unidad» (42501). Con NULL: el mismo error.
-- 5. Como el inquilino con «Solo el recibo del mes», con su unidad:
--      select * from pagos_desde_cierre('<su unidad>');
--    -- Esperado: las dos sumas, igual que antes del cambio.
-- 6. select count(*) from unidades u cross join lateral destinatarios_de(u.id) d
--     where d.correo <> lower(d.correo);
--    -- Esperado: 0 (destinatarios_de ya no devuelve mayúsculas).
