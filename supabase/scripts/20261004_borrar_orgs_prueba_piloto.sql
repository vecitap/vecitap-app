-- Borra las dos organizaciones que Gustavo creó en producción para probar
-- la carga del piloto (01 y 02-oct), con todo lo que depende de ellas.
--
-- NO es una migración: no cambia el esquema, borra datos. Por eso vive en
-- supabase/scripts/ y no tiene rollback: el reverso es el respaldo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CÓMO SE CORRE
-- ─────────────────────────────────────────────────────────────────────────
--   1. Respaldo de producción (docs/respaldo.md). Sin respaldo no se corre.
--   2. Correrlo tal cual, con v_confirmar = false. Es un ensayo: hace todo,
--      arma el informe y termina en un error que DESHACE la transacción. El
--      informe sale en el mensaje del error ("ENSAYO — nada quedó escrito").
--      Revisar que los números "antes" sean los esperados y que "después"
--      sea todo 0.
--   3. Solo entonces cambiar v_confirmar a true y correrlo de nuevo. El
--      informe sale como NOTICE.
--   4. Correr la VERIFICACIÓN del final.
--
-- Probado en vecitap-pruebas el 04-oct, en modo ensayo (nada quedó
-- escrito), contra una organización de pruebas con edificios, unidades,
-- vínculos y membresías. Ver docs/estado-migracion.md.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE Y POR QUÉ ASÍ
-- ─────────────────────────────────────────────────────────────────────────
-- · Guarda: tienen que existir las dos y haber sido creadas desde el
--   01-oct. Si no, aborta sin tocar nada (protege contra un id mal pegado).
-- · Un solo DELETE sobre `organizaciones`: las 27 tablas que dependen de
--   ella tienen ON DELETE CASCADE, y `membresia_ultimo_admin()` deja pasar
--   el borrado de la última administradora cuando la organización ya no
--   existe, que es justo este caso.
-- · `auditoria` tiene org_id SIN clave foránea: sus filas no caen con la
--   cascada, y además el propio borrado agrega filas nuevas (los
--   disparadores aud_*). Se borran al final, para que no quede historia
--   colgando de una organización que ya no existe.
-- · NO toca los usuarios de Auth: una cuenta puede tener membresías en
--   otras organizaciones, y borrar un usuario es otra decisión. El informe
--   dice cuántas cuentas quedan sin ninguna membresía.
-- · NO toca Storage: Supabase no deja borrar `storage.objects` por SQL. El
--   informe cuenta los comprobantes bajo `<org_id>/` en el bucket
--   `comprobantes`; si hay alguno, se borran desde el panel de Storage.
-- ─────────────────────────────────────────────────────────────────────────

do $borrar$
declare
  -- ▼▼▼ Lo único que se edita ▼▼▼
  v_confirmar boolean := false;
  v_orgs uuid[] := array[
    '43f8192f-6a28-4997-b52d-0176aa06efb9',   -- creada 2026-10-01, 53 unidades
    '304b9a43-2a04-4cc5-85bd-9c00d78772e4'    -- creada 2026-10-02, 2 unidades
  ]::uuid[];
  v_desde timestamptz := '2026-10-01 00:00:00-04';
  -- ▲▲▲ ─────────────────────── ▲▲▲

  v_tablas text[];
  t text;
  n bigint;
  v_antes text := '';
  v_despues text := '';
  v_resto bigint := 0;
  v_encontradas int;
  v_huerfanas int;
  v_archivos int;
  v_informe text;
begin
  -- Guarda
  select count(*) into v_encontradas
    from public.organizaciones
   where id = any (v_orgs) and creada_en >= v_desde;
  if v_encontradas <> cardinality(v_orgs) then
    raise exception 'ABORTADA: se esperaban % organizaciones creadas desde %, se encontraron %. Revise los ids.',
      cardinality(v_orgs), v_desde, v_encontradas;
  end if;

  -- Todas las tablas de public con org_id (incluye auditoria)
  select array_agg(c.table_name::text order by c.table_name) into v_tablas
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
   where c.table_schema = 'public' and c.column_name = 'org_id'
     and tb.table_type = 'BASE TABLE';

  foreach t in array v_tablas loop
    execute format('select count(*) from public.%I where org_id = any ($1)', t) into n using v_orgs;
    if n > 0 then v_antes := v_antes || format('%s=%s ', t, n); end if;
  end loop;

  -- Cuentas que se quedarían sin ninguna membresía (no se borran)
  select count(distinct m.usuario_id) into v_huerfanas
    from public.membresias m
   where m.org_id = any (v_orgs)
     and not exists (select 1 from public.membresias o
                      where o.usuario_id = m.usuario_id
                        and not (o.org_id = any (v_orgs)));

  select count(*) into v_archivos
    from storage.objects o
   where o.bucket_id = 'comprobantes'
     and split_part(o.name, '/', 1) = any (select x::text from unnest(v_orgs) x);

  -- El borrado
  delete from public.organizaciones where id = any (v_orgs);
  delete from public.auditoria where org_id = any (v_orgs);

  -- Lo que quedó (tiene que ser todo 0)
  foreach t in array v_tablas loop
    execute format('select count(*) from public.%I where org_id = any ($1)', t) into n using v_orgs;
    v_resto := v_resto + n;
    if n > 0 then v_despues := v_despues || format('%s=%s ', t, n); end if;
  end loop;
  if v_resto > 0 then
    raise exception 'ABORTADA: después del borrado quedan filas: %', v_despues;
  end if;

  v_informe := format(
    'ANTES: %s| DESPUÉS: todo 0 | cuentas que quedan sin ninguna membresía (no se borraron): %s | comprobantes en Storage para borrar a mano: %s',
    v_antes, v_huerfanas, v_archivos);

  if not v_confirmar then
    raise exception 'ENSAYO — nada quedó escrito. %', v_informe;
  end if;
  raise notice 'BORRADO CONFIRMADO. %', v_informe;
end
$borrar$;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN (después de correrlo con v_confirmar = true)
-- ─────────────────────────────────────────────────────────────────────────
--   select count(*) as orgs from public.organizaciones
--    where id in ('43f8192f-6a28-4997-b52d-0176aa06efb9',
--                 '304b9a43-2a04-4cc5-85bd-9c00d78772e4');
--   -- Esperado: 0
--
--   select count(*) as auditoria from public.auditoria
--    where org_id in ('43f8192f-6a28-4997-b52d-0176aa06efb9',
--                     '304b9a43-2a04-4cc5-85bd-9c00d78772e4');
--   -- Esperado: 0
--
--   select count(*) as organizaciones_restantes from public.organizaciones;
--   -- Esperado: 1 (había 3 el 04-oct). Si da otro número, avisar.
