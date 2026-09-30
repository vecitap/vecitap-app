# Respaldo diario de la base

Para **Windows + PowerShell**. Un comando por línea: se copian y se pegan.

**Por qué esto existe y no es opcional.** En el plan **Free de Supabase no hay
respaldos automáticos** — ni diarios ni point-in-time; eso llega con Pro. O sea
que, hasta que se pase a Pro, **este archivo es el único respaldo que tiene
Vecitap**. Si alguien borra una tabla el martes y nadie corrió esto el lunes,
los datos no están en ningún lado.

Y es obligatorio **antes de cualquier migración en producción**
([`AGENTS.md`](../AGENTS.md), sección "Producción"). Sin excepción por "es un
cambio chiquito": las chiquitas son justamente las que se aplican sin
pensarlas.

---

## 0. Una sola vez: instalar las dos herramientas

```powershell
scoop install supabase
```

```powershell
scoop install postgresql
```

`supabase` hace los respaldos; `psql` (que viene con `postgresql`) es lo único
que sabe restaurarlos. Instale los dos ahora, no el día que los necesite.

Sin Scoop, el CLI también corre con `npx supabase@latest <comando>`, pero es
más lento y hay que tener red. Para `psql` no hay atajo: se instala.

Comprobar que quedaron:

```powershell
supabase --version; psql --version
```

---

## 1. La cadena de conexión: de dónde sale

Supabase → el proyecto → **Project Settings → Database → Connection string →
URI**, y ahí elija **Session pooler**.

Tres cosas que importan y que se equivocan seguido:

- **Session pooler, no Transaction pooler.** El de transacciones es el puerto
  **6543** y no sirve para `pg_dump`: no soporta las sentencias preparadas que
  el volcado necesita. El de sesión es el **5432**, y el usuario tiene forma
  `postgres.<ref>`, con punto.
- **No use la conexión directa** (`db.<ref>.supabase.co`) salvo que sepa que
  tiene IPv6: en muchas conexiones hogareñas de Venezuela no resuelve y el
  error que da no lo dice claro.
- La URI que copia trae `[YOUR-PASSWORD]` en el medio. **Deje ese texto tal
  cual**: los comandos de abajo lo reemplazan solos.

Los dos proyectos:

| Base | Ref | Cuándo se respalda |
|---|---|---|
| **vecitap-produccion** | `sudghmerriewjmmnlcrf` | Todos los días, y antes de cada migración |
| **vecitap-pruebas** | `hdivffuorclzulijkyry` | Antes de una migración que vaya a probar ahí |

---

## 2. La contraseña, sin dejarla escrita

Tres razones para no pegarla en el comando: PowerShell guarda **todo lo que
usted escribe** en `ConsoleHost_history.txt` (en texto plano, para siempre);
esa carpeta está sincronizada con OneDrive; y el repo es público, así que
cualquier archivo que la tenga es un accidente a un `git add` de distancia.

`Read-Host -AsSecureString` no la muestra en pantalla y **no la guarda en el
historial**. Estas cuatro líneas se corren al empezar la sesión de respaldo:

```powershell
$uri = Read-Host "Pegue la URI del Session pooler (con [YOUR-PASSWORD] adentro)"
```

```powershell
$seg = Read-Host "Contraseña de la base" -AsSecureString
```

```powershell
$cla = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
```

```powershell
$DB = $uri -replace '\[YOUR-PASSWORD\]', [uri]::EscapeDataString($cla)
```

`EscapeDataString` es necesario, no decorativo: si la contraseña tiene `@`,
`/`, `#` o `?`, sin escapar rompe la URI y el error que da habla de "host
desconocido", que no ayuda nada.

Al terminar, borre las variables de la sesión:

```powershell
Remove-Variable cla, seg, uri, DB -ErrorAction SilentlyContinue
```

> `$DB` vive solo en memoria y solo mientras la ventana esté abierta. Nunca se
> escribe en disco, no aparece en el historial y no va a ningún archivo del
> repo.

---

## 3. Dónde se guardan: **fuera del repo**

```powershell
$RESP = "$env:USERPROFILE\OneDrive\Respaldos\vecitap"
```

```powershell
New-Item -ItemType Directory -Force $RESP | Out-Null
```

```powershell
$HOY = Get-Date -Format 'yyyy-MM-dd-HHmm'
```

**Fuera del repo, sin negociación.** Un volcado de datos de producción tiene
nombres, cédulas, correos, teléfonos y pagos de personas reales, y
`github.com/vecitap/vecitap-app` es **público**. Un solo `git add -A` con el
archivo adentro publica la base entera, y borrarlo después no lo saca del
historial.

Sobre OneDrive, para que sea una decisión y no un descuido: guardar ahí le da
una copia fuera de la computadora (un disco que se muere no se lleva el
respaldo puesto), y a cambio sube datos de clientes a la nube de Microsoft. La
alternativa —un disco externo— no tiene esa contrapartida pero solo protege si
alguien se acuerda de enchufarlo. La ruta de arriba usa OneDrive; cambie
`$RESP` si prefiere lo otro.

---

## 4. El respaldo: tres archivos, con la fecha en el nombre

Se hacen por separado a propósito: al restaurar hay que aplicarlos en orden, y
muchas veces se necesita solo uno (recuperar una tabla de datos sin tocar el
esquema, por ejemplo).

**Roles** — los usuarios de base de datos y sus permisos:

```powershell
supabase db dump --db-url $DB --role-only -f "$RESP\vecitap-roles-$HOY.sql"
```

**Esquema** — tablas, funciones, vistas, triggers, políticas de RLS, índices:

```powershell
supabase db dump --db-url $DB -f "$RESP\vecitap-esquema-$HOY.sql"
```

**Datos** — el contenido de las tablas:

```powershell
supabase db dump --db-url $DB --data-only --use-copy -f "$RESP\vecitap-datos-$HOY.sql"
```

`--use-copy` hace que los datos salgan como `COPY` en vez de un `INSERT` por
fila: el archivo es mucho más chico y restaura mucho más rápido.

Comprobar que los tres salieron y que ninguno quedó vacío:

```powershell
Get-ChildItem $RESP -Filter "vecitap-*-$HOY.sql" | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}
```

Un archivo de **0 KB es un respaldo fallido**, no un respaldo vacío. Si pasa,
casi siempre es la contraseña o el pooler equivocado. No siga hasta que los
tres tengan tamaño.

---

## 5. Lo que NO cubre

Esto es lo que más importa entender de todo el archivo, porque un respaldo que
uno cree completo y no lo es, es peor que no tener ninguno.

`supabase db dump` respalda el **esquema `public`**. Deja afuera:

### 5.1 Los usuarios de Auth — **lo más grave**

Los tres archivos de arriba **no traen `auth.users`**. Si restaura sobre un
proyecto nuevo, la base vuelve con todas las unidades, los recibos y las
membresías… y **sin una sola cuenta**: cada `usuario_id` de `membresias` apunta
a un usuario que no existe, y nadie puede entrar. La app queda intacta y
completamente inaccesible al mismo tiempo.

Dos cosas cubren eso. Una copia del esquema `auth`:

```powershell
supabase db dump --db-url $DB --schema auth -f "$RESP\vecitap-auth-$HOY.sql"
```

Y, como red de seguridad legible por un humano, la lista de cuentas —
**sin contraseñas, que están cifradas y no sirven fuera de su proyecto**:

```powershell
psql $DB -A -F "," -c "select id, email, created_at, last_sign_in_at, confirmed_at from auth.users order by created_at" -o "$RESP\vecitap-usuarios-$HOY.csv"
```

> Restaurar el esquema `auth` **sobre el mismo proyecto** funciona. Sobre un
> proyecto distinto es delicado (hay claves y configuración atadas al
> proyecto): en ese caso sirve para saber **quién** tenía cuenta, y las cuentas
> se vuelven a crear invitando a la gente.

### 5.2 Los archivos de Storage

El bucket `comprobantes` guarda los comprobantes de pago que suben los
residentes. **Ni los archivos ni la lista de objetos están en los tres
volcados.** Si se pierde el proyecto, se pierden todos los comprobantes.

El CLI los puede bajar, pero el comando cambió entre versiones — mire primero
qué acepta la suya:

```powershell
supabase storage --help
```

```powershell
supabase storage cp -r "ss:///comprobantes" "$RESP\comprobantes-$HOY" --experimental
```

Si su versión no tiene `storage cp`, bájelos desde el dashboard
(Storage → comprobantes → Download) o actualice el CLI. **No lo deje para
después con la excusa de que es engorroso**: es la única copia que existe de
esos archivos.

### 5.3 Todo lo que no vive en una tabla

Nada de esto viaja en un `pg_dump`, y por eso está en
[`docs/consultas-produccion.sql`](consultas-produccion.sql) con el bloque que
lo detecta:

| Qué | Dónde se ve | Qué pasa si falta |
|---|---|---|
| Tareas de `cron.job` | bloque (d) | No salen los correos, la tasa del BCV queda congelada, no se generan los cobros. **Y no da ningún error** |
| Buckets de Storage y sus políticas | bloque (e) | Reportar un pago con comprobante falla |
| Secretos (`resend_api_key`, `correo_remitente`, `correo_enlace`) | bloque (f) | No sale un solo correo; `despachar_correos` lo anota en `tareas_log` y sigue en silencio |
| Extensiones (`pg_net`, `pg_cron`, `pgcrypto`) | bloque (c.2) | Sin `pg_net` no hay correo ni tasa; sin `pgcrypto` no se generan códigos de invitación |
| Config de Auth: Site URL, Redirect URLs, plantillas de correo, "Confirm email" | Dashboard → Authentication | Los enlaces de confirmar cuenta y recuperar clave no vuelven al sitio |
| Variables de entorno de Vercel | Dashboard de Vercel | El build sale sin saber a qué base apuntar |

**Consecuencia práctica:** los tres volcados alcanzan para *deshacer una
migración que salió mal*, que es el 99 % de los casos y para lo que se usan
todos los días. **No** alcanzan para *levantar el proyecto de cero en otra
cuenta*. Para eso hacen falta además los de 5.1, 5.2 y la lista de 5.3.

---

## 6. Cómo restaurar

**Antes de empezar:** restaurar encima de una base con datos los pisa. Si la
base de destino tiene algo que le importe, respáldela primero — sí, respaldar
antes de restaurar.

Arme `$DB` con la URI **de la base de destino** (sección 2), fije la fecha del
respaldo que va a usar y verifique que los tres archivos existan:

```powershell
$HOY = "2026-09-30-0800"
```

```powershell
Get-ChildItem $RESP -Filter "vecitap-*-$HOY.sql"
```

La restauración completa, en un solo comando — así es como la documenta
Supabase, y el orden importa: roles, después esquema, después datos:

```powershell
psql --single-transaction --variable ON_ERROR_STOP=1 --file "$RESP\vecitap-roles-$HOY.sql" --file "$RESP\vecitap-esquema-$HOY.sql" --command "SET session_replication_role = replica" --file "$RESP\vecitap-datos-$HOY.sql" --dbname $DB
```

Las tres partes que parecen ruido y no lo son:

- `--single-transaction`: o entra todo o no entra nada. Sin esto, un error a la
  mitad deja la base en un estado intermedio que nadie sabe describir.
- `ON_ERROR_STOP=1`: `psql` por defecto **sigue después de un error**. Sin
  esto, la restauración "termina bien" con la mitad de las tablas vacías.
- `SET session_replication_role = replica`: apaga los triggers y las claves
  foráneas mientras entran los datos. Si no, el orden de inserción de las
  tablas tiene que ser perfecto, y no lo es.

Si solo quiere volver atrás una **migración**, no restaure nada: use el
rollback que acompaña a esa migración en
[`supabase/rollbacks/`](../supabase/rollbacks/). Es más rápido, más preciso y
no toca los datos.

### Probar el respaldo

Un respaldo que nunca se restauró no se sabe si sirve. Una vez, con calma y
antes de necesitarlo: cree un proyecto de Supabase descartable, restaure ahí el
respaldo de **pruebas** (no el de producción) y confirme que las tablas tienen
las filas que espera. Después borre el proyecto.

---

## 7. Comprobar que no se coló nada en el repo

El respaldo tiene datos de clientes y el repo es público. Después de cada
tanda, dos comprobaciones.

**La que importa** — el repo tiene que estar limpio:

```powershell
git -C "$env:USERPROFILE\OneDrive\Documentos\GitHub\vecitap-app" status --porcelain
```

Esperado: que **no aparezca ningún `.sql` ni `.csv` de respaldo**. Si `$RESP`
está fuera del repo (sección 3), Git ni se entera de que existen: la lista sale
con sus cambios de código y nada más.

**La de red de seguridad** — qué pasaría si un archivo terminara adentro:

```powershell
git -C "$env:USERPROFILE\OneDrive\Documentos\GitHub\vecitap-app" check-ignore -v "$RESP\vecitap-datos-$HOY.sql"
```

Cómo se lee la respuesta. **Es al revés de lo que parece**, así que vale la
pena leer la tabla entera antes de interpretarla (las tres se comprobaron
contra este repo, no son de memoria):

| Respuesta | Código | Qué significa |
|---|---|---|
| `fatal: … is outside repository at …` | 128 | ✅ **Lo que se busca.** El archivo está fuera del repo y Git ni lo considera |
| `fatal: Invalid path …: No such file or directory` | 128 | ✅ Lo mismo, pero el respaldo de esa fecha todavía no existe. Revise el nombre |
| `.gitignore:54:/*.sql	vecitap-datos-….sql` | 0 | ⚠ El archivo **está dentro del repo**, en la raíz, y la regla `/*.sql` lo tapa. No se va a subir, pero está donde no debe: muévalo a `$RESP` |
| **No imprime nada** | 1 | 🚨 **El caso peligroso.** El archivo está **dentro del repo** y **no** está ignorado: el próximo `git add -A` lo sube al repo público |

El silencio es la respuesta mala, no la buena — es la trampa de este comando.
Y pasa de verdad, porque la regla `/*.sql` del `.gitignore` empieza con `/` y
por eso cubre **solo la raíz**: un respaldo guardado en `docs/` o en
`supabase/` no queda ignorado y `check-ignore` se calla.

Por eso **la comprobación que manda es `git status` (la primera)**, que en ese
caso sí lista el archivo. Esta segunda sirve para entender *por qué* un
archivo está o no protegido, no para decidir si el respaldo está bien
guardado.

---

## 8. El guion completo

Guárdelo **fuera del repo**, por ejemplo en `%USERPROFILE%\Respaldar-Vecitap.ps1`.
Pide la URI y la contraseña cada vez, a propósito: no hay forma de que quede
escrita en ningún lado.

```powershell
$RESP = "$env:USERPROFILE\OneDrive\Respaldos\vecitap"
New-Item -ItemType Directory -Force $RESP | Out-Null
$HOY = Get-Date -Format 'yyyy-MM-dd-HHmm'
$uri = Read-Host "URI del Session pooler (con [YOUR-PASSWORD] adentro)"
$seg = Read-Host "Contrasena de la base" -AsSecureString
$cla = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg))
$DB  = $uri -replace '\[YOUR-PASSWORD\]', [uri]::EscapeDataString($cla)
supabase db dump --db-url $DB --role-only -f "$RESP\vecitap-roles-$HOY.sql"
supabase db dump --db-url $DB -f "$RESP\vecitap-esquema-$HOY.sql"
supabase db dump --db-url $DB --data-only --use-copy -f "$RESP\vecitap-datos-$HOY.sql"
supabase db dump --db-url $DB --schema auth -f "$RESP\vecitap-auth-$HOY.sql"
Remove-Variable cla, seg, uri, DB -ErrorAction SilentlyContinue
Get-ChildItem $RESP -Filter "vecitap-*-$HOY.sql" | Select-Object Name, @{n='KB';e={[math]::Round($_.Length/1KB,1)}}
```

Falta a propósito la copia de los archivos de Storage (5.2): el comando cambia
según la versión del CLI y meterlo acá sin comprobarlo daría la falsa
impresión de que los comprobantes están respaldados. Córralo aparte.

**Borrar lo viejo.** Los respaldos ocupan y se acumulan. Esto deja los últimos
30 días y borra el resto — léalo antes de correrlo, borra archivos:

```powershell
Get-ChildItem $RESP -Filter "vecitap-*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Confirm
```

`-Confirm` está puesto a propósito: pregunta uno por uno. Sáquelo solo cuando
ya haya visto que la lista es la que espera.
