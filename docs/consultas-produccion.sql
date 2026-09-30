-- ═══════════════════════════════════════════════════════════════════════════
-- Radiografía de las dos bases, antes de salir a producción
--
-- **TODAS las consultas de este archivo son de SOLO LECTURA.** No hay un
-- solo INSERT, UPDATE, DELETE, CREATE ni ALTER. Se pueden correr con la base
-- en uso, sin avisarle a nadie y sin respaldo previo.
--
-- Cómo se usa: Supabase → SQL Editor. Cada bloque dice **en qué base** se
-- corre y **qué resultado se espera**. Los bloques que dicen "en las dos"
-- hay que correrlos una vez en cada proyecto y comparar los resultados
-- (no se puede consultar una base desde la otra).
--
--   · vecitap-produccion  ref sudghmerriewjmmnlcrf
--   · vecitap-pruebas     ref hdivffuorclzulijkyry
--
-- Para comparar cómodo: "Download CSV" en cada base y diff de los dos
-- archivos. Las consultas ya vienen con `order by` fijo para que el diff sea
-- limpio.
--
-- ⚠ NINGUNA consulta devuelve el VALOR de un secreto. El bloque (f) trae
--   nombres, fechas y longitudes, nunca el contenido. Está hecho así a
--   propósito: el resultado de estas consultas se pega en documentos y en
--   chats. No lo cambie.
--
-- Índice:
--   (a) Funciones de public: md5, SECURITY DEFINER, search_path
--   (b) RLS: qué tablas lo tienen activo y qué políticas hay
--   (c) Triggers y extensiones
--   (d) Tareas programadas (cron.job)
--   (e) Storage: buckets y políticas de storage.objects
--   (f) Quién despacha cola_correo y dónde vive la clave de Resend
--   (g) URLs escritas dentro de la base (incluidas las plantillas de correo)
--   (h) Qué migraciones del repo ya están aplicadas
--   (z) El orden exacto para aplicar lo que falte en producción
-- ═══════════════════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════════════════
-- (a) FUNCIONES DE public
--     Correr en LAS DOS BASES y comparar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Qué se espera:
--   · El MISMO conjunto de funciones en las dos bases. Una función que esté
--     en pruebas y no en producción es, casi seguro, una migración aplicada
--     de un lado nomás — el bloque (h) lo confirma.
--   · `md5_definicion` igual en las dos para cada función. Donde difiera,
--     alguien tocó una de las dos bases por fuera de las migraciones.
--   · Las funciones de seguridad (`puede_operar`, `tiene_rol`, `es_operador`,
--     `unidades_visibles`, `unidades_historico`, `edificios_visibles`,
--     `periodos_corrientes`, `permitir_garita`, `puede_garita`,
--     `edificios_del_vigilante`) tienen que salir con
--     `security_definer = true` Y con un `search_path` fijo. Una
--     SECURITY DEFINER **sin** search_path fijo es un agujero: el llamante
--     elige desde qué esquema se resuelven los nombres. Si aparece alguna
--     así, no se sale a producción hasta arreglarla.
--   · Las auxiliares de zona (`hoy_local`, `inicio_dia_local`, `dia_local`)
--     al revés: `security_definer = false` y `search_path` vacío
--     (`search_path=`, con el `=` y nada después).

select p.proname                                 as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       l.lanname                                 as lenguaje,
       p.provolatile                             as volatilidad,   -- i/s/v
       p.prosecdef                               as security_definer,
       coalesce(array_to_string(p.proconfig, ' | '),
                '(hereda la de la sesión)')      as search_path,
       md5(pg_get_functiondef(p.oid))            as md5_definicion,
       md5(p.prosrc)                             as md5_cuerpo
  from pg_proc p
  join pg_language l on l.oid = p.prolang
 where p.pronamespace = 'public'::regnamespace
   and p.prokind = 'f'
 order by p.proname, pg_get_function_identity_arguments(p.oid);


-- (a.2) El mismo resultado, resumido a una sola fila, para comparar de un
--       vistazo antes de ponerse a mirar función por función.
--       Esperado: el mismo par (cuantas, huella) en las dos bases una vez
--       que estén al día.

select count(*)                                                as cuantas,
       md5(string_agg(md5(pg_get_functiondef(p.oid)), ','
                      order by p.proname,
                               pg_get_function_identity_arguments(p.oid))) as huella
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prokind = 'f';


-- (a.3) Las SECURITY DEFINER sin search_path fijo. Esperado: CERO FILAS en
--       las dos bases. Cualquier fila acá es un hallazgo de seguridad.

select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prosecdef
   and (p.proconfig is null
        or not exists (select 1 from unnest(p.proconfig) c
                        where c like 'search_path=%'))
 order by p.proname;



-- ═══════════════════════════════════════════════════════════════════════════
-- (b) RLS: TABLAS Y POLÍTICAS
--     Correr en LAS DOS BASES y comparar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Qué se espera en (b.1):
--   · `rls_activo = true` en TODAS las tablas de public. Una tabla con RLS
--     apagado está abierta a cualquiera con la clave anon, que es pública.
--     Si aparece una en false, es bloqueante para el lanzamiento.
--   · `politicas = 0` **solo** en `operadores`, `secretos` y `tasa_pendiente`.
--     Esas tres están bloqueadas al cliente a propósito (AGENTS.md): con RLS
--     activo y sin políticas, el frontend no recibe error, recibe vacío.
--     Cualquier OTRA tabla con 0 políticas es una tabla inaccesible por
--     accidente — o una que se olvidó de abrir.

select c.relname                        as tabla,
       c.relrowsecurity                 as rls_activo,
       c.relforcerowsecurity            as rls_forzado,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as politicas
  from pg_class c
 where c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
 order by c.relname;


-- (b.2) Las políticas en detalle. Esperado: mismo conjunto en las dos bases,
--       con las mismas expresiones. Mirar en particular:
--         · `correos_malos_ver` → tiene que usar `es_operador()`. Si dice
--           `auth.uid() IS NOT NULL`, falta aplicar 20260928130000.
--         · toda política que filtre por organización tiene que pasar por
--           una de las funciones de seguridad, no por una subconsulta suelta.

select tablename  as tabla,
       policyname as politica,
       cmd        as operacion,
       permissive,
       roles,
       qual       as usando,
       with_check as al_escribir
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;



-- ═══════════════════════════════════════════════════════════════════════════
-- (c) TRIGGERS Y EXTENSIONES
--     Correr en LAS DOS BASES y comparar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (c.1) Triggers. Esperado: el mismo conjunto en las dos bases. Los que
--       importan y tienen que estar sí o sí en producción:
--         · `cola_modulo` en cola_correo (no encola si el módulo está
--           apagado)
--         · `membresia_ultimo_admin` (impide dejar una organización sin
--           administrador)
--         · `cierre_exige_activo` y `impedir_tocar_ajuste_cerrado`
--       Un trigger que falte en producción es una regla de negocio que allá
--       no se aplica, y no da error: simplemente deja pasar lo que debería
--       frenar.

select c.relname            as tabla,
       t.tgname             as disparador,
       pg_get_triggerdef(t.oid) as definicion
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'public'::regnamespace
   and not t.tgisinternal
 order by c.relname, t.tgname;


-- (c.2) Extensiones. Esperado: las mismas y en el mismo esquema.
--       Imprescindibles en producción, porque hay código que se cae sin
--       ellas:
--         · **pg_net** — `despachar_correos` (net.http_post a Resend) y
--           `traer_tasa_bcv` (net.http_get a dolarapi) la usan. Sin pg_net
--           no sale un solo correo y la tasa no se actualiza.
--         · **pg_cron** — sin ella no corre ninguna tarea automática.
--         · **pgcrypto** — `gen_random_bytes` genera los códigos de
--           invitación de visita.
--       Ojo con la versión: una versión distinta de pg_net entre las dos
--       bases puede cambiar el nombre de la tabla de respuestas.

select e.extname     as extension,
       e.extversion  as version,
       n.nspname     as esquema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
 order by e.extname;



-- ═══════════════════════════════════════════════════════════════════════════
-- (d) TAREAS PROGRAMADAS (cron.job)
--     Correr en LAS DOS BASES y comparar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Qué se espera:
--   · En **producción** tienen que existir y estar `active = true` las
--     tareas de: despachar correos (`despachar_correos`), traer la tasa del
--     BCV (`traer_tasa_bcv`) y generar los cobros de suscripción
--     (`generar_cobros_vencidos`). Si producción es una base nueva armada
--     desde un volcado del esquema, es MUY probable que **no tenga ninguna**:
--     `pg_dump` no exporta las filas de `cron.job`. Es el olvido clásico al
--     mudar de proyecto, y no da ningún error — simplemente no pasa nada
--     nunca: no salen los correos, la tasa queda congelada y no se factura.
--   · En **pruebas** puede haber tareas que en producción no correspondan, o
--     al revés. Compare las dos listas, no asuma.
--
-- ⚠ EL HORARIO ES EN UTC salvo que `cron.timezone` diga otra cosa (ver d.3).
--   Venezuela está en -04:00: un `0 4 * * *` es la medianoche de Caracas, y
--   un `0 0 * * *` son las 20:00 del día ANTERIOR en Caracas. Ese desfase es
--   exactamente el que arregla la migración 20260929120000 del lado de las
--   funciones; acá se comprueba del lado del horario.

select jobid,
       jobname,
       schedule,
       command,
       nodename,
       active
  from cron.job
 order by jobname nulls last, jobid;


-- ⚠ Si `cron.job` da "relation does not exist", **pg_cron no está instalada
--   en esa base** — que es en sí mismo el hallazgo, y el más grave de este
--   archivo: sin pg_cron no corre ninguna tarea automática y nada avisa.
--   Confírmelo con el bloque (c.2) y actívela desde Database → Extensions.
--
-- (d.2) Cómo les fue a las últimas corridas. Esperado: `status = 'succeeded'`.
--       Un `failed` repetido en `despachar_correos` suele ser la clave de
--       Resend ausente o vencida; en `traer_tasa_bcv`, pg_net sin salida a
--       internet.

select d.jobid,
       j.jobname,
       d.status,
       d.return_message,
       d.start_time,
       d.end_time
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
 order by d.start_time desc
 limit 40;


-- (d.3) En qué zona interpreta pg_cron los horarios de arriba.
--       Esperado: `cron.timezone = GMT` (el default). Si dice otra cosa,
--       reinterprete los `schedule` de (d) con esa zona.

select name, setting, source
  from pg_settings
 where name like 'cron.%'
 order by name;



-- ═══════════════════════════════════════════════════════════════════════════
-- (e) STORAGE
--     Correr en LAS DOS BASES y comparar.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (e.1) Buckets. Esperado: existe **`comprobantes`** en las dos, y tiene que
--       estar con `public = false`. Ahí van los comprobantes de pago que
--       suben los residentes (`FormularioReportarPago.tsx`) y que Admin abre
--       con `createSignedUrl` (`Pagos.tsx:219`) — justamente porque el bucket
--       es privado. Si en producción sale `public = true`, cualquiera con la
--       URL ve el comprobante de pago de cualquier residente.
--       Si el bucket **no existe** en producción, reportar un pago falla al
--       subir el archivo: `pg_dump` no exporta buckets.

select id,
       name,
       public,
       file_size_limit,
       allowed_mime_types,
       created_at
  from storage.buckets
 order by name;


-- (e.2) Políticas sobre storage.objects. Esperado: el mismo conjunto en las
--       dos bases. Sin políticas, un bucket privado no lo puede leer ni
--       escribir nadie con la clave anon — y reportar un pago deja de
--       funcionar sin dar una pista clara del motivo.

select policyname as politica,
       cmd        as operacion,
       roles,
       qual       as usando,
       with_check as al_escribir
  from pg_policies
 where schemaname = 'storage'
   and tablename  = 'objects'
 order by policyname;


-- (e.3) Cuánto ocupa cada bucket, para el plan Free (1 GB de Storage).
--       Solo informativo.

select o.bucket_id,
       count(*)                                                as objetos,
       pg_size_pretty(sum((o.metadata->>'size')::bigint))      as tamano
  from storage.objects o
 group by o.bucket_id
 order by o.bucket_id;



-- ═══════════════════════════════════════════════════════════════════════════
-- (f) EL CORREO: QUIÉN DESPACHA cola_correo Y DÓNDE VIVE LA CLAVE DE RESEND
--     Correr en LAS DOS BASES.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Lo que ya se sabe leyendo `esquema_inicial.sql`, para que estas consultas
-- sirvan para CONFIRMARLO y no para descubrirlo desde cero:
--
--   · **No hay Edge Function.** El repo no tiene `supabase/functions/`, y el
--     envío ocurre entero dentro de la base.
--   · La cadena es: `despachar_ahora()` → `despachar_correos(20)`, y
--     `despachar_correos` llama **directo** a `net.http_post` (pg_net) contra
--     `https://api.resend.com/emails`. No hay intermediario.
--   · Es asíncrona en dos pasos: una corrida manda la tanda y guarda el
--     `request_id`; la SIGUIENTE recoge la respuesta de
--     `net._http_response`. O sea que **hace falta que el cron corra
--     periódicamente**, no alcanza con una corrida suelta: con una sola,
--     los correos salen pero la cola nunca pasa a `enviado`.
--   · La clave **NO está en vault**: sale de `public.secretos` con
--     `nombre = 'resend_api_key'`. El remitente, de
--     `secretos.correo_remitente`. Y el nombre visible por organización sale
--     de `ajustes_correo.remitente`, con el nombre de la organización como
--     respaldo.
--   · `secretos` tiene RLS activo y **cero políticas**: no se lee desde el
--     cliente. Solo la alcanza `despachar_correos`, que es SECURITY DEFINER.
--
-- (f.1) Qué secretos hay cargados. **No devuelve ningún valor**: nombre,
--       cuándo se actualizó y cuántos caracteres tiene. Es la misma
--       información que ya expone la función `hay_secreto()` de la base.
--
--       Esperado en producción, las tres presentes y con largo > 0:
--         · `resend_api_key`     (una clave de Resend arranca con `re_`;
--                                 el largo típico ronda los 36 caracteres)
--         · `correo_remitente`   → tiene que ser `no-reply@envios.vecitap.com`
--         · `correo_enlace`      → **ver el bloque (g): tiene que apuntar a
--                                 https://vecitap.com, no a mi.vecitap.com**
--       Si falta `resend_api_key`, `despachar_correos` no falla: escribe
--       `{"error":"falta la clave de Resend"}` en `tareas_log` y se va en
--       silencio. Nadie se entera salvo que mire ahí.

select nombre,
       actualizado,
       length(valor)                              as largo,
       coalesce(btrim(valor), '') <> ''           as cargada
  from secretos
 order by nombre;


-- (f.2) Lo mismo para vault, por si algo se migró ahí. **Se piden columnas
--       explícitas a propósito**: `select *` sobre las vistas de vault puede
--       traer el secreto descifrado. No lo cambie por `*`.
--       Esperado hoy: cero filas, o filas que no tengan que ver con Resend.
--       Si da "relation does not exist", `supabase_vault` no está instalada:
--       no es un problema — la clave no vive ahí, vive en `secretos`.

select id, name, description, created_at, updated_at
  from vault.secrets
 order by name nulls last;


-- (f.3) Quién dispara el despacho, y cada cuánto.
--       Esperado: al menos una fila. **Cero filas en producción significa
--       que no sale ningún correo**, aunque todo lo demás esté bien.

select jobid, jobname, schedule, command, active
  from cron.job
 where command ilike '%despachar%'
 order by jobname nulls last, jobid;


-- (f.4) pg_net instalado y respondiendo. Esperado: una fila con la versión.

select extname, extversion
  from pg_extension
 where extname = 'pg_net';


-- (f.5) Estado de la cola. Esperado en una base recién armada: cero filas o
--       todo en `enviado`. Muchos `pendiente` con `request_id` no nulo y
--       viejos = el cron no está corriendo o no recoge las respuestas.
--       Muchos `fallido` = mirar `ultimo_error`.

select estado,
       count(*)                          as cuantos,
       count(*) filter (where request_id is not null) as esperando_respuesta,
       min(encolado_en)                  as el_mas_viejo,
       max(encolado_en)                  as el_mas_nuevo
  from cola_correo
 group by estado
 order by estado;


-- (f.6) Los últimos errores reales del despachador, que es donde se esconden
--       los problemas de correo (la función los traga y los anota acá).
--       Esperado: sin filas con `detalle ? 'error'`.

select tarea, corrida_en, detalle
  from tareas_log
 where tarea in ('despachar_correos', 'traer_tasa_bcv', 'cobros_suscripcion')
 order by corrida_en desc
 limit 30;


-- (f.7) Direcciones que Resend rechazó por inválidas. Solo informativo:
--       `despachar_correos` las anota y deja de insistir.

select correo, motivo, anotado_en
  from correos_malos
 order by anotado_en desc
 limit 30;



-- ═══════════════════════════════════════════════════════════════════════════
-- (g) URLs ESCRITAS DENTRO DE LA BASE
--     Correr en LAS DOS BASES.
--
--     ⚠ ESTE ES EL BLOQUE CRÍTICO PARA EL CAMBIO DE DOMINIO. El código de la
--       app ya no tiene ninguna URL escrita a mano (punto 1 de la salida a
--       producción), pero **la base sí las tiene**, y son las que llegan al
--       correo del residente.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (g.1) Funciones cuyo cuerpo contiene una URL.
--       Esperado, y ninguna de las dos es un problema:
--         · `despachar_correos`  → https://api.resend.com/emails
--         · `traer_tasa_bcv`     → https://ve.dolarapi.com/v1/dolares/oficial
--       **Cualquier otra URL que aparezca acá hay que mirarla.** En
--       particular, si alguna función que arma HTML de correo trae un
--       `mi.vecitap.com`, un `*.vercel.app` o un `github.io` escrito adentro,
--       los correos que salgan de producción van a mandar a la gente al sitio
--       de respaldo en vez de a vecitap.com.

select p.proname                                 as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       u.url
  from pg_proc p
  cross join lateral (
    select distinct m[1] as url
      from regexp_matches(p.prosrc, 'https?://[^''"[:space:])<]+', 'g') as m
  ) u
 where p.pronamespace = 'public'::regnamespace
   and p.prosrc ilike '%http%'
 order by p.proname, u.url;


-- (g.2) **El enlace de los correos.** Esto es lo más importante del archivo.
--
--       `correo_recibo` arma el enlace así (volcado, líneas 776-777):
--           v_enlace := coalesce(ajustes_correo.enlace_base,
--                                secretos.correo_enlace)
--       O sea: cada organización puede tener el suyo, y si no lo tiene se usa
--       el global. Si cualquiera de los dos quedó apuntando a
--       `mi.vecitap.com`, los residentes de esa organización reciben el
--       recibo con un enlace al sitio de respaldo.
--
--       **Esperado en producción: todo en `https://vecitap.com`.**
--       Toda fila con `apunta_al_respaldo = true` hay que corregirla antes
--       de mandar el primer recibo. (La corrección es un UPDATE, así que no
--       va en este archivo: va como migración o la hace Nicolás a mano, y
--       queda anotada.)

select 'secretos.correo_enlace'         as donde,
       null::uuid                       as org_id,
       null::text                       as organizacion,
       valor                            as enlace,
       valor ilike '%mi.vecitap.com%'
         or valor ilike '%vercel.app%'
         or valor ilike '%github.io%'   as apunta_al_respaldo
  from secretos
 where nombre = 'correo_enlace'

union all

select 'ajustes_correo.enlace_base',
       ac.org_id,
       o.nombre,
       ac.enlace_base,
       ac.enlace_base ilike '%mi.vecitap.com%'
         or ac.enlace_base ilike '%vercel.app%'
         or ac.enlace_base ilike '%github.io%'
  from ajustes_correo ac
  left join organizaciones o on o.id = ac.org_id
 where ac.enlace_base is not null

order by 1, 3 nulls first;


-- (g.3) El remitente que ve quien recibe el correo. Esperado:
--       `secretos.correo_remitente` = `no-reply@envios.vecitap.com`, y cada
--       `ajustes_correo.remitente` con el nombre comercial de esa
--       administradora (o NULL, y entonces se usa el nombre de la
--       organización).

select o.nombre                as organizacion,
       ac.remitente            as nombre_visible,
       ac.responder_a          as responder_a,
       ac.activo
  from ajustes_correo ac
  left join organizaciones o on o.id = ac.org_id
 order by o.nombre nulls last;


-- (g.4) URLs guardadas en datos, no en código. Esta consulta **no busca**:
--       genera la consulta que busca, recorriendo todas las columnas de
--       texto de public. Copie el valor de la columna `consulta` del
--       resultado, péguelo en una pestaña nueva del SQL Editor y córralo —
--       también es de solo lectura, solo cuenta filas, no muestra contenido.
--
--       Esperado: filas > 0 en `organizaciones.logo_url` (normal, son las
--       imágenes de los logos) y en las columnas de enlace de
--       `ajustes_correo`/`secretos` que ya vio en (g.2). Cualquier otra
--       columna con URLs hay que mirarla a ojo.

select string_agg(
         format(
           'select %L as tabla, %L as columna, count(*) as filas_con_url '
           'from public.%I where %I ilike ''%%http%%''',
           c.table_name, c.column_name, c.table_name, c.column_name),
         E'\nunion all\n'
         order by c.table_name, c.column_name)
       || E'\norder by 1, 2;' as consulta
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
 where c.table_schema = 'public'
   and t.table_type   = 'BASE TABLE'
   and c.data_type in ('text', 'character varying');



-- ═══════════════════════════════════════════════════════════════════════════
-- (h) QUÉ MIGRACIONES DEL REPO YA ESTÁN APLICADAS
--     Correr en LAS DOS BASES.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- No hay tabla de control de migraciones en este proyecto (se aplican a mano
-- en el SQL Editor), así que esto no consulta un registro: **comprueba que
-- exista el objeto que cada migración crea**. Es más confiable que un
-- registro, porque no se puede desincronizar de la realidad.
--
-- Esperado en **pruebas** (según docs/estado-migracion.md, al 29-sep):
--   20260926120000  aplicada
--   20260928120000  NO aplicada  ← correcto, es del bloque 13, que no arrancó
--   20260928130000  NO aplicada
--   20260928140000  NO aplicada
--   20260929120000  NO aplicada
--
-- Esperado en **producción**: si la base se armó desde `esquema_inicial.sql`
-- (volcado del 27-sep), lo más probable es que 20260926120000 salga
-- `aplicada = true` —porque el volcado ya la traía dentro— y las otras
-- cuatro en false. **Confírmelo, no lo asuma**: de eso depende la lista del
-- bloque (z).

-- Escrita como UNION ALL y no como una lista VALUES a propósito: cada rama
-- es una consulta independiente, así que se puede correr suelta para ver por
-- qué una migración da false. Y todo pasa por `to_regclass`/`to_regprocedure`,
-- que devuelven NULL en vez de reventar cuando el objeto no existe — sin eso,
-- una sola tabla faltante haría fallar la consulta entera sin decir cuál.

select '20260926120000_membresias_multiples_por_organizacion' as migracion,
       'constraint membresias_persona_rol_alcance_key sobre membresias'
                                                              as que_comprueba,
       exists (select 1 from pg_constraint
                where conname  = 'membresias_persona_rol_alcance_key'
                  and conrelid = to_regclass('public.membresias'))
                                                              as aplicada

union all
select '20260928120000_puede_ver_garita',
       'función public.puede_ver_garita(uuid)',
       to_regprocedure('public.puede_ver_garita(uuid)') is not null

union all
select '20260928130000_correos_malos_ver_solo_operador',
       'política correos_malos_ver usando es_operador()',
       exists (select 1 from pg_policies
                where schemaname = 'public'
                  and tablename  = 'correos_malos'
                  and policyname = 'correos_malos_ver'
                  and qual ilike '%es_operador%')

union all
select '20260928140000_garita_bitacora_dia_local',
       'hoy_local() + inicio_dia_local(date) + garita_bitacora ya sin el cast',
       to_regprocedure('public.hoy_local()')            is not null
       and to_regprocedure('public.inicio_dia_local(date)') is not null
       and exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure('public.garita_bitacora(uuid,date,integer)')
                      and p.prosrc ilike '%inicio_dia_local%')

union all
select '20260929120000_segunda_ronda_dia_local',
       'dia_local(timestamptz) + libro_edificio con ventana + default de vinculos.desde',
       to_regprocedure('public.dia_local(timestamp with time zone)') is not null
       and exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure('public.libro_edificio(uuid,date,date)')
                      and p.prosrc ilike '%inicio_dia_local%')
       and exists (select 1 from information_schema.columns c
                    where c.table_schema  = 'public'
                      and c.table_name    = 'vinculos'
                      and c.column_name   = 'desde'
                      and c.column_default ilike '%hoy_local%')

order by 1;


-- (h.2) Por si producción y pruebas no arrancan del mismo esquema: el
--       inventario grueso, para detectar una tabla o una columna que falte
--       de un lado. Esperado: los mismos números en las dos bases.

select (select count(*) from pg_class
         where relnamespace = 'public'::regnamespace and relkind = 'r')  as tablas,
       (select count(*) from pg_class
         where relnamespace = 'public'::regnamespace and relkind = 'v')  as vistas,
       (select count(*) from pg_proc
         where pronamespace = 'public'::regnamespace and prokind = 'f')  as funciones,
       (select count(*) from pg_policies where schemaname = 'public')    as politicas,
       (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where c.relnamespace = 'public'::regnamespace
           and not t.tgisinternal)                                       as triggers,
       (select count(*) from information_schema.columns
         where table_schema = 'public')                                  as columnas;


-- (h.3) Las columnas, una por una, por si (h.2) da distinto y hay que
--       encontrar dónde. Descargue el CSV de las dos bases y haga diff.

select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, column_name;



-- ═══════════════════════════════════════════════════════════════════════════
-- (z) EL ORDEN EXACTO PARA APLICAR EN PRODUCCIÓN LO QUE FALTE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Antes de la primera: **respaldo** (docs/respaldo.md). Después de cada una,
-- corra los pasos de verificación que trae el propio archivo de migración.
-- Y aplique cada una **primero en vecitap-pruebas**, confirme, y recién
-- entonces en producción (AGENTS.md, "Producción").
--
-- Aplique solo las que el bloque (h) haya devuelto con `aplicada = false`,
-- y EN ESTE ORDEN:
--
--   1. supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql
--        · Sin dependencias, pero va primera porque es la única que **toca
--          datos existentes** (limpia campos sobrantes de `membresias` antes
--          de poder crear la constraint única). Si algo va a fallar por el
--          estado de los datos, que falle acá, con la base recién
--          respaldada y sin nada más aplicado encima.
--        · Es muy probable que ya salga `aplicada = true` si producción se
--          armó desde el volcado del 27-sep. En ese caso, saltear.
--
--   2. supabase/migrations/20260928130000_correos_malos_ver_solo_operador.sql
--        · Independiente de todas las demás. Va acá porque es la más chica
--          (una política) y deja de exponer la lista de correos rebotados a
--          cualquier sesión.
--
--   3. supabase/migrations/20260928140000_garita_bitacora_dia_local.sql
--        · Crea `hoy_local()` e `inicio_dia_local(date)` y arregla
--          `garita_bitacora`. **La 4 depende de esta**: sin ella aborta.
--        · Avisarle a Gustavo antes: toca una función SECURITY DEFINER.
--
--   4. supabase/migrations/20260929120000_segunda_ronda_dia_local.sql
--        · Las cinco funciones de fecha + `dia_local(timestamptz)` + el
--          default de `vinculos.desde`.
--        · Trae dos guardas propias: aborta sola si falta la 3, y aborta
--          sola si alguna de las cinco funciones cambió respecto del volcado
--          del 27-sep. Es seguro intentarla: si algo no cuadra no aplica
--          nada, y el mensaje dice exactamente qué revisar.
--
--   5. supabase/migrations/20260928120000_puede_ver_garita.sql
--        · **NO APLICAR TODAVÍA.** Es el gate de solo lectura del bloque 13
--          (vista de Garita dentro de Admin), que no arrancó. Va cuando ese
--          bloque empiece, no antes: una función de seguridad que no usa
--          nadie es superficie de ataque sin contrapartida.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Lo que NO son migraciones y hay que revisar igual, con el bloque que lo
-- detecta al lado. Nada de esto viaja en un `pg_dump` del esquema, así que
-- si producción se armó desde el volcado, lo más probable es que falte todo:
--
--   · Las tareas de `cron.job` → bloque (d). Sin ellas no salen los correos,
--     la tasa del BCV queda congelada y no se generan los cobros.
--   · El bucket `comprobantes` de Storage y sus políticas → bloque (e). Sin
--     eso, un residente no puede reportar un pago con comprobante.
--   · Los secretos `resend_api_key`, `correo_remitente` y `correo_enlace`
--     → bloque (f).
--   · `secretos.correo_enlace` y cada `ajustes_correo.enlace_base`
--     apuntando a **https://vecitap.com** → bloque (g.2). Es lo único de
--     esta lista que puede estar "presente pero mal": el correo sale igual,
--     con el enlace al sitio equivocado.
--   · La lista blanca de Authentication → URL Configuration:
--       Site URL      https://vecitap.com
--       Redirect URLs https://vecitap.com/**, http://localhost:3000/**,
--                     https://*.vercel.app/**
--     Sin esto, el enlace de confirmar la cuenta y el de recuperar la clave
--     no vuelven al sitio (ver `app/auth/confirmar/route.ts`).
-- ═══════════════════════════════════════════════════════════════════════════
