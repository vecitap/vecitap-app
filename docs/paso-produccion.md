# Paso a producción — las 46 migraciones, la limpieza y la configuración

Guía para seguir **sin Claude**, de arriba abajo. Cada consulta está lista para pegar en el
**SQL Editor de vecitap-produccion** (Supabase → proyecto `sudghmerriewjmmnlcrf` → SQL Editor →
*New query*). Al lado de cada una va el resultado esperado y qué hacer si no coincide.

Preparada el 01-nov con lectura de producción: sigue en `20260929120000_segunda_ronda_dia_local`,
igual que en el diagnóstico D5 del 31-oct (las 15 funciones que miran las guardas de la primera
tanda tienen el mismo md5; ver el paso 2).

**Regla general:** si algo no coincide, **no sigas con el paso siguiente**. Copia el resultado y
avísame. No corras un rollback por tu cuenta: cada migración es una sola transacción
(`begin; … commit;`), así que una que falla o aborta **no deja nada a medias**, y la base queda
como estaba antes de ese archivo.

---

## 0. Antes de empezar

| # | Qué | Cómo se comprueba |
|---|---|---|
| 0.1 | La ronda 12 está commiteada en `dev` y `npm run build`, `npm run lint` y `npx tsc --noEmit` dan verde | Los tres sin errores |
| 0.2 | `info@vecitap.com` existe y recibe correo (la pantalla «Esta cuenta no administra ningún edificio» lo muestra) | Mandarle un correo de prueba |
| 0.3 | Elegir un momento sin uso (de noche). Mientras se aplican las tandas, vecitap.com sigue con el código viejo (`integration`) sobre una base que va cambiando; el código nuevo sale recién en el paso 7. Calcular una hora y media, sin cortes | — |
| 0.4 | Tener abiertos: Supabase (producción), Vercel, Resend, y VS Code con este repo en la rama `dev` | — |
| 0.5 | **Gustavo, antes de empezar** (el mismo día, sin esperar a las migraciones): el webhook de Resend (6.3), la variable `RESEND_WEBHOOK_SECRET` de Vercel en Production (6.1) y el INSERT de la huella en `secretos` (5.1). El `whsec_…` lo maneja solo él: no hace falta que te lo pase | Lo compruebas tú en el paso 5 (largo de la huella = 64) |

**Cómo se corre un archivo de migración:** en VS Code, abrir el archivo de
`supabase/migrations/`, `Ctrl+A`, `Ctrl+C`; en el SQL Editor, *New query*, pegar y *Run*. Si el
editor avisa de «operaciones destructivas», confirmar. Lo esperado es *Success* (con o sin
avisos). Un error que empieza con **«ABORTADA»** es una guarda del archivo: no se aplicó nada;
parar y avisarme con el texto completo.

---

## 1. Respaldo (obligatorio, antes de tocar nada)

`docs/respaldo.md` usa `supabase db dump`, que pide el CLI de Supabase **y Docker**, y en esta
computadora no está ninguno de los dos (comprobado el 01-nov). Sí están `pg_dump` y `psql`
18.6 (Scoop), que alcanzan. La carpeta `OneDrive\Respaldos\vecitap` no existe todavía, así que
este será el primer respaldo. Ver la sección «Sobre `docs/respaldo.md`» al final.

En **PowerShell**, una línea por vez (la URI sale de Supabase → *Connect* → **Session
pooler**, puerto 5432; dejar `[YOUR-PASSWORD]` tal cual):

```powershell
$RESP = "$env:USERPROFILE\OneDrive\Respaldos\vecitap"
New-Item -ItemType Directory -Force $RESP | Out-Null
$HOY = Get-Date -Format 'yyyy-MM-dd-HHmm'
$uri = Read-Host "URI del Session pooler (con [YOUR-PASSWORD] adentro)"
$seg = Read-Host "Contrasena de la base" -AsSecureString
$cla = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
$DB  = $uri -replace '\[YOUR-PASSWORD\]', [uri]::EscapeDataString($cla)
```

```powershell
pg_dump --dbname=$DB --schema=public --format=custom --file="$RESP\vecitap-public-$HOY.dump"
pg_dump --dbname=$DB --schema=auth --data-only --format=custom --file="$RESP\vecitap-auth-$HOY.dump"
psql $DB -A -F "," -c "select id, email, created_at, last_sign_in_at from auth.users order by created_at" -o "$RESP\vecitap-usuarios-$HOY.csv"
psql $DB -A -F "|" -c "select jobname, schedule, active, command from cron.job order by 1" -o "$RESP\vecitap-cron-$HOY.csv"
Remove-Variable cla, seg, uri, DB
```

Comprobar:

```powershell
Get-ChildItem $RESP -Filter "vecitap-*-$HOY.*" | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}
(pg_restore --list "$RESP\vecitap-public-$HOY.dump" | Select-String "TABLE DATA public").Count
git -C "$env:USERPROFILE\OneDrive\Documentos\GitHub\vecitap-app" status --porcelain
```

| Esperado | Si no |
|---|---|
| Cuatro archivos, **ninguno de 0 KB** | 0 KB = falló (casi siempre la contraseña o el pooler equivocado). No seguir |
| El conteo de `TABLE DATA public` da **37** | Avisarme antes de seguir |
| `git status` **no** lista ningún `.dump` ni `.csv` | Si aparece, el archivo está dentro del repo (que es público): moverlo a `$RESP` |
| `vecitap-usuarios-….csv` tiene **4** cuentas | Avisarme |

Storage no hace falta: hoy producción tiene **0** comprobantes.
Sin estos archivos, **no se sigue**.

---

## 2. Comprobación de partida (producción está como en D5)

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'crear_invitacion' que, 'f29847e7ef3fcfdafaa7cfe14830647c' esperado, (select m from f where proname = 'crear_invitacion') hay
  union all select 'correo_recibo', '343c43e80fcefb7c62f9f3b728e19e6b', (select m from f where proname = 'correo_recibo')
  union all select 'cerrar_periodo', '5f2029656a2a68333e91170c1e646453', (select m from f where proname = 'cerrar_periodo')
  union all select 'simular_cierre', '334a723c4e58774e408a44dd58c7e95a', (select m from f where proname = 'simular_cierre')
  union all select 'despachar_correos', '9c5e5a398a3af2f356f15c36095d6e66', (select m from f where proname = 'despachar_correos')
  union all select 'org_campos_del_operador', '1aa49bce2a1c43c59ba0285fcf629f3c', (select m from f where proname = 'org_campos_del_operador')
  union all select 'saldo_unidad', '1396d4083c6be0e3902f0814a3de0e44', (select m from f where proname = 'saldo_unidad')
  union all select 'pagos_posible_duplicado', 'af3373039b05ee7b2a425fe9c98d81ef', (select m from f where proname = 'pagos_posible_duplicado')
  union all select 'crear_organizacion', '443c0239b618fa4e6f3b086b5b8bc4ce', (select m from f where proname = 'crear_organizacion')
  union all select 'administra_algo', '80bd69fb8012e783c993595b9c988dfb', (select m from f where proname = 'administra_algo')
  union all select 'traer_tasa_bcv', '1a8f607ae0ab59cbce2cbb1547ba60b1', (select m from f where proname = 'traer_tasa_bcv')
  union all select 'exigir_org_al_dia', '61529947264f7088ce8d2da7187ea44e', (select m from f where proname = 'exigir_org_al_dia')
  union all select 'edificio_dentro_del_tope', 'f1f555e84ab8fe93cf5ca445ed32c048', (select m from f where proname = 'edificio_dentro_del_tope')
  union all select 'destinatarios_de', '2be2e76b2ed4f1102ab8081b0b870776', (select m from f where proname = 'destinatarios_de')
  union all select 'esc_html', 'a5f0a43bf349fe7139e9702fe789c6d1', (select m from f where proname = 'esc_html')
  union all select 'unidades.paga (no debe existir)', '0', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'unidades' and column_name = 'paga')
  union all select 'permisos de mis_unidades (paso 0 del archivo 1)', 'postgres=X/postgres,authenticated=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'mis_unidades')
  union all select 'vínculos con unidad de otra organización (consulta previa del archivo 3)', '0', (select count(*)::text from vinculos v join unidades u on u.id = v.unidad_id where v.org_id <> u.org_id)
  union all select 'cola de correos vacía', '0', (select count(*)::text from cola_correo)
) v;
```

**Esperado:** las 19 filas en **OK** (comprobado por lectura el 01-nov).
**Si alguna dice NO COINCIDE:** alguien cambió producción desde el 31-oct. No seguir; avisarme
con el resultado.

---

## 3. Borrar los datos de prueba de la base real

Se hace **ahora**, antes de las migraciones: menos datos que migrar y el esquema de hoy es el
mismo con el que se ensayó el borrado.

### Qué se borra

| Organización | Id | Qué tiene (lectura del 01-nov) |
|---|---|---|
| **Guachu** (de Gustavo, `gustavobricenor@gmail.com`) | `2828082e-02f0-4693-bb94-d5604ea9c169` | 1 edificio «Edificio Isabella», 0 unidades, 1 membresía (la dueña), 1 cobro, 3 filas de auditoría |
| **Edificio arauca** (`guasimo.eventos@gmail.com`) | `304b9a43-2a04-4cc5-85bd-9c00d78772e4` | 1 edificio «Edificio Arauca II», 2 unidades, 2 personas, 2 vínculos, 1 membresía (la dueña), 4 categorías, 1 cobro, 22 partidas fijas, 6 filas de auditoría |

Ninguna tiene pagos, meses, invitaciones, correos ni comprobantes.

**Lo que NO está en producción (nada que borrar):**
- **Organizaciones A y B:** no existen. Producción tiene solo tres organizaciones: Guachu, GRUPO
  ING3 y Edificio arauca. Tampoco están en pruebas.
- **El usuario de prueba de la Fase 3:** no existe. Producción tiene 4 cuentas:
  `vecitap.admin@gmail.com` (operador de Vecitap), `gustavobricenor@gmail.com` (Guachu),
  `info.ing3@gmail.com` (GRUPO ING3) y `guasimo.eventos@gmail.com` (Edificio arauca). Ninguna es
  de prueba.

Si con «Organizaciones A y B» o con el usuario de la Fase 3 querías decir otra cosa, avísame antes
de borrar nada.

**GRUPO ING3 no se toca.**

**Las cuentas no se borran con esto.** `gustavobricenor@gmail.com` y `guasimo.eventos@gmail.com`
quedan sin ninguna organización: al entrar ven «Esta cuenta no administra ningún edificio».
Borrarlas es otra decisión (Supabase → Authentication → Users). Yo dejaría la de Gustavo.

### 3.1 Comprobación antes

```sql
select o.nombre,
  (select count(*) from edificios where org_id = o.id) edificios,
  (select count(*) from unidades where org_id = o.id) unidades,
  (select count(*) from personas where org_id = o.id) personas,
  (select count(*) from vinculos where org_id = o.id) vinculos,
  (select count(*) from membresias where org_id = o.id) membresias,
  (select count(*) from pagos where org_id = o.id) pagos,
  (select count(*) from periodos where org_id = o.id) meses,
  (select count(*) from invitaciones where org_id = o.id) invitaciones,
  (select count(*) from storage.objects s where s.bucket_id = 'comprobantes' and split_part(s.name, '/', 1) = o.id::text) comprobantes
from organizaciones o
where o.id in ('2828082e-02f0-4693-bb94-d5604ea9c169', '304b9a43-2a04-4cc5-85bd-9c00d78772e4')
order by 1;
```

| nombre | edificios | unidades | personas | vinculos | membresias | pagos | meses | invitaciones | comprobantes |
|---|---|---|---|---|---|---|---|---|---|
| Edificio arauca | 1 | 2 | 2 | 2 | 1 | 0 | 0 | 0 | 0 |
| Guachu | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |

**Si no coincide:** alguien usó esas cuentas desde el 01-nov. No borrar; avisarme.

### 3.2 El borrado, primero en ensayo

Pegar tal cual (con `v_confirmar := false`). Es un **ensayo**: borra, cuenta y al final da un
error a propósito que deshace todo.

```sql
do $borrar$
declare
  v_confirmar boolean := false;   -- false = ENSAYO (no borra nada). true = borra de verdad.
  v_orgs uuid[] := array[
    '2828082e-02f0-4693-bb94-d5604ea9c169',   -- Guachu (edificio «Edificio Isabella»)
    '304b9a43-2a04-4cc5-85bd-9c00d78772e4'    -- Edificio arauca (edificio «Edificio Arauca II»)
  ]::uuid[];
  v_nombres text[] := array['Guachu', 'Edificio arauca'];
  n bigint;
  t text;
  v_antes text := '';
  v_despues text := '';
begin
  -- 1. Guardas: si algo no es lo esperado, no borra nada.
  select count(*) into n from public.organizaciones
   where id = any (v_orgs) and nombre = any (v_nombres);
  if n <> 2 then
    raise exception 'ABORTADO: se esperaban 2 organizaciones (Guachu y Edificio arauca) y hay %. No se borró nada.', n;
  end if;
  select count(*) into n from public.pagos where org_id = any (v_orgs);
  if n > 0 then raise exception 'ABORTADO: hay % pago(s) en esas organizaciones. No se borró nada.', n; end if;
  select count(*) into n from public.periodos where org_id = any (v_orgs);
  if n > 0 then raise exception 'ABORTADO: hay % mes(es) abiertos o cerrados. No se borró nada.', n; end if;
  select count(*) into n from public.membresias where org_id = any (v_orgs) and rol <> 'propietario_cuenta';
  if n > 0 then raise exception 'ABORTADO: hay % acceso(s) además de la dueña de la cuenta. No se borró nada.', n; end if;
  select count(*) into n from storage.objects o
   where o.bucket_id = 'comprobantes' and split_part(o.name, '/', 1) = any (select x::text from unnest(v_orgs) x);
  if n > 0 then raise exception 'ABORTADO: hay % comprobante(s) en Storage. No se borró nada.', n; end if;

  -- 2. Lo que hay antes, tabla por tabla.
  for t in select c.table_name::text from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE'
            order by 1 loop
    execute format('select count(*) from public.%I where org_id = any ($1)', t) into n using v_orgs;
    if n > 0 then v_antes := v_antes || format('%s=%s ', t, n); end if;
  end loop;

  -- 3. El borrado, en este orden: las organizaciones (todo lo suyo cae en cascada)
  --    y después su auditoría (no tiene clave foránea y el borrado le agrega filas).
  delete from public.organizaciones where id = any (v_orgs);
  delete from public.auditoria where org_id = any (v_orgs);

  -- 4. Lo que queda: tiene que ser todo 0.
  for t in select c.table_name::text from information_schema.columns c
             join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE'
            order by 1 loop
    execute format('select count(*) from public.%I where org_id = any ($1)', t) into n using v_orgs;
    if n > 0 then v_despues := v_despues || format('%s=%s ', t, n); end if;
  end loop;
  if v_despues <> '' then
    raise exception 'ABORTADO: después del borrado quedan filas (%). No se borró nada.', v_despues;
  end if;

  if not v_confirmar then
    raise exception 'ENSAYO, nada quedó escrito. Se borrarían: %', v_antes;
  end if;
  raise notice 'BORRADO. Se borró: %', v_antes;
end
$borrar$;
```

**Esperado (sale como error rojo, es lo normal):**
`ENSAYO, nada quedó escrito. Se borrarían: auditoria=9 categorias=4 conceptos_cobro=2 edificios=2 membresias=2 partidas_fijas=22 personas=2 unidades=2 vinculos=2`
(auditoría puede dar algo más si alguien entró a esas cuentas; lo demás, igual).

**Si dice «ABORTADO: …»:** no se borró nada; avisarme con el texto.

### 3.3 El borrado de verdad

El mismo bloque, cambiando **solo** la línea 3 a `v_confirmar boolean := true;`.
**Esperado:** *Success* y el aviso `BORRADO. Se borró: …` con los mismos números del ensayo.

### 3.4 Comprobación después

```sql
select
  (select count(*) from organizaciones where id in ('2828082e-02f0-4693-bb94-d5604ea9c169', '304b9a43-2a04-4cc5-85bd-9c00d78772e4')) borradas_que_quedan,
  (select count(*) from auditoria where org_id in ('2828082e-02f0-4693-bb94-d5604ea9c169', '304b9a43-2a04-4cc5-85bd-9c00d78772e4')) auditoria_que_queda,
  (select string_agg(nombre, ', ') from organizaciones) organizaciones,
  (select count(*) from unidades) unidades;
```

**Esperado:** `0 | 0 | GRUPO ING3 | 53`. **Si no:** avisarme.

---

## 4. Las 46 migraciones, en siete tandas

Cada archivo, **en el orden de la tabla**, uno por vez (ver «Cómo se corre un archivo» en el
paso 0). Al terminar **cada tanda**, su consulta de verificación. Si todas las filas dicen
**OK**, la tanda siguiente. Las guardas de cada archivo exigen lo que dejó el anterior: si se
salta uno, el siguiente aborta solo.

**Dos archivos piden algo antes** (ya comprobado en el paso 2, no hace falta repetirlo): el 1
(«paso 0», los permisos de `mis_unidades`) y el 3 (la «consulta previa», 0 vínculos cruzados).

**Si una consulta de tanda da NO COINCIDE:** no seguir. El sitio sigue andando con el código
viejo. Avisarme con el resultado; los rollbacks están en `supabase/rollbacks/` y van en orden
inverso, pero se deciden juntos.

### Tanda 1 — tramo 1 y rondas 2 a 6 (12 archivos)

| # | Archivo |
|---|---|
| 1 | `20260930120000_unidades_paga.sql` |
| 2 | `20260930130000_puede_operar_search_path.sql` |
| 3 | `20260930140000_vinculos_org_coherente.sql` |
| 4 | `20261005120000_crear_invitacion_reemplaza_pendiente.sql` |
| 5 | `20261008120000_reemplazar_inquilino.sql` |
| 6 | `20261008130000_mis_cuotas.sql` |
| 7 | `20261008140000_reemplazar_propietario.sql` |
| 8 | `20261008150000_indices_saldo_unidad.sql` |
| 9 | `20261018120000_periodo_cerrado_exige_tasa.sql` |
| 10 | `20261018130000_unidades_tipo_correo_respaldo.sql` |
| 11 | `20261018140000_importar_unidades.sql` |
| 12 | `20261025120000_importar_unidades_plantilla.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 crear_invitacion' que, 'd5807ae08c2fb3415f04056493b5e5a7' esperado, (select m from f where proname = 'crear_invitacion') hay
  union all select 'md5 mis_cuotas', '7cf5f15d328f76cc2ee23b9e2f4dcb0d', (select m from f where proname = 'mis_cuotas')
  union all select 'md5 importar_unidades', '467fadf95398b1ce1e99ed8bb6b85655', (select m from f where proname = 'importar_unidades')
  union all select 'columnas unidades.paga, unidades.tipo, personas.correo_respaldo', '3', (select count(*)::text from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (('unidades','paga'),('unidades','tipo'),('personas','correo_respaldo')))
  union all select 'search_path de puede_operar', 'search_path=public', (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.puede_operar(uuid)'::regprocedure)
  union all select 'disparadores de vínculos y unidades', '2', (select count(*)::text from pg_trigger where tgname in ('vinculos_unidad_misma_org','unidades_org_con_vinculos'))
  union all select 'funciones de reemplazo', '3', (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('reemplazar_inquilino','reemplazar_propietario','vinculos_propietario_sale_accesos'))
  union all select 'índices de saldo_unidad', '3', (select count(*)::text from pg_indexes where schemaname = 'public' and indexname in ('ajustes_sin_cerrar_por_unidad','pagos_conciliados_sin_cerrar_por_unidad','recibos_por_unidad'))
  union all select 'restricción periodos_cerrado_con_tasa', '1', (select count(*)::text from pg_constraint where conname = 'periodos_cerrado_con_tasa')
  union all select 'tabla notas_unidad', 'notas_unidad', (select to_regclass('public.notas_unidad')::text)
  union all select 'permisos de mis_unidades (iguales que antes)', 'postgres=X/postgres,authenticated=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'mis_unidades')
) v;
```

**Esperado:** 11 filas en OK.

### Tanda 2 — rondas 7 y 8 (13 archivos)

| # | Archivo |
|---|---|
| 13 | `20261026120000_datos_pago.sql` |
| 14 | `20261026130000_invitacion_en_recibo.sql` |
| 15 | `20261026140000_cobro_solo_usd.sql` |
| 16 | `20261026150000_cuotas_extraordinarias.sql` |
| 17 | `20261026160000_redondeo_cuotas.sql` |
| 18 | `20261026170000_mensajes_masivos.sql` |
| 19 | `20261026180000_estado_financiero.sql` |
| 20 | `20261026190000_pago_agrupado.sql` |
| 21 | `20261027120000_importar_corrige_fichas.sql` |
| 22 | `20261027130000_pago_agrupado_completo.sql` |
| 23 | `20261027140000_recibo_titulares_sin_bs.sql` |
| 24 | `20261027150000_redondeo_total.sql` |
| 25 | `20261027160000_correos_estado_y_cupo.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 correo_recibo' que, 'fc342ae7a87d2beac3ad8a10060d440c' esperado, (select m from f where proname = 'correo_recibo') hay
  union all select 'md5 crear_invitacion', 'cf461ba94f839511db5545832077e2a8', (select m from f where proname = 'crear_invitacion')
  union all select 'md5 encolar_recibos', 'cac4ad3316589f36c4e67823a9023dc7', (select m from f where proname = 'encolar_recibos')
  union all select 'md5 asegurar_invitaciones_recibo', '169010a2f4fdb4cc44e1c4171d09be05', (select m from f where proname = 'asegurar_invitaciones_recibo')
  union all select 'md5 cerrar_periodo', 'c2fcede6ac32b3fe25b74b48abbd44c4', (select m from f where proname = 'cerrar_periodo')
  union all select 'md5 simular_cierre', '69144d1e27642caf18a8a264ffa382f8', (select m from f where proname = 'simular_cierre')
  union all select 'md5 despachar_correos', 'ab2d4304b921029146ec19ca9220d00f', (select m from f where proname = 'despachar_correos')
  union all select 'md5 momento_cupo', '9f7d811a4068dc3ab69ac1df2254aa72', (select m from f where proname = 'momento_cupo')
  union all select 'md5 puesto_en_cola', '1722c487a50c73429e4a28a7ba3a101a', (select m from f where proname = 'puesto_en_cola')
  union all select 'md5 estado_financiero', 'c4c4878ecf9f8a9eb6fad425323df9e5', (select m from f where proname = 'estado_financiero')
  union all select 'md5 pagos_posible_duplicado', '13959e3ec8eaf321a99d5b32aa063b07', (select m from f where proname = 'pagos_posible_duplicado')
  union all select 'md5 importar_unidades', '64fac9ed0e225513035dfd6688715fc4', (select m from f where proname = 'importar_unidades')
  union all select 'md5 pagos_grupo_al_insertar', '584fb1055a82a713857b633a761ab45f', (select m from f where proname = 'pagos_grupo_al_insertar')
  union all select 'tablas nuevas (datos_pago, invitaciones_codigo, ajustes_cobro, mensajes)', '4', (select count(*)::text from pg_tables where schemaname = 'public' and tablename in ('datos_pago','invitaciones_codigo','ajustes_cobro','mensajes'))
  union all select 'columnas pagos.grupo_id, conceptos_cobro.cuotas, cola_correo.evento_en, mensajes.unidades', '4', (select count(*)::text from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (('pagos','grupo_id'),('conceptos_cobro','cuotas'),('cola_correo','evento_en'),('mensajes','unidades')))
  union all select 'disparadores de pago agrupado', '3', (select count(*)::text from pg_trigger where tgname in ('pagos_grupo_al_insertar','pagos_grupo_mismo_estado','pagos_grupo_inmutable'))
  union all select 'disparador invitaciones_borra_codigo', '1', (select count(*)::text from pg_trigger where tgname = 'invitaciones_borra_codigo')
  union all select 'funciones de correos nuevas', '4', (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cupo_correo','estado_correos_periodo','reenviar_recibo','unidades_mensaje'))
) v;
```

**Esperado:** 18 filas en OK.

### Tanda 3 — ronda 9 (7 archivos)

| # | Archivo |
|---|---|
| 26 | `20261028120000_redondeo_regla_gustavo.sql` |
| 27 | `20261028130000_avisos_resend.sql` |
| 28 | `20261028140000_cupo_por_organizacion.sql` |
| 29 | `20261028150000_solo_operador_y_ajustes_seguridad.sql` |
| 30 | `20261028160000_saldo_unidad_control.sql` |
| 31 | `20261028170000_permisos_sobrantes.sql` |
| 32 | `20261028180000_pagos_desde_cierre.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 cerrar_periodo' que, '36bdef305a5cc58cd1cd3b66038220aa' esperado, (select m from f where proname = 'cerrar_periodo') hay
  union all select 'md5 simular_cierre', '19b6299970311a6d0bf17d48f3aa673f', (select m from f where proname = 'simular_cierre')
  union all select 'md5 registrar_evento_correo', 'feb53cdc2d8cc0ad3c7319d5cd04ce7c', (select m from f where proname = 'registrar_evento_correo')
  union all select 'md5 cupo_correo', '969a97d27dc5380fbb51bc4578a65e33', (select m from f where proname = 'cupo_correo')
  union all select 'md5 despachar_correos', 'e2b9a8ad1adee36bed93e9ccb80ecdb9', (select m from f where proname = 'despachar_correos')
  union all select 'md5 crear_organizacion', '5e4e1157102d48abc239c29fb2f5923b', (select m from f where proname = 'crear_organizacion')
  union all select 'md5 administra_algo', '02553d8dc245667bfd14a16f25608401', (select m from f where proname = 'administra_algo')
  union all select 'md5 org_campos_del_operador', '0b28110290b22a2a5d3dd9170720f5be', (select m from f where proname = 'org_campos_del_operador')
  union all select 'md5 dar_de_baja_acceso', '80f189f60e790ea3ffd7fa3605f1d9cf', (select m from f where proname = 'dar_de_baja_acceso')
  union all select 'md5 traer_tasa_bcv', '2a5a1433626ef394de2795f80719fcb2', (select m from f where proname = 'traer_tasa_bcv')
  union all select 'md5 saldo_unidad', '497d819a42e0533a410dbb62155da7cb', (select m from f where proname = 'saldo_unidad')
  union all select 'md5 pagos_desde_cierre', '7b86d8acf44f957f57a87a45b1558c24', (select m from f where proname = 'pagos_desde_cierre')
  union all select 'anon ejecuta saldo_unidad', 'false', (select has_function_privilege('anon', 'public.saldo_unidad(uuid)', 'execute')::text)
  union all select 'índice cola_por_proveedor', '1', (select count(*)::text from pg_indexes where indexname = 'cola_por_proveedor')
  union all select 'anon con TRUNCATE/REFERENCES/TRIGGER/MAINTAIN en tablas', '0', (select count(*)::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f') and (has_table_privilege('anon', c.oid, 'TRUNCATE') or has_table_privilege('anon', c.oid, 'REFERENCES') or has_table_privilege('anon', c.oid, 'TRIGGER') or has_table_privilege('anon', c.oid, 'MAINTAIN')))
  union all select 'respaldo de permisos r9 en tareas_log', '1', (select count(*)::text from tareas_log where tarea = 'r9_permisos_sobrantes')
) v;
```

**Esperado:** 16 filas en OK.

### Tanda 4 — ronda 10 (6 archivos)

| # | Archivo |
|---|---|
| 33 | `20261029120000_permisos_authenticated.sql` |
| 34 | `20261029130000_estado_envio_periodo.sql` |
| 35 | `20261029140000_cargos_en_recibo.sql` |
| 36 | `20261029150000_fechas_ve.sql` |
| 37 | `20261029160000_cargos_unidad.sql` |
| 38 | `20261029170000_reenviar_sin_duplicar.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 estado_envio_periodo' que, '1ffdc2eba5960fa1d868b676ffe69136' esperado, (select m from f where proname = 'estado_envio_periodo') hay
  union all select 'md5 cerrar_periodo', '2db1cb7be8c9a6d8330e29da8a6a7ac3', (select m from f where proname = 'cerrar_periodo')
  union all select 'md5 simular_cierre', 'c116e31f4170921832b2f640a5592d77', (select m from f where proname = 'simular_cierre')
  union all select 'md5 despachar_correos', 'd20348414484564578a3469ed7940c89', (select m from f where proname = 'despachar_correos')
  union all select 'md5 garita_avisar', 'afd9c226b53ff1acfe7916d0a95758fd', (select m from f where proname = 'garita_avisar')
  union all select 'md5 reabrir_periodo', '482c12b7434a33c76696a5ff66d69b81', (select m from f where proname = 'reabrir_periodo')
  union all select 'md5 reenviar_recibo', '5786e9909401cca6bbacaf9302276efd', (select m from f where proname = 'reenviar_recibo')
  union all select 'fecha_hora_ve de prueba', '28/10/2026, 4:40 p. m.', (select fecha_hora_ve('2026-10-28 20:40:00+00'))
  union all select 'columna recibos.cargos', 'jsonb NO', (select data_type || ' ' || is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'recibos' and column_name = 'cargos')
  union all select 'tabla cargos_unidad con RLS', 'true', (select relrowsecurity::text from pg_class where oid = to_regclass('public.cargos_unidad'))
  union all select 'políticas de cargos_unidad', '2', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'cargos_unidad')
  union all select 'authenticated con TRUNCATE/REFERENCES/TRIGGER/MAINTAIN en tablas', '0', (select count(*)::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f') and (has_table_privilege('authenticated', c.oid, 'TRUNCATE') or has_table_privilege('authenticated', c.oid, 'REFERENCES') or has_table_privilege('authenticated', c.oid, 'TRIGGER') or has_table_privilege('authenticated', c.oid, 'MAINTAIN')))
) v;
```

**Esperado:** 12 filas en OK.

### Tanda 5 — ronda 10b (1 archivo)

| # | Archivo |
|---|---|
| 39 | `20261031120000_correcciones_revision_r9_r10.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 pagos_desde_cierre' que, 'c17eb556849fb630e4f2e43b83318d2f' esperado, (select m from f where proname = 'pagos_desde_cierre') hay
  union all select 'md5 org_campos_del_operador', 'c43fde43b1187e0c8894da9773f2d07c', (select m from f where proname = 'org_campos_del_operador')
  union all select 'md5 exigir_org_al_dia', 'b9c832365abf7318944d6c15f29593d7', (select m from f where proname = 'exigir_org_al_dia')
  union all select 'md5 edificio_dentro_del_tope', 'dcdd9fecaaf51552794b5a0fa2d18268', (select m from f where proname = 'edificio_dentro_del_tope')
  union all select 'md5 destinatarios_de', '2558c045144a6e72adfbd5b8632f4255', (select m from f where proname = 'destinatarios_de')
  union all select 'md5 esc_html', 'dc4d15f24644035a3580d97ef58f5b67', (select m from f where proname = 'esc_html')
  union all select 'funciones que todavía dicen hola@vecitap.com', '0', (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%hola@vecitap.com%')
) v;
```

**Esperado:** 7 filas en OK.

### Tanda 6 — ronda 11 (3 archivos)

| # | Archivo |
|---|---|
| 40 | `20261031130000_mora_activa_con_porcentaje.sql` |
| 41 | `20261031140000_cuotas_y_cargos_en_previa.sql` |
| 42 | `20261031150000_multas_sin_mora.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 simular_cierre' que, '5bb826a852dd38de42cfc7ca78bb59a4' esperado, (select m from f where proname = 'simular_cierre') hay
  union all select 'md5 cerrar_periodo', 'cf6653ad5390d41bc5a4c579af0fd1a1', (select m from f where proname = 'cerrar_periodo')
  union all select 'md5 deuda_por_orden', 'e5d46aa2bd52c3af12d827555dd52410', (select m from f where proname = 'deuda_por_orden')
  union all select 'permisos de deuda_por_orden', 'postgres=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'deuda_por_orden')
  union all select 'permisos de simular_cierre', 'postgres=X/postgres,authenticated=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'simular_cierre')
  union all select 'restricción edificios_mora_con_porcentaje', '1', (select count(*)::text from pg_constraint where conname = 'edificios_mora_con_porcentaje')
  union all select 'columnas cargos_unidad.tipo y cortes_mensuales.multas_acumuladas', '2', (select count(*)::text from information_schema.columns where table_schema = 'public' and (table_name, column_name) in (('cargos_unidad','tipo'),('cortes_mensuales','multas_acumuladas')))
) v;
```

**Esperado:** 7 filas en OK.

### Tanda 7 — ronda 12 (4 archivos)

| # | Archivo |
|---|---|
| 43 | `20261031160000_multas_al_final.sql` |
| 44 | `20261031170000_multa_con_fundamento.sql` |
| 45 | `20261031180000_cuentas_en_cero.sql` |
| 46 | `20261031190000_cerrar_funciones_expuestas.sql` |

```sql
with f as (
  select proname, string_agg(md5(prosrc), ',') m
    from pg_proc where pronamespace = 'public'::regnamespace group by proname)
select que, esperado, coalesce(hay, '(no existe)') hay,
       case when hay = esperado then 'OK' else 'NO COINCIDE' end resultado
from (
            select 'md5 deuda_por_orden' que, '766beca27abf363f4b78b3d21db6654e' esperado, (select m from f where proname = 'deuda_por_orden') hay
  union all select 'md5 simular_cierre (sin cambios)', '5bb826a852dd38de42cfc7ca78bb59a4', (select m from f where proname = 'simular_cierre')
  union all select 'md5 cerrar_periodo (sin cambios)', 'cf6653ad5390d41bc5a4c579af0fd1a1', (select m from f where proname = 'cerrar_periodo')
  union all select 'md5 datos_pago_html', 'fdf7692914e87a3c31df7a4168770b46', (select m from f where proname = 'datos_pago_html')
  union all select 'md5 datos_pago_texto', '2a6fa6a5dffba8ab25fa031f65bacf9c', (select m from f where proname = 'datos_pago_texto')
  union all select 'md5 correo_recibo', '76eed05ec00d037400bd624bdf1dfd2d', (select m from f where proname = 'correo_recibo')
  union all select 'permisos de correo_recibo', 'postgres=X/postgres,authenticated=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'correo_recibo')
  union all select 'permisos de destinatarios_de', 'postgres=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = 'destinatarios_de')
  union all select 'permisos de _usr', 'postgres=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = '_usr')
  union all select 'permisos de _entrar', 'postgres=X/postgres', (select array_to_string(proacl, ',') from pg_proc where proname = '_entrar')
  union all select 'restricción cargos_unidad_multa_con_fundamento', '1', (select count(*)::text from pg_constraint where conname = 'cargos_unidad_multa_con_fundamento')
) v;
```

**Esperado:** 11 filas en OK.

### 4.8 La foto final: producción igual a pruebas

```sql
select
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace) funciones,
  (select md5(string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, chr(13), '')), '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace) huella_cuerpos,
  (select md5(string_agg(p.oid::regprocedure::text || '=' || coalesce(array_to_string(p.proacl, ','), '') || '/' || p.prosecdef, '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace) huella_permisos,
  (select count(*) from pg_tables where schemaname = 'public') tablas,
  (select md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, '|' order by table_name, column_name)) from information_schema.columns where table_schema = 'public') huella_columnas,
  (select md5(string_agg(conrelid::regclass::text || '.' || conname, '|' order by conrelid::regclass::text, conname)) from pg_constraint where connamespace = 'public'::regnamespace) huella_restricciones,
  (select md5(string_agg(tablename || '.' || policyname, '|' order by tablename, policyname)) from pg_policies where schemaname = 'public') huella_politicas;
```

**Esperado** (lo que da hoy vecitap-pruebas con las 46 aplicadas):

| funciones | huella_cuerpos | huella_permisos | tablas | huella_columnas | huella_restricciones | huella_politicas |
|---|---|---|---|---|---|---|
| 169 | `463ba1b1ae3db48e4dc745552f9bf554` | `13f983698c431a3243333caaefaaaf22` | 43 | `eb7293aeff702c8527d084f1e6cf0f6c` | `5a00f844116657cc2f4db3dff580dd5e` | `b87935952533987056ae54d5502f45ef` |

**Si alguna huella no coincide** y las siete tandas dieron OK: no es para parar. La app puede
salir igual; avísame y comparo función por función por lectura (puede ser una diferencia de
antes, de las que no rompen nada).

---

## 5. Datos en `secretos` (en el SQL Editor de producción)

`guardar_secreto()` pide la sesión del operador, así que va el INSERT directo. **El `whsec_…` se
escribe en el editor y no se guarda en ningún archivo ni se pasa por chat.**

**5.1 La huella del secreto del webhook: la pone Gustavo antes de empezar** (paso 0.5). Tú no
corres este INSERT: solo la comprobación de abajo (largo 64). Se puede correr con producción
todavía en `20260929120000` (comprobado por lectura el 01-nov: `secretos` tiene clave primaria
en `nombre`, existe `extensions.digest`, ningún disparador ni regla sobre la tabla, y el SQL
Editor entra como `postgres`, que es el dueño y no pasa por RLS). Ninguna de las 46 migraciones
ni de sus rollbacks escribe, borra o recrea filas de `secretos`: la fila queda intacta. Lo que
corre Gustavo (con el *Signing secret* del webhook de producción, paso 6.3):

```sql
insert into secretos (nombre, valor)
values ('webhook_resend_sha256', encode(extensions.digest('PEGAR_AQUI_EL_whsec_DE_PRODUCCION', 'sha256'), 'hex'))
on conflict (nombre) do update set valor = excluded.valor, actualizado = now();
```

**5.2 El tope diario de correos en 65** (plan gratis de Resend: 100 por día para toda la
cuenta, pruebas incluida):

```sql
insert into secretos (nombre, valor) values ('correo_tope_diario', '65')
on conflict (nombre) do update set valor = excluded.valor, actualizado = now();
```

**5.3 El aviso de «se acabó el cupo» por correo** (obligatorio):

```sql
insert into secretos (nombre, valor) values ('correo_operador', 'info@vecitap.com')
on conflict (nombre) do update set valor = excluded.valor, actualizado = now();
```

**Comprobar:**

```sql
select tope_correo() tope,
       (select length(valor) from secretos where nombre = 'webhook_resend_sha256') largo_huella,
       (select valor from secretos where nombre = 'correo_operador') correo_operador,
       (select valor from secretos where nombre = 'correo_enlace') correo_enlace,
       (select valor from secretos where nombre = 'correo_remitente') correo_remitente,
       (select string_agg(nombre, ', ' order by nombre) from secretos) secretos;
```

**Esperado:**

| tope | largo_huella | correo_operador | correo_enlace | correo_remitente | secretos |
|---|---|---|---|---|---|
| 65 | 64 | `info@vecitap.com` | `https://vecitap.com/mi` | `avisos@envios.vecitap.com` | `correo_enlace, correo_operador, correo_remitente, correo_tope_diario, resend_api_key, webhook_resend_sha256` |

`correo_enlace` y `correo_remitente` no se tocan: son los de hoy (leídos el 01-nov). El enlace
lleva `/mi` a propósito: los correos arman con él «Ver mi recibo», y de ahí sacan el origen
(`https://vecitap.com`) para el enlace de crear usuario.

**Si no coincide:**
- Tope distinto de 65: repetir el 5.2.
- Largo vacío o distinto de 64: falta la huella de Gustavo o está mal. Que la vuelva a poner
  (5.1); el webhook no anda sin ella.
- `correo_operador` vacío: repetir el 5.3.
- `correo_enlace` o `correo_remitente` distintos: no cambiarlos; avisarme.

---

## 6. Lo que se configura fuera de la base

### 6.1 Vercel → Project → Settings → Environment Variables, entorno **Production**

| Variable | Valor | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://sudghmerriewjmmnlcrf.supabase.co` | La de **producción**, no la de pruebas |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clave *anon/publishable* de vecitap-produccion | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SITE_URL` | `https://vecitap.com` | **Solo** en Production. En Preview no tiene que existir |
| `RESEND_WEBHOOK_SECRET` | el `whsec_…` del webhook de producción (6.3) | **La pone Gustavo antes de empezar** (paso 0.5). Sin `NEXT_PUBLIC_`. Es el mismo valor cuya huella va en el 5.1 |

**No van** en Vercel: la clave de Resend (vive en `secretos`), la *service_role* ni la contraseña
de la base.

En **Preview**: las dos de Supabase apuntando a **pruebas** (`hdivffuorclzulijkyry`) y
`RESEND_WEBHOOK_SECRET` con el `whsec_` del webhook de pruebas.

Una variable nueva o cambiada no llega a un deploy ya hecho: el deploy del paso 7 las toma.

**Cómo comprobar (después del paso 7):**
- En la lista de variables, filtrar por *Production*: las cuatro, y ninguna más de las de arriba.
- `https://vecitap.com/entrar` → F12 → Network → entrar con cualquier cuenta: los pedidos van a
  `sudghmerriewjmmnlcrf.supabase.co`. Si van a `hdivffuorclzulijkyry`, la variable de
  Production está mal.
- El webhook, en PowerShell:
  `curl.exe -s -o NUL -w "%{http_code}" -X POST https://vecitap.com/api/resend -d "{}"`
  → **401** (la ruta tiene el secreto y rechaza una firma falsa). **500** = falta
  `RESEND_WEBHOOK_SECRET` en Production (agregarla y volver a desplegar).

### 6.2 Supabase (producción) → Authentication → URL Configuration

| Campo | Valor |
|---|---|
| Site URL | `https://vecitap.com` |
| Redirect URLs | `https://vecitap.com/**` |

Los Preview y `localhost` van contra pruebas: no hace falta agregarlos en producción.

**Cómo comprobar:** en `https://vecitap.com/entrar` → «Olvidé mi contraseña» con una cuenta
tuya. El enlace del correo, al tocarlo, tiene que terminar en `https://vecitap.com/…`, no en
`localhost` ni en `*.vercel.app`.

### 6.3 Resend (lo hace Gustavo antes de empezar)

Hasta el deploy del paso 7, vecitap.com no tiene la ruta `/api/resend`: los avisos que mande
Resend en esas horas dan 404 y Resend los reintenta solo. Es normal, no hay que hacer nada.

1. **Webhooks → Add Webhook**:
   - Endpoint URL: `https://vecitap.com/api/resend`
   - Events: `email.delivered`, `email.delivery_delayed`, `email.bounced`,
     `email.complained`, `email.opened` y **`email.clicked`**. Nada más. (`email.clicked` se
     agrega porque el seguimiento de clics está encendido; ver el punto 3.)
   - Abrir el webhook creado → copiar el **Signing secret** (`whsec_…`).
2. **Dónde va el secreto:** en **dos** lugares, el mismo valor: en Vercel como
   `RESEND_WEBHOOK_SECRET` (Production, 6.1) y su huella en la base (5.1). Nunca en el repo.
3. **Domains → `envios.vecitap.com` → Configuration: se deja como está.** Hoy tiene **Click
   Tracking encendido** y **Open Tracking apagado**, y el panel no deja cambiarlo sin crear
   un subdominio de seguimiento. Pruebas usa el mismo dominio y la misma cuenta: todas las
   rondas se probaron así. Lo que implica:
   - **Click Tracking encendido:** Resend cambia cada enlace del correo por uno suyo que
     redirige al original, con la dirección completa. El enlace «Crear mi usuario» lleva el
     código de invitación en la dirección (`/entrar?volver=/mi/agregar?codigo=…`) y llega
     entero. Además el código va escrito en el correo, para copiarlo y pegarlo, así que no
     depende del enlace. «Ver mi recibo» y «Vea el monto en bolívares» tampoco llevan nada
     que se pierda. Lo único que cambia: al pasar el cursor, el enlace muestra el dominio de
     seguimiento de Resend y no vecitap.com.
   - **Open Tracking apagado:** Resend no avisa cuando alguien abre un correo
     (`email.opened` no llega nunca). En Cortes, «Ver cuáles» muestra **«Entregado»** y
     no **«Abierto»**, salvo que la persona toque un enlace: con `email.clicked` en el
     webhook, ese clic también se muestra como «Abierto». Nada más depende de «abierto»: ni
     el envío, ni el reenvío, ni el cupo, ni los montos. **Para el piloto no afecta.**
   - **Pendiente para después del piloto:** decidir si se crea el subdominio de seguimiento
     (para encender Open Tracking y que los enlaces muestren un dominio de Vecitap). Hay que
     hacerlo en Resend y en el DNS de Cloudflare. Hasta entonces, no tocar esta
     configuración.

**Cómo comprobar:** el `curl` del 6.1 da 401; y con el primer correo real, en Resend → Webhooks
→ el webhook → los envíos salen con **200**.

### 6.4 Tareas de cron

Ninguna migración las cambia. Hoy en producción están las tres, iguales que en pruebas:

```sql
select jobname, schedule, active, command from cron.job order by jobname;
```

| jobname | schedule | active | command |
|---|---|---|---|
| vecitap_cobros | `0 11 * * *` | true | `select generar_cobros_vencidos()` |
| vecitap_correos | `*/5 * * * *` | true | `select despachar_correos(20)` |
| vecitap_tasa | `*/30 12-16 * * *` | true | `select traer_tasa_bcv()` |

Y que corren sin error después de las migraciones (esperar 10 minutos después de la tanda 7):

```sql
select j.jobname, d.status, d.start_time, left(d.return_message, 80) mensaje
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 order by d.start_time desc limit 6;
```

**Esperado:** `vecitap_correos` con `succeeded` en las corridas posteriores a la tanda 7.
**Si sale `failed`:** copiar el mensaje y avisarme (la tarea de correos no manda nada hasta que
se arregle, y no avisa a nadie).

### 6.5 Tope diario de correos en 65

Es el 5.2. Se vuelve a mirar con `select tope_correo();` → **65**. El día que se contrate el
plan pago de Resend, el mismo INSERT con `'1600'` (ver `docs/estado-migracion.md`, «El día
del plan pago de Resend»).

---

## 7. Publicar el código

Recién ahora, con las siete tandas en OK:

1. En `dev`: `npm run build`, `npm run lint` y `npx tsc --noEmit` en verde.
2. Antes del merge, dos comprobaciones:
   - `git fetch` y después `git log --oneline origin/integration..dev` lista los commits que
     van a salir, y **`git log --oneline dev..origin/integration` sale vacío**. Si no sale
     vacío, `integration` tiene algo que `dev` no tiene: no mergear; avisarme.
   - El arreglo del desglose de «Cuotas y cargos» (`components/admin/CierreMes.tsx`, «Ronda 12
     del tramo 2: monto del desglose en una línea») **está commiteado en `dev`**:
     `git status` limpio y ese commit en `git log --oneline -3`.
3. Llevar `dev` a `integration` (avance rápido: `integration` no tiene nada que `dev` no tenga;
   son 23 commits al 01-nov, más el de la ronda 12) y hacer push. Eso publica vecitap.com.
4. Vercel → Deployments: esperar que el deploy de `integration` quede *Ready*. Si falla, el
   sitio sigue con la versión anterior: avisarme con el log.
5. Las comprobaciones del 6.1 y el 6.2.

## 8. Prueba corta en el sitio

Con la cuenta de GRUPO ING3 (o la del operador), en `https://vecitap.com`:

| Qué | Esperado |
|---|---|
| Entrar | Lleva a Admin, al edificio de ING3 |
| El menú | Sin «Cobros» (Inicio · Propietarios · Pagos recibidos · Gastos del mes · Cortes de cuenta · …) |
| Propietarios | Las 53 unidades |
| Gastos del mes | Abre sin error (con o sin mes abierto) |
| Ajustes | «Reglas de cobro del edificio» aparece debajo de «Datos del edificio» |

Si algo da error: no tocar la base. Mandarme una captura y la hora.

---

## 9. Si algo sale mal

| Pasa | Qué hacer |
|---|---|
| Un archivo da «ABORTADA: …» | No se aplicó nada de ese archivo. Parar y mandarme el texto |
| Un archivo da otro error | Lo mismo: la transacción se deshizo sola. Parar y avisar |
| Una tanda da NO COINCIDE | Parar. No correr rollbacks sin hablarlo: van en orden inverso y algunos tienen guardas |
| El deploy falla | El sitio queda con la versión anterior. Avisar |
| Hay que volver todo atrás | Último recurso: restaurar el respaldo del paso 1, juntos. Ojo: el respaldo es de antes del paso 3, así que **restaurarlo trae de vuelta Guachu y Edificio arauca** |

Al terminar, avísame: comparo por lectura las 169 funciones de las dos bases y actualizo
`docs/estado-migracion.md`.

---

## Sobre `docs/respaldo.md` con el plan Free

- **El porqué sigue valiendo:** con el plan Free de Supabase no hay respaldos automáticos ni
  recuperación a un momento dado. El respaldo a mano es el único que hay, y se hace antes de
  cada migración.
- **El cómo no se puede seguir en esta computadora:** `supabase db dump` necesita el CLI de
  Supabase y **Docker**, y no está ninguno de los dos. Sí están `pg_dump` y `psql` 18.6, que
  alcanzan para lo que se usa (`public` entero, datos de `auth`, y la lista de cuentas y del cron
  en CSV). Eso es el paso 1 de esta guía. **Lo que no cubre:** los roles de la base. Para
  deshacer una migración no hacen falta; para levantar el proyecto de cero en otra cuenta, sí.
- **Nunca se hizo un respaldo con ese archivo:** la carpeta que indica
  (`OneDrive\Respaldos\vecitap`) no existe.
- **Para después del paso a producción:** actualizar `docs/respaldo.md` con los comandos de
  `pg_dump` del paso 1 (o instalar Docker y el CLI), y probar una restauración en un proyecto
  descartable, como dice su sección 6.
- **Sigue valiendo todo lo demás:** la contraseña sin dejarla escrita (`Read-Host
  -AsSecureString`), los archivos fuera del repo, `git status` para comprobarlo, y lo que no
  viaja en un volcado (cron, secretos, Auth, Vercel).
