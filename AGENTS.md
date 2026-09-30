<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vecitap — Contexto del proyecto

## Qué es esto
Sistema de administración de condominios. Fue construido originalmente por un socio
comercial no técnico vía "vibe coding" (con ayuda de Claude, sin supervisión de
ingeniería formal). Este proyecto es una auditoría técnica + migración para corregir
deuda técnica acumulada y validar la arquitectura: de 4 archivos HTML monolíticos
(React 18 + Babel standalone vía CDN, sin build step) a un proyecto Next.js real.

**El estado del plan de migración (qué fase está en curso, qué falta, pendientes
concretos de cada fase) vive en [`docs/estado-migracion.md`](docs/estado-migracion.md)
— se actualiza al cerrar cada fase. Este archivo (`AGENTS.md`) se toca rara vez: solo
stack, convenciones de arquitectura y reglas de gobierno que no cambian de una fase a
otra.**

## Producción

**Léelo antes de tocar nada. Esta app está en vivo.**

### `integration` publica vecitap.com. Cada push llega a usuarios reales.

No hay rama de staging entre medio: lo que se empuja a `integration` se
despliega en https://vecitap.com y lo usan administradores de condominio y
residentes de verdad, con su dinero y sus datos. No es un entorno de pruebas
con datos bonitos.

De eso salen tres reglas, sin excepción:

1. **`npm run build`, `npm run lint` y `npx tsc --noEmit` en verde antes de
   cada push.** Los tres, no uno. Un error de tipos no rompe `npm run dev`
   pero sí rompe el build de Vercel, y un build roto deja el sitio servido
   por la versión anterior sin avisar a nadie.
2. **Lo que dependa del método HTTP o del status de una respuesta se prueba
   contra `next start` o contra el Preview de Vercel, nunca solo contra
   `npm run dev`** — ver "Flujo de trabajo" más abajo: un `POST` a una página
   devuelve 200 en dev y 405 en el build de producción, y así pasó un bug
   entero una validación completa.
3. **Ante la duda, abrí un Preview.** Cada rama que no sea `integration`
   genera uno en Vercel con su propia URL; eso es gratis y no toca a nadie.

Contexto que conviene tener presente: `main` está **congelada** y publica
`mi.vecitap.com` (GitHub Pages, contra la base de **pruebas**), que queda como
respaldo. Nunca se mergea a `main`.

### En esta rama no hay HTML. La referencia de paridad es `main`.

**No busques `admin.html`, `index.html`, `operador.html` ni `garita.html` en
el árbol de trabajo: no están.** Se borraron de `integration` el 29-sep. Si un
comentario del código o un documento dice `admin.html:3899`, se refiere al
archivo **en `main`**, no a un archivo de esta rama.

Para leerlos, **sin cambiar de rama y sin restaurarlos**:

```bash
git show main:admin.html | less          # el archivo entero
git show main:index.html                 # Residente
git show main:operador.html              # Operador
git show main:garita.html                # Garita
git show main:admin.html | sed -n '3899,3960p'   # un rango concreto
git show main:index.html | grep -n "papelRecibo" # buscar algo
```

`main` está congelada, así que esas líneas no se mueven: una referencia
`archivo.html:N` escrita hace semanas sigue apuntando a lo mismo.

Dos reglas que salen de esto:

1. **Los HTML son de solo lectura, y de otra rama.** Se consultan para
   comparar comportamiento o texto. No se editan, no se restauran a esta
   rama, no se copian a `public/`.
2. **Todo cambio va en la app de Next.** Si algo no coincide con `main`, lo
   que se corrige es el componente, nunca el HTML. Y si el desvío es
   deliberado, se registra en
   [`docs/casos-de-uso-mejorados.md`](docs/casos-de-uso-mejorados.md).

Los estáticos que sí necesita la app viven en **`public/`**
(`logo-claro.png`, `logo-oscuro.png`) y el favicon en `app/favicon.ico`. La
raíz ya no sirve archivos: en esta rama la sirve Next, y Next solo publica
`public/`.

### Los cambios de base van como archivo, nunca a mano en el dashboard

Todo cambio de esquema, función, política de RLS, trigger o cron **se escribe
como archivo**:

- La migración en `supabase/migrations/AAAAMMDDHHMMSS_nombre.sql`.
- Su reverso en `supabase/rollbacks/AAAAMMDDHHMMSS_nombre_rollback.sql`.
  **Sin rollback la migración no está terminada**, aunque el SQL de ida
  funcione.
- Los pasos de verificación (qué consultar y qué tiene que devolver) al final
  del propio archivo de migración, no en el mensaje del commit ni en el chat.

Y se aplican **en este orden, siempre**:

1. Primero en **vecitap-pruebas**.
2. Después, y solo si lo anterior salió bien, en **vecitap-produccion**.

**Nunca se edita nada directo en el dashboard de producción** — ni el SQL
Editor "para probar rápido", ni el editor de tablas, ni el de políticas. Un
cambio hecho ahí no queda en el repo, no tiene rollback, no está en
pruebas, y la próxima migración que asuma el estado anterior se va a romper o,
peor, va a pisar el cambio en silencio. Si hace falta corregir algo en
producción, se escribe la migración y se aplica.

Quien corre el SQL es **Nicolás**: un asistente entrega la consulta lista para
copiar, más una de verificación, y no ejecuta nada contra ninguna base.

### Respaldo antes de cualquier migración en producción

**Respaldo primero, migración después.** Sin excepciones por "es un cambio
chiquito": las migraciones chiquitas son justamente las que se aplican sin
pensarlas. El procedimiento completo (Supabase CLI con `--db-url`, roles /
esquema / datos por separado, y cómo restaurar) está en
[`docs/respaldo.md`](docs/respaldo.md).

### Ninguna clave en el repo: es público

`github.com/vecitap/vecitap-app` es un **repositorio público**. Cualquiera lee
cada archivo y todo el historial de commits, así que una clave commiteada está
comprometida desde el momento del push — borrarla después no la borra del
historial, solo hay que rotarla.

- **Nunca** en un archivo del repo, ni en `docs/`, ni en un comentario, ni
  como "valor de ejemplo" en `.env.example`, ni en un script de pruebas:
  la clave de **Resend**, la **service_role** de Supabase, la **contraseña de
  la base**, ni las claves de las cuentas de prueba.
- Los valores reales van en `.env.local` (gitignored) y en las variables de
  entorno de Vercel. Qué variable va en qué entorno está documentado en
  [`.env.example`](.env.example), que es plantilla: nombres y explicaciones,
  cero valores.
- La única excepción es la clave **anon/publishable** de Supabase, que es
  pública por diseño (la seguridad la dan las políticas de RLS, no el secreto
  de esa clave). Aun así vive en variables de entorno, para poder apuntar a
  distintos proyectos sin tocar código.
- Tampoco se escriben a mano en el código las URLs ni los refs de los
  proyectos de Supabase: van por variables de entorno, y la URL pública del
  sitio se resuelve en un solo lugar, `lib/url-sitio.ts`.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Hosting: Vercel — plan Hobby durante desarrollo, Pro obligatorio antes del
  lanzamiento comercial (el plan gratuito prohíbe uso comercial y Vecitap
  gestiona pagos)
- Backend/DB: Supabase — Free durante desarrollo, Pro antes del lanzamiento
  (el plan gratuito pausa el proyecto tras una semana sin actividad)
- **Piloto del 30-sep: se sale a producción con los dos planes Free.**
  Decisión tomada por Nicolás, no un olvido. Los dos límites de arriba
  siguen en pie y hay que resolverlos antes del lanzamiento comercial
  abierto — no volver a proponerlo como pregunta, sí tenerlo presente
- Repo: github.com/vecitap/vecitap-app — **público**. Rama de trabajo
  `integration` (desde el 27-sep; `optimization` se mergeó ahí junto con
  `main`), que además **publica producción** — ver la sección "Producción"
  más arriba. Nunca mergear a `main`: está congelada y publica
  mi.vecitap.com contra la base de pruebas
- Dominio vecitap.com vía Cloudflare (DNS apuntando a Vercel). La raíz sirve
  toda la app (`/mi`, `/admin`, `/operador`, `/garita`); `www` redirige a la
  raíz
- Bases: **vecitap-produccion** (`sudghmerriewjmmnlcrf`) y **vecitap-pruebas**
  (`hdivffuorclzulijkyry`). Los refs no se escriben en el código: van por
  variables de entorno
- Correo transaccional: Resend, dominio verificado `envios.vecitap.com`,
  remitente `no-reply@envios.vecitap.com`. Lo despacha la base (`cola_correo`),
  no la app Next

## Gobierno del proyecto
- **No avanzar de fase sin aprobación explícita de Nicolás.**
- **Fases 5 y 9 requieren revisión cruzada obligatoria** (con el chat estratégico de
  Claude.ai, no solo Claude Code).
- Flujo dual: Claude Code (esta herramienta) crea/edita archivos con aprobación de
  Nicolás; el chat de Claude.ai sirve de segunda opinión estratégica para
  arquitectura, análisis de seguridad y documentación.
- Cada cambio se revisa antes de aplicarse — no autoaprobar.
- Al cerrar cada fase: resumen breve antes de avanzar, y actualizar
  `docs/estado-migracion.md` (no este archivo).

## Convenciones de arquitectura
- Una sola app, rutas por rol (no monorepo): `app/(marketing)`, `app/(admin)/admin`,
  `app/(residente)/mi`, `app/(interno)/operador`, `app/api`
- Cliente Supabase tipado (`supabase gen types typescript`), no queries sueltas
- Lógica de negocio (cálculo de deuda, estados de suscripción, formateo) vive en
  `lib/` y `hooks/`, no en componentes
- `proxy.ts` (se llamaba `middleware.ts` hasta Next.js 15 — Next 16 renombró el
  archivo) refresca la sesión de Supabase en cada request y protege navegación/UX:
  por sesión para `/admin`, `/mi`, `/operador` y `/garita`, y además por rol
  (`es_operador()` para `/operador/*`, `tiene_rol()` para `/admin/[orgId]/*`,
  `edificios_del_vigilante()` para `/garita/[edificioId]/*`) — **no reemplaza RLS
  de la base de datos**, son capas complementarias
- **La sesión en `proxy.ts` se comprueba con `getClaims()`, no con `getUser()`**
  (verificación local de la firma del JWT contra la clave asimétrica del proyecto,
  ECC P-256; sin viaje al servidor de Auth). Falla cerrado: sin claims o sin `sub`
  se trata como sin sesión. **Las RPC de autorización no cambian** — los roles
  viven en `membresias`, no en el JWT, así que siguen siendo consultas a la base.
  Los layouts y pages **sí** usan `getUser()` (vía `usuarioActual()` de
  `lib/supabase/cache.ts`): ahí está la comprobación fresca contra el servidor de
  Auth, y es deliberado — es la capa que ve una sesión revocada al instante. No
  cambiar `proxy.ts` a `getSession()` nunca: ese decodifica sin verificar la firma.
- **Todo redirect de `proxy.ts` sale por `redirigirConCookies()`**, nunca por un
  `NextResponse.redirect()` directo: una redirección nace sin cookies y se
  perdería el refresco de sesión de esa misma petición (el refresh token rotado),
  dejando al navegador con uno ya consumido. Si se agrega una rama de redirect
  nueva, usar esa función.
- Fase 4 (Admin, ~5.318 líneas) es el módulo de mayor riesgo de cronograma —
  tratarlo con buffer extra de planificación
- Todo desvío de comportamiento frente al HTML original (bug corregido, mejora
  aprobada, capacidad nueva) se registra en
  [`docs/casos-de-uso-mejorados.md`](docs/casos-de-uso-mejorados.md) — es lo que se
  revisa con el socio comercial al cerrar la migración, no solo el mensaje del commit

## Sistema de diseño
- Tokens de tema en `app/globals.css` (`:root` y `:root[data-theme="oscuro"]`) —
  **esa es la única fuente de verdad de la paleta**. No duplicar valores hex en
  este archivo ni en otros documentos; leerlos de ahí.
- Clave de `localStorage`: `vecitap-tema` — **no cambiarla**, es la misma de los
  HTML originales y romperla descartaría la preferencia de usuarios actuales.
- Componentes base en `components/ui/` — leen solo variables CSS, sin color
  hardcodeado.
- `/design-system` es vitrina interna de referencia, **no producto**: excluir del
  build de producción o proteger por rol antes del lanzamiento (Fase 7/9).
- Lección de testing (viene de un bug real de hidratación): probar también
  **recargando con la preferencia ya guardada**, no solo con carga limpia.

## Seguridad
- Todas las tablas tienen RLS activo; diseño evaluado como sólido (auditoría previa
  al desarrollo)
- Funciones de seguridad (`puede_operar`, `tiene_rol`, `es_operador`,
  `unidades_visibles`, `unidades_historico`, `edificios_visibles`,
  `periodos_corrientes`) usan `SECURITY DEFINER` con `search_path` fijo
  correctamente. Cualquier edición futura a estas funciones merece revisión
  cuidadosa: son el punto único de falla del aislamiento multi-tenant.
- Garita agrega tres a esa lista, con la **misma** advertencia de revisión
  cuidadosa — son el punto único de falla del acceso al módulo:
  - `permitir_garita(p_edificio)` — el gate de las 4 funciones de escritura
    (`garita_entrada`, `garita_avisar`, `garita_salida`, `garita_nota`) y
    también de `garita_validar`/`garita_visitante`, que llaman a
    `permitir_garita` aunque sean de lectura. Autoriza delegando en
    `puede_garita`.
  - `puede_garita(p_edificio)` — vigilante de ese edificio
    (`edificios_del_vigilante()`) **o** `puede_operar(org del edificio)`.
    Sumarle un rol acá le da de una vez todas las escrituras de la garita:
    para permisos de solo lectura va una función nueva y separada, no una
    edición de esta (ver `puede_ver_garita` en `docs/estado-migracion.md`).
  - `edificios_del_vigilante()` — la lista de edificios de la sesión, y lo
    único con lo que `proxy.ts` gatea `/garita/[edificioId]`.
  - En la misma familia, aunque no sean gates del módulo:
    `crear_invitacion_visita`/`anular_invitacion_visita` deciden quién puede
    crear o anular un acceso a un edificio (las usa "Mis visitas" de
    Residente).
- Tablas bloqueadas intencionalmente al cliente (RLS activo, 0 políticas):
  `operadores`, `secretos`, `tasa_pendiente`. Llamarlas desde el frontend no da
  error — devuelve vacío en silencio.
- El rol (residente/administrador) es **por organización**, vía la tabla
  `membresias` — no hay un rol global del usuario ni claims de rol en el JWT.
  `es_operador()` (staff interno de Vecitap) sí es global.
- Solo la clave anon/publishable estuvo hardcodeada en el historial de commits;
  verificado sobre los 24 commits originales. No se requiere rotación.
- Pendientes de seguridad puntuales (por fase): ver `docs/estado-migracion.md`.

## Flujo de trabajo
- El proyecto vive en una carpeta sincronizada con OneDrive; `node_modules/` y
  `.next/` generan avisos de borrado masivo al recompilar (comportamiento normal)
- Tras crear una carpeta nueva bajo `app/` (una ruta nueva del App Router,
  con o sin segmento dinámico), reiniciar `npm run dev` — el watcher de Next
  no siempre recoge una carpeta de ruta creada mientras el servidor ya
  estaba corriendo, y la ruta nueva da 404 hasta reiniciar
- **Lección de testing: hay una clase de bug que `npm run dev` no muestra.**
  Medido el 28-sep: un `POST` a una página devuelve **200 en dev y 405 en el
  build de producción**. Por eso el 405 de "Salir" (un redirect 307 después de
  un POST, que hace que el navegador repita el POST) pasó una validación
  entera sin que se viera. Todo lo que dependa del **método HTTP o del status**
  de una respuesta —POST a una página, 405, redirects que preservan método— se
  prueba contra `next start` o el Preview de Vercel, nunca solo contra
  `npm run dev`. Va junto a la lección de hidratación de la Fase 2 (más abajo,
  en Sistema de diseño): las dos son casos que la prueba obvia no ejercita.

## Comunicación con el socio comercial
No es técnico: requiere formatos visuales (gráficos, colores, lenguaje simple) en
vez de resúmenes técnicos escritos. Para deliverables usar el navy `--tinta` como
primario y `--acento` (naranja) para destacar — valores exactos en `globals.css`.

## Mantenimiento de este archivo
Este archivo cambia rara vez: solo cuando cambia el stack, una convención de
arquitectura, o una regla de gobierno del proyecto. El estado del plan (qué fase
está en curso, qué falta, pendientes concretos de cada fase) vive en
`docs/estado-migracion.md` y se actualiza al cerrar cada fase — no acá. Si
`CLAUDE.md` también existe, este archivo (`AGENTS.md`) es el principal; `CLAUDE.md`
solo debe referenciarlo, no duplicar su contenido.