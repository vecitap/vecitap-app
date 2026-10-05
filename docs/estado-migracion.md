# Estado de la migración — Vecitap

Fuente de verdad del **estado del plan**: qué fase está en curso, qué quedó
hecho, qué falta y qué correcciones puntuales están pendientes para más
adelante. Se actualiza al cerrar cada fase. Las reglas y convenciones que no
cambian de una fase a otra viven en [`AGENTS.md`](../AGENTS.md), no acá.

Vecitap-app se está migrando de 4 archivos HTML monolíticos (React 18 +
Babel standalone vía CDN, sin build step) a un proyecto Next.js (App
Router) real, en un plan de 9 fases.

**Rama de trabajo, desde el 27-sep: `integration`** (no `optimization` —
`AGENTS.md` actualizado). `optimization` se mergeó ahí junto con `main`
(commit `3483ad8`, sin conflictos) para el piloto con datos reales del 28-sep.
Toda corrección que salga de la validación en escritura va a `integration`.
**Nunca mergear a `main`**: esa rama se publica sola en mi.vecitap.com vía
GitHub Pages.

## Dónde quedamos (05-oct)

Detalle en "Validación de la fase 1 en el Preview: tres problemas
bloqueantes (05-oct)", al final de este archivo.

**Pendiente de aprobación de Nicolás:** la migración
`20261005120000_crear_invitacion_reemplaza_pendiente.sql`, con su rollback.
Está escrita y sin aplicar. Después de la aprobación se aplica en pruebas.

**Hecho en `dev`, sin commit y sin validar en el Preview:**
- Aceptar una segunda invitación (`/mi/agregar` y el botón "+ Agregar otra
  unidad").
- Errores legibles (`mensajeDeError()`).
- Accesos:
  - la invitación nueva reemplaza a la pendiente;
  - la tarjeta del código se limpia;
  - revocar muestra el resultado;
  - aviso cuando el navegador cambia de cuenta.
- `usuarioActual()` distingue "sin conexión" de "sin sesión".
- `/entrar` sigue de largo cuando la sesión es válida.
- Build, lint y tsc en verde. La revisión cruzada sigue pendiente, porque
  toca autenticación.

Pruebas en el Preview (con la migración ya aplicada en pruebas):
1. El inquilino con 04D usa "+ Agregar otra unidad" y pega el código de
   03C. Tiene que llegar al recibo de 03C, con el resumen y el selector de
   las dos unidades.
2. "Copiar el mensaje completo": el enlace, abierto con la sesión ya
   iniciada, lleva directo a "Agregar otra unidad" con el código escrito.
   Sin sesión, pide entrar y después llega igual.
3. Dos invitaciones seguidas para el mismo correo y la misma unidad:
   - la primera queda "vencida" y Accesos avisa que se anuló;
   - el código viejo da "Invitación inválida o vencida".
4. La tarjeta del código desaparece al cambiar la unidad o el correo.
   Revocar muestra "Revocando…" y después el resultado.
5. Accesos abierto como administradora y el inquilino abierto en otra
   pestaña del mismo navegador:
   - aparece el aviso de cambio de cuenta;
   - si se genera igual, el error dice "Sin permiso para invitar" y no
     "[object Object]".
6. Salir desde otra pestaña muestra el aviso "La sesión de este navegador
   se cerró".
7. `/entrar` con la sesión abierta lleva adentro sin pedir la clave. El
   enlace de "Olvidé mi contraseña" sigue pidiendo la clave nueva.
8. `/admin`, `/mi`, `/garita` y `/operador` entran como antes. La pantalla
   "No pudimos conectar" no se puede forzar con la base sana.

**Validación de la fase 1 (lista del 04-oct):**
- Ya pasó:
  - el importador con el archivo anonimizado;
  - 03C con inquilino, que muestra "Paga: inquilino" en Propietarios;
  - la guarda de "paga" sin inquilino, que avisa y no guarda.
- Falta:
  - la **sección 3**, "El inquilino ya no ocupa la unidad", con sus tres
    casos: sin cuenta, con cuenta y con dos inquilinos;
  - la **sección 4**, `/mi` de un propietario con 6 unidades: total
    $ 524,01, el caso de 08D que paga el inquilino, el saldo a favor de 02D,
    una cuenta de una sola unidad, el tema oscuro y el ancho de teléfono.

**Para probar con dos cuentas:** usar perfiles o navegadores distintos (o
una ventana privada), nunca dos pestañas del mismo navegador. La sesión
vive en cookies, que son una sola por navegador: abrir otra cuenta en una
pestaña cambia la sesión de todas. Eso causó los problemas 2 y 3 del 04-oct.

**Lo que sigue, en este orden:**
1. Respaldo de producción (`docs/respaldo.md`).
2. Las tres migraciones de la fase 1 en producción: 20260930120000,
   20260930130000 y 20260930140000.
   - Ojo con 20261005120000: si el código de hoy llega a `integration` sin
     esa migración aplicada en producción, Accesos dice "el anterior quedó
     anulado" y no es verdad.
   - Hay que aplicarla junto con las otras tres, o antes del merge.
3. Merge de `dev` a `integration` (publica vecitap.com).
4. El script de borrado de las dos organizaciones de prueba
   (`supabase/scripts/20261004_borrar_orgs_prueba_piloto.sql`), primero en
   modo ensayo.

## Decisiones de arquitectura ya tomadas

No volver a proponerlas como abiertas:

- Framework: **Next.js con App Router** (no Vite/SPA pura).
- Estructura: **una sola app con rutas por rol** (`/admin`, `/mi`
  (residente), `/operador` (interno Vecitap, acceso restringido)), no
  monorepo con apps separadas.
- Se mantiene Supabase como backend.
- Orden de migración vertical (Fase 4 en adelante): **Residente →
  Operador → Admin** (del módulo más chico al más grande).
- Tarjeta de saldo del residente (`TarjetaSaldo.tsx`, migración de Residente
  en la Fase 4): **3 tonos** (verde / azul / rojo, "a favor" con color
  propio) en vez de los 2 tonos del `residente.html` original (rojo si
  debe, verde para todo lo demás). Decisión tomada y aprobada, no una
  deriva accidental — no revertir a 2 tonos más adelante por "parecer
  distinto al original".

Contexto de negocio: el objetivo es lanzamiento público real para
administradores de condominio (clientes) con un módulo propio para
residentes (clientes también). `operador.html` es back-office interno de
Vecitap (gestiona suscripciones de las administradoras), no un módulo de
cliente. `vecitap.html` es un banco de pruebas de desarrollo que se
retira, no es parte del producto.

## Plan de 9 fases — estado actual

1. Fundaciones — ✅ Completa
2. Sistema de diseño compartido — ✅ Completa
3. Autenticación y capa de datos — ✅ Completa
4. Migración vertical por módulo (Residente → Operador → Admin) — ⏳ En
   curso. **Desde el 28-sep se reescribe contra los HTML actuales de `main`**
   (ver la sección "Reescritura contra `main`" más abajo): Admin, las
   diferencias de Residente (banda oscura, pestañas, Mis visitas) y
   `PanelModulos` de Operador construidos (bloques 0 a 9), **sin validar**. Las
   fundaciones de Garita (bloque 10) están **validadas en lectura y navegación**
   (28-sep). Las cuatro vistas de Garita (bloques 11 y 12) están
   **validadas en lectura y escritura** (28-sep): sus 4 acciones de escritura
   (`garita_entrada`, `garita_avisar`, `garita_salida`, `garita_nota`) se
   conectaron el 28-sep, después de confirmar el SQL real de las cuatro con
   `pg_get_functiondef`, y se ejercieron contra la base. El **bloque 13**
   (vista de Garita de solo lectura dentro de Admin) queda para después de la
   validación de Gustavo con datos piloto — **no empezar**.
5. Endurecimiento multi-tenant y escala — Pendiente (revisión cruzada obligatoria)
6. Observabilidad y operación — Pendiente
7. CI/CD — Pendiente
8. Pruebas — Pendiente
9. Seguridad y lanzamiento — Pendiente (revisión cruzada obligatoria)

---

## Dónde quedó todo — corte del 28-sep

Índice de lo que está esperando una acción, con el enlace a la sección que
tiene el detalle. **Esto es un índice, no la fuente de verdad:** cada punto se
explica en su sección, y cuando uno se cierra se marca acá y allá. Existe
porque la sesión del 28-sep dejó pendientes repartidos en seis secciones y
reconstruirlos leyendo el documento entero es caro.

### Lo que tiene que correr Nicolás en la base (nada aplicado todavía)

| # | Qué | Archivo | Antes de correrlo |
|---|---|---|---|
| 1 | `puede_ver_garita()` — gate de solo lectura para el bloque 13 | `supabase/migrations/20260928120000_puede_ver_garita.sql` | **No correr todavía:** es del bloque 13, que no arranca hasta la validación de Gustavo con datos piloto |
| 2 | `correos_malos_ver` → `es_operador()` | `supabase/migrations/20260928130000_correos_malos_ver_solo_operador.sql` | Correr en **las dos bases** (vecitap-pruebas y producción). Sin dependencias |
| 3 | Día local de la Bitácora + `hoy_local()` / `inicio_dia_local()` | `supabase/migrations/20260928140000_garita_bitacora_dia_local.sql` | **Avisarle a Gustavo antes:** toca una función `SECURITY DEFINER` de la base compartida. El cliente ya está corregido, así que hasta que esto corra la Bitácora sigue mostrando la ventana corrida |
| 4 | Segunda ronda de fechas: las 5 funciones (`libro_edificio`, `historial_unidad`, `cerrar_periodo`, `generar_cobros_vencidos`, `generar_cobro_interno`) + `dia_local()` + default de `vinculos.desde` | `supabase/migrations/20260929120000_segunda_ronda_dia_local.sql` | **Va después del #3** (la guarda 1 aborta si faltan las auxiliares). **Respaldo antes de correrla en producción.** La guarda 2 aborta sola si alguna función cambió desde el volcado del 27-sep, así que es seguro intentarla. Ver "Punto 3" en "Salida a producción — 29-sep" |

| 5 | **✅ pruebas (01-oct) · falta producción** — `unidades.paga` + guardas A/B + `mis_unidades()` con `paga` (propietarios con varias unidades, fase 1) | `supabase/migrations/20260930120000_unidades_paga.sql` | Primero vecitap-pruebas; **correr el paso 0 del archivo antes** (anota los permisos de `mis_unidades()`). Después regenerar `types/supabase.ts`. Respaldo antes de producción. **Va a producción ANTES que el código del paso 3** (Propietarios y la ficha piden la columna). Ver "Propietarios con varias unidades — fase 1" |
| 6 | **✅ pruebas (01-oct) · falta producción** — `puede_operar` con `search_path` fijado | `supabase/migrations/20260930130000_puede_operar_search_path.sql` | Función de seguridad. La guarda aborta sola si el cuerpo no es el del volcado. Anotar el NOTICE "ANTES" que imprime. Sin dependencias |
| 7 | **✅ pruebas (01-oct) · falta producción** — Coherencia de organización en `vinculos` (disparadores) | `supabase/migrations/20260930140000_vinculos_org_coherente.sql` | **Correr antes la CONSULTA PREVIA del archivo**: tiene que dar 0 filas. La guarda aborta sola si no. Sin dependencias |

Todos tienen su rollback en `supabase/rollbacks/` y su consulta de
verificación dentro del propio archivo.

### Lo que falta probar en el navegador

- **`getClaims()` en `proxy.ts`** — matriz de 19 casos en "Hecho el 28-sep ·
  `getClaims()` en el proxy". Los específicos son el **9, 10 y 12** (refresco de
  sesión) y el **16 al 19** (cookies en los redirect). El caso 11 ya quedó
  ejercido de rebote.
- **"Salir" en los cuatro módulos, sobre un build de producción** (no
  `npm run dev`: ahí el bug era invisible). Ver "Salir da HTTP 405".
- **El lateral de Admin fijo**, y de paso que `/mi`, `/garita` y `/operador`
  sigan sin scroll horizontal en el teléfono — el cambio de `globals.css` es
  global. Ver "El lateral de Admin volvió a quedar fijo".
- **Los `loading.tsx`**, recargando y navegando (lección de la Fase 2: probar
  también con recarga).
- **Los bloques 0 a 9**, que siguen sin validar — es el pendiente más grande y
  es anterior a esta sesión.

### Decisiones abiertas, sin código escrito

- **Región de las funciones de Vercel** (propuesta 2 de "Lentitud de la
  interfaz"): mirar Settings → Functions → Function Region y anotarlo. No toca
  código y puede valer más que todo el resto junto.
- **`experimental.staleTimes.dynamic`** (propuesta 4): sin aprobar. Contrapartida
  de datos algo viejos en una app de contabilidad.
- ~~**Segunda ronda de zona horaria**~~ — **CERRADA el 29-sep.** La migración
  está escrita (`20260929120000_segunda_ronda_dia_local.sql`), sin aplicar. No
  hizo falta el CSV de `pg_get_functiondef`: la migración se escribió sobre el
  volcado y lleva adentro una guarda que compara el cuerpo actual de las cinco
  contra el del volcado y **aborta sola** si alguno cambió, que es la misma
  protección con menos pasos. Ver "Punto 3" en "Salida a producción — 29-sep".
- ~~**`vinculos.desde`**~~ — **CERRADA el 29-sep**, revirtiendo la decisión del
  28-sep: la misma migración le pone `default hoy_local()`. El motivo está en
  "Punto 3" (resumen: `hoy_local()` va a existir igual, es una línea, y
  cambiar un DEFAULT no reescribe la tabla).
- **`proxy.ts` ↔ layouts**: la repetición de `getUser()`/`tiene_rol` entre el
  proxy y el primer layout de cada módulo **sigue en pie a propósito**.
  `cache()` no puede resolverla (runtimes distintos) y tocarla es autenticación.
- **Zona única vs. zona por organización**: hoy `America/Caracas` está escrita
  a mano en dos lugares (`ZONA_VECITAP` en `lib/formato.ts` y las auxiliares de
  la base). Correcto mientras todos los clientes estén en Venezuela.

---

## Fase 1 — Fundaciones (✅ completa)

Node.js instalado (v24, npm 11) y scaffolding hecho: Next.js 16 (App
Router, Turbopack) + React 19 + TypeScript, sin Tailwind (decisión
diferida a la Fase 2). Estructura creada: `app/(marketing)`,
`app/(admin)/admin`, `app/(residente)/mi`, `app/(interno)/operador`,
`app/api`, `components/{ui,admin,residente,operador}`,
`lib/{supabase,theme,auth}`, `hooks/`, `types/`, `tests/`. `.env.example`
(commiteable) y `.env.local` (gitignored) creados. Los 4 HTML originales
quedaron intactos en la raíz. Validado con `npm install`, `npm run build`
y `npm run lint`.

> **Al 29-sep esto ya no es así:** los HTML se borraron de `integration` (ver
> "Limpieza de `integration`" al final). La referencia es `main`, congelada, y
> se lee con `git show main:<archivo>`.

`create-next-app` (Next 16) generó automáticamente `AGENTS.md` y
`CLAUDE.md` con reglas de framework para agentes de IA — son parte del
tooling oficial, no se quitan.

## Fase 2 — Sistema de diseño compartido (✅ completa)

Se auditaron los 3 bloques `TEMAS` (`app.html`/`residente.html`/
`operador.html`): `app.html` y `residente.html` coincidían byte a byte en
todos los valores de color; `operador.html` tenía *drift* real (no solo
nombres distintos) en `azul`, `tenue`/`suave` oscuro, `borde` y las
opacidades de fondo (`.13` vs `.14`), y además usaba la fuente "Archivo"
en vez de Inter. Se unificó tomando `app.html`/`residente.html` como
fuente de verdad — cambia un poco la apariencia visual de la consola del
operador. Verificado visualmente con Playwright en claro/oscuro/diálogo.

Implementado: tokens de tema en `app/globals.css`, `lib/theme/ThemeProvider.tsx`
(contexto de tema + script anti-flash), fuentes reales vía `next/font`
(Inter/Poppins/IBM Plex Mono), componentes base en `components/ui/`, y
`/design-system` como vitrina interna de referencia.

**Bug real encontrado y corregido:** mismatch de hidratación en el script
de tema — solo aparecía al recargar con una preferencia ya guardada
distinta del default del servidor (no con carga limpia). Fix de raíz:
`useSyncExternalStore` en vez de `useState` + lectura del DOM, más el
patrón oficial de Next.js para scripts anti-flash sin warning de
hidratación
(https://nextjs.org/docs/app/guides/preventing-flash-before-hydration).
**Lección para fases futuras:** probar siempre también con la preferencia
ya guardada, no solo con carga limpia — es el caso que de verdad ejercita
la hidratación.

## Fase 3 — Autenticación y capa de datos (✅ completa)

Investigación previa (grep sobre los 3 HTML) confirmó el modelo real:
Supabase Auth por email/password con sesión en `localStorage` (sin
cookies), y **toda la autorización fina vive en funciones RPC de
Postgres** (`es_operador()`, `mis_unidades()`, `tiene_rol(p_org,
p_roles[])`, `puede_operar(p_org)`). El rol es **por organización** vía la
tabla `membresias` — no hay un rol global del usuario ni claims de rol en
el JWT (verificado exhaustivamente: cero uso de `app_metadata`/
`user_metadata`/`claims` en los 3 HTML). `es_operador()` sí es global
(staff interno de Vecitap, tabla `operadores` separada).
`operadores`/`secretos`/`tasa_pendiente` nunca se tocan con `.from()`,
siempre por RPC.

Tipos generados desde el schema real (`npx supabase gen types typescript
--project-id hdivffuorclzulijkyry --schema public`) y en uso en
`types/supabase.ts`. El schema `public` no tiene ningún enum de Postgres —
todos los campos de estado (`cobros_suscripcion.estado`, etc.) son
`string` plano, sin barrera de tipos propia de la base.

Implementado:
- `@supabase/supabase-js` + `@supabase/ssr` como dependencias reales.
- `lib/supabase/client.ts` / `server.ts`: clientes con sesión en
  **cookies** (no localStorage), tipados con `<Database>`.
- `proxy.ts` (no `middleware.ts` — Next.js 16 renombró el archivo):
  refresca la sesión en cada request y redirige a `/entrar?volver=...` a
  quien no tiene sesión y pide `/admin`, `/mi` u `/operador`. Gate de rol
  real para `/operador/*` vía `rpc("es_operador")`, falla cerrado
  (cualquier error o `data !== true` → redirige a `/`) — probado a mano
  con una cuenta real, exitoso. `/admin/*` y `/mi/*` quedan solo con gate
  de sesión: el rol ahí es por organización y todavía no hay estructura de
  URL que le diga al proxy a qué organización se entra — se resuelve
  cuando la Fase 4 defina esa estructura. Cada Server Component/Route
  Handler de `/admin` y `/mi` deberá revalidar el rol por su cuenta.
- `hooks/useSesion.ts`: reemplaza el patrón `getSession()` +
  `onAuthStateChange()` repetido en los 3 HTML.
- `app/(marketing)/entrar/`: login mínimo (sin signUp/invitaciones — eso
  es de los flujos reales que se migran en la Fase 4).
- `app/api/auth/salir/route.ts`: logout.
- `lib/formato.ts` (`nf`/`usd`), `lib/estados-suscripcion.ts`
  (`EstadoSuscripcion` + `estadoSuscripcion()`), `lib/estados-unidad.ts`
  (`EstadoUnidad` + `tonoEstadoUnidad()`/`contarPorEstadoUnidad()`):
  lógica de negocio que antes vivía duplicada en los HTML, movida al
  código nuevo. Tipada con uniones literales escritas a mano (no hay
  enums de Postgres que derivar). Cero `any`/`as`.

**Decisión ya zanjada — no volver a proponerla:** las copias de
`nf`/`usd` (y demás lógica) que siguen en `app.html`/`residente.html`/
`operador.html` son **intencionales y no se tocan**. Esos 3 HTML no
tienen bundler (Babel standalone en el navegador, sin resolución de
módulos con alias), así que no pueden hacer `import` de `lib/`. Quedan
intactos a propósito como línea base de validación visual/funcional de la
Fase 4 — la duplicación desaparece sola cuando cada HTML se reemplace en
su migración, no antes.

> **Cerrado el 29-sep:** pasó exactamente eso. Con los cuatro módulos
> migrados, los HTML salieron de `integration` y con ellos la duplicación.
> `lib/formato.ts` es ahora la única copia de `nf`/`usd` en esta rama; las de
> `main` siguen donde estaban, y `main` está congelada.

## Fase 4 — Migración vertical por módulo (⏳ en curso)

Orden: **Residente → Operador → Admin** (del módulo más chico al más
grande). La fase sigue abierta hasta que los tres estén migrados y
probados — Residente y Operador (918 líneas) ya están migrados y
validados. Admin (5.318 líneas, el de mayor riesgo de cronograma) se
migra en dos sesiones según el plan de corte de
`docs/inventario-admin.md`: la Sesión 1 (Inicio, Propietarios, Cobros,
Cierre del mes, más ruteo/gate/componentes compartidos) está **construida,
sin validar**; la Sesión 2 (Pagos, Accesos, Cortes de cuenta, Ajustes)
todavía no empieza.

### Residente — VALIDADO

Verificado por lectura de código, `npm run build`, `npm run lint`, y
pruebas manuales con sesión real (2026-09-23). Todos los casos probados
pasaron, salvo un detalle de formato (ver abajo).

Casos probados con sesión real, todos OK:
- Sin sesión → `/mi` redirige a `/entrar?volver=/mi`; el login vuelve a `/mi`.
- `/entrar` sin botón de crear cuenta (confirmado el cierre del Bloque 3).
- Cuenta sin membresías: pantalla "sin unidades asociadas", sin link a registro.
- `/mi` redirige a `/mi/<uuid>/recibo`.
- Recibo contrastado contra `residente.html`: mismos campos, orden y formato.
- Navegación entre pestañas cambia la URL; botón atrás vuelve a la pestaña
  anterior; recargar en una pestaña interna se queda ahí.
- Gate de `/mi/[unidadId]`: id malformado → 404; UUID real de una unidad
  ajena → 404. Ningún caso mostró datos ni detalle técnico de Postgres.
- Recarga en tema oscuro en `/recibo`, `/reportar` y `/entrar`: sin avisos
  de hidratación en consola.
- Selector de unidad: cambian URL y datos.
- Inquilino en unidad con `inquilino_ve='mes'`: muestra el mensaje de
  saldo no visible, no cero ni NaN.
- Formulario: envío vacío hace scroll al primer error; obligatorios con
  `*`; cédula solo aparece con Pago móvil; el input rechaza no-dígitos;
  el texto de ayuda está presente.
- Comprobante: un archivo de texto renombrado a `.jpg` fue rechazado
  (validación por firma de bytes, confirmada en runtime). JPG/PDF real
  aceptado.
- Tras enviar: va a Mis pagos con badge "Esperando revisión", la tarjeta
  de saldo no cambia, y aparece la línea explicativa.
- Fila en `pagos`: `estado='reportado'`, `org_id` y `unidad_id`
  correctos, `periodo_cierre_id` null.

**Detalle de formato encontrado durante la prueba:** una fila de `pagos`
quedó con `documento_origen = "V12345678"`, sin el guion esperado
(`V-12345678`). Al revisar el código, `FormularioReportarPago.tsx:209`
ya arma el valor con guion (`` `${documentoTipo}-${documentoNumero}` ``)
en el único commit de Residente (`bf68ba8`) — no se encontró una versión
sin guion en el código commiteado, así que no hizo falta ningún cambio
de código. La fila sin guion es casi con certeza un registro de una
iteración anterior del formulario durante el desarrollo (el módulo se
commiteó de una sola vez, sin commits intermedios), no un bug vigente.
Si en una prueba futura vuelve a aparecer una fila nueva sin guion, sí es
un bug real y hay que revisar con más cuidado.

### Entorno de pruebas

- La cuenta `residente.prueba@vecitap.com` quedó con dos membresías de
  propietario: Edificio Administradora Unión 01A y Torre Ida 01A.
  Pendiente de limpieza en la Fase 9.
- Para probar la rama del saldo `null` hubo que cambiar temporalmente
  `unidades.inquilino_ve` a `'mes'` en Torre Ida 01A y la `relacion` de
  la membresía a `'inquilino'`. Ambos cambios **ya fueron revertidos** —
  ninguna unidad de la base tiene `inquilino_ve='mes'` de forma
  permanente.
- Queda un pago de prueba en estado `'reportado'` (123 USD, Pago móvil,
  Torre Ida 01A). Sumado a la lista de limpieza de la Fase 9.

Implementado:
- Rutas reales `app/(residente)/mi/[unidadId]/{recibo,reportar,pagos}`
  (subrutas, no estado de tabs en memoria) + layout con selector de
  unidad, tarjeta de saldo y navegación entre pestañas.
- Las 4 correcciones pendientes del formulario de pagos, todas aplicadas
  en `FormularioReportarPago.tsx`:
  1. Comprobante restringido a jpg/png/pdf validando la **firma real** del
     archivo (`lib/archivos.ts`, lee los bytes de cabecera), no la
     extensión ni el `type` que reporta el navegador.
  2. Scroll automático (`scrollIntoView`) hasta el aviso cuando falla la
     validación.
  3. Cédula/RIF como `<select>` V/E/G/J + input numérico (antes texto
     libre), obligatorio solo cuando el campo se renderiza (método "Pago
     móvil").
  4. Campos obligatorios marcados con `*` y validados antes de enviar.
- `signUp` y la pantalla de aceptar invitación (`Invitacion.tsx`) quedaron
  **fuera de alcance** de esta migración — código presente, sin punto de
  entrada. Detalle bajo Fase 5 más abajo.

### La cadena del saldo

Costó trabajo reconstruirla y no estaba escrita en ningún lado — queda acá
para no tener que rehacerlo:

```
mis_unidades() → saldo_visible(unidad_id) → saldo_unidad(unidad_id)
```

La vista `saldos_actuales` (que usa el lado admin) también llama a
`saldo_unidad` — hay **una sola implementación** del cálculo, no dos que
puedan desalinearse.

- `saldo_visible` devuelve `NULL` **a propósito** cuando `relacion =
  'inquilino'` y la unidad tiene `inquilino_ve = 'mes'` — la base oculta el
  saldo deliberadamente en ese caso, no es un dato faltante ni un error.
- El saldo es **acumulado**: arranca del último corte mensual, suma los
  recibos cerrados posteriores y resta los pagos conciliados y los
  ajustes. Por eso **no tiene por qué coincidir** con el total de un
  recibo individual — los dos números pueden ser correctos y distintos a
  la vez, y eso hay que poder explicarlo si alguien pregunta por qué no
  cuadran.
- La mora **ya está incluida** dentro del total (`saldo_unidad` la suma
  dentro de `v_cond`, junto con cuota y directos). Se devuelve aparte solo
  para mostrarla desglosada — sumarla de nuevo sobre el total sería
  contarla dos veces.

### Operador — VALIDADO

Verificado por lectura de código, `npm run build`, `npm run lint` y
pruebas manuales con una cuenta de operador real
(`operador.prueba@vecitap.com`, 2026-09-26): lectura, navegación y
escritura, con las salvedades de abajo.

Casos probados con cuenta real, todos OK:
- Carga de cartera, KPIs, morosidad, tasa BCV y cobros automáticos con
  datos reales, sin errores en consola.
- Cifras, columnas y etiquetas comparadas contra `operador.html`:
  coinciden.
- Ficha de cliente (las 5 secciones) comparada contra el original,
  incluido un cliente con casi ningún dato cargado.
- Búsqueda por nombre y por RIF, cada filtro por separado, y filtro +
  búsqueda combinados. Administradora Baja (`cancelada`) solo aparece en
  "Todos", igual que en el original.
- Exportar CSV: columnas, eñes, cero inicial del teléfono y montos
  correctos al abrir en Excel.
- Recarga en tema oscuro: sin parpadeo ni errores de hidratación.
- Gate: sin sesión → `/entrar?volver=%2Foperador`; una cuenta de
  residente (sin fila en `operadores`) rebota a `/`.

Escritura probada y aprobada:
- "Correr ahora" (cobros automáticos): 0 cobros / $0, igual que lo que
  hace el cron — seguro de correr antes del 1 de octubre porque todavía
  no hay ningún `proximo_cobro` vencido en la cartera de prueba.
- Guardar suscripción (acción #4 del inventario de escritura) en Cliente
  55 Casas, con ida y vuelta (cambiar y volver a dejar como estaba).
- Generar cobro (#5) en Casas: desde `2026-09-26` hasta `2026-10-25`,
  `proximo_cobro` pasó a `2026-10-26`. Paridad `null`/`undefined`
  confirmada: `p_desde` tiene `DEFAULT NULL` en la función, así que
  omitir la clave (lo que hace `undefined` acá) y mandar `null` explícito
  (como hacía `operador.html:649`) llegan al mismo resultado — no era una
  divergencia real, quedaba pendiente de confirmar y ya se confirmó.
- Anular (#6) ese mismo cobro.
- Cobro dentro del recibo (#7), incluido el desvío aprobado más arriba:
  carga el valor real al abrir la ficha, escenario 1→2→1 sin reabrir, y
  bajar a 0 muestra "apagado" al instante. Verificado directo en la base:
  una sola fila (sin duplicados).

No ejecutadas, por decisión (no por limitación técnica) — la paridad con
el original quedó verificada por lectura de código en ambos casos:
- "Guardar la de hoy" (#1): una tasa cargada a mano queda fija todo el
  día — `traer_tasa_bcv` (el cron) la respeta porque filtra
  `where fuente = 'dolarapi'`, así que no la pisa. No se ejecutó porque
  hubiera dejado una tasa manual falsa activa en la única instancia
  compartida por el resto de las pruebas (Residente incluido) hasta la
  próxima corrida real.
- "Pagado" (#6): mismo `update` que "Anular", con el literal `'pagado'`
  en vez de `'anulado'` — no se ejecutó por ser la contraparte exacta de
  una acción ya probada, sin lógica adicional que valga la pena verificar
  a mano.

No bloqueante, para tener en cuenta:
- El cliente "55 Torres" figura activo con 3 edificios y 0 unidades —
  parece un dato de prueba incompleto en `vecitap-pruebas`, no un error
  de la migración.
- En Excel, `proximo_cobro` se muestra según la configuración regional
  (`2026-10-01` aparece como `10/1/2026`) — es formato de Excel al abrir
  un CSV, no algo que dependa del código migrado.

Implementado:
- Ruta real `app/(interno)/operador/page.tsx` (Server Component): gate de
  sesión + `es_operador()` (defensa en profundidad — proxy.ts ya bloquea
  `/operador/*` a quien no es operador, ver proxy.ts), carga la cartera y
  el estado de las tareas automáticas, y se lo pasa a un Client Component.
- `components/operador/ConsolaOperador.tsx`: KPIs, panel de morosidad,
  panel de tasa BCV (cargar a mano / traer ahora), panel de cobros
  automáticos (correr ahora), búsqueda/filtro, tabla de cartera,
  exportar CSV. "Actualizar" y las acciones ahora usan
  `router.refresh()` en vez del `cargar()` manual del original.
- `components/operador/FichaCliente.tsx`: panel lateral con Suscripción,
  Contacto, Cobros, "cobro dentro del recibo" y Sus edificios — mismas
  mutaciones que el original (upsert de `suscripciones`, `generar_cobro`,
  marcar cobros, upsert de `conceptos_cobro`).
- `lib/operador/`: `tipos.ts`, `planes.ts` (PLANES/DESCUENTO + cálculo de
  la cuota prevista), `metricas-cartera.ts` (KPIs agregados) y
  `exportar-cartera.ts` (construcción del CSV) — lógica de negocio movida
  fuera de los componentes, mismo patrón que Residente.
- `lib/formato.ts`: agregadas `usd0` y `num0` (antes solo en
  `operador.html`, ahora compartidas).
- **No se portó** la pantalla de conexión manual a Supabase (`Conexion`,
  `CONFIG` editable en pantalla) ni el login propio del operador
  (`Entrar` en `operador.html`): quedaron obsoletos por el nuevo diseño,
  no diferidos. La URL/clave de Supabase vienen de variables de entorno
  (Fase 1) y el login es el mismo `/entrar` compartido por los tres roles
  (Fase 3) — no hace falta una pantalla propia por módulo.

**Desvío deliberado del original, aprobado (2026-09-26)** — encontrado
durante la validación manual, en `FichaCliente.tsx`, sección "Cobro
dentro del recibo":

- **Bug heredado:** `operador.html:823-826` usa un `<input
  defaultValue={String(servicio?.monto ?? 0)}>` — no controlado. Como
  `servicio` carga de forma asíncrona (llega después del primer render),
  React nunca vuelve a sincronizar ese campo con el valor real: el input
  se queda mostrando "0" aunque la base tenga otro monto guardado.
  Confirmado que `operador.html` reproduce el mismo síntoma con el mismo
  cliente de prueba.
- **Por qué se corrige y no se deja igual que el original:** el campo
  guarda `onBlur`, que dispara con solo entrar y salir del campo — sin
  el fix, eso alcanzaba para pisar en silencio un monto real por 0 (y
  desactivar el cobro) sin que nadie editara nada a propósito. Es un
  riesgo de pérdida de datos, no solo un problema visual.
- **Corrección aplicada (solo en el archivo migrado, `operador.html` NO
  se tocó — su versión de referencia vive en `main`, congelada, y se lee
  con `git show main:operador.html`):**
  1. El campo pasa a ser un input controlado, sincronizado con `servicio`
     apenas llega del fetch — mismo patrón que ya usan todos los demás
     campos de esta ficha.
  2. `guardarServicio` no escribe nada si el monto no cambió respecto al
     valor ya guardado — entrar y salir del campo sin editarlo deja de
     escribir en la base.
  3. La rama de `insert` ahora pide la fila recién creada
     (`.select().single()`) y la guarda en el estado, para que un
     segundo guardado sin reabrir la ficha haga `update` y no inserte
     una fila duplicada — cierra el bug heredado de doble-insert que ya
     estaba anotado en el inventario de escritura de Operador.
  4. La rama de `update` también pide la fila guardada
     (`.select().single()`) y refresca el estado, por el mismo motivo que
     el punto 3 — no era solo "una escritura de más": sin esto, cambiar
     1→2 y volver a 1 sin reabrir la ficha comparaba el segundo guardado
     contra el `servicio` viejo (1), la guarda del punto 2 lo cancelaba
     por "no cambió", y la base quedaba en 2 mientras la pantalla seguía
     mostrando 1 — un desfase silencioso entre lo mostrado y lo guardado,
     detectado y corregido antes de validar la escritura de este módulo.

### Entorno de pruebas (Operador)

- Cliente 55 Casas quedó con un cobro anulado (`2026-09-26`) y una fila
  de `conceptos_cobro` en monto 0 e inactiva, ambos de las pruebas de
  escritura de esta sesión. Sumar a la limpieza de Fase 9.
- La cuenta `operador.prueba@vecitap.com` también debe eliminarse o
  desactivarse en Fase 9.

### Admin — Sesión 1: construida, sin validar

Inventario completo en `docs/inventario-admin.md` (no se toca durante la
construcción — es la referencia fija de las dos sesiones). Alcance de la
Sesión 1: componentes compartidos, ruteo, gate de rol, Inicio,
Propietarios (con Ficha, Datos, Alta, Importar unidades, Cargar saldos),
Cobros y Cierre del mes. **Nadie ejecutó ninguna acción de escritura
contra la base durante la construcción** — la validación manual con
`admin.prueba@vecitap.com` sobre Administradora Baja queda pendiente
(la hace Nicolás).

Decisiones tomadas al revisar el inventario (registradas también en
`docs/casos-de-uso-mejorados.md`):
- **Roles:** paridad con `app.html` — sin distinción por sección todavía.
  `proxy.ts` gatea `/admin/[orgId]/*` con
  `tiene_rol(orgId, ['propietario_cuenta','administrador','contador','junta'])`,
  fail-closed como `/operador`. El layout de `[edificioId]` verifica además
  que el edificio esté en `edificios_visibles()` y, si no, `notFound()`
  (mismo patrón que `/mi/[unidadId]/layout.tsx`).
- **Umbral de saldo:** unificado contra `estado` de `saldos_actuales` y
  `UMBRAL_SALDO`/`contarPorEstadoUnidad()` de `lib/estados-unidad.ts` — se
  eliminaron los literales `0.01`/`0.009` que tenía `app.html` en Inicio,
  Propietarios y Ficha (ver inventario, sección 5f).
- **Alícuota:** se mantienen 4 decimales (`pct()`, nuevo en `lib/formato.ts`)
  en todos lados, incluida la lista de Propietarios — el original mostraba
  ahí 5 decimales sin el signo `%` (`app.html:1532`), inconsistente con el
  resto de sus propias pantallas; se unificó a 4, como el resto.
- **Ruteo:** `/admin/[orgId]/[edificioId]/<sección>`, edificio como
  segmento de URL (no query param, no estado). Ficha de unidad como
  subruta simple `/propietarios/[unidadId]` — página completa, no un
  drawer superpuesto ni parallel/intercepting routes.

Construido:
- `proxy.ts`: gate por rol para `/admin/[orgId]/*` (ver arriba).
- `components/ui/`: `Aviso`, `Vacio`, `Cargando`, `Flechas`, `Confirmar`
  (nuevos) + tonos `neutro`/`marca` agregados a `Badge` (aditivo, solo
  variables CSS). `lib/formato.ts`: `pct()` agregado.
- `lib/admin/`: `constantes.ts` (MESES/BOLSILLOS/MODOS_COBRO),
  `personas.ts` (vigente/nombreDe/normaliza/normalizarTel/correoValido),
  `tipos.ts`, `metricas.ts` (cálculo de Inicio, usa `contarPorEstadoUnidad`),
  `imprimir-estado.ts` (ventana de estado de cuenta imprimible).
- Ruteo: `app/(admin)/admin/{page,[orgId]/{layout,page},[orgId]/[edificioId]/{layout,page,inicio,propietarios,propietarios/[unidadId],cobros,mes}}`.
  Inicio no tiene componente propio en `components/admin/` — su JSX vive
  directo en `inicio/page.tsx` (no necesitaba estado de cliente).
  `components/admin/`: `EncabezadoAdmin`, `SelectorEdificio`, `NavAdmin`,
  `PrimerEdificio`, `Edificio` (widget de cuadrícula de unidades),
  `Propietarios` (+ `AltaUnidad`, `ImportarUnidades`, `ImportarSaldos`,
  `Ficha`, `DatosUnidad`), `Cobros`, `CierreMes`.
- Nav de la Sesión 1 muestra solo Inicio/Propietarios/Cobros/Cierre del
  mes a propósito — Pagos/Cortes/Accesos/Ajustes se agregan en la Sesión 2,
  no hay enlaces a rutas que todavía no existen.
- `npm run build` y `npm run lint` limpios después de cada bloque.

**Patrón para filas editables con inputs controlados (para reusar en la
Sesión 2):** el lint de este proyecto (`eslint-plugin-react-hooks`) rechaza
tanto sincronizar estado local desde una prop dentro de un `useEffect`
como leer/escribir un `ref` durante el render — los dos atajos típicos
para "resetear un input cuando cambia el valor guardado". La solución que
quedó funcionando en `Cobros.tsx`/`CierreMes.tsx`: cada campo editable es
un subcomponente con su propio `useState(valorInicial)`, y quien lo llama
le pasa `key={`${id}:${valor}`}` — cuando el valor guardado cambia (por
esta misma sesión u otra), React lo remonta con el valor fresco en vez de
dejar un buffer local desactualizado. Nada de `useEffect` ni `ref` para
esto. Pagos/Accesos/Cortes/Ajustes van a necesitar el mismo patrón.

Pendiente, no bloqueante para validar la Sesión 1:
- `ImportarSaldos` (carga de saldos desde Excel/CSV/PDF, app.html:1788-1976)
  necesita `xlsx`/`papaparse` (Excel/CSV) y una lectura de PDF
  (`pdf.js`/`pdfjs-dist`) — ninguno es dependencia del proyecto hoy y no se
  instaló ninguno (instrucción explícita de esta sesión). El componente
  quedó construido con el flujo completo, pero la lectura de archivo real
  está sin implementar — deja un aviso claro en vez de fingir que funciona.
  Decisión pendiente: qué paquete(s) instalar.
- Los íconos de `app.html` (librería `lucide`, vía CDN) no se portaron —
  mismo criterio que ya usaron Residente y Operador (ninguno de los dos
  instaló `lucide-react`). Donde el ícono era decorativo se omitió; donde
  era la única pista visual (Flechas) se usó texto/Unicode.
  **Superado el 28-sep:** con el criterio de paridad visual esto pasó a ser una
  brecha, no una decisión; `lucide-react` está aprobado y entra en el bloque 7.
- Prueba funcional pendiente (fuera de alcance de código): validar con
  `admin.prueba@vecitap.com` contra Administradora Baja.

**Bug real encontrado y corregido en la primera validación manual
(2026-09-27):** con `admin.prueba@vecitap.com` sobre Baja/Torre Ida, todas
las secciones daban 404 pese a que el acceso por RLS es correcto (confirmado
comparando contra `app.html`). Causa:
`app/(admin)/admin/[orgId]/[edificioId]/layout.tsx:30-31` leía el resultado
de `edificios_visibles()` como array plano de uuids (`visibles?.includes(edificioId)`),
siguiendo el tipo generado (`types/supabase.ts:1871`,
`Returns: string[]`) — pero no hay ningún otro punto del código que ya
consumiera ese RPC ni los otros 3 con la misma forma (`orgs_del_usuario`,
`periodos_corrientes`, `unidades_historico`/`unidades_visibles`), así que
nunca se había verificado en runtime si esa forma es la real. Si la función
de la base está declarada `RETURNS TABLE(...)` en vez de
`RETURNS SETOF uuid`/`uuid[]`, PostgREST serializa cada fila como objeto
(`{"edificio_id": "..."}` o `{"id": "..."}`), no como string — `.includes()`
contra un string nunca matchea un objeto, así que el gate fallaba cerrado
para **cualquier** edificio, no solo para accesos ilegítimos. No se pudo
confirmar la forma exacta sin `pg_get_functiondef` (fuera de este repo).
**Corrección aplicada en ese momento:** `idsDeEdificiosVisibles()` (mismo
archivo) toleraba las dos formas — strings sueltos u objetos con
`edificio_id`/`id` — sin debilitar el chequeo: si no reconocía ningún id,
la lista quedaba vacía y el gate seguía fallando cerrado igual que antes.

**Actualización 2026-09-27 (tarde):** por decisión de Nicolás,
`idsDeEdificiosVisibles()` se eliminó y el layout volvió a
`visibles?.includes(edificioId)` directo — esta sesión no repitió la
verificación con `pg_get_functiondef`, así que la forma real de
`edificios_visibles()` sigue sin confirmarse por esa vía; la decisión de
sacar la tolerancia se toma como dada, no se re-audita acá. De paso se
sacaron los logs `[DIAG-ADMIN]` (de `proxy.ts` y de los dos layouts, ya
cumplieron su función de diagnóstico) y se agregó `lib/validacion.ts`
(`esUuid()`), usada en `proxy.ts` y en cada layout/page que recibe
orgId/edificioId/unidadId crudo del URL, antes de la primera consulta o
RPC. Los otros 3 RPCs `string[]` sin consumidor real (`orgs_del_usuario`,
`periodos_corrientes`, `unidades_historico`/`unidades_visibles`) quedan en
la misma situación — no bloquea nada hoy porque ninguno se usa todavía.

### Entorno de pruebas (Admin) — preparado, todavía sin usar (la Sesión 1 no ejecutó ninguna escritura)

- Organización de pruebas: **Administradora Baja**
  (`a91054da-5afa-47e1-98b7-028fb26b9f7a`). Ficticia. Suscripción
  `cancelada` a propósito: no bloquea módulos (`modulo_activo` no consulta
  suscripciones) y la tarea de cobros automáticos la ignora, así que queda
  aislada de la facturación real. **No reactivar la suscripción.**
- Períodos en el edificio Torre Ida (`f51676d7-80ff-4812-8830-6307267baecf`):
  agosto 2026 cerrado, septiembre 2026 abierto. El otro edificio de Baja no
  tiene períodos cargados.
- Cuenta `admin.prueba@vecitap.com`, rol `administrador` en Baja (membresía
  `3320f4e4-a6de-4ead-89b7-0923c11eb41c`). Probada: entra a `app.html` y ve
  Baja.
- `residente.prueba@vecitap.com` (la misma cuenta de las pruebas de
  Residente, ver arriba): residente propietario en Baja (Torre Ida 01A) y en
  Administradora Unión. El pago de prueba de 123 USD en estado `reportado`
  (de la validación de Residente) está en Baja, no en Unión.
- **Administradora Unión** la está usando el socio comercial desde el lunes
  (2026-09-28) para cargar datos de prueba con los HTML de `main`. Ninguna
  prueba de escritura de Admin se hace en Unión — queda reservada para el
  socio.
- **Regla mientras haya una sola base de datos compartida:** nada de
  migraciones de esquema ni acciones de alcance global (cargar la tasa BCV a
  mano, correr cobros automáticos) sin coordinarlo antes con el socio — las
  pruebas de Admin y las suyas conviven en la misma instancia.
- Pendiente de Fase 9: eliminar o desactivar `admin.prueba@vecitap.com` y su
  membresía en Baja (`3320f4e4-a6de-4ead-89b7-0923c11eb41c`).

---

### Reescritura contra `main` — 28-sep (bloques 0 a 6 construidos)

**Cambio de criterio de Nicolás (28-sep).** La referencia funcional y visual de la
Fase 4 pasa a ser **la versión actual de los HTML de `main`**, que Gustavo ya probó
a fondo. La app Next tiene que hacer y parecer exactamente lo mismo; lo único que
cambia es la estructura (rutas por rol, Server/Client Components, lógica en
`lib/`, tipado estricto, tokens de `app/globals.css`).

Consecuencias:

1. **Los desvíos de `docs/casos-de-uso-mejorados.md` se revierten**, salvo los que
   corrigen un riesgo de pérdida o corrupción de datos, o de seguridad. Cada uno
   de los 22 casos quedó marcado ahí (REVERTIDO / MANTENIDO / PORTADO / RESUELTO /
   PENDIENTE) con su motivo en una línea, más una tabla resumen al principio.
2. **Un bug de `main` se copia tal cual**, salvo que arriesgue datos.
3. **Lo obsoleto por arquitectura no se porta** (conexión manual a Supabase, logins
   propios por módulo): lo reemplazan las variables de entorno y `/entrar`.

**Por qué había tanto sin portar en módulos ya validados:** los HTML crecieron
después de que se migraran. Residente se migró de `residente.html` de 1.159 líneas
(09-sep) y hoy `index.html` tiene 1.774; Operador se migró de 918 líneas (07-sep) y
hoy tiene 1.174; y `docs/inventario-admin.md` se hizo sobre `app.html` de 5.318
líneas, mientras que `admin.html` tiene 6.093. "Residente VALIDADO" y "Operador
VALIDADO" siguen siendo ciertos **contra el HTML que se migró**, no contra `main`
de hoy.

El inventario nuevo, pantalla por pantalla y acción por acción, está en
[`docs/inventario-main.md`](inventario-main.md) — reemplaza a
`docs/inventario-admin.md` como referencia viva.

#### Construido (build y lint verdes en cada bloque)

| Bloque | Alcance |
|---|---|
| 0 | El inventario de `main` |
| 1 | Admin · **Pagos**: registrar, conciliar con el banco, exoneraciones, visor de comprobante, purga de vencidos |
| 2 | Admin · **Cortes de cuenta** + el recibo en papel unificado con Residente |
| 3 | Admin · **Estadísticas** (pantalla nueva del socio) |
| 4 | Admin · **Ajustes** + logo de la administradora + `NuevoEdificio` de vuelta a Ajustes |
| 5 | Admin · armazón: columna lateral oscura, `mis_modulos`, tasa del BCV en el encabezado, pestaña Vigilantes en Accesos, recuperación de clave |
| 6 | Reversión de desvíos (umbrales, alícuota, 2 tonos, cédula, obligatorios) + lectura real de Excel y PDF |
| 7 | `lucide-react` (íconos, caso 13) + Residente: banda oscura y pestañas |
| 8 | Residente · **Mis visitas** (invitar, QR en canvas, vehículos, quién entró) |
| 9 | Operador · `PanelModulos` + campo de clave con ojo en su login |
| 10 | Garita · fundaciones: ruta, gate en `proxy.ts`, tema, armazón y "falta un paso" — **validado en lectura y navegación** (28-sep, ver abajo) |
| 11 | Garita · **Entrada**: cámara, lectura de QR, veredicto a pantalla completa, visita sin anunciar — **validado en lectura y escritura** (28-sep, ver abajo) |
| 12 | Garita · **Adentro**, **Consultar** y **Bitácora** — **validado en lectura y escritura** (28-sep, ver abajo) |

Los 12 bloques de la reescritura están construidos y completos. Lo que falta
es validar manualmente los módulos que todavía no se probaron con una cuenta
real — Garita **ya no** está en esa lista: los bloques 10, 11 y 12 quedaron
validados el 28-sep (10 en lectura y navegación; 11 y 12 en lectura y
escritura).

Garita ocupa tres bloques porque es un módulo propio, del tamaño de Residente, no
un archivo suelto — ver "Ruta de la garita" más abajo.

#### Decisiones tomadas en estos bloques

- **El recibo en papel vive una sola vez.** En `main` el mismo código está dos
  veces, byte a byte (`admin.html:htmlRecibo` e `index.html:papelRecibo` —
  comprobado con `diff`, solo cambia el nombre de la función). Acá es
  `lib/recibo-papel.ts` y lo usan Admin y Residente.
- **La columna lateral reemplaza a `NavAdmin`/`SelectorEdificio`/`EncabezadoAdmin`**,
  que se borraron. El armazón (`components/admin/MarcoAdmin.tsx`) vive en el layout
  de `[orgId]`, que es donde está en `main`: una sola columna para toda la
  organización, no una por edificio. El layout de `[edificioId]` queda solo como
  gate.
- **El caso 1 se revierte pese a la decisión anterior.** `docs/estado-migracion.md`
  decía explícitamente que los 3 tonos de `TarjetaSaldo.tsx` eran una decisión
  aprobada y que no se revirtiera "por parecer distinto al original". El criterio
  del 28-sep la reemplaza. Queda anotado en los dos documentos.
- **Excel y PDF se leen de verdad** (revierte la decisión del 27-sep de quedarse en
  CSV): `xlsx` 0.20.3 desde `cdn.sheetjs.com` —**no** el 0.18.5 congelado del
  registro de npm— y `pdfjs-dist`. Los dos entran por `await import(...)`, así que
  sus chunks (480 KB y 433 KB) solo se bajan cuando alguien elige un archivo.
  Verificado contra los manifiestos del build: los referencian únicamente
  `/admin/.../pagos` y `/admin/.../propietarios`, y ninguna ruta de `/mi/*`.
- **`pdfjs-dist` va en 6.3.289, no en la 3.11.174 de `main`** — desvío de seguridad
  registrado como caso 23, **aprobado por Nicolás el 28-sep**. CVE-2024-4367 (alta,
  8,8) afecta a `≤ 4.1.392`: un PDF preparado a propósito puede ejecutar
  JavaScript en el origen que lo abre, y acá el PDF del banco se lee en el
  navegador, en el mismo origen que la sesión de Supabase.
- **Bloque 7 (íconos + banda de Residente), cerrado.** `lucide-react` 0.469.0
  (misma versión que `main` carga por CDN, `--save-exact`). El caso 13 resultó
  ser una brecha solo de Admin: `index.html`, `operador.html` y `garita.html`
  no usan lucide en `main` (verificado por conteo), así que la banda oscura de
  Residente se portó **sin íconos**, igual que main — agregárselos habría sido
  una mejora no pedida. El detalle completo de qué ícono va en qué pantalla
  quedó en `docs/inventario-main.md`, sección 6. La pestaña "Mis visitas" ya
  aparece cuando el edificio tiene el módulo `garita` activo, pero todavía
  lleva a un 404 hasta que el bloque 8 construya esa ruta.
- **Bloque 8 (Residente · Mis visitas), cerrado.** `app/(residente)/mi/[unidadId]/visitas/page.tsx`
  gatea por el módulo `garita` del lado del servidor (`notFound()` si está
  apagado — a diferencia de main, acá sí hay una URL propia que alguien
  podría visitar directo) y trae `invitaciones_visita`, `mis_visitas` y
  `vehiculos` en paralelo. Las cuatro secciones de main quedaron portadas:
  `InvitarVisitas.tsx` (V1/V2), `MisVehiculos.tsx` (V3/V4) y
  `QuienHaEntrado.tsx` (lectura de `mis_visitas`). `qrcode` 1.5.4 se instaló
  por npm (`--save-exact`, misma versión que main baja por CDN) y
  `lib/residente/tarjeta-visita.ts` tiene el QR y el canvas de la tarjeta.

  **El SQL de `crear_invitacion_visita`/`anular_invitacion_visita`** (pedido
  con la consulta que quedó acá, corrida por Nicolás contra `vecitap-pruebas`)
  confirmó reglas que no estaban documentadas y que ahora aplica el cliente:
  `p_hasta` tiene que ser futura y a lo sumo 30 días adelante (lo valida la
  función, no el formulario); `p_documento`/`p_placa` se normalizan en la
  base (mayúsculas, sin caracteres raros) y `p_usos` se clampa entre 1 y 50;
  el código lo genera la base (`gen_random_bytes`), nunca el navegador; y
  `anular_invitacion_visita` autoriza por `unidades_visibles()` (mismo
  criterio de RLS que ya filtra qué unidades ve la sesión) o `puede_operar`,
  así que alcanza con mandarle el id de la invitación. Las dos funciones son
  `SECURITY DEFINER` con `search_path` fijo, correctamente — ninguna de las
  dos está en la lista de funciones de seguridad de `AGENTS.md`, pero
  conviene tenerlas presentes si se tocan en el futuro: son las que deciden
  quién puede crear o anular un acceso a un edificio.
  **`MisVehiculos.tsx` preserva un detalle de main:** el formulario tiene un
  solo campo "Marca y modelo" (no dos), porque `main` nunca conecta su
  `auto.modelo` a ningún input — `modelo` siempre queda `null`. Es un bug de
  main sin riesgo de datos, se copia tal cual (criterio del 28-sep).
- **Bloque 9 (Operador · PanelModulos + login), cerrado.** `components/operador/PanelModulos.tsx`
  se insertó en `FichaCliente.tsx` entre "Suscripción" y "Contacto" (mismo
  lugar que main), usando `modulos_de`/`fijar_modulo`/`soltar_modulo` —
  las tres ya estaban tipadas en `types/supabase.ts` desde el 28-sep, sin
  sorpresas. El toggle "Habilitado"/"Apagado" y el resto de las piezas
  (excepciones por edificio, alta de excepción con 2+ edificios) son fieles
  a `operador.html:709-849`, con los tokens de `globals.css` en vez de los
  colores propios de `operador.html`.

  **El "campo de clave con ojo en el login del Operador" resultó ser un
  pendiente ya resuelto, no código nuevo.** A diferencia de main (donde
  `operador.html` tiene su propia pantalla de login con un
  `<input type="password">` pelado), Operador en el port **no tiene login
  propio**: `/operador` ya redirigía a `/entrar?volver=/operador` desde antes
  de este bloque, y `/entrar` es compartido por los cuatro roles desde el
  bloque 5 — con `CampoClave` (el campo con ojo) puesto ahí una sola vez para
  todos. El inventario lo arrastraba como pendiente porque describía
  `operador.html` tal cual es en `main`, no lo que ya construyó la
  arquitectura compartida. Verificado también que no hay ningún otro
  `type="password"` suelto en `components/operador/` ni en `app/(interno)/`.
- **Bloque 10 (Garita · fundaciones), cerrado.** Ruta
  `app/(garita)/garita/[edificioId]/…` — **sin `orgId`**, por el resultado de la
  verificación de RLS (ver "Ruta de la garita"). Gate en `proxy.ts` con
  `edificios_del_vigilante()`, y defensa en profundidad en el layout de
  `[edificioId]` con `garita_edificios()`, que además es lo que da el nombre del
  edificio y llena el selector. `esUuid()` antes de cualquier consulta, igual que
  el resto. `/destino` ganó su rama de vigilante: `administra_algo()` no lo
  cuenta, así que sin ella un vigilante caía en `/mi` y veía la pantalla de
  aceptar invitación de un residente.

  **El login resultó ser un pendiente ya resuelto, igual que en el bloque 9.**
  `garita.html:364-450` tiene su propia pantalla con tres modos (entrar · "Es mi
  primera vez" · "Olvidé mi clave") y campo con ojo; el `/entrar` compartido del
  bloque 5 ya tiene los cuatro (esos tres más `clave-nueva`) y `CampoClave`. La
  garita no necesita pantalla propia — el inventario lo arrastraba porque
  describía `garita.html` tal cual es en `main`, no lo que ya resolvió la
  arquitectura compartida.

  **Tema: la garita usa el de toda la app** (revisión del 28-sep, ver abajo).
  `ThemeProvider` y el script anti-parpadeo quedaron **como estaban antes del
  bloque 10** — una sola clave, `vecitap-tema`, sin parametrizar. Lo que sí es
  propio del módulo son los tamaños (`app/(garita)/garita.css`) y los tokens
  `--veredicto-si`/`--veredicto-no`, agregados a `globals.css` en los dos temas;
  `--verde`/`--rojo` **no** se pisaron.

  **Andamio temporal, a propósito:** las cuatro vistas eran `<EnConstruccion>`
  (`components/garita/EnConstruccion.tsx`) hasta que los bloques 11 y 12 las
  reemplazaron — el archivo se borró en el bloque 12, cuando ya no quedaba
  ningún `<nav>` que llevara a él.

- **Bloques 11 y 12 (Garita · las cuatro vistas) — VALIDADOS EN LECTURA Y
  ESCRITURA (28-sep).** Construidos el 28-sep y probados a mano por Nicolás
  con la cuenta `vigilante.prueba@vecitap.com` sobre Torre Ida: las cuatro
  vistas y las cuatro acciones de escritura (`garita_entrada`,
  `garita_avisar`, `garita_salida`, `garita_nota`) se ejercieron contra la
  base. Con esto Garita queda validada de punta a punta salvo el único
  pendiente que ya arrastraba el bloque 10 ("Falta un paso" con un código de
  invitación real, que necesita una segunda cuenta de vigilante sin garita
  asignada — ver el final de este documento). Las cuatro vistas de
  `garita.html:630-896` están reescritas
  como componentes de cliente propios
  (`components/garita/Vista{Entrada,Adentro,Consultar,Bitacora}.tsx`), una
  por ruta, con sus 10 llamadas a `garita_*` conectadas (6 de lectura + las 4
  de escritura).

  - **Entrada** (`VistaEntrada.tsx`): `garita_validar` (código QR o escrito a
    mano) con el veredicto a pantalla completa, `garita_visitante`
    (autocompletado por cédula, debounce 350ms), y "Registrar entrada"
    (`garita_entrada` + `garita_avisar`) en los dos caminos — el veredicto y
    "Visita sin anunciar".
  - **Adentro** (`VistaAdentro.tsx`): `garita_dentro` con refresco automático
    cada 60s (para el relevo de turno, igual que garita.html:1004-1009), un
    botón "Actualizar" y "Registrar salida" (`garita_salida`).
  - **Consultar** (`VistaConsultar.tsx`): `garita_vehiculos` (debounce 280ms,
    mínimo 2 caracteres) y el directorio del edificio, filtrado en memoria
    sobre el mismo directorio que ya trajo el layout (máximo 60 filas) — vista
    **completa**, no tiene ninguna acción de escritura.
  - **Bitácora** (`VistaBitacora.tsx`): `garita_bitacora` (el día completo,
    200 filas como máximo, recarga sola al cambiar la fecha) y "Anotar"
    (`garita_nota`).

  **Las 4 acciones de escritura se conectaron después de confirmar su SQL
  real con `pg_get_functiondef`** (pedido explícito de Nicolás en esta
  sesión — el mismo criterio que ya evitó el bug de `edificios_visibles()`
  de la Sesión 1 de Admin: no asumir la forma de un RPC sin haberla visto).
  Acá sí hizo falta: la nota anterior de este mismo documento sobre
  `p_unidad` (ver "Dos detalles de los tipos" más arriba) decía justo lo
  contrario de lo que confirmó el SQL real. Lo que se verificó de cada una:

  | Función | Toca | Obligatorio verificar | Idempotente |
  |---|---|---|---|
  | `garita_entrada` | `visitas` (insert), `bitacora` (insert "entrada"), `visitantes` (upsert si hay documento), `invitaciones_visita` (`usos+1` si hay invitación, revalida vigencia/estado/cupo ahí mismo) | `permitir_garita(p_edificio)`; unidad pertenece al edificio si se manda; nombre no vacío | **No** — cada llamada crea una visita nueva |
  | `garita_avisar` | `cola_correo` (insert, uno por destinatario de `destinatarios_de(unidad_id)` con correo) | `permitir_garita(r.edificio_id)`, resuelto de la visita (el único parámetro es `p_visita`) | No, pero se llama una sola vez por entrada; cada insert va en su propio `exception when others` — un correo roto no tumba a los demás ni a la entrada ya registrada |
  | `garita_salida` | `visitas` (update a `salio`), `bitacora` (insert "salida") | `permitir_garita(r.ed)`, resuelto de la visita | **Sí** — si `estado <> 'dentro'` no hace nada, `return` sin error |
  | `garita_nota` | `bitacora` (insert únicamente) | `permitir_garita(p_edificio)`; texto no vacío; `p_tipo` restringido a `novedad`/`ronda`/`relevo` (nuestro `<select>` ya solo ofrece esas 3) | No — inmutable por diseño, no hay ningún `update`/`delete` sobre `bitacora` en todo el esquema de Garita |

  `permitir_garita(p_edificio)` es el punto único de autorización de las 6
  funciones `garita_*` de escritura y de `garita_validar`/`garita_visitante`
  también (las dos llaman a `permitir_garita` aunque sean de lectura) — no
  está en la lista de funciones de seguridad de `AGENTS.md` (que lista
  `puede_operar`/`tiene_rol`/`es_operador`/etc.), pero cumple el mismo papel
  para este módulo y conviene tenerla presente si se la toca. No se pidió su
  SQL en esta ronda (no cambia nada del lado del cliente); si hiciera falta
  auditarla, es la candidata obvia.

  **`garita_validar` no es de solo lectura**, aunque esté documentada así en
  `docs/inventario-main.md`: si el código no existe, inserta ella misma un
  rechazo en `bitacora` (`tipo='rechazo'`) antes de devolver el veredicto —
  "para que si alguien prueba códigos al azar en la puerta, quede asentado"
  (comentario del propio SQL). El código ya conectado en el bloque 11 es fiel
  a esto: llama a la función normalmente y solo lee el resultado, sin asumir
  que era de solo lectura ni intentar replicar el registro por su cuenta —
  el insert es un efecto de la función, no algo que dependa del cliente.
  `garita_visitante` sí es `STABLE` de verdad (sin ningún `insert`/`update` en
  el cuerpo): el código que ya la llama (autocompletado por cédula) es
  puramente de lectura, sin ajustes.

  **Corrección de comportamiento encontrada al leer el SQL, aplicada en el
  bloque 11 (no en una sesión anterior):** `p_unidad` de `garita_entrada` **no
  tiene `DEFAULT`** en la firma real — a diferencia de `p_documento`/
  `p_placa`/`p_invitacion`/`p_nota`, que sí. El tipo generado (`p_unidad:
  string`, sin `| null`) no es un error del generador: refleja bien que el
  parámetro es obligatorio. Lo que no expresa es que la función acepta `NULL`
  como valor de ese parámetro obligatorio (lo comprueba ella misma). Los dos
  puntos donde se llama (`registrarEntradaDesdeVeredicto`, `registrarSinAnunciar`
  en `VistaEntrada.tsx`) mandan siempre `p_unidad` — con el uuid real o con
  `null` explícito — nunca lo omiten; se castea a
  `Database["public"]["Functions"]["garita_entrada"]["Args"]` en la llamada
  porque el tipo generado no admite `null` ahí, con el motivo comentado en el
  código. Esto reemplaza la nota anterior de este documento que decía mandar
  `undefined` — esa nota nunca se verificó contra el SQL real y estaba al
  revés (ver "Dos detalles de los tipos" arriba, donde queda tachada).

  **Blindaje contra reenvíos, según cada función:** `garita_entrada` y
  `garita_nota` no son idempotentes, así que sus botones se deshabilitan
  mientras la llamada está en curso (`enviandoSinAnunciar`/`enviandoNota`); el
  veredicto, en cambio, se cierra de inmediato al tocar "Registrar entrada"
  (igual que garita.html:612), lo que ya alcanza para no poder tocarlo dos
  veces. `garita_salida` es idempotente (confirmado en el SQL), así que
  alcanza con deshabilitar el botón de esa fila nada más por prolijidad
  visual, no por riesgo real de duplicar nada.

  **Un detalle de paridad que se corrigió de paso, al releer `garita.html`
  con más cuidado:** el veredicto negativo (código inválido/vencido/anulado)
  también muestra los datos de quién intentó entrar
  (`garita.html:602-607,626` arma `datos` antes del `if(r.valido)` y lo pasa
  en los dos casos) — la primera versión de `VistaEntrada.tsx` solo lo hacía
  en el camino válido; quedó corregido en esta misma pasada.

  Piezas nuevas, compartidas entre las cuatro vistas:

  - **`components/garita/DirectorioContexto.tsx`**: el layout de
    `[edificioId]` trae `garita_directorio()` **una sola vez** por edificio
    (igual que `cargarEdificio()` en garita.html:995-1002) y lo reparte por
    contexto — Entrada (select de unidad) y Consultar lo reusan sin volver a
    pedirlo al cambiar de pestaña, a diferencia de si cada ruta lo pidiera por
    su cuenta.
  - **`hooks/useLectorQR.ts`**: cámara + `BarcodeDetector` nativo con `jsQR`
    como respaldo (garita.html:523-591). A diferencia del original, que baja
    `jsQR` por CDN (`import()` a una URL de jsdelivr), acá es
    `jsqr` 1.4.0 por npm (`--save-exact`) con `import()` dinámico — mismo
    efecto de no bajar el chunk salvo que haga falta, sin depender de un CDN
    externo en tiempo de ejecución. Ninguna de las dos APIs de navegador tiene
    tipos en TypeScript 5.9 (verificado contra `lib.dom.d.ts`): se agregaron
    `types/barcode-detector.d.ts` y `types/jsqr.d.ts`.
  - **`lib/garita/pitido.ts`**: el pitido (880/220Hz) y la vibración del
    veredicto (garita.html:292-303), envueltos en `try/catch` como el
    original — son un plus, no una condición para operar la garita.
  - **`lib/formato.ts`**: se agregaron `horaCorta()` (solo hora:minuto, para
    Adentro y Bitácora) y `hoyLocalISO()` — el "hoy" en la zona horaria del
    navegador, no en UTC como el `hoyISO()` que ya usan Pagos/Cierre del
    mes/Operador. Hace falta uno propio para el selector de fecha de
    Bitácora: con el `hoyISO()` normal, después de las 20:00 hora de
    Venezuela el selector ya abriría en el día siguiente.

  **Lección de lint, para las próximas vistas con carga periódica o
  reactiva:** el rechazo a `setState` sincrónico dentro de un efecto (ver
  "Patrones nuevos" más abajo) también alcanza a **llamar dentro del efecto a
  una función nombrada que internamente hace `setState`**, aunque sea
  `async` y el `setState` ocurra después de un `await` — no es una cuestión
  de sincronía real, el lint lo rechaza igual. Apareció en `VistaAdentro.tsx`
  (`cargar()` llamada al montar) y en `VistaBitacora.tsx` (`setCargando(true)`
  síncrono al principio del efecto). La solución: la carga que dispara el
  efecto va **inline**, con `.then()` directo sobre la llamada a Supabase
  dentro del propio efecto (con su `vivo` para no pisar un fetch viejo); una
  función aparte (`cargar`, con `useCallback`) queda solo para lo que se
  dispara **fuera** de un efecto — un botón, un `setInterval`. Bitácora, de
  paso, sumó a `cargando` a la lista de estados que se derivan de una clave
  en vez de un booleano propio (mismo patrón que Cortes.tsx/Estadísticas.tsx).
  Por separado, `hooks/useLectorQR.ts` tropezó con la otra mitad de esa
  familia de reglas: escribir un `ref` durante el render también está
  prohibido, así que el "último valor" de un callback (`onDetectadoRef`) se
  sincroniza en un efecto sin dependencias, no en el cuerpo de la función.

#### Bloque 13 — investigación previa (28-sep), no empieza sin aprobación

Pedido de Nicolás: una vista de solo lectura de Garita dentro de Admin
(visitas del día + bitácora, selector de fecha limitado a 30 días, exportar
CSV e imprimible, sin correos), después de validar los bloques 0-9. Roles:
`propietario_cuenta`/`administrador` ven toda la organización, `junta` solo
su edificio, `contador` no — lista pensada para poder cambiar después. Esta
sección es solo la investigación previa; **el bloque no arranca sin
aprobación explícita**, y no se escribió ningún componente ni ruta todavía.

**Hallazgo central: `puede_garita(p_edificio)` ya existe**, y no es lo que
parecía. No es algo para crear — es el gate operativo completo del módulo,
y **no se debe tocar para esto**:

```
puede_garita(p_edificio) = vigilante de ese edificio (edificios_del_vigilante())
                           OR puede_operar(org de ese edificio)
puede_operar(p_org)      = tiene_rol(p_org, ['propietario_cuenta','administrador'])
tiene_rol(p_org, roles)  = existe membresía activa de ESE org con rol = any(roles)
                           -- no mira edificio en absoluto
```

`permitir_garita` (el gate de las 4 funciones de escritura del bloque 11/12
más `garita_validar`/`garita_visitante`) llama a `puede_garita` para
autorizar. Editar `puede_garita` para sumar `junta` le daría a junta las
mismas escrituras que a un vigilante — registrar entradas/salidas, escribir
notas de bitácora — cuando el pedido es una vista de solo lectura. Por eso
la propuesta (sin aplicar) es una función **nueva y separada**,
`puede_ver_garita(p_edificio)`, que ninguna función de escritura llama:
`supabase/migrations/20260928120000_puede_ver_garita.sql` +
`supabase/rollbacks/20260928120000_puede_ver_garita_rollback.sql`. El nombre
es una propuesta, no una decisión — Nicolás la revisa y renombra si hace
falta antes de correrla.

**Consecuencia útil del hallazgo:** las 4 funciones `garita_*` de lectura
(`garita_bitacora`, `garita_dentro`, `garita_directorio`, `garita_vehiculos`)
autorizan vía `permitir_garita` → `puede_garita`, así que
`propietario_cuenta`/`administrador` **ya pueden llamarlas hoy**, sin ningún
cambio, para cualquier edificio de su organización — la rama `puede_operar`
de `puede_garita` ya los deja pasar. `garita_edificios()` es la única
excepción de forma (no pasa por `permitir_garita`; filtra
`where puede_garita(e.id) and modulo_activo(...)` directo en su `select`,
porque enumera varios edificios a la vez en lugar de autorizar uno solo).
Lo único que falta para completar la regla de roles es `junta`, acotado a su
edificio — de ahí `puede_ver_garita`.

**El día tiene que ser el día LOCAL (`America/Caracas`), no el de UTC.**
Agregado el 28-sep, después del bug de zona horaria de `garita_bitacora` (ver
"Zona horaria: el día local vs. el día UTC" más abajo): la Bitácora mostraba en
el día siguiente todo lo registrado entre las 20:00 y la medianoche. Cuando
este bloque arranque, las dos piezas que deciden un día —la bitácora y la
función nueva de "visitas del día"— tienen que usar `hoy_local()` /
`inicio_dia_local()` (las auxiliares que crea
`supabase/migrations/20260928140000_garita_bitacora_dia_local.sql`), **nunca**
`current_date` ni un cast `date::timestamptz`. Si no, Admin y la garita van a
mostrar bitácoras distintas del mismo día. El selector limitado a 30 días
también cuenta esos días en zona local.

**`garita_dentro` no sirve para "visitas del día".** Su único parámetro es
`p_edificio` — sin fecha, solo muestra quién está adentro *ahora mismo*
(`estado = 'dentro'`), no admite mirar un día de los últimos 30. Ninguna de
las 11 funciones `garita_*` existentes devuelve un listado de visitas
histórico y estructurado (nombre/documento/placa/hora entrada/hora salida)
para una fecha arbitraria — `garita_bitacora` es lo más parecido, pero
devuelve texto libre (`texto`, `tipo`, `vigilante`, `creado_en`), no
columnas. Cuando el bloque 13 arranque de verdad, "visitas del día" va a
necesitar una función nueva (además de `puede_ver_garita`, que es solo el
gate) — no se diseñó todavía porque no se pidió en esta ronda.

**El dato de `membresias.edificio_id` para `junta` ya existe, no hace falta
ninguna migración de esquema.** El CHECK `membresia_alcance` (confirmado en
`esquema_inicial.sql`, el dump local de referencia — ver nota de confianza
abajo) obliga a que toda fila con `rol='junta'` tenga `edificio_id NOT
NULL`; la migración `20260926120000_membresias_multiples_por_organizacion.sql`
ya normalizó esto. La migración propuesta es pura función, cero
`ALTER TABLE`.

**Nivel de confianza de estos hallazgos:** salieron de `esquema_inicial.sql`
(dump local con `pg_dump` 17.11, no versionado — está en `.gitignore` —,
modificado el 27-sep), no de un `pg_get_functiondef` corrido en esta sesión.
Se cruzó su versión de `garita_entrada` contra el CSV real que Nicolás pasó
en la sesión anterior y coincide en la parte comparada, así que se usa como
referencia de alta confianza — pero antes de aplicar la migración conviene
confirmar con la consulta que trae ese mismo archivo de migración en un
comentario, sobre `puede_garita`/`permitir_garita`/`puede_operar`/
`tiene_rol`/`edificios_del_vigilante`.

**De `lib/garita/`/`components/garita/`, casi nada se reutiliza tal cual** —
son dos contextos visuales distintos: la garita es una tableta táctil en una
puerta (`garita.css`, botones de 60px, veredicto a pantalla completa,
cámara), Admin es un dashboard de escritorio con `components/ui/` y las
convenciones ya establecidas de Cortes/Estadísticas/Pagos. Lo que sí se
reutiliza:
- `lib/garita/tipos.ts`: el tipo `NotaBitacora` (fila de `garita_bitacora`)
  sirve tal cual para la pestaña de bitácora.
- `lib/formato.ts`: `horaCorta()` y `hoyLocalISO()`, ya genéricas, no
  específicas de garita.
- El mapa `ETIQUETA_TIPO` (hoy una constante local dentro de
  `VistaBitacora.tsx`) convendría subirlo a un archivo compartido cuando el
  bloque 13 arranque, para no duplicarlo entre las dos pantallas que van a
  mostrar bitácora (la del vigilante y la nueva de Admin).
- El patrón de exportar CSV es el de `lib/operador/exportar-cartera.ts`
  (función pura que arma el string, la descarga la dispara el componente) y
  el de imprimible es `lib/admin/imprimir-estado.ts` (`window.open` con el
  HTML armado) — ninguno de los dos vive en `lib/garita/`, son los que ya
  usa el resto de Admin.

**Ni `garita.html` ni `admin.html` de `main` tienen algo parecido.**
Confirmado por grep: ninguna de las 11 funciones `garita_*` aparece en
`admin.html` (ni en `index.html`/`operador.html`). Lo único remotamente
relacionado es la pestaña **Vigilantes** de Accesos en Admin — pero esa
administra altas/bajas de cuentas de vigilante, no muestra ninguna actividad
de la garita. El bloque 13 es terreno nuevo, no un desvío de algo que ya
existía en `main`.

#### Lo único que falta para igualar a `main` en aspecto

Los **íconos** (caso 13). `main` usa `lucide` 0.469.0 por CDN en decenas de
botones y estados vacíos; la app no tiene ninguno. **Nicolás aprobó
`lucide-react` el 28-sep**: se instala y se aplica en el **bloque 7**, junto con
las diferencias de Residente. Es lo primero de ese bloque.

#### `types/supabase.ts` — regenerado el 28-sep

Nicolás lo regeneró contra `vecitap-pruebas` y quedó **completo**: las 16
funciones y las 2 tablas que faltaban están todas (verificado cruzando el archivo
contra la lista completa de `rpc("…")`/`from("…")` de los cuatro HTML, en las dos
direcciones). Llegaron 564 líneas: las tablas `bitacora`, `invitaciones_visita`,
`vehiculos`, `visitantes` y `visitas`, y 29 funciones, entre ellas las 11
`garita_*`. `npx tsc --noEmit` queda limpio, así que nada de lo ya escrito se
rompió. Dos detalles para el bloque 10 están anotados en
`docs/inventario-main.md` sección 5.

**Los bloques 0 a 9 siguen sin validar.** Ninguno ejecutó una escritura contra
la base con una cuenta real; la validación manual la hace Nicolás. **Garita ya
no está en esa lista:** el bloque 10 quedó validado el 28-sep en lectura y
navegación (ver "Bloque 10" más abajo) y los bloques 11 y 12 el 28-sep en
lectura y escritura (ver "Bloques 11 y 12" arriba). De paso quedó probado en
escritura el `PanelModulos` del bloque 9, al prender el módulo `garita` en
Torre Ida.

#### Pendientes concretos que dejan estos bloques

Lo que queda abierto y hay que retomar, además del alcance de los bloques 7 a 12:

- ~~**Validar manualmente las 4 acciones de escritura de Garita** con una
  cuenta de vigilante real (`garita_entrada`, `garita_avisar`, `garita_salida`,
  `garita_nota`).~~ **Hecho el 28-sep** — ver "Bloques 11 y 12" arriba.
- **Instalar `lucide-react` y poner los íconos** (caso 13, aprobado). Es lo
  primero del bloque 7. Las citas de `main` están en `docs/inventario-main.md`;
  los puntos donde hoy no hay ícono son los botones de acción de todas las
  pantallas de Admin, los estados vacíos (`Vacio`) y las flechas de reordenar
  (`components/ui/Flechas.tsx`, que hoy usa ▲▼ Unicode).
- ~~**El enlace `/garita` de Accesos apunta a una ruta que todavía no existe.**~~
  **Resuelto en el bloque 10:** `/garita` ya existe y resuelve sola (sin garitas
  asignadas → "Falta un paso", con una o más → entra a la primera). El mensaje
  que `components/admin/Accesos.tsx` copia para el vigilante (caso 25) ya lleva a
  una pantalla real. Lo que todavía **no** funciona de punta a punta es lo que hay
  detrás: las cuatro vistas llegan en los bloques 11 y 12.
- **Los cuatro módulos comparten la recuperación de clave de `/entrar`.** El
  bloque 5 la construyó ahí (modo `clave-nueva`, detecta `type=recovery` en el
  hash y el evento `PASSWORD_RECOVERY`). Operador y Garita no necesitan una
  pantalla propia; lo que sí falta es el campo de clave con ojo en el login del
  Operador (bloque 9), que hoy usa un `<input type="password">` pelado.
- **Al validar Pagos, probar la conciliación con un archivo real de cada tipo**
  (`.csv`, `.xlsx`, `.pdf`). El lector de PDF es interpretado, no exacto: la
  previa hay que mirarla con más cuidado, y eso vale igual para "Cargar saldos".
- **Accesos ya no filtra las unidades por `activa`** al armar el selector de
  invitar, porque `main` tampoco lo hace (la lista que recibe `Accesos` en
  `admin.html` es la de `App()`, sin filtro). Si aparece una unidad inactiva en
  ese selector, es fiel al original, no un bug.

#### Patrones nuevos, para reusar en los bloques que faltan

Se suman a la nota sobre filas editables con `key={`${id}:${valor}`}` que ya
estaba más arriba. Los dos salieron de pelear con
`eslint-plugin-react-hooks` en este proyecto:

- **"Cargando" se deriva, no se pone con un `setState` sincrónico.** El lint
  rechaza `setCargando(true)` dentro de un `useEffect`. La solución que quedó en
  `Cortes.tsx` y `Estadisticas.tsx`: guardar lo cargado **junto a la clave que
  lo identifica** (`{ periodoId, filas }`) y derivar `cargando` comparando esa
  clave con la elegida. De paso arregla un problema real: al cambiar de mes ya no
  se ven un instante los datos del mes anterior.
- **Preferencias de `localStorage` con `useSyncExternalStore`.**
  `lib/preferencia-local.ts` (hoy solo `vecitap_plantilla`, el texto de WhatsApp
  de Cortes). Leerlo en el inicializador de `useState` rompe la hidratación
  (en el servidor no hay `localStorage`) y sincronizarlo desde un efecto lo
  rechaza el lint; `useSyncExternalStore` resuelve las dos cosas. Guarda además
  una copia en memoria para que siga funcionando en navegación privada.

#### Tropezón de entorno, para no volver a perder tiempo

`npm run build` puede fallar con `EPERM: operation not permitted, unlink
'.next\server\app\design-system.segments'`. Es OneDrive sosteniendo un archivo
del build anterior, no un error del código: `rm -rf .next` y volver a construir.
Va en la misma familia que los avisos de borrado masivo que ya menciona
`AGENTS.md`.

---

## Cabos sueltos de Garita cerrados el 28-sep

- **El cast de `p_unidad` salió del componente.** Estaba dos veces en
  `components/garita/VistaEntrada.tsx` (`registrarEntradaDesdeVeredicto` y
  `registrarSinAnunciar`), con el comentario del motivo repetido en el
  primero. Ahora es `registrarEntradaGarita()` en **`lib/garita/entrada.ts`**:
  recibe el cliente de Supabase y un objeto en los términos de la pantalla
  (`unidadId: string | null`), y encierra el único `as` del módulo en una
  línea. El motivo (firma real sin `DEFAULT` en `p_unidad`, el tipo generado
  no puede expresar "obligatorio pero acepta NULL") quedó escrito completo en
  el docblock de esa función, que es el lugar donde hay que leerlo si algún
  día se le pone `DEFAULT NULL` al parámetro y se regenera el tipo. Mismo
  criterio que el resto: la lógica en `lib/`, no en el componente.

## El lateral de Admin volvió a quedar fijo (28-sep) — paridad, no desvío

Gustavo reportó que la columna lateral oscura se desplaza con el scroll,
mientras que en `admin.html` de `main` queda fija. No era un olvido:
`.admin-lateral` ya tenía `position: sticky; top: 0; height: 100vh` desde el
bloque 5, igual que el original (`admin.html:1231` + el estilo en línea del
`<aside>`).

**La causa estaba en `app/globals.css`, no en el armazón de Admin:** la regla
`html, body { max-width: 100vw; overflow-x: hidden }`. `overflow-x` en `body`
le da a `body` un *scrollport* propio (el eje que queda `visible` se computa
como `auto`), y entonces todo `position: sticky` de adentro se pega a ese
scrollport en vez de al viewport — y ese scrollport no scrollea, así que el
elemento se va con la página. `admin.html` no tiene esa regla (su `body` es
solo `margin: 0; background`), y por eso ahí sí funciona. Es una de esas
diferencias que no se ven leyendo el componente: el componente estaba bien.

Corrección, en dos archivos:
- `app/globals.css`: el recorte horizontal queda **solo en `html`**
  (`html { overflow-x: hidden }`). En el elemento raíz el recorte se propaga
  al viewport y no crea un scrollport que rompa `sticky`; el efecto de "sin
  scroll horizontal", que es para qué estaba la regla, se conserva igual.
  `max-width: 100vw` sigue en los dos.
- `components/ui/ui.css`: `.admin-lateral` pasa a `height: 100dvh` (no
  `100vh`: con la barra del navegador de un teléfono, `100vh` se pasa de
  largo y el pie del lateral —Ajustes / Tema / Salir— queda debajo del
  borde) y gana `overflow-y: auto` + `overscroll-behavior: contain`, para
  que en una ventana baja el menú scrollee **dentro** de la columna sin
  arrastrar la página. `.admin-marco` pasa a `min-height: 100dvh` por
  coherencia.

Sigue scrolleando solo el contenido, con el scroll de la página (no se metió
ningún contenedor de scroll anidado en `.admin-principal`: eso habría roto la
restauración de scroll de Next al navegar). **Al validar, mirar también las
otras tres rutas** — el cambio de `globals.css` es global, así que conviene
confirmar de paso que `/mi`, `/garita` y `/operador` siguen sin scroll
horizontal en el teléfono.

## Lentitud de la interfaz — diagnóstico (28-sep) + puntos 1, 3 y 6 aplicados

Gustavo reporta que la interfaz "se siente lenta al hacer clic", en general.
Lo de abajo hasta "Propuestas" es el diagnóstico original, **tal como se
escribió antes de tocar nada** (no se reescribió con los números de después —
eso queda en las dos secciones "Hecho el 28-sep", al final). Estado de las
seis propuestas:

| # | Propuesta | Estado |
|---|---|---|
| 1 | `loading.tsx` | ✅ aplicada (3 rutas aprobadas + `pagos` y `cortes`) |
| 2 | Región de Vercel | ⏳ **pendiente de Nicolás** — mirar el dashboard, no toca código |
| 3 | Paralelizar lo independiente | ✅ aplicada (`[orgId]/layout`, `[edificioId]/layout`, `recibo/page`) |
| 4 | `experimental.staleTimes.dynamic` | ⏸ sin tocar, necesita aprobación |
| 5 | Dedup `getUser()`/`tiene_rol` | ✅ corregida (tenía un error de análisis) y aplicada su mitad viable, con `cache()` |
| 6 | `getClaims()` en `proxy.ts` | ✅ **aplicada el 28-sep**, con las claves ECC confirmadas |

### Los viajes de red de una navegación de Admin

Ruta de referencia: `/admin/[orgId]/[edificioId]/inicio`. Cada ítem es **un
viaje de ida y vuelta a Supabase** (PostgREST o el servidor de Auth), medido
desde la función de Vercel.

**Carga completa (primera entrada, o F5) — 9 en serie + 1 tanda de 5:**

| # | Dónde | Llamada | ¿Serie? |
|---|---|---|---|
| 1 | `proxy.ts:58` | `auth.getUser()` → `GET /auth/v1/user` | serie (bloquea todo) |
| 2 | `proxy.ts:101` | `rpc("tiene_rol")` | serie, después de #1 |
| 3 | `[orgId]/layout.tsx:33` | `auth.getUser()` — **repite #1** | serie |
| 4 | `[orgId]/layout.tsx:38` | `rpc("tiene_rol")` — **repite #2** | serie |
| 5 | `[orgId]/layout.tsx:44` | `from("organizaciones")` | serie |
| 6 | `[orgId]/layout.tsx:51` | `from("edificios")` (todos los de la org) | serie |
| 7 | `[orgId]/layout.tsx:57` | `tasaDelDia` → `rpc("tasa_atrasada")` | serie |
| 8 | `[edificioId]/layout.tsx:33` | `rpc("edificios_visibles")` | serie |
| 9 | `[edificioId]/layout.tsx:37` | `from("edificios")` (1 fila) — **2.ª vez que se consulta `edificios`** | serie |
| 10 | `inicio/page.tsx:19` | `Promise.all` de 5: `unidades`, `saldos_actuales`, `conceptos_cobro`, `periodos`, `edificios` (**3.ª vez**) | **paralelo**, 1 tanda |

**Lo que se repite entre layout y page:** `auth.getUser()` ×2 (proxy + layout),
`tiene_rol` ×2 (proxy + layout), y `edificios` ×3 (layout de org, layout de
edificio, page). `getUser()` no es gratis ni está cacheado: es un `GET` al
servidor de Auth en cada llamada.

**Navegación dentro del mismo edificio (Inicio → Cobros, el clic que se
siente lento) — 2 en serie + lo que pida la página.** Los layouts **no** se
vuelven a ejecutar: lo dicen los docs de esta versión de Next
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:240`,
"Layouts do not re-render on navigation", y el apartado de *partial
rendering* de `staleTimes.md`). Lo que sí corre de nuevo, **en cada clic**,
es `proxy.ts` completo — el `matcher` solo excluye archivos estáticos, así
que la petición RSC de la navegación también pasa por ahí: `getUser()` +
`tiene_rol()` en serie, antes de que la página empiece a pedir sus datos.
Ese es el costo fijo por clic.

**Cambiar de edificio con el selector** vuelve a ejecutar el layout de
`[edificioId]` (cambia el segmento): #8 y #9 se suman a los dos del proxy.

### Lo mismo, más corto, en los otros dos módulos

**`/mi/[unidadId]/recibo`** — 6 en serie, ninguna tanda paralela:
`proxy.getUser()` → `proxy` no tiene gate de rol para `/mi` → layout
`getUser()` (**repite**) → layout `rpc("mis_unidades")` → page
`rpc("mis_unidades")` (**repite**, `recibo/page.tsx:22`) → page
`from("recibos")` → page `tasaDelDia`. Las tres de la página están una
detrás de la otra, sin `Promise.all`. `/mi/.../pagos` es el más liviano
(una sola consulta propia); `/mi/.../visitas` sí paraleliza sus 5.

**`/garita/[edificioId]/entrada`** — 4 en serie: `proxy.getUser()` →
`proxy.rpc("edificios_del_vigilante")` → layout `getUser()` (**repite**) →
layout `rpc("garita_edificios")` → layout `rpc("garita_directorio")` (las
dos últimas también en serie, `layout.tsx:38` y `:48`). Las cuatro páginas
de garita no piden nada del lado del servidor (las vistas son de cliente y
reusan el directorio por contexto), así que el resto ya está bien: cambiar
de pestaña dentro de la garita solo paga el proxy.

### Ninguna ruta tiene `loading.tsx`

**Cero archivos `loading.tsx` en todo `app/`** (Admin, Residente, Operador,
Garita y marketing incluidos). Concretamente faltan en:

- Admin: `[orgId]/`, `[orgId]/[edificioId]/` y las 9 secciones
  (`inicio`, `propietarios`, `propietarios/[unidadId]`, `cobros`, `mes`,
  `pagos`, `cortes`, `estadisticas`, `accesos`, `ajustes`).
- Residente: `mi/`, `mi/[unidadId]/` y sus 4 pestañas (`recibo`,
  `reportar`, `pagos`, `visitas`).
- Garita: `garita/`, `garita/[edificioId]/` y sus 4 vistas.
- (Operador: `operador/` — tampoco, aunque no lo pedía la consigna.)

**Por qué importa más de lo que parece, y no es solo cosmético.** Los docs de
esta versión (`.../02-components/link.md:302`) dicen que para una ruta
**dinámica** el prefetch de `<Link>` llega "down to the nearest segment with
a `loading.js` boundary". Sin ninguna frontera de carga, **no hay nada útil
que prefetchear**: el clic arranca de cero. Y sin frontera tampoco hay
transición en cuanto se hace clic — el router espera el payload RSC completo
antes de cambiar de pantalla, así que el botón se siente muerto por todo lo
que tarden los viajes de arriba. Es exactamente el síntoma que describe
Gustavo. (Dato aparte, del mismo doc, línea 298: el prefetch **solo funciona
en producción**, nunca en `npm run dev` — si la prueba fue contra el
servidor de desarrollo, la sensación es peor que la real.)

### ¿Se puede usar `getClaims()` en el proxy?

> **Resuelto y aplicado el 28-sep.** Nicolás confirmó en el dashboard que **las
> dos bases** (vecitap-pruebas y producción) tienen **ECC (P-256) como clave
> actual**, con la HS256 legacy como clave anterior — o sea que sí, la
> condición de abajo se cumple y `getClaims()` verifica localmente de verdad.
> El cambio está hecho, solo en `proxy.ts`. Ver "Hecho el 28-sep ·
> `getClaims()` en el proxy" al final de esta sección, incluida la corrección
> del análisis de seguridad que traía este apartado.

**Depende de una sola cosa, y no está en el repo: si el proyecto de Supabase
ya migró a claves de firma asimétricas** (Supabase → Project Settings → JWT
Keys). Verificado leyendo la implementación en
`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:5528-5548`:

- `getClaims()` verifica la firma **localmente** solo si el token trae `alg`
  que no empieza con `HS` y un `kid` (es decir, firma asimétrica ECC/RSA).
- Si la clave sigue siendo el secreto compartido HS256 (el modo *legacy*),
  `getClaims()` **cae a `getUser()` por dentro** — mismo viaje de red, cero
  ganancia y una capa más de indirección. No falla, no avisa: simplemente no
  ahorra nada.
- El JWKS se guarda en `GLOBAL_JWKS`, un módulo global compartido por todos
  los clientes del mismo proceso, con TTL de 10 minutos
  (`lib/constants.js:48`). En una función tibia de Vercel es gratis; en un
  arranque frío es **un** `fetch` extra.

**Lo que implica para la seguridad** (esto es lo que hay que decidir, no el
rendimiento):

- **No debilita la autenticación como la debilitaría `getSession()`.**
  `getSession()` decodifica sin verificar y por eso no sirve para autorizar;
  `getClaims()` **sí verifica la firma** con la clave pública. La identidad
  que devuelve es confiable.
- **Lo que se pierde es la revocación inmediata.** `getUser()` le pregunta al
  servidor de Auth, así que ve al instante una sesión cerrada en todos los
  dispositivos, un usuario borrado o baneado. `getClaims()` confía en una
  firma válida hasta el `exp` del token: queda una ventana igual al tiempo de
  vida del access token (por omisión 1 hora en Supabase, configurable). Para
  una app que maneja pagos conviene decidirlo a conciencia — una opción
  intermedia es dejar `getUser()` para `/operador` (el back-office interno) y
  usar `getClaims()` en el camino común.
- **No ahorra ni una llamada de autorización.** Los roles de este proyecto
  viven en `membresias`, no en el JWT (ver `AGENTS.md`: no hay claims de rol),
  así que `tiene_rol`, `es_operador` y `edificios_del_vigilante` siguen
  siendo RPC igual. `getClaims()` ahorra el viaje #1, no el #2.
- **El refresco de sesión se conserva** (era la duda razonable, porque es el
  trabajo #1 del proxy): `getClaims()` sin argumento llama a `getSession()`
  por dentro, y `getSession()` renueva el token vencido y dispara la
  escritura de cookies igual que hoy. Verificado en el mismo archivo
  (`_useSession`/`__loadSession`, líneas 2537-2565).

### Región de las funciones de Vercel

**El repo no fija ninguna.** No hay `vercel.json`, y no hay ningún
`export const preferredRegion` ni `runtime` en todo el código (verificado por
grep sobre `app/`, `lib/`, `components/`, `proxy.ts` y los `.json` del
repo). Con eso, las funciones corren en la **región por omisión que tenga
configurado el proyecto en el dashboard de Vercel** (Settings → Functions →
Function Region), que es un dato que no vive acá.

Importa mucho: los 9 viajes en serie de arriba se pagan uno por uno contra
Supabase en **East US**. Si la región de Vercel es `iad1` (Washington, el
default histórico de Vercel para proyectos nuevos) están prácticamente
pegados y cada viaje cuesta pocos milisegundos; si quedó en otra región, cada
uno de esos 9 cruza el continente o el Atlántico y ahí sí se explica sola la
lentitud. **Pendiente para Nicolás: mirar ese valor en el dashboard y
anotarlo acá.** El `proxy.ts` es aparte: el `matcher` de Next 16 lo corre en
la red de Vercel, no necesariamente en la región de las funciones.

### Propuestas, por impacto sobre esfuerzo

Ninguna aplicada. Las dos últimas necesitan aprobación separada.

1. **`loading.tsx` en las fronteras que importan** — impacto alto, esfuerzo
   bajo, riesgo cero. Devuelve el prefetch de `<Link>` (hoy inexistente en
   rutas dinámicas sin frontera) y, sobre todo, hace que el clic responda al
   instante en vez de esperar el payload completo. Mínimo: uno en
   `[orgId]/[edificioId]/`, uno en `mi/[unidadId]/` y uno en
   `garita/[edificioId]/`; después, los de las secciones que más tardan
   (`inicio`, `propietarios`, `pagos`). Ojo con lo aprendido en la Fase 2:
   probar también recargando, no solo navegando.
2. **Confirmar la región de Vercel** — impacto potencialmente alto, esfuerzo
   nulo, no toca código. Si no es `iad1`, cambiarla es un clic y puede valer
   más que todo el resto junto.
3. **Paralelizar lo que ya no depende de nada** — impacto medio, esfuerzo
   bajo, sin cambio de semántica:
   - `[orgId]/layout.tsx`: `organizaciones` + `edificios` + `tasa_atrasada`
     en un `Promise.all` (hoy son 3 en serie) → 5 viajes en serie pasan a 3.
   - `[edificioId]/layout.tsx`: `edificios_visibles` + la comprobación de
     `edificios` en paralelo (las dos tienen que pasar igual) → 2 pasan a 1.
   - `mi/[unidadId]/recibo/page.tsx`: `from("recibos")` + `tasaDelDia` en
     paralelo, y **sacar el `mis_unidades()` repetido** (el layout ya lo
     trajo) → 3 en serie pasan a 1.
4. **`experimental.staleTimes.dynamic`** en `next.config.ts` — impacto medio
   (volver a una sección ya visitada, y atrás/adelante, quedan instantáneos),
   esfuerzo nulo. Por omisión es **0 en Next 15+**, o sea que hoy no se
   cachea nada del lado del cliente. Contrapartida real: durante esos
   segundos se ven cifras de hace un momento, y esto es contabilidad — si se
   pone, un valor chico (10-15 s), no 30.
5. **Corregido el 28-sep — el punto original conflaba dos cosas distintas.**
   Lo que decía acá ("dejar de repetir `getUser()`/`tiene_rol` entre
   `proxy.ts` y el layout de `[orgId]`... con `cache()` de React") mezclaba
   dos repeticiones que no se resuelven igual:
   - **`proxy.ts` ↔ el primer layout de cada módulo** (2 viajes: `getUser()`
     + `tiene_rol`/`edificios_del_vigilante`). `cache()` de React memoiza
     dentro del árbol de render de Server Components de **una** petición;
     `proxy.ts` corre **antes**, como Edge Middleware, en un runtime aparte
     — no hay ningún árbol de render compartido con el que memoizar. `cache()`
     **no puede** resolver esta repetición. Sigue existiendo a propósito, sin
     tocar (toca autenticación → se aprueba aparte si se quiere atacar de
     otra forma, p. ej. pasando el resultado del proxy al layout por header).
   - **Un layout ↔ una page, dentro del mismo árbol de render** (`edificios`,
     `mis_unidades`, y `getUser()`/`mis_unidades()` repetidos entre
     `[unidadId]/layout.tsx` y `recibo`/`reportar`/`visitas`). Esto **sí** es
     exactamente el caso que `cache()` resuelve, porque layout y page
     renderizan en la misma petición. **Aprobado y hecho el 28-sep** — ver
     "Hecho el 28-sep" más abajo.
6. **`getClaims()` en `proxy.ts`** — impacto alto en frecuencia (es el viaje
   que se paga en **cada** clic). **Aprobada y aplicada el 28-sep**, una vez
   confirmadas las claves ECC en las dos bases. El análisis de seguridad que
   traía este punto ("se pierde la revocación inmediata") estaba mal
   encuadrado y quedó corregido en "Hecho el 28-sep · `getClaims()` en el
   proxy", más abajo — junto con la matriz de pruebas.

### Hecho el 28-sep — puntos 1 y 3

`proxy.ts`, `experimental.staleTimes` y `getClaims()` **no se tocaron**, como
se pidió. Todo lo de abajo es de render (`loading.tsx`, `Promise.all`,
`cache()` de React) — nada de autenticación ni autorización cambió de forma
ni de orden, solo de dónde sale cada dato.

**`loading.tsx` (punto 1), con los componentes del sistema de diseño** — las
tres del mínimo aprobado, más dos elegidas dentro de Admin:

- `admin/[orgId]/[edificioId]/loading.tsx`, `mi/[unidadId]/loading.tsx` y
  `garita/[edificioId]/loading.tsx` — las tres aprobadas. Las tres renderizan
  `<Cargando />` (`components/ui/Cargando.tsx`, ya existía, portado de
  `Cargando()` en `app.html`) sin envoltorio propio: en Admin cae dentro de
  `.admin-relleno`, que ya trae su padding; en Residente y Garita reemplaza
  pantalla completa mientras el layout con el "chrome" (encabezado, tarjeta
  de saldo o el directorio de la garita) todavía no resolvió sus datos —
  correcto, porque en esos dos módulos el chrome depende de qué unidad/garita
  es, a diferencia de Admin donde el lateral vive en el layout de `[orgId]`,
  un nivel por encima, y queda montado sin remontarse.
- **Elegidas además, dentro de Admin: `pagos/loading.tsx` y
  `cortes/loading.tsx`.** Motivo, con datos del diagnóstico de arriba: de las
  9 secciones de Admin, son las **únicas dos** que hacen un viaje de red
  extra, en serie, más allá de la única tanda paralela que ya usa el resto
  (verificado leyendo cada `page.tsx`, no a ojo). En `pagos/page.tsx` el
  extra es real y no un descuido — `pagos`/`comprobantes` se filtran por
  `.in("unidad_id", ids)`, y `ids` sale de traer `unidades` primero, una
  dependencia de datos genuina. En `cortes/page.tsx` el extra es
  `tasaDelDia(supabase)` después de su `Promise.all`, y **ese no es una
  dependencia real** — no toca los datos del `Promise.all` de al lado — así
  que queda anotado como el candidato más claro para la próxima ronda de
  paralelización (no se tocó ahora: no estaba en el alcance aprobado de esta
  sesión). El resto de las secciones (`inicio`, `propietarios`,
  `propietarios/[unidadId]`, `cobros`, `mes`, `estadisticas`, `ajustes`,
  `accesos`) ya resuelve todo en una sola tanda paralela, así que agregarles
  una frontera propia no habría cambiado nada — la de `[edificioId]/` que ya
  cubre a todas por herencia alcanza igual.

**Paralelizar (punto 3), en los tres archivos aprobados:**

- **`[orgId]/layout.tsx`** — `organizaciones` + `edificios` + `tasa_atrasada`
  pasaron de 3 en serie a un `Promise.all`. El gate de acceso
  (`getUser()` → `tiene_rol()`) se dejó **fuera** de la tanda y sigue en
  serie, antes que las tres: no se buscó ganar velocidad a costa de pedir
  datos de la organización antes de confirmar que el usuario puede verlos.
- **`[edificioId]/layout.tsx`** — la segunda consulta (¿el edificio es de
  esta organización?) dejó de ser una consulta propia y ahora lee de la lista
  de `edificios` que ya trajo `[orgId]/layout.tsx` (ver `cache()` abajo): no
  quedó un `Promise.all` de dos viajes reales, quedó **un viaje menos**,
  porque el segundo ya está resuelto cuando este layout lo pide.
  `edificios_visibles()` (la autorización real, RLS-aware) se dejó intacta,
  sin reordenar ni tocar.
- **`recibo/page.tsx`** — `from("recibos")` + `tasaDelDia` pasaron a
  `Promise.all`; `mis_unidades()` dejó de pedirse de nuevo (ver `cache()`
  abajo). **Efecto secundario aceptado, anotado a propósito:** si
  `from("recibos")` falla, ahora `tasaDelDia` ya se disparó igual (antes no
  llegaba a pedirse) — un viaje de más solo en el camino de error, que no
  cambia el resultado que ve la persona (`Recibo` recibe el mismo
  `falla={error.message}` de antes, la tasa simplemente no se usa en esa
  rama). Mismo criterio que ya se aceptó para `[edificioId]/layout.tsx`.

**`cache()` de React, para lo que se repetía entre layout y page dentro del
mismo árbol de render** (no con `proxy.ts` — ver el punto 5 corregido más
arriba). Tres archivos nuevos:

- **`lib/supabase/cache.ts`** → `usuarioActual()`, `getUser()` memoizado.
- **`lib/residente/datos.ts`** → `misUnidadesSesion()`, `mis_unidades()`
  memoizado.
- **`lib/admin/edificios-organizacion.ts`** → `edificiosDeOrganizacion(orgId)`,
  la lista de `edificios` de una organización memoizada — con
  `tolerancia_alicuota` sumada al `select` de `[orgId]/layout.tsx` (antes
  `id,nombre,direccion`) para que también sirva al chequeo de
  `[edificioId]/layout.tsx` y a la tolerancia que pedía `inicio/page.tsx` por
  su cuenta. Es la única de las tres consultas de "edificios" del diagnóstico
  original que de verdad se pudo unificar: `ajustes` (`*`), `cortes`/
  `estadisticas` (`nombre,rif`), `accesos` (`id,nombre`) y
  `propietarios/[unidadId]` (`id,nombre,rif,direccion`) piden columnas
  distintas para necesidades distintas de cada sección — no son duplicados
  del layout, así que no se tocaron.
- **`lib/admin/acceso.ts`** → `tieneRolOrganizacion(orgId, roles)`, `tiene_rol()`
  memoizado. Hoy no ahorra ningún viaje real (`[orgId]/layout.tsx` es el
  único punto de Admin que lo llama dentro de ese árbol) — queda listo para
  el día que una sección de Admin necesite revalidar el rol por su cuenta,
  igual que ya hacen `usuarioActual`/`misUnidadesSesion`/
  `edificiosDeOrganizacion`.

Consumido en: `[orgId]/layout.tsx` y `[edificioId]/layout.tsx` (Admin);
`inicio/page.tsx` (Admin, solo `edificiosDeOrganizacion`); `[unidadId]/layout.tsx`,
`recibo/page.tsx`, `reportar/page.tsx` y `visitas/page.tsx` (Residente) — estas
dos últimas no estaban en el alcance aprobado de "paralelizar" (ese era solo
`recibo/page.tsx`), pero sí en el de "deduplicar con `cache()` lo que se
repite entre layout y page": `reportar/page.tsx` y `visitas/page.tsx` volvían
a llamar a `getUser()`/`mis_unidades()` cada uno por su cuenta, exactamente el
mismo patrón que `recibo/page.tsx`, así que se corrigieron los cuatro con la
misma pieza.

**Verificado, no solo asumido, antes de tocar cada archivo:** ninguna
consulta cambió de columnas seleccionadas salvo la de `edificios` (aditivo,
un campo más); ningún `if (!user)`/`if (error)`/`notFound()`/`redirect()`
se movió de orden respecto al resto de sus propias comprobaciones ni se
sacó; `edificios_visibles()` y la comprobación de rol siguen siendo el
mismo RPC, llamado con los mismos argumentos. `npx tsc --noEmit`, `npm run
lint` y `npm run build` quedaron verdes después de cada bloque de cambios.

### Hecho el 28-sep · `getClaims()` en el proxy (propuesta 6, aprobada)

Aprobado por Nicolás con el dato que faltaba: **las dos bases tienen ECC
(P-256) como clave de firma actual**, con la HS256 legacy como anterior
(verificado en el dashboard). Sin eso el cambio no habría servido de nada —
con HS256 `getClaims()` cae a `getUser()` por dentro, en silencio.

**Alcance, tal como se pidió:** solo `proxy.ts`. Los layouts y pages siguen
con `getUser()` (vía `usuarioActual()`), las RPC de autorización
(`tiene_rol`, `es_operador`, `edificios_del_vigilante`) no se tocaron, y no
se tocó nada del proyecto de Supabase ni se revocó nada.

#### Corrección al análisis de seguridad de más arriba

El apartado "¿Se puede usar `getClaims()`?" decía que lo que se pierde es "la
revocación inmediata". **Eso estaba mal encuadrado, y lo señaló Nicolás:**
PostgREST valida el JWT localmente (firma + `exp`) y no consulta revocación,
así que el token de una sesión revocada **ya hoy** sirve para leer y escribir
datos hasta su `exp`, con o sin este cambio. El `getUser()` del proxy nunca
fue lo que protegía los datos — protegía la navegación.

Qué **no** cambia:

- **Falsificación:** `getClaims()` verifica la firma con la clave pública. Un
  token manipulado se rechaza igual. Es lo contrario de `getSession()`, que
  decodifica sin verificar — esa línea no se cruza.
- **`exp`:** `getClaims()` lo valida (`validateExp`) y rechaza vencidos.
- **Autorización:** las tres RPC siguen corriendo contra Postgres como ese
  mismo JWT. Ya operaban sobre la base de "confiable hasta `exp`".
- **La ventana de revocación que vale para datos:** acotada por `exp` + el
  fallo del refresh. No se movió.
- **El acceso efectivo de una sesión revocada y no vencida:** tampoco cambia,
  porque **los cuatro módulos tienen un `getUser()` fresco en su layout o
  page** — `/admin` y `/admin/[orgId]`, `/mi` y `/mi/[unidadId]`, `/operador`,
  `/garita` y `/garita/[edificioId]` (verificados uno por uno). La rebota el
  layout en vez del proxy.

Lo único que cambia de verdad: **qué capa** frena una sesión revocada, no
**si** la frenan. Y como consecuencia, en algún caso el destino del redirect
puede diferir (lo frena el layout, no el proxy) — eso es UX, no seguridad, y
está en la matriz de pruebas.

#### Cómo queda garantizado el refresco de sesión

Era la pregunta con más filo, porque refrescar la sesión es el trabajo #1 del
proxy. **El refresco no lo hace ninguno de los dos métodos: lo hace el paso
previo de cargar la sesión, que `getUser()` y `getClaims()` comparten.** La
cadena quedó escrita en el comentario de `proxy.ts`, con las líneas exactas de
las librerías instaladas:

1. `getClaims()` **sin argumento** llama a `getSession()`
   (`GoTrueClient.js:5509-5516`). Por eso no se le pasa el token a mano: eso
   sería justo lo que saltearía el refresco.
2. `getSession()` → `__loadSession()` renueva si el token venció o está dentro
   del margen (`_callRefreshToken`, 2537-2565) y guarda la sesión nueva (4265).
3. Guardarla emite `TOKEN_REFRESHED`; `@supabase/ssr` engancha ese evento y
   vuelca las cookies con `applyServerStorage`
   (`createServerClient.js:49-66`).
4. Eso llama al `setAll` de `proxy.ts:51-57`, que reconstruye `response` y le
   escribe las cookies.
5. `return response` (`proxy.ts:190`) devuelve esa respuesta reconstruida.

**Detalle preexistente encontrado acá y corregido después, en el mismo día
(aprobado aparte):** en los caminos de `redirect`, el proxy devolvía un
`NextResponse.redirect(url)` nuevo que **no** arrastraba las cookies
refrescadas de `response`. Ver "Hecho el 28-sep · los redirect del proxy
conservan las cookies" más abajo.

#### Qué se ahorra

Por request, con la función tibia: **un viaje de red menos, el más frecuente
de todos** (se pagaba en cada clic, ver la tabla del diagnóstico). Token
vigente → 0 llamadas de auth (el JWKS vive en un global de módulo con TTL de
10 min, compartido por todos los clientes del mismo proceso). Token vencido →
1 (el refresh), donde antes eran 2 (refresh + `getUser()`). En un arranque
frío de isolate, la primera petición paga un `fetch` del JWKS en lugar del
`getUser()`: ahí es empate, no pérdida.

#### Falla cerrado, con un detalle del tipo de retorno

`getClaims()` devuelve una **unión de tres formas**, no dos: con claims, con
error, y **sin ninguno de los dos** cuando simplemente no hay sesión
(`GoTrueClient.d.ts:2569-2581`, y el `return this._returnResult({ data: null,
error })` de `GoTrueClient.js:5512` cuando `getSession()` no trae sesión ni
error). Por eso mirar solo `error` **no alcanzaría** — la comprobación es
`!errorClaims && typeof sub === "string" && sub.length > 0`, que es
exactamente lo que pidió Nicolás ("si devuelve error, no trae claims o no
trae `sub`, se trata como sin sesión").

### Hecho el 28-sep · los redirect del proxy conservan las cookies

Salió de la nota de arriba, y Nicolás lo aprobó como cambio aparte. Es un bug
**preexistente**, no algo que introdujera `getClaims()`: estaba desde que el
proxy existe.

**El bug.** `NextResponse.redirect(url)` crea una respuesta nueva y vacía: no
hereda nada de la `response` que el proxy venía armando. Si en esa misma
petición el cliente de Supabase refrescó la sesión, las cookies nuevas
(access token + refresh token rotado) estaban en `response`, puestas por
`setAll` — y las cuatro ramas de redirect las tiraban a la basura.

**Por qué eso toca el reuso del refresh token.** Un refresco rota el refresh
token: el servidor emite uno nuevo y deja el anterior consumido. Si la
respuesta que llega al navegador no trae el nuevo, el navegador sigue con el
viejo y en la petición siguiente **presenta un token ya usado**. Dentro de la
ventana de reuso de Supabase eso se tolera (devuelve la misma sesión, para no
romper peticiones concurrentes), pero pasada la ventana un refresh token
reusado es indistinguible de un token robado y puede invalidar toda la familia
de sesiones: al usuario se le cierra la sesión sin motivo aparente. Copiando
las cookies a la redirección, navegador y servidor siempre coinciden en cuál
es el refresh token vigente, y el token consumido no se vuelve a presentar.

**Alcanza también al caso inverso**, que es el que se nota como "no me deja
salir": cuando la sesión se desarma, `applyServerStorage` manda a `setAll` las
cookies de **borrado** (`value: ""`, `maxAge: 0`) — verificado en
`@supabase/ssr` `cookies.js:455-490`. Antes también se perdían al redirigir, y
el navegador se quedaba con cookies inválidas que reintentaba en cada
petición.

**Cómo quedó.** Una sola función auxiliar, `redirigirConCookies(url, response)`
(`proxy.ts:40-49`), usada en las **cuatro** ramas de redirect. No queda ningún
`NextResponse.redirect()` suelto en el archivo fuera de esa función. **No
cambió a dónde redirige ninguna rama ni la lógica de ningún gate** — solo se
reemplazó la construcción de la respuesta.

Copia la cookie **entera**, no una lista de campos:

```ts
for (const cookie of response.cookies.getAll()) {
  redireccion.cookies.set(cookie);
}
```

Esto es a propósito y no es lo mismo que enumerar `path`/`maxAge`/`httpOnly`/
`sameSite`/`secure` a mano. Verificado en la implementación de Next
(`node_modules/next/dist/compiled/@edge-runtime/cookies/index.js`): `getAll()`
devuelve los objetos tal como los guardó `set()` en su `Map` interno
(línea 279 — **no** los reparsea de la cabecera `Set-Cookie`, así que no hay
pérdida por round-trip), y `set()` acepta ese mismo objeto completo como único
argumento (línea 293). Enumerando campos a mano se podrían olvidar `domain`,
`expires`, `priority` o `partitioned`; pasando el objeto, no.

**Un detalle que conviene saber, sin cambio de comportamiento:** cuando hay
borrado de cookies con `domain`, `applyServerStorage` manda dos entradas con
el mismo nombre (una host-only, sin `domain`, y otra con él). `response.cookies`
es un `Map` por nombre, así que la segunda pisa a la primera — eso ya pasaba
antes de este cambio, al escribir en `response`. La copia reproduce
exactamente lo que `response` hubiera enviado, que es lo que se pidió; no
intenta "mejorarlo".

#### Matriz de pruebas en el navegador

Lo que hay que ejercer a mano, con las cuatro cuentas de prueba. Ninguna de
estas pruebas escribe en la base salvo donde se aclara.

| # | Caso | Esperado |
|---|---|---|
| 1 | Sin sesión → `/admin`, `/mi`, `/operador`, `/garita` (las cuatro) | `/entrar?volver=…` con el `volver` correcto en cada una |
| 2 | `admin.prueba` entra y navega Inicio → Propietarios → Cobros → Cierre → Pagos → Cortes → Accesos → Ajustes | Todas 200, sin rebotes a `/` ni a `/entrar` |
| 3 | `admin.prueba` en `/admin/<Baja>/<Torre Ida>/inicio`, **F5** | Carga igual, sesión intacta |
| 4 | `admin.prueba` → un `orgId` ajeno y un `orgId` malformado | Las dos a `/` (fail-closed del `tiene_rol`, sin cambios) |
| 5 | `residente.prueba` → `/mi`, cambiar de unidad con el selector, las 4 pestañas | Todas 200; `/mi/no-es-uuid` → 404 limpio |
| 6 | `residente.prueba` escribiendo `/admin` a mano | "Nueva administradora" sola, sin organizaciones listadas |
| 7 | `vigilante.prueba` → `/garita`, las 4 vistas, un `edificioId` ajeno y uno malformado | Las 4 vistas 200; los dos últimos a `/` |
| 8 | `operador.prueba` → `/operador`; y `residente.prueba` → `/operador` | Entra / rebota a `/` (fail-closed del `es_operador`) |
| 9 | **El refresco, que es el punto delicado.** Dejar una pestaña abierta en `/admin/…` más de una hora (o el `exp` que tenga el proyecto) sin tocarla, y después navegar a otra sección | Navega normal, sin pasar por `/entrar`: el proxy refrescó el token y escribió las cookies |
| 10 | Igual que el 9 pero con **F5** en vez de navegar | Misma cosa: carga sin volver a pedir clave |
| 11 | Cerrar sesión ("Salir") y después tocar Atrás en el navegador | No entra: rebota a `/entrar` |
| 12 | Cerrar sesión en una pestaña y, en otra pestaña ya abierta en `/admin/…`, navegar a otra sección | Rebota a `/entrar` o a `/` — **puede que lo frene el layout en vez del proxy**, que es el cambio de capa esperado. Lo que importa: que **no** muestre datos |
| 13 | En dos navegadores distintos, `admin.prueba` en uno y `residente.prueba` en el otro, a la vez | Cada uno ve lo suyo; ninguna sesión se filtra a la otra |
| 14 | Recarga en tema oscuro en `/admin`, `/mi` y `/garita` | Sin parpadeo ni avisos de hidratación (la prueba de la Fase 2, que sigue valiendo) |
| 15 | Una escritura cualquiera ya validada, para confirmar que la sesión sirve para escribir y no solo para navegar (p. ej. una nota de bitácora en Garita con `vigilante.prueba`) | Se registra igual que antes. **Esta sí escribe en la base** |
| 16 | **El redirect que refresca.** Dejar vencer el token con una pestaña abierta (como el 9) y entonces pedir una ruta que **rebota**: con `residente.prueba`, escribir a mano `/operador`. Mirar en DevTools → Network la respuesta 307 | El 307 trae `Set-Cookie` con los tokens nuevos, y la sesión sigue viva después del rebote (seguir navegando en `/mi` sin volver a entrar) |
| 17 | Igual que el 16 pero con `admin.prueba` y un `orgId` ajeno (rebota por `tiene_rol`), y con `vigilante.prueba` y un `edificioId` ajeno (rebota por `edificios_del_vigilante`) | Mismo resultado: rebota a `/`, con `Set-Cookie`, y la sesión sigue viva |
| 18 | Repetir el 16 **dos o tres veces seguidas**, dejando vencer el token cada vez | No se cierra la sesión sola en ningún momento (es el síntoma del reuso de refresh token que este arreglo evita) |
| 19 | "Salir" y después pedir una ruta protegida, mirando las cookies en DevTools → Application | Las cookies de sesión quedan borradas, no inválidas-pero-presentes; y el redirect a `/entrar` trae el `Set-Cookie` de borrado |

Los casos **9, 10 y 12 son los específicos de `getClaims()`**; los **16 al 19,
los específicos del arreglo de cookies en los redirect** (el 16 y el 17 son el
corazón: antes de este cambio, ese 307 salía **sin** `Set-Cookie`). El resto es
regresión de los gates que ya estaban validados y que ahora dependen de
`haySesion` en vez de `user`.

Nota práctica para los casos 9, 10, 16, 17 y 18: en vez de esperar la hora real
del `exp`, se puede bajar temporalmente la vida del access token en Supabase →
Authentication → Sessions, o borrar a mano la cookie del access token dejando
la del refresh token. Lo segundo no toca configuración de la base y es
reversible cerrando sesión.

---

## "Salir" da HTTP 405 en producción — CORREGIDO el 28-sep

Gustavo/Nicolás lo vieron en `vecitap-app.vercel.app`, desde Admin con
`admin.prueba`: al tocar **Salir** la pantalla queda en `HTTP ERROR 405` y la
consola muestra
`POST https://vecitap-app.vercel.app/ … 405 (Method Not Allowed)`.

**La hipótesis de Nicolás es correcta:** un redirect **307** después de un POST
hace que el navegador **repita el POST** contra el destino, y `/` es una página
que solo atiende GET.

### El flujo completo de Salir

| Paso | Dónde | Qué pasa |
|---|---|---|
| 1 | `components/admin/MarcoAdmin.tsx:195` | `<form action="/api/auth/salir" method="post">` con un `<button type="submit">`. **No es Server Action ni `signOut()` en el cliente**: es un POST de formulario HTML, a propósito (funciona sin JavaScript — ver el comentario de `MarcoGarita.tsx:19`, el criterio es de la tableta vieja de la garita) |
| 2 | `app/api/auth/salir/route.ts:4` | Route Handler `POST`. Corre `supabase.auth.signOut()` (línea 6) |
| 3 | `app/api/auth/salir/route.ts:7` | `return NextResponse.redirect(new URL("/", request.url))` — **sin status explícito** |
| 4 | Next | `NextResponse.redirect()` **usa 307 por omisión** (verificado en `next/dist/esm/server/web/spec-extension/response.js:93`: `?? 307`) |
| 5 | Navegador | 307 = "repetí la petición igual, con el mismo método" → **vuelve a hacer POST, ahora contra `/`** |
| 6 | Next | `/` es `app/(marketing)/page.tsx`, una página: no tiene handler de POST → **405** |

Los cuatro módulos usan el **mismo** formulario, así que **no es específico de
Admin**: `MarcoAdmin.tsx:195` (Admin), `EncabezadoResidente.tsx:74` (Residente),
`EncabezadoOperador.tsx:47` (Operador) y `MarcoGarita.tsx:57` (Garita) postean
todos a `/api/auth/salir`. **Confirmado por Nicolás:** pasa igual al salir desde
`/mi` con `residente.prueba`. Eso descarta cualquier causa propia de Admin (el
formulario del lateral, el layout de `[orgId]`, el gate de `tiene_rol`) y deja
al Route Handler compartido como único punto de falla — con la consecuencia
útil de que **una sola línea arregla los cuatro módulos a la vez**.

### ¿De dónde sale el 307? ¿Es regresión de hoy?

**Sale del Route Handler, no de `redirigirConCookies()`. Y no es regresión: es
un bug latente desde la Fase 3.**

- `/api/auth/salir` **no está en `RUTAS_PROTEGIDAS`** (`proxy.ts:7`, que es
  `["/admin", "/mi", "/operador", "/garita"]`), así que el proxy lo deja pasar
  sin redirigir: `redirigirConCookies()` nunca se ejecuta en este flujo. El
  POST de rebote contra `/` tampoco es ruta protegida, así que tampoco.
- `app/api/auth/salir/route.ts` no se tocó hoy (`git status` limpio para ese
  archivo) y su único commit es `bfb85eb`, "Fase 3 - 2do commit: Auditoría".
- Por qué no había aparecido antes: **nadie había ejercido Salir**. No está en
  ninguna de las listas de casos validados, y la corrida de Playwright del
  bloque 0 fue explícitamente de solo lectura, sin formularios que escriban.
  El botón existe desde la Fase 3 y arrastra el bug desde entonces.

### ¿Quedó cerrada la sesión? Sí — CONFIRMADO

**Confirmado por Nicolás:** después de Salir, `/admin` redirige a `/entrar`. O
sea que el 405 pasa *después* de que la sesión ya se cerró: es una pantalla de
error sobre una acción que igual funcionó. **Severidad: UX, no seguridad.**

Coincide con el mecanismo: en un Route Handler, Next **mezcla las cookies
escritas vía `cookies()` en la respuesta que devuelve el handler, conservando
su status** (verificado en
`next/dist/server/route-modules/app-route/module.js:521-529`, con el comentario
"It's possible cookies were set in the handler, so we need to merge the
modified cookies and the returned response here"). El `signOut()` del paso 2
borra las cookies por ese camino, así que el 307 del paso 3 ya sale con el
`Set-Cookie` de borrado.

**Lo que este dato descarta**, y por eso importaba preguntarlo: que el borrado
de cookies se estuviera perdiendo en el redirect. Ese habría sido un bug
distinto —de la misma familia que el de `redirigirConCookies()` en `proxy.ts`,
arreglado hoy— y habría necesitado otra corrección (escribir las cookies sobre
la respuesta a mano). No es el caso: el único defecto es el status code.

De paso, que `/admin` rebote a `/entrar` después de salir **ejercita el caso 11
de la matriz** de `getClaims()`: el proxy detecta correctamente "no hay sesión"
con la verificación local.

### Por qué el 26-sep "funcionaba": dev no da 405, producción sí

Nicolás preguntó si el flujo de Salir había cambiado desde el 26-sep, cuando en
la validación de Operador llevaba a `/` sin error. **No cambió nada.** Lo
verificado con `git log`:

- `app/api/auth/salir/route.ts` tiene **un solo commit**, `bfb85eb` del 20-sep
  ("Fase 3 - 2do commit: Auditoría"). Nunca se tocó.
- `components/operador/EncabezadoOperador.tsx` tiene **un solo commit**,
  `99f9926` del 25-sep ("Fase 4 - Operador (no validado)"), y ya traía el
  mismo `<form action="/api/auth/salir" method="post">` — comprobado con
  `git show 99f9926:…`. O sea que el 26-sep el código era **idéntico** al de
  hoy.

Entonces la diferencia no está en el código sino en **dónde se probó**, y es
medible:

| Servidor | `GET /` | `POST /` |
|---|---|---|
| `npm run dev` | 200 | **200** |
| `next start` (build de producción) | 200 | **405** |

Medido en esta sesión contra los dos servidores locales. **En dev, el
re-POST que dispara el 307 renderiza la página como si nada**; solo el build de
producción devuelve 405. La validación del 26-sep fue contra `npm run dev`, así
que el bug estaba ahí y era **invisible**. Apareció ahora porque es la primera
vez que alguien toca Salir en un build de producción.

**Lección de proceso, de la misma familia que la de la Fase 2** ("probar también
recargando con la preferencia ya guardada"): **hay una clase de bug que dev no
muestra.** Todo lo que dependa del método HTTP o del status de una respuesta
—POST a una página, 405, redirects que preservan método— hay que probarlo
contra `next start` o contra el Preview de Vercel, no contra `npm run dev`. Para
Salir en concreto: probarlo en los cuatro módulos sobre un build de producción.

### La corrección aplicada

**Una línea, un archivo, y no toca `proxy.ts`** (`app/api/auth/salir/route.ts`):

```ts
return NextResponse.redirect(new URL("/", request.url), 303);
```

`303 See Other` es exactamente el status para el patrón POST → redirect → GET:
le dice al navegador que siga el `Location` **con GET**, en vez de repetir el
POST. Verificado que Next lo admite (`303` está en el `REDIRECTS` de
`response.js:7-13`) y que el merge de cookies del párrafo anterior conserva el
status que devuelve el handler, así que el borrado de sesión sigue viajando
igual.

No `302`: en la práctica los navegadores también cambian a GET con 302, pero la
especificación dice que el método no debería cambiar. `303` declara la
intención sin ambigüedad.

**Por qué no hay que tocar `proxy.ts`**, como marcó Nicolás: sus cuatro
redirects son para **navegaciones GET**, donde 307 es lo correcto —preservar el
método es justo lo que se quiere al rebotar un GET— y además ninguno participa
de este flujo.

**Verificado end-to-end sobre un build de producción local** (`next start`, no
`npm run dev`, que es justo lo que no lo hubiera mostrado):

```
POST /api/auth/salir  →  303 See Other, Location: /
                      →  GET /  →  200 OK
```

Antes del cambio esa cadena era `307 → POST / → 405`. Se probó sin cookies, así
que el `signOut()` no tenía ninguna sesión que revocar y no hubo tráfico contra
la base.

Un detalle por si alguien repite la prueba: `curl -L -X POST` **no** sirve, da
un falso negativo. `-X` fuerza el método en toda la cadena de redirecciones y
tapa justamente lo que se quiere medir. Hay que usar `curl -L --data ""`, que
es un POST de verdad y deja que curl cambie a GET en el 303, como hace un
navegador.

**Todavía falta probarlo en el navegador**, en los cuatro módulos y sobre un
build de producción (Preview de Vercel): que Salir lleve a `/` sin error desde
Admin, `/mi`, `/operador` y `/garita`.

### Anotado, sin arreglar: el 307 del proxy frente a un POST

Hoy es teórico y por eso no se propone cambiarlo, pero conviene que quede
escrito. Si el proxy alguna vez rebotara un **POST** a una ruta protegida (una
sesión que vence justo cuando alguien envía un formulario), el 307 de
`redirigirConCookies()` repetiría ese POST contra `/entrar` y daría el mismo
405. Hoy no puede pasar: **no hay ninguna Server Action en el repo**
(verificado: cero `"use server"`) y el único POST de formulario es el de Salir,
que va a una ruta no protegida. Si más adelante se adoptan Server Actions,
`redirigirConCookies()` debería recibir el status y usar `303` cuando el método
no sea GET.

---

## Zona horaria: el día local vs. el día UTC — auditoría del 28-sep

**Bug confirmado en la validación de Garita:** una nota registrada a las 22:59
hora de Venezuela del 28-sep (02:59 UTC del 29) no aparece en la Bitácora del
28 — aparece en la del 29. Migración propuesta, **sin aplicar**:
`supabase/migrations/20260928140000_garita_bitacora_dia_local.sql` + su
rollback. Toca una función `SECURITY DEFINER` en la base compartida: la aplica
Nicolás, avisándole antes a Gustavo.

### La causa, y cuál de las dos expresiones es

`garita_bitacora` tiene **dos** lugares que dependen de la zona, y conviene no
confundirlos porque solo el segundo explica el caso reportado:

1. `v_f := coalesce(p_fecha, current_date)` — `current_date` es el día en la
   zona de la sesión. **No es la causa de este caso:** tanto
   `VistaBitacora.tsx` como `garita.html` mandan siempre `p_fecha`, así que
   ese default nunca se usa desde la app.
2. `b.creado_en >= v_f::timestamptz and b.creado_en < (v_f + 1)::timestamptz`
   — **esta sí.** Castear `date` → `timestamptz` interpreta la medianoche en
   la zona de la sesión (UTC en PostgREST). Pedir el 2026-09-28 abre la
   ventana `[28-sep 00:00 UTC, 29-sep 00:00 UTC)`, que en Venezuela es
   `[27-sep 20:00, 28-sep 20:00)`: el "día" del vigilante arrancaba a las 8 de
   la noche anterior y se cortaba a las 8 de la noche. **Cuatro horas de cada
   turno de noche caían en el día equivocado.**

La corrección arregla las dos.

### Auditoría: qué más decide un día, y a qué le afecta la zona

Hecha sobre `esquema_inicial.sql` como mapa. **Nivel de confianza:** el dump
es del 27-sep, pero para las tres funciones que Nicolás trajo hoy con
`pg_get_functiondef` (`garita_bitacora`, `garita_dentro`, `garita_vehiculos`)
se comparó y **coincide** — el arreglo del correo del vigilante de Gustavo ya
estaba en el dump. Eso sube la confianza en el mapa, pero coincidir en 3 de
~40 funciones no prueba que coincida en todas: la columna "releer" marca las
que hay que sacar de la base antes de tocarlas.

| Función / objeto | Criterio de fecha | ¿Le afecta la zona? | ¿Releer antes de tocar? |
|---|---|---|---|
| **`garita_bitacora`** | `current_date` + `v_f::timestamptz` (L1875, L1882-83) | **SÍ — bug confirmado.** Ventana corrida 4 h | **No hace falta:** es la versión de hoy, traída con `pg_get_functiondef` |
| `garita_dentro` | ninguno: filtra `estado = 'dentro'` | No. No mira fechas | Ya releída hoy |
| `garita_vehiculos` | ninguno: filtra por placa/código | No | Ya releída hoy |
| `libro_edificio` | `p.cerrado_en::date between p_desde and p_hasta` (L2526, L2531) | **SÍ, y es el de mayor consecuencia:** castea `timestamptz`→`date` con la zona de la sesión. Un mes cerrado después de las 20:00 se asienta en el libro con la fecha del día siguiente — y si cae el último día del mes, **en el mes siguiente** | **Sí**, antes de tocarla |
| `historial_unidad` | `p.cerrado_en::date` ×4 (L2392-2411) | **SÍ:** mismo cast. El estado de cuenta del residente puede mostrar la cuota con un día de más | **Sí** |
| `cerrar_periodo` | `current_date` al insertar ajustes (L428, L437) | **SÍ, leve:** la fecha del ajuste generado puede quedar un día adelante | **Sí** (es la que cierra el mes: revisión cuidadosa) |
| `generar_cobros_vencidos` | `s.proximo_cobro <= current_date` (L2300), `c.desde + s.dias_gracia < current_date` (L2324) | **SÍ, leve:** un cobro puede dispararse hasta 4 h antes de lo previsto. Corre por cron, no por clic | **Sí** |
| `generar_cobro_interno` | `coalesce(p_desde, …, current_date)` (L2260) | **SÍ, leve:** solo si no se manda `p_desde`. La app siempre lo manda | **Sí** |
| `cargar_tasa` / `completar_tasa` | `if p_fecha > current_date + 1` (L256, L677) | **No en la práctica:** es una guarda de "no muy futuro" con 1 día de margen, que absorbe el desfase | No, si no se toca |
| `tasa_atrasada` | `(current_date - t.fecha)::int` (L3770) | **SÍ, cosmético:** el contador de "atrasada N días" puede decir uno más después de las 20:00 | No urgente |
| `tasa_del_dia` | `p_fecha date DEFAULT CURRENT_DATE` (L3797) | **SÍ, leve:** mismo caso que arriba | No urgente |
| `traer_tasa_bcv` | `(… ::timestamptz at time zone 'America/Caracas')::date` (L3882-83) y `fecha >= current_date` (L3906) | **Parcial, y es el buen ejemplo:** la fecha que publica el BCV **ya** la convierte bien a Caracas. La guarda de la L3906 sigue en `current_date` | No urgente |
| `correo_recibo` | `r.nota_hasta < current_date` (L786) | **SÍ, cosmético:** una nota al pie puede dejar de mostrarse 4 h antes | No |
| `crear_cliente` / `fijar_cliente` | `current_date` como inicio de suscripción (L942, L1675) | **SÍ, leve:** fecha de alta un día adelante si se crea de noche | No |
| `crear_invitacion_visita`, `garita_validar`, `garita_entrada`, `garita_salida` | `now()` contra `timestamptz` (`desde`/`hasta`) | **NO, y está bien así.** Nunca reducen un instante a un día: comparan instantes contra instantes. El modelo de vigencia de invitaciones es correcto | No |
| Tablas: `pagos.fecha`, `ajustes.fecha`, `suscripciones.inicio`, `vinculos.desde` | `DEFAULT CURRENT_DATE` | **SÍ, leve:** solo cuando se inserta sin fecha explícita. Los formularios mandan fecha | No (cambiar un default toca DDL de tabla) |

**Del lado del cliente, el mismo patrón — CORREGIDO el 28-sep** (aprobado por
Nicolás; registrado como **caso 30** de `docs/casos-de-uso-mejorados.md`, desvío
mantenido por riesgo de datos):

| Dónde | Usaba | Efecto que tenía |
|---|---|---|
| `Pagos.tsx:65,199` | `hoyISO()` (**UTC**) | **Riesgo de datos:** después de las 20:00, el pago o la exoneración se guardaba en `pagos`/`ajustes` con la fecha de mañana |
| `FormularioReportarPago.tsx:50,158,279` | `hoyISO()` | Lo mismo, y además el `max` del input y la validación "no futura" **dejaban pasar el día siguiente** |
| `ConsolaOperador.tsx:111,123,326` | `hoyISO()` | Tasa cargada con fecha de mañana; nombre del CSV de cartera con el día equivocado; pastilla "vencido" hasta 4 h antes |
| `FichaCliente.tsx:52,114,147` | `hoyISO()` | Inicio de suscripción y fecha de pago de un cobro, un día adelante |
| `VistaBitacora.tsx:30,94,146` | `hoyLocalISO()` (zona **del navegador**) | Correcto en una tableta bien configurada; con la zona mal puesta le pedía a la base un día distinto |

**Lo aplicado:** `lib/formato.ts` — `hoyLocalISO()` quedó fijada a
`America/Caracas` con `Intl.DateTimeFormat`, y **`hoyISO()` (la de UTC) se
eliminó**, en vez de dejarla al lado invitando a elegir la equivocada. Los 11
puntos de la tabla pasaron a `hoyLocalISO()`. La zona vive en **una sola
constante** del cliente (`ZONA_VECITAP`), cuyo par del lado de la base son
`hoy_local()` / `inicio_dia_local()`.

Dos detalles de implementación que valen la pena:

- Se arma con `formatToParts` y no con `format()`, para no depender del patrón
  de fecha de ningún locale — el orden y los separadores los pone nuestro
  código, no ICU.
- Al no depender ya de dónde corre, `hoyLocalISO()` pasó a ser **segura en un
  Server Component** (antes no: servidor y navegador podían calcular días
  distintos y romper la hidratación). Hoy solo la usan Client Components, pero
  deja de ser una trampa.

**Comprobado en vivo**, y con la suerte de que se hizo dentro de la ventana
exacta del bug (23:38 del 28-sep en Venezuela, o sea 03:38 del 29 en UTC):

```
ahora (UTC)            2026-09-29T03:38:07Z
hoyISO() viejo (UTC)   2026-09-29   ← el bug
hoyLocalISO() nuevo    2026-09-28   ← correcto
```

Fuera de esa ventana de cuatro horas las tres versiones dan lo mismo, que es
justamente por qué el problema pasó desapercibido tanto tiempo: **el 83 % del
día el código equivocado da el resultado correcto.**

### La corrección propuesta, y la auxiliar

La migración crea dos funciones chicas y arregla `garita_bitacora`:

- **`hoy_local()`** → el día de hoy en `America/Caracas`, para reemplazar
  `current_date` cuando se quiere decir "hoy".
- **`inicio_dia_local(p_dia date)`** → el instante en que arranca ese día
  local, para armar la ventana `>= inicio_dia_local(d)` /
  `< inicio_dia_local(d + 1)` sin castear `date::timestamptz`.

**Por qué la auxiliar y no todo en línea** (Nicolás pidió evaluarlo): ya hay
un segundo consumidor planificado (el bloque 13, ver abajo), la auditoría de
arriba dejó más candidatos, y sobre todo `AT TIME ZONE` significa **dos cosas
distintas** según el tipo de la izquierda — `timestamptz AT TIME ZONE z` da un
`timestamp` local, `timestamp AT TIME ZONE z` da un instante absoluto. Ese es
el pie de banana real, y encerrarlo en una función evita que cada call site lo
reescriba. Además, el día que haya un cliente fuera de Venezuela hay un solo
lugar que cambiar.

**La simplificación que esto asume, dicha explícitamente:** zona única escrita
a mano. Correcto mientras todos los clientes estén en Venezuela (premisa
confirmada por Nicolás). El modelo correcto a largo plazo es una columna de
zona por organización o por edificio — **queda como decisión a revisar, no
como olvido**, y la auxiliar hace que esa migración futura sea más barata, no
más cara.

Se usa el **nombre** `America/Caracas`, no `-04:00`: Venezuela ya cambió de
offset una vez (−04:30 entre 2007 y 2016), así que el nombre sobrevive a un
cambio de política. Hay precedente en la propia base — `traer_tasa_bcv` ya lo
usa. Las dos auxiliares **no** son `SECURITY DEFINER` a propósito (no leen
ninguna tabla; `AGENTS.md` advierte no sumar `SECURITY DEFINER` sin
necesidad) y quedan `STABLE`, que alcanza: se evalúan una vez por consulta y
el `where` sigue pudiendo usar índice sobre `creado_en`.

### El lado del cliente queda coherente, con una salvedad

`hoyLocalISO()` (`lib/formato.ts:97-101`) calcula hoy en la zona **del
navegador**, y `VistaBitacora.tsx` **siempre** manda `p_fecha` explícito
(líneas 50 y 64), nunca deja que la base ponga el default. Con la corrección
aplicada:

- En una tableta configurada en hora de Venezuela, cliente y base coinciden:
  el selector abre en el día local y la base devuelve ese mismo día local. ✅
- **La salvedad:** si la tableta tiene mal la zona (riesgo real en un equipo
  barato de una garita), el cliente pediría otro día. La base ya no se
  equivoca, pero el cliente le pide el día equivocado. La solución sería fijar
  `hoyLocalISO()` a `America/Caracas` con `Intl.DateTimeFormat`, en vez de
  usar la zona del navegador.

**No se tocó `hoyLocalISO()` en esta sesión, a propósito:** fijarla a Caracas
es la misma decisión de producto que la zona única de la base (todos los
clientes en Venezuela), así que conviene decidirla junto con la migración y
que las dos puntas cambien a la vez. Hoy además replica exactamente lo que
hace `main`.

### `garita.html` de `main` tiene el mismo comportamiento

Sí, idéntico, y **el port es fiel** — el bug no lo introdujo la migración:

- `garita.html:242-245` define su propio `hoyISO()` con **la misma
  implementación** que nuestra `hoyLocalISO()` (`setMinutes(... -
  getTimezoneOffset())`), o sea la zona del navegador.
- `garita.html:860` lo usa como `value` del `<input type="date">` y
  `garita.html:866` manda `p_fecha: $("#fecha").value || hoyISO()` — siempre
  explícito, igual que el port.
- Llama a **la misma** `garita_bitacora` de la base, así que la ventana se
  calcula igual de mal.

Conclusión: el bug es de la función de la base, compartida por los dos. Al
aplicar la migración, **`main` queda arreglado de paso**, sin tocar el HTML.

### Segunda ronda (pendiente): las cinco funciones de la base

Decidido el 28-sep: **no se escribe la migración todavía.** Primero Nicolás
trae el SQL real de las cinco con `pg_get_functiondef`, y recién con ese CSV se
propone la corrección usando `hoy_local()` / `inicio_dia_local()`. Es el mismo
criterio que ya evitó dos errores (el de `edificios_visibles()` en la Sesión 1
de Admin y el de `p_unidad` en el bloque 11): no asumir la forma de una función
de la base sin haberla visto.

**La consulta, lista para copiar:**

```sql
select p.proname,
       pg_get_functiondef(p.oid) as definicion
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('libro_edificio',
                     'historial_unidad',
                     'cerrar_periodo',
                     'generar_cobros_vencidos',
                     'generar_cobro_interno')
 order by p.proname;
```

Qué se espera encontrar en cada una (del mapa del dump, a confirmar con el
CSV): `libro_edificio` y `historial_unidad` con `cerrado_en::date`;
`cerrar_periodo` con `current_date` al insertar ajustes;
`generar_cobros_vencidos` con dos comparaciones contra `current_date`;
`generar_cobro_interno` con `coalesce(p_desde, …, current_date)`.

**Orden de prioridad sugerido para cuando llegue el CSV:** `libro_edificio`
primero (es la única donde el desfase puede mover un cierre al **mes**
equivocado del libro contable), después `historial_unidad` (el estado de cuenta
del residente), y las tres restantes al final (son de magnitud "un día" y dos
de ellas corren por cron, no por clic).

### Los `DEFAULT CURRENT_DATE`: solo uno se usa de verdad

Auditado el 28-sep, revisando cada `insert`/`upsert` del cliente. La pregunta
era si la app manda siempre la fecha explícita o si el default de la columna
llega a dispararse:

| Columna | ¿La app manda la fecha? | Detalle |
|---|---|---|
| `pagos.fecha` | **Sí, siempre** | Admin `Pagos.tsx:162` (`fecha: f.fecha`, del formulario) y Residente `FormularioReportarPago.tsx:190`. El default no se dispara nunca desde la app |
| `ajustes.fecha` | **Sí, siempre** | `Pagos.tsx:199` (ahora `hoyLocalISO()`). Aparte, `cerrar_periodo` inserta ajustes con `current_date` **explícito** — eso es la función, no el default, y va en la segunda ronda |
| `suscripciones.inicio` | **Sí, siempre** | `FichaCliente.tsx:114` (`inicio: s.inicio \|\| hoyLocalISO()`). Aparte, `crear_cliente`/`fijar_cliente` lo ponen con `current_date` explícito |
| **`vinculos.desde`** | **NO — nunca.** El default es el único que se usa | Tres puntos insertan vínculos sin `desde`: `AltaUnidad.tsx:79`, `DatosUnidad.tsx:81` e `ImportarUnidades.tsx:97` |

**La severidad de `vinculos.desde` es baja, y conviene decirlo con precisión
para no inflarla:** el valor guardado puede quedar un día adelante si se da de
alta un propietario después de las 20:00, pero **nada en la app filtra por
`desde`**. `vigente()` (`lib/admin/personas.ts:8-10`) decide quién es el
propietario actual mirando **solo** `!v.hasta`, así que un `desde` futuro no
esconde a nadie. El único uso real de la columna es un `order by v.desde desc`
dentro de `destinatarios_de` (dump L1282), que podría reordenar dos vínculos
del mismo tipo creados la misma noche. O sea: es un dato de registro
ligeramente corrido, no un cambio de comportamiento.

Por eso **no** se propone tocar el `DEFAULT` de la columna en esta ronda:
cambiarlo es DDL de tabla sobre la base compartida por un beneficio cosmético.
Las dos formas de arreglarlo cuando se decida, para tenerlas escritas:
mandar `desde: hoyLocalISO()` desde los tres puntos del cliente (sin tocar la
base), o `ALTER TABLE vinculos ALTER COLUMN desde SET DEFAULT hoy_local()`
(una sola vez, y cubre cualquier insert futuro que se olvide de mandarla). La
segunda es más robusta y depende de que la migración de las auxiliares ya esté
aplicada.

### Bloque 13: tiene que usar el mismo criterio de día local

Anotado también en la sección del bloque 13: cuando arranque la vista de
Garita de solo lectura dentro de Admin (visitas del día + bitácora, selector
limitado a 30 días), **tiene que decidir el día con `hoy_local()` /
`inicio_dia_local()`**, no con `current_date` ni casteando
`date::timestamptz`. Si no, Admin y la garita van a mostrar bitácoras
distintas del mismo día, y el desfase de 4 h reaparece en la pantalla nueva.
Vale para las dos piezas: la bitácora y la función nueva de "visitas del día"
que ese bloque va a necesitar (ver la investigación previa del bloque 13:
`garita_dentro` no sirve porque no tiene parámetro de fecha).

---

## Pendientes para fases futuras

### Fase 4 — al migrar Admin

- Unificar el formato de `pagos.documento_origen` (`V-12345678`). Admin es
  el único módulo que falta y que muestra/concilia pagos individuales
  (Operador no llega a ese detalle — ver nota en su sección de arriba);
  tiene que contemplar los formatos legacy que ya conviven en la tabla
  (`"V12345MIJO"`, `"24223950"`, sin prefijo, etc.) — no migrar esos datos
  previos, solo normalizar lo que escriban los formularios nuevos.
- La alícuota se muestra como "100,0000%" (cuatro decimales) en
  `TarjetaSaldo`. Confirmado (2026-09-26, inventario de Admin) que los dos
  HTML originales usan el mismo formato de cuatro decimales sin redondeo:
  `app.html` (líneas donde se muestra la alícuota de la unidad) y
  `residente.html:472,586,803` (`nf(4).format(...)`, el mismo `nf` que ya
  existe en `lib/formato.ts`). No es un redondeo que la migración de
  Residente introdujera por error — es fiel al original. Queda pendiente
  solo si se decide *cambiar* el formato (sigue sin ser una decisión
  tomada, ver `docs/inventario-admin.md`).
- Cómo se acepta una invitación en los HTML originales (`app.html`/
  `residente.html`): revisar y documentar como parte del inventario de
  Admin, para tener la base de comparación de la prueba funcional de la
  migración de membresías (casos 8, 9 y 10 de
  `docs/casos-de-uso-mejorados.md` — construida y aplicada estructuralmente,
  falta esa prueba funcional).

### Fase 5 — Endurecimiento multi-tenant y de escala

Auditoría completa de RLS ya realizada (antes de iniciar el desarrollo):
todas las tablas tienen RLS activo, las funciones de seguridad
(`puede_operar`, `tiene_rol`, `es_operador`, etc.) usan `SECURITY
DEFINER` con `search_path` fijo correctamente, los flujos sensibles
(registrar pagos) ya tienen protecciones adecuadas. Diseño evaluado como
sólido.

Pendiente puntual:
- Cambiar la política **`correos_malos_ver`** de `auth.uid() IS NOT
  NULL` a `es_operador()`, igual que ya tiene `correos_malos_borrar` —
  hoy es inconsistente que cualquier usuario logueado pueda ver esa tabla
  si solo el operador puede borrarla.
  **Migración escrita el 28-sep, sin aplicar** (la aplica Nicolás en las dos
  bases): `supabase/migrations/20260928130000_correos_malos_ver_solo_operador.sql`
  + su rollback en `supabase/rollbacks/`, los dos con su consulta de
  verificación sobre `pg_policies`. Verificado antes de escribirla que el
  cambio no rompe nada: las tres funciones que tocan la tabla
  (`encolar_recibos` y `resumen_correos` leen, `despachar_correos` escribe)
  son `SECURITY DEFINER`, así que no pasan por RLS, y del lado del cliente no
  hay ninguna consulta directa — `correos_malos` solo aparece en
  `types/supabase.ts` (grep sobre el código nuevo y los cuatro HTML de
  `main`). No se toca ningún `GRANT`: un `select` de quien no es operador
  devuelve 0 filas en silencio, igual que `operadores`/`secretos`/
  `tasa_pendiente`.
- Confirmar que ningún componente del frontend llame directo a
  `operadores`, `secretos` o `tasa_pendiente` vía `.from(...)` — están
  intencionalmente bloqueadas (RLS activo sin políticas) y solo deben
  tocarse por funciones de seguridad o desde el backend.
- El generador de tipos (`supabase gen types`) tampoco marca nullable las
  columnas de un `RETURNS TABLE` de una función — por eso
  `mis_unidades().saldo` aparece como `number` en `types/supabase.ts`
  cuando en realidad puede ser `null` (`saldo_visible()` lo devuelve así a
  propósito para inquilinos con `inquilino_ve='mes'`, ver Fase 4 arriba).
  Mismo problema de fondo que los estados sin enum (Fase 3): el tipo
  generado no es una garantía completa — hay que verificar contra la
  función real antes de confiar ciegamente en él.
- Revisar si los roles `anon` y `authenticated` tienen `EXECUTE` sobre
  `saldo_unidad` directamente. Esa función no es `SECURITY DEFINER`, no
  fija `search_path`, y no hace control de acceso propio — el gate real
  está en `saldo_visible()`, que es la que el frontend usa indirectamente
  vía `mis_unidades()`. El frontend no necesita (ni debería poder) llamar
  a `saldo_unidad` directamente.
- **Bug encontrado validando la escritura de Operador:**
  `traer_tasa_bcv()` hace `delete from tasa_pendiente` sin `WHERE`.
  Supabase lo rechaza cuando la función se invoca vía API ("DELETE
  requires a WHERE clause"), así que el botón "Traer ahora" del operador
  falla — el cron sí funciona porque corre con otro camino de ejecución
  que no pasa por ese mismo rechazo. Corrección: `where request_id =
  v_req`. Es una función `SECURITY DEFINER` — la misma categoría que
  `puede_operar`/`tiene_rol`/`es_operador` de más arriba — así que
  cualquier edición acá merece la misma revisión cuidadosa, no un cambio
  de una línea sin más.
- El aviso "La API respondió: …" que muestra "Traer ahora" cuando falla
  es confuso: ese mensaje sale del `error` que devuelve la propia base
  (el bug de arriba), no de una respuesta real de DolarAPI — vale la pena
  revisar el texto para que no le eche la culpa a un tercero que no tuvo
  nada que ver.

### Migración de esquema de `membresias` — adelantada de Fase 5 a Fase 4 (desvío deliberado)

**Desvío deliberado del plan, sujeto a revisión con el socio al terminar la
migración.** `membresias` tenía un índice único sobre `(org_id, usuario_id)`:
un usuario solo podía tener UNA membresía por organización — un propietario
con dos unidades en el mismo condominio, o alguien que además de vivir en su
unidad participa en la junta de condominio, no se podían representar. Esto
estaba anotado como "decisión de negocio pendiente" para la Fase 5, pero
bloqueaba una decisión necesaria antes de migrar Admin, así que se investigó
y se decidió ahora, adelantando a la Fase 4 lo que iba a ser una migración de
esquema de Fase 5.

Decisión tomada (2026-09-26): sí, una persona puede tener varias membresías
en la misma organización (dos unidades, o junta + residente, o administrador
+ residente). Investigación completa (auditoría de la restricción, de las 16
funciones que leen `membresias`, de `app.html` y del código migrado) y los 3
casos de comportamiento resultantes en `docs/casos-de-uso-mejorados.md`
(casos 8, 9 y 10):
- Caso 8 — nueva restricción única por persona + rol + alcance, en vez de
  por persona + organización.
- Caso 9 — `aceptar_invitacion` deja de sobrescribir una membresía existente
  en silencio; se elimina también la protección basada en una sola fila
  "actual" por organización (juicio de producto marcado explícitamente para
  que el socio lo confirme: un administrador que acepta ser residente de su
  misma organización ya no se bloquea).
- Caso 10 — `crear_invitacion`/`aceptar_invitacion` normalizan
  `unidad_id`/`edificio_id` según el rol antes de guardar (bug de datos
  encontrado en el camino: 2 membresías de residente tenían un edificio
  guardado de más).

**Estado: aplicada y verificada estructuralmente; prueba funcional del flujo
de invitaciones pendiente.** Aplicada en el SQL Editor de Supabase el
2026-09-26 (PostgreSQL 17.6). Verificado tras aplicar:
- Única restricción `UNIQUE` en `membresias`:
  `membresias_persona_rol_alcance_key`,
  `UNIQUE NULLS NOT DISTINCT (org_id, usuario_id, rol, unidad_id, edificio_id)`.
- Las 2 filas del PASO 1 (limpieza) quedaron con `edificio_id` en `NULL` y
  `unidad_id` intacto.
- `crear_invitacion` y `aceptar_invitacion` quedaron con la versión nueva.

Falta la prueba funcional del flujo real de invitaciones (invitar, aceptar,
reactivar una membresía dada de baja, rechazar un conflicto de relación) —
se hará al preparar la cuenta de administrador y la organización de prueba
de Admin.

Archivos:
- `supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql`
- `supabase/rollbacks/20260926120000_membresias_multiples_por_organizacion_rollback.sql`

**Pendiente de Fase 7 (CI/CD):** esta migración se aplicó a mano en el SQL
Editor, no vía `supabase db push`, así que no quedó registrada en el
historial de migraciones de Supabase (`supabase_migrations.schema_migrations`).
Si al llegar a la Fase 7 se adopta `supabase db push`/CLI como flujo de
migraciones, marcarla antes como aplicada con
`supabase migration repair --status applied 20260926120000` — si no, la CLI
va a intentar reaplicarla y va a chocar contra objetos que ya existen.

### Fase 5 — Registro de residentes (alcance, no de esta fase 5 todavía)

Decisión explícita durante la migración de Residente (Fase 4): el `signUp`
y la pantalla de aceptar invitación **no son parte de la migración** — los
HTML originales no tienen pantalla de registro (las cuentas se crean desde
el dashboard de Supabase), así que es funcionalidad nueva, no un port. El
modelo de registro todavía se está definiendo, y su lugar natural es esta
fase, junto con el rate limiting de formularios públicos que ya está en su
alcance.

El código ya existe pero quedó **deliberadamente sin punto de entrada**,
a la espera de esa definición:
- `app/(marketing)/entrar/FormularioEntrar.tsx` — tiene el modo "crear"
  (signUp) implementado; el botón que cambiaba a ese modo se quitó a
  propósito, así que hoy es código muerto (nunca se ejecuta) pero no se
  borró.
- `components/residente/Invitacion.tsx` — pantalla de aceptar invitación
  (RPC `aceptar_invitacion`), no referenciada desde ninguna ruta.
- `app/(residente)/mi/page.tsx` — el caso de "cuenta sin unidades" ya no
  renderiza `Invitacion`; muestra un mensaje estático ("contacte a su
  administración") en su lugar.

### Decisión de producto pendiente — Generar cobro (Operador)

Encontrado validando la escritura de Operador, no es un bug de la
migración sino un riesgo de diseño que ya tenía `operador.html`: "Generar
el cobro del período" avanza `proximo_cobro` un período por cada clic, y
"Anular" un cobro **no revierte** ese avance. Un doble clic accidental, o
generar y después anular un cobro por error, deja al cliente sin cobrar
un mes entero — la única forma de arreglarlo hoy es corregir
`proximo_cobro` a mano en la ficha. Evaluar agregar una confirmación
("¿generar el cobro de este período?") antes de ejecutar la acción.
Como es una decisión de producto (cambia el flujo, no corrige un error
de paridad con el original), queda para revisar con Nicolás antes de
tocar el botón — no forma parte de ninguna fase todavía.

### Pedidos de Gustavo para más adelante (04-oct)

Anotados, sin plan ni fecha. Ninguno es parte del bloque de mejoras para
la próxima carga del piloto.

1. **Que el residente corrija sus propios datos de contacto** (teléfono,
   correo, correo de respaldo) desde `/mi`. Hoy los cambia solo la
   administración, en la ficha de la unidad. Ojo al diseñarlo: los datos
   viven en `personas`, que es de la administración, mientras que el
   residente entra por su cuenta (`membresias`), y no hay un vínculo entre
   su cuenta y su persona. Hace falta decidir ese vínculo, y si el cambio
   se aplica directo o pasa por aprobación de la administradora.
2. **Distinguir el tipo de unidad** (oficina, local, estacionamiento…).
   Hoy `unidades` no tiene ese dato. En la planilla del piloto aparece como
   prefijo del código ("PB.", "Mz.") y como una fila "Estacionamiento" sin
   alícuota, que el importador omite.

### Para después de la fase 1 (validación en el Preview, 05-oct)

Anotados por Nicolás al validar la fase 1. No se hacen ahora.

1. **Saldo a favor en Propietarios:** hoy sale en negro con signo menos.
   Mostrarlo como "A favor $ X".
2. **Prefijo "Sr." duplicado:** el prefijo automático se suma al que ya
   trae la planilla.
3. **Botón desactivado que no lo parece:** un botón desactivado tiene que
   verse desactivado. Va con el patrón único de carga y guardado (E).
4. **D baja de prioridad:** no se reprodujo en el Preview. El edificio se
   crea y la pantalla se actualiza sola. El `router.refresh()` que falta en
   `PrimerEdificio.tsx` sigue siendo la causa probable si vuelve a pasar.
5. **Demasiadas llamadas a `tiene_rol`:** más de 15 en el mismo segundo al
   abrir una página (proxy, layouts y prefetch de los enlaces del menú).
   Hay que reducirlas. Toca autorización: va con revisión cruzada.

---

## Checklist de despliegue — piloto con datos reales (28-sep)

Configuración fuera del código, para Nicolás, antes de que el socio cargue
datos reales en la base de producción nueva vía el Preview de Vercel:

- [ ] **Migración de membresías** — la base de producción se arma desde un
  volcado de `vecitap-pruebas`, que **ya incluye** la migración
  `20260926120000`. **No aplicarla allá.** Al crear la base, correr solo las
  dos consultas de verificación: ¿existe la restricción
  `membresias_persona_rol_alcance_key` sobre `membresias`? ¿`crear_invitacion`
  y `aceptar_invitacion` ya tienen los cambios marcados en el archivo (los
  comentarios `-- CAMBIO:`)? Si alguna de las dos no está, el volcado no
  salió de donde se creía — parar y revisar antes de cargar nada.
- [ ] Variables de entorno del Preview de Vercel apuntando a la base de
  producción nueva (no a `vecitap-pruebas`).
- [ ] **Auth del proyecto de producción:**
  - [ ] Estado de **"Confirm email"**: decidir si queda encendido o apagado.
    Encendido, `signUp` no abre sesión y el residente tiene que confirmar el
    correo antes de poder pegar su código; apagado, entra derecho. El
    formulario de `/entrar` ya maneja los dos casos, pero cambia lo que hay
    que explicarle al residente al pasarle la invitación.
  - [ ] **SMTP propio.** El servicio de correo por omisión de Supabase tiene
    límites bajos y restricciones de destinatarios — con una carga real de
    residentes se topa. Configurarlo antes de invitar a nadie.
  - [ ] **Site URL** y **Redirect URLs** con la URL del Preview de Vercel,
    incluida la ruta de recuperación de clave (punto 5 de la sesión de hoy)
    y la de confirmación de correo si "Confirm email" queda encendido.
- [ ] Protección de acceso de los Preview de Vercel.
- [ ] Cuenta del administrador del socio (y su fila en `operadores` si
  corresponde) en la base de producción nueva.
- [x] **Hecho (27-sep, rama `integration`).** Copiar `logo-claro.png` y
  `logo-oscuro.png` de la raíz a `public/` — el merge de `main` (commit
  `3483ad8`) trajo los blobs nuevos del socio a la raíz, pero `public/` (lo que
  sirve la app Next) seguía con los viejos del 09-sep, porque `optimization`
  nunca había tocado esos archivos. Verificado por hash (`sha256sum`): los 4
  archivos quedaron idénticos raíz ↔ `public/`.
- [ ] **Saber que el alta de organización queda abierta.** Con el registro
  (`signUp`) reactivado, cualquiera que cree una cuenta y entre a `/admin`
  ve el formulario de crear administradora, y la organización que cree
  aparece en la cartera del operador. Es el mismo comportamiento que
  `app.html` siempre tuvo, y se acepta para el piloto (Preview protegido,
  un solo condominio) — pero conviene mirar la cartera antes de la reunión
  con el socio, por si aparece algo que nadie creó a propósito. Registrado
  en `docs/casos-de-uso-mejorados.md` (caso 19).

---

## Casos de validación en escritura — carga de datos (Sesión 2, 27-sep)

Lista para que Nicolás la ejecute a mano. **Todo sobre Administradora Baja**
(`a91054da-5afa-47e1-98b7-028fb26b9f7a`), salvo el bloque 1, que necesita una
cuenta nueva sin organizaciones. **Nunca sobre Administradora Unión** — la está
usando el socio.

Cada caso dice si la escritura es **irreversible desde la app**: irreversible
significa que ninguna pantalla de la app la deshace, no que sea imposible de
arreglar (con acceso a la base casi todo se arregla). En una base de pruebas eso
es aceptable; la lista lo marca para que, al repetir esto contra producción, se
sepa de antemano dónde no hay vuelta atrás.

### Bloque 0 — Revalidación de lo que ya estaba validado y se tocó hoy

**Automatizado el 27-sep con Playwright** (instalado temporal, `npm install
--no-save playwright`, desinstalado al terminar — script en
`scripts/validacion-bloque0.mjs`, capturas en `scripts/capturas-bloque0/`,
carpeta ignorada por Git). Solo lectura: ningún formulario que escriba en la
base. **21/21 casos pasan**, dos corridas seguidas, sin errores de Postgres en
el log de `npm run dev` (se buscó `22P02`/`PGRST`/"invalid input syntax", nada
apareció). El detalle completo del run queda en
`scripts/capturas-bloque0/reporte.md` (no versionado — se regenera corriendo
el script de nuevo).

- [x] **`/mi/[unidadId]` sigue entrando** — recibo, reportar y pagos con
  `residente.prueba@vecitap.com`, todo 200. `/mi/no-es-uuid` → 404 limpio.
- [x] **`/admin/[orgId]/[edificioId]/*` sigue entrando** — Inicio, Propietarios,
  Cobros, Cierre del mes y Accesos con `admin.prueba@vecitap.com`, todo 200.
  `/admin/no-es-uuid` lo intercepta `proxy.ts` (rebota a `/`, nunca llega al
  layout); `/admin/<orgId>/no-es-uuid` sí llega al layout y da 404 limpio vía
  `esUuid()`.
- [x] **Paleta nueva en los tres módulos** — confirmado visualmente en las
  capturas (Inicio de Admin, Accesos, estado de cuenta imprimible), colores y
  contraste legibles.
- [x] **Paleta en tema oscuro, recargando con la preferencia ya guardada** —
  `localStorage["vecitap-tema"]` queda en `"oscuro"` tras recargar y el fondo
  del `<body>` es `rgb(7, 12, 28)` (`#070C1C`, el token nuevo), sin flash del
  tema claro.
- [x] **Estado de cuenta imprimible** — el HTML de la ventana emergente
  contiene `#0A1128` (tinta nueva) y no contiene `#111144` (la vieja).
- [x] **Entrar funciona para los tres roles** y **Entrar sin `volver`** — ver
  el hallazgo y la corrección más abajo.
- [x] **Clave incorrecta**: aviso visible "Correo o contraseña incorrectos."
  (agregado a la validación, no estaba en la lista original).
- [x] **Logos nuevos servidos por Next**: `/logo-claro.png` y
  `/logo-oscuro.png` responden con el mismo hash sha256 que los archivos de la
  raíz del repo (agregado a la validación).

**Hallazgo real (confirmado a mano por Nicolás antes de automatizar, y
reproducido en la corrida): `residente.prueba` entrando sin `volver` caía en
`/admin` en vez de `/mi`.** `/destino` decidía "es administrador" con
`organizaciones.select().limit(1)` — esa tabla es visible por RLS a
**cualquiera con una membresía ahí, sea cual sea el rol** (un residente ve el
nombre/RIF de su propio edificio, lo necesita para su recibo), así que la
consulta nunca distinguía residente de administrador. El mismo problema
existía en `/admin/page.tsx` (AdminHome): listaba como "administrables" las
organizaciones donde el usuario solo es residente, y recién se frenaba al
hacer clic (por `tiene_rol()` en `/admin/[orgId]/layout.tsx`) — no era un
agujero de seguridad, pero sí una lista incorrecta.

**Corrección aplicada:**
- `/destino` ahora usa `administra_algo()` (RPC que sí distingue por rol) en
  vez de la visibilidad de la tabla `organizaciones`.
- `/admin/page.tsx` filtra la lista de organizaciones candidatas con
  `tiene_rol(org.id, ROLES_ADMIN)` — la misma función que ya gatea
  `/admin/[orgId]/*` — así que la lista y el acceso real son siempre la misma
  cosa.
- `ROLES_ADMIN` se unificó en `lib/admin/constantes.ts` (antes duplicado en
  `proxy.ts` y en `[orgId]/layout.tsx`).
- Validado en la corrida automatizada: `residente.prueba` sin `volver` termina
  en `/mi/...`; escribiendo `/admin` a mano ve "Nueva administradora" sola,
  sin ninguna organización real listada ni enlaces a `/admin/<org>`.

### Bloque 1 — Crear organización · cuenta nueva, no Baja

Necesita una cuenta **sin ninguna organización**: crear una a propósito
(p. ej. `alta.prueba@vecitap.com`). No sirven `admin.prueba@` ni
`residente.prueba@`.

- [ ] **Crear la cuenta** desde `/entrar` → "No tengo cuenta todavía".
  **Irreversible desde la app** (no hay borrado de cuentas).
  Según cómo esté "Confirm email" en vecitap-pruebas, o entra derecho o pide
  confirmar el correo — **anotar cuál de las dos pasó**, porque es justo lo que
  hay que decidir para producción (ver checklist de despliegue).
- [ ] Esa cuenta recién creada debe caer en **`/mi` → "Falta un paso"** (la
  pantalla de invitación), no en `/`. Es el destino correcto para el caso que
  importa mañana (residente invitado); para el caso de esta cuenta (viene a
  crear una administradora) verificar el enlace nuevo **"¿Viene a registrar su
  administradora?"** al pie de esa pantalla — debe llevar a `/admin` (caso 20 de
  `casos-de-uso-mejorados.md`).
- [ ] **Crear administradora** desde `/admin`: nombre y RIF. Usar un nombre que
  se reconozca como basura después (p. ej. `ZZZ Prueba Alta 27-sep`).
  **Irreversible desde la app.** Además **aparece en la cartera del operador**
  (ver caso 19 de `casos-de-uso-mejorados.md`) — verificar que aparece ahí, y
  anotarla para limpiarla en Fase 9.
- [ ] Después de crear, debe llevar sola a `/admin/<orgId>` y de ahí a "Registre
  su primer edificio".

### Bloque 2 — Crear edificio

**Primer edificio, en la organización nueva del bloque 1:**

- [ ] **Crear el primer edificio**: nombre, prefijo de recibo, interés de mora,
  tolerancia de alícuotas, RIF, dirección (`PrimerEdificio.tsx`).
  **Irreversible desde la app** (no hay borrado ni desactivación de edificios).
- [ ] Verificar que el prefijo de recibo se guarda en mayúsculas y que dejar la
  tolerancia vacía cae en `0,01`, no en `0`.
- [ ] Debe llevar solo a `/admin/<orgId>/<edificioId>/inicio`.

**Edificio adicional, sobre Baja (que ya tiene dos):** portado hoy
(`NuevoEdificio.tsx`, caso 21 de `casos-de-uso-mejorados.md`) — antes de esta
sesión, una organización con al menos un edificio no tenía ninguna forma de
crear el segundo desde la app nueva.

- [ ] Botón **"+ Otro edificio"** junto al selector de edificio, en cualquier
  sección de Baja. Crear uno de prueba: nombre, prefijo, interés de mora,
  tolerancia. **Irreversible desde la app.**
- [ ] Con nombre o prefijo vacío, debe avisar sin crear nada.
- [ ] Debe llevar a `/admin/<orgId>/<edificioId>/inicio` del edificio nuevo, y
  ese edificio debe aparecer en el selector junto a los otros dos de Baja.
- [ ] Verificar que el botón sigue visible y funciona igual con un solo edificio
  visible (no depende de que el selector de edificios esté mostrando pastillas).

### Bloque 3 — Unidades · sobre Baja / Torre Ida

Torre Ida: `f51676d7-80ff-4812-8830-6307267baecf`. Tiene septiembre 2026 abierto
y agosto 2026 cerrado — **no cerrar ni reabrir períodos en esta tanda**, eso es
otra validación.

- [ ] **Alta de unidad** (Propietarios → "Nueva unidad"): código, alícuota,
  saldos iniciales y propietario. **Irreversible desde la app**: una unidad se
  puede desactivar (Ficha → "Unidad activa"), nunca borrar.
- [ ] **Código repetido**: intentar dar de alta una unidad con un código que ya
  existe en Torre Ida. Debe fallar con un mensaje legible, no romper la pantalla.
- [ ] **Alícuota con 4 decimales**: cargar algo como `1,2345` y verificar que se
  guarda y se muestra con los 4 decimales en Propietarios y en la Ficha (es la
  decisión ya tomada, ver caso 12).
- [ ] **Documento con guion** (`V-12345678`): cargarlo en el propietario y
  verificar que se guarda tal cual. Es uno de los pendientes que llegaban a
  Admin.
- [ ] **Importar unidades** (Propietarios → "Importar unidades") con un CSV de
  3–4 filas, con y sin nombre de propietario. **Irreversible desde la app**:
  inserta unidades, personas y vínculos de una vez y no hay deshacer.
- [ ] En esa importación, revisar la **suma de alícuotas** que muestra la previa
  antes de aplicar, y que las filas inválidas se señalen en vez de colarse.
- [ ] **Importar saldos** (Propietarios → "Cargar saldos") con un CSV.
  **Reversible con trabajo**: pisa `saldo_inicial` unidad por unidad y no guarda
  el valor anterior; se puede corregir a mano en la Ficha de cada unidad, pero no
  hay "deshacer la importación".
  ⚠️ **Solo escribe `saldo_inicial` (condominio), NO `saldo_inicial_hon`
  (honorarios)** — igual que el original. Si el socio espera cargar los dos por
  archivo, no se puede todavía: los honorarios van a mano, unidad por unidad.
- [ ] **Excel**: confirmar que un `.xlsx` muestra el aviso de "todavía no" y no
  falla en silencio (ver caso 14). **Para mañana el socio carga en CSV** —
  decisión explícita de Nicolás (27-sep), no instalar `xlsx` para el piloto.
  Nota para cuando se retome: el paquete `xlsx` de npm es la versión vieja
  (0.18, sin actualizar desde 2022) — SheetJS dejó de publicar ahí y distribuye
  la versión mantenida desde `https://cdn.sheetjs.com/`, no desde el registro de
  npm. Un `npm install xlsx` a ciegas trae la vieja.
- [ ] **Ficha de unidad · cambio de propietario.** ⚠️ Caveat heredado de
  `app.html` (verificado: `main` hace exactamente lo mismo, no es un desvío de la
  migración): editar el nombre del propietario **modifica la misma persona**, no
  la reemplaza. Si una unidad cambia de dueño, escribir encima del nombre le
  cambia la identidad a la persona anterior en todos lados donde aparezca.
  Probar el caso, confirmar que se comporta así, y avisarle al socio antes de que
  cargue datos reales.

### Bloque 4 — Accesos · sobre Baja / Torre Ida

- [ ] **Invitar a un residente**: elegir unidad, correo y relación
  (propietario / inquilino). **Reversible desde la app** (botón "Revocar"
  mientras esté pendiente). Guardar el código: se muestra una sola vez.
- [ ] **"Copiar el mensaje completo"**: verificar que el enlace apunta a
  `…/entrar?volver=/mi` y no a la raíz del sitio (se corrigió hoy; en `main`
  apuntaba a la raíz porque ahí la raíz era el panel del residente).
- [ ] **Correo inválido y unidad sin elegir**: los dos deben dar aviso, no
  generar invitación.
- [ ] **Revocar** una invitación pendiente. **Irreversible desde la app** (no hay
  "des-revocar"; hay que generar otra invitación).
- [ ] **Pestaña Invitaciones**: verificar los estados (pendiente / aceptada /
  vencida) y que el botón Revocar solo salga en las pendientes.
- [ ] **Visibilidad del inquilino** (pestaña "Quién tiene acceso"): cambiar el
  nivel entre "solo el recibo del mes" / "el recibo y el saldo total" / "todo".
  **Reversible desde la app** (se vuelve a cambiar cuando se quiera). Verificar
  del lado del residente que el nivel se respeta de verdad.
- [ ] **Dar de baja** a alguien con acceso. **Irreversible desde la app**: la
  fila desaparece de la lista y no hay botón de reactivar (en `main` tampoco lo
  hay para residentes, solo para vigilantes). Dejarlo para el final del bloque.

### Bloque 5 — Registro y aceptación de invitación

El flujo son dos pantallas, igual que en `main`: primero la cuenta, después el
código. No hay un paso único que haga las dos cosas.

- [ ] **Circuito completo**: invitar a un correo nuevo desde Accesos (Baja /
  Torre Ida, una unidad libre) → crear la cuenta en `/entrar` con **ese mismo
  correo** → caer en `/mi` → "Falta un paso" → pegar el código → "Usar la
  invitación" → debe llevar al recibo de esa unidad.
  **Irreversible desde la app** en los dos tramos: la cuenta no se borra y el
  código se consume de una sola vez.
- [ ] **Código equivocado y código ya usado**: los dos deben dar un error legible
  en pantalla, no una pantalla en blanco.
- [ ] **Invitación a otro correo**: crear la cuenta con un correo **distinto** al
  invitado y pegar el código. La base debe rechazarlo — es la garantía de que la
  invitación está atada al correo, no solo al código.
- [ ] **Dos unidades para la misma persona** — esto prueba la migración
  `20260926120000` de verdad: invitar a `residente.prueba@vecitap.com`, que ya es
  residente de Torre Ida 01A, a **otra** unidad de Baja. Aceptar. Debe quedar con
  **dos** membresías en la misma organización y el selector de unidad debe
  ofrecer las dos. Antes de esa migración, la segunda pisaba la primera.
- [ ] **Junta + residente**: si hay tiempo, el otro caso que la migración
  habilita — la misma persona con dos roles distintos en la misma organización.

### Al terminar

Anotar en Fase 9 (limpieza) todo lo que quede creado: la cuenta nueva del bloque
1, su organización `ZZZ Prueba…`, su edificio, las unidades de prueba de Torre
Ida y las cuentas de residente creadas para el bloque 5.

---

## Notas de proceso

- No avanzar de fase sin aprobación explícita de Nicolás.
- Fases 5 y 9 requieren revisión cruzada obligatoria (con el chat
  estratégico de Claude.ai, no solo Claude Code).
- Al cerrar cada fase: resumen breve antes de avanzar (sin volcar código
  salvo pedido explícito), y este archivo se actualiza antes de pasar a
  la siguiente.
- No contradecir decisiones ya tomadas y documentadas acá en una fase
  posterior — si algo necesita cambiar, señalarlo explícitamente en vez
  de cambiarlo en silencio.

---

## Ruta de la garita (decidida y resuelta el 28-sep)

`garita.html` se porta como módulo nuevo en
**`/garita/[edificioId]/{entrada,adentro,consultar,bitacora}`**, en el grupo
`app/(garita)/`, con gate sobre `edificioId` en `proxy.ts` contra
`edificios_del_vigilante()`, fail-closed (mismo patrón que ya usan `/operador` y
`/admin/[orgId]`).

**Sin `orgId` en la URL.** La forma con `/[orgId]/` que decidió el 28-sep quedó
descartada por la verificación de RLS que ella misma dejaba pendiente — ver
"Verificación de RLS del vigilante" más abajo. El vigilante **no ve la tabla
`edificios`**, así que el `org_id` no se puede resolver desde el cliente y un
segmento de organización en la URL no se podría ni construir ni comprobar.

Dos detalles de los tipos, verificados el 28-sep contra `types/supabase.ts` ya
regenerado (están también en `docs/inventario-main.md`, sección 5):

- **`garita_edificios()` devuelve `{ edificio_id, nombre, org }`, y `org` es el
  NOMBRE de la organización, no su id.** Con la ruta sin `orgId` esto dejó de ser
  un problema y pasó a ser una ventaja: el nombre es justo lo que la garita
  necesita mostrar, y no hay ningún id que resolver. `garita_edificios()` es la
  única fuente de los edificios de la sesión **para pintar**; para **autorizar**
  se usa `edificios_del_vigilante()`.
- **Corregido el 28-sep con el SQL real (esta nota decía lo contrario, sin
  haberlo verificado — no seguirla, queda solo como historial):** a
  `garita_entrada` hay que pasarle **`null` explícito**, no `undefined`, en
  `p_unidad`. La firma real (`pg_get_functiondef`) es
  `garita_entrada(p_edificio uuid, p_unidad uuid, p_nombre text, p_documento
  text DEFAULT NULL, p_placa text DEFAULT NULL, p_invitacion uuid DEFAULT
  NULL, p_nota text DEFAULT NULL)` — **`p_unidad` no tiene `DEFAULT`**, a
  diferencia de los cuatro parámetros de atrás. El tipo generado dice
  `p_unidad: string` sin `| null` no porque el generador "nunca marque
  nullable", sino porque refleja correctamente que el parámetro es
  obligatorio (sin `DEFAULT`, PostgREST no puede omitirlo); lo que el
  generador no expresa es que la función SÍ acepta `NULL` como valor de ese
  parámetro obligatorio (lo comprueba ella misma:
  `if p_unidad is not null and not exists (...)`). Mandar `undefined` (que
  es como este cliente omite una clave) habría roto la llamada — "función no
  encontrada", porque Postgres no tiene con qué completar un parámetro sin
  `DEFAULT`. `garita.html:615/713` ya mandaba `null` explícito en los dos
  casos, nunca omitía la clave — el original tenía razón, esta nota no.
  Detalle completo en "Bloques 11 y 12" más abajo.

### Garita es un módulo propio, como los otros tres

**Decisión de Nicolás (28-sep), no negociable:** Garita se construye igual que
Residente, Operador y Admin — su route group en `app/`, sus componentes en
`components/garita/`, su lógica en `lib/garita/`, React/Next como el resto y los
tokens de `app/globals.css`. Dividido en rutas y componentes. **Nunca un solo
archivo que replique `garita.html`.**

#### Qué significa "no es React" (y qué NO significa)

Es una observación sobre el **archivo original**, no una instrucción para el port.
`garita.html` está escrito en JavaScript pelado con manipulación de DOM, a
propósito: el comentario de cabecera dice que en la tableta barata de una garita,
bajar y compilar React son varios segundos de pantalla en blanco cada vez que la
reinician — y la reinician.

Lo único que hay que hacer con ese dato: **decírselo al socio.** Al portarlo a
Next, la garita deja de arrancar en el primer segundo en un equipo viejo. Es una
consecuencia real de unificar el sistema, y es mejor que la sepa por nosotros y no
porque el vigilante se queje. Si llegara a doler de verdad, se ataca con las
herramientas de Next (esa ruta con poco JavaScript de cliente, Server Components
donde se pueda), no volviendo a un archivo suelto.

#### Tema — REVISADO el 28-sep: la garita usa el tema de toda la app

> La decisión del 28-sep (proveedor y clave propios) **queda sin efecto**.
> Confirmado con Gustavo: lo que la garita necesita es **legibilidad**, y eso son
> los tamaños, no el color.

`garita.html` guarda el tema bajo `vecitap-tema-garita` y arranca en oscuro, y el
28-sep se decidió replicarlo con un proveedor propio acotado al route group más
un script anti-parpadeo consciente de la ruta. Eso se construyó en el bloque 10 y
**se deshizo el 28-sep**.

**Decisión vigente:** la garita usa la clave `vecitap-tema` y el mismo valor por
omisión que el resto. `lib/theme/ThemeProvider.tsx` y `THEME_INIT_SCRIPT`
volvieron exactamente a como estaban antes del bloque 10 — sin `clave`/
`porOmision`, sin mirar `location.pathname`. El grupo `(garita)` no lleva
proveedor: hereda el del layout raíz. Lo propio del módulo son **los tamaños**
(`app/(garita)/garita.css`: base 17 px, campos 56 px, botones 60-64 px) y los
tokens `--veredicto-si`/`--veredicto-no`, que también son legibilidad — el
veredicto es una superficie a pantalla completa con letra blanca encima.

Registrado como desvío aprobado: caso 29 de `docs/casos-de-uso-mejorados.md`.

##### El bug que encontró la prueba, y por qué importa más allá del tema

Nicolás probó el botón "Tema" de la garita: escribía en `vecitap-tema`, y
`vecitap-tema-garita` **nunca se creaba**. La parametrización no funcionaba, y la
causa vale la pena guardarla porque no es obvia y puede repetirse.

`TEMA_GARITA` se exportaba desde `lib/theme/ThemeProvider.tsx`, que es un módulo
`"use client"`. El layout del grupo, que es un **Server Component**, lo importaba
y hacía `clave={TEMA_GARITA.clave}`. Pero en un Server Component, **todo** lo que
se importa de un módulo `"use client"` llega como referencia de cliente, no como
el valor: se comprobó en runtime que del lado del servidor `typeof TEMA_GARITA`
es `"function"` y `TEMA_GARITA.clave` es `undefined`. Así que el layout pasaba
`clave={undefined}` y `porOmision={undefined}`, el componente caía en sus valores
por omisión (`vecitap-tema` / claro) y la garita venía usando el tema de la app
desde el principio, sin que nada fallara ni avisara.

**Regla para no repetirlo: una constante que un Server Component vaya a leer no
puede vivir en un módulo `"use client"`.** Va en un módulo aparte sin la
directiva (como `lib/garita/secciones.ts`), y el módulo de cliente la importa de
ahí. Ni TypeScript ni el lint lo marcan — `.clave` tipa bien y el fallo es
silencioso.

#### La paleta — DECIDIDO: tokens compartidos + dos de superficie

Comparado token por token contra `app/globals.css`: en tema claro la paleta de
`garita.html` **coincide exactamente** (fondo, lienzo, tinta, tinta2, tenue,
linea, lineaFuerte, verde, rojo). En oscuro coincide todo salvo `--verde` y
`--rojo`, y esa diferencia **no es drift**: son otro rol.

- En la app, `--verde`/`--rojo` oscuros (`#00D1B2`, `#F08A78`) son colores de
  **texto** sobre fondo oscuro.
- En la garita (`garita.html:135`) se usan como **fondo a pantalla completa** del
  veredicto, con letra blanca encima (`#0E9C86`, `#B03A2A`). El `#00D1B2` de la
  app detrás de texto blanco sería ilegible.

**Decidido (28-sep, aprobado por Nicolás):** se usan los tokens de
`app/globals.css` para todo, y el veredicto lleva **tokens de superficie nuevos**,
`--veredicto-si` / `--veredicto-no`, definidos en los dos temas. **No se pisan
`--verde`/`--rojo`**, que siguen siendo colores de texto para toda la app.

Valores, tomados de `garita.html:35-49`:

| Token | Claro | Oscuro |
|---|---|---|
| `--veredicto-si` | `#0E7C6B` | `#0E9C86` |
| `--veredicto-no` | `#9B2C1F` | `#B03A2A` |

Los dos llevan texto blanco encima (`#veredicto{ color:#fff }`), a pantalla
completa. Van en `app/globals.css` junto al resto de los tokens, que es la única
fuente de verdad de la paleta.

Lo otro que sí es propio de la garita es el **tamaño**: base de 17 px, campos y
botones de nav de 56 px de alto, botones de acción de 60 px, botones del veredicto
de 64 px. Eso es para tocar de pie, con guantes o con lluvia — va como clases
propias del módulo, no tocando los componentes de `components/ui/`.

#### Verificación de RLS del vigilante — hecha el 28-sep, con evidencia

La decisión del 28-sep dejaba abierta una pregunta: **¿un vigilante ve la tabla
`edificios` por RLS?** De ella dependía si el `orgId` se podía resolver desde el
cliente. Se verificó con una sesión de vigilante real
(`vigilante.prueba@vecitap.com`, membresía `rol = 'vigilante'` sobre Torre Ida en
Administradora Baja), impersonando en el SQL Editor:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<usuario_id>","role":"authenticated"}';

select
  (select count(*)            from public.edificios)      as edificios_que_ve,
  (select array_agg(e.id)     from public.edificios e)    as ids_edificios,
  (select array_agg(e.org_id) from public.edificios e)    as org_ids,
  (select count(*)            from public.organizaciones) as orgs_que_ve,
  public.edificios_del_vigilante()                        as del_vigilante,
  (select count(*) from public.garita_edificios())        as garitas_asignadas;

rollback;
```

Resultado:

| campo | valor |
|---|---|
| `edificios_que_ve` | **0** |
| `ids_edificios` | `null` |
| `org_ids` | `null` |
| `orgs_que_ve` | 1 |
| `del_vigilante` | `f51676d7-80ff-4812-8830-6307267baecf` (Torre Ida) |
| `garitas_asignadas` | 1 |

**Conclusión: el vigilante no ve `edificios`.** Los dos caminos que el 28-sep
proponía para resolver el `org_id` desde el cliente dependían de esa tabla, así
que los dos quedan descartados. La ruta pasa a **`/garita/[edificioId]`**,
gateada con `edificios_del_vigilante()`, que es además más simple.

Tres cosas que conviene no perder de este resultado:

- **`orgs_que_ve = 1` no rescata la forma con `orgId`.** El vigilante sí ve una
  fila de `organizaciones`, pero sin `edificios` no hay forma de saber que *esa*
  organización es la de *ese* edificio. Una sola fila hoy es una coincidencia de
  la base de prueba, no una garantía: un vigilante con garitas en dos
  administradoras vería dos filas y ninguna manera de aparearlas.
- **`edificios_del_vigilante()` devolvió un uuid pelado, no un objeto.** Es la
  primera confirmación en runtime de la forma de uno de los cuatro RPC
  `string[]` que arrastraban la duda del bug de `edificios_visibles()` del
  27-sep (ver más arriba en este documento). Acá el valor llegó sin llaves ni
  paréntesis, consistente con `SETOF uuid` / `uuid[]`, que es lo que declara
  `types/supabase.ts`. Por eso el gate usa `.includes()` directo, sin capa de
  tolerancia — misma decisión que tomó Nicolás el 27-sep al eliminar
  `idsDeEdificiosVisibles()`. Sigue siendo fail-closed: si la forma no fuera esa,
  `.includes()` no matchea y el gate niega, nunca deja pasar de más.
- **El módulo `garita` tiene que estar activo en el edificio.** En la primera
  corrida `modulo_activo(Baja, 'garita', Torre Ida)` dio `false` y se prendió
  desde `/operador` con `PanelModulos`. Sin eso no solo falla la garita: la
  pestaña "Mis visitas" de Residente tampoco aparece, así que no habría QR que
  leer. **De paso quedó probado en escritura el `PanelModulos` del bloque 9.**

#### Cómo gatea `proxy.ts`

`proxy.ts` toma el `edificioId` **del segmento de la URL**, lo valida con
`esUuid()` y llama `edificios_del_vigilante()`, comprobando que el id esté en la
lista. Fail-closed: cualquier error, o un id que no esté, redirige a `/`.
`garita_edificios()` se usa **dentro de la página**, para el nombre del edificio y
el selector — nunca para autorizar.

`/garita` a secas no lleva gate de edificio (todavía no hay uno): solo pide
sesión, y la página resuelve a dónde va según cuántas garitas tenga asignadas —
ninguna → "Falta un paso"; una o más → entra a la primera, igual que
`garita.html:973`. Con dos o más aparece además el `<select>` del encabezado,
que cambia de garita **quedándose en la misma vista**.

### Entorno de pruebas (Garita)

- Cuenta **`vigilante.prueba@vecitap.com`** (Auth, confirmada), creada el 28-sep.
  Una sola membresía: `rol = 'vigilante'`, `activo = true`, edificio Torre Ida
  (`f51676d7-80ff-4812-8830-6307267baecf`) en Administradora Baja,
  `unidad_id`/`relacion` en `NULL`. Se insertó directo en `membresias`
  reproduciendo la fila que deja `aceptar_invitacion`, porque en el SQL Editor
  `auth.uid()` es `NULL` y ni `crear_invitacion` ni `aceptar_invitacion`
  funcionan desde ahí.
- **El módulo `garita` quedó activo en Torre Ida** (estaba apagado; se prendió
  desde `/operador` con `PanelModulos`). Hace falta para las dos puntas: sin él
  las funciones `garita_*` niegan y la pestaña "Mis visitas" de Residente no
  aparece, así que no habría QR que leer.
- **Pendiente de Fase 9:** eliminar o desactivar `vigilante.prueba@vecitap.com` y
  su membresía, junto con las otras tres cuentas de prueba.

#### Bloque 10 — VALIDADO EN LECTURA Y NAVEGACIÓN (28-sep)

Nicolás lo probó en el navegador el 28-sep y **pasó todo**. El alcance de esa
validación es exactamente lo que el bloque construye: control de acceso, ruteo,
armazón y tema. **No** cubre escritura contra la base — la única del bloque
("Falta un paso") queda pendiente, ver el final de esta sección.

Probado a mano en el navegador, todo OK:

- **Control de acceso**, con cuatro situaciones distintas: sin sesión; con una
  cuenta de residente contra `/garita` y contra `/garita/<Torre Ida>`; con la
  cuenta de vigilante; y con un edificio ajeno y un id malformado.
- **Tema:** arranque limpio en claro; los tamaños de la garita se ven más
  grandes que los de `/mi`; el botón "Tema" escribe solo en `vecitap-tema`;
  recarga en oscuro **sin parpadeo y sin avisos de hidratación** (la prueba de la
  Fase 2, sobre una ruta nueva); y la preferencia cruza entre `/mi` y `/garita`
  en los dos sentidos, que es el comportamiento nuevo del caso 29.

Verificado antes, en la sesión de construcción (`npm run build`, `npm run lint` y
`npx tsc --noEmit` limpios, más pruebas contra el servidor de desarrollo con la
sesión real de `vigilante.prueba@vecitap.com`):

- Sin sesión, las cuatro rutas de garita redirigen a `/entrar?volver=…`.
- Con sesión de vigilante: `/destino` → `/garita` → `/garita/<Torre Ida>/entrada`;
  las cuatro vistas dan 200; el encabezado muestra "Torre Ida" y el correo; el
  `<nav>` marca `aria-current="page"` en la vista abierta; el selector **no**
  aparece (una sola garita), como corresponde.
- Fail-closed confirmado: un uuid de edificio ajeno y un id malformado redirigen
  los dos a `/`. `/operador` con esta cuenta también rebota a `/`.
- El layout del grupo `(garita)` se aplica de verdad: el HTML servido trae
  `class="garita"` y el chunk de `garita.css`. De eso dependen los tamaños.
- Tras la revisión del tema (28-sep): en el código de la app la única clave de
  `localStorage` de tema vuelve a ser `vecitap-tema`. `vecitap-tema-garita` solo
  aparece en `garita.html`, que es la referencia original y no se toca.

**Único pendiente del bloque 10: "Falta un paso" con un código de invitación
real.** Es la única escritura que hace el bloque (`aceptar_invitacion`) y la
única pieza que nadie ejerció todavía. Para probarla hace falta una **segunda
cuenta de vigilante sin garita asignada** —`vigilante.prueba@vecitap.com` ya
tiene la suya, así que esa pantalla no le aparece más— y una invitación emitida
desde Admin → Accesos → Vigilantes sobre Torre Ida. Conviene hacerlo junto con la
validación de Accesos, que es de donde sale el código, y sumar esa segunda cuenta
a la limpieza de Fase 9.

---

## Salida a producción — 29-sep (vecitap.com)

Objetivo: dejar la app lista para producción el **miércoles 30-sep** en
**vecitap.com** (raíz, con `/mi`, `/admin`, `/operador` y `/garita`), contra la
base **vecitap-produccion**, con los planes Free de Vercel y Supabase.

**Decisiones tomadas (no se reabren):**

- Dominio: `vecitap.com`. `www.vecitap.com` redirige a la raíz.
- `mi.vecitap.com` (GitHub Pages desde `main`, contra **vecitap-pruebas**) queda
  como **respaldo**. No se toca. `main` queda **congelada**.
- `integration` sigue siendo la rama de trabajo durante el piloto **y publica
  producción**. Gustavo trabaja con su propio Claude sobre esta misma rama.
- Repo **público**.
- Refs de Supabase: **vecitap-produccion `sudghmerriewjmmnlcrf`**,
  **vecitap-pruebas `hdivffuorclzulijkyry`**.
- Correo: **Resend**, dominio verificado `envios.vecitap.com`, remitente
  `no-reply@envios.vecitap.com` con nombre visible "Vecitap". **Confirm email
  activado** en producción.
- En producción se aplican todas las migraciones del repo que falten. Las corre
  Nicolás en el SQL Editor.

Estado de los 5 puntos de esa sesión:

| # | Punto | Estado |
|---|---|---|
| 1 | Código (URLs por entorno, redirects de correo, `/design-system`, `.env.example`) | ✅ Hecho |
| 2 | Sección "Producción" en `AGENTS.md` | ✅ Hecho |
| 3 | Migración: segunda ronda de fechas | ✅ Hecho (escrita, sin aplicar) |
| 4 | `docs/consultas-produccion.sql` | ✅ Hecho (las corre Nicolás) |
| 5 | `docs/respaldo.md` | ✅ Hecho |

**Los 5 puntos cerrados.** Lo que queda en manos de Nicolás, en orden:
correr `docs/consultas-produccion.sql` en las dos bases (bloque h primero);
cargar las variables de Vercel (`.env.example` dice cuál va en qué entorno);
cargar la lista blanca de Authentication en vecitap-produccion; respaldar;
aplicar las migraciones pendientes en el orden del bloque (z); y revisar que
`secretos.correo_enlace` y los `ajustes_correo.enlace_base` apunten a
`https://vecitap.com` (bloque g.2) **antes de que salga el primer recibo**.

### Punto 1 — Código ✅ (29-sep)

**a) Ninguna URL ni ref escrita a mano en el código de la app.** La auditoría
(grep de `vercel.app`, `mi.vecitap.com`, `github.io` y los dos refs sobre todo
el repo, excluyendo `node_modules/` y `.next/`) encontró que **el proyecto Next
ya estaba limpio**: las dos variables de Supabase salen de `process.env` desde
la Fase 1 y no había ningún dominio escrito. Los únicos aciertos quedan a
propósito, y conviene que esté dicho para que nadie los "arregle" después:

- `admin.html`, `index.html`, `operador.html`, `garita.html` y `CNAME` traen el
  ref de **vecitap-pruebas** y `mi.vecitap.com` escritos a mano. **Son el
  respaldo de `main`**, que apunta a pruebas a propósito y está congelado; y
  además no tienen build step, así que no pueden leer variables de entorno.
  Vercel no los sirve (no están en `public/`), así que en producción son
  inertes. **No se tocaron.**
  > **Superado el 29-sep:** se borraron de `integration` en la limpieza (ver
  > la última sección). Siguen intactos en `main`, que es donde importan.
- `scripts/validacion-bloque0.mjs` tenía **las claves de las tres cuentas de
  prueba escritas en el archivo**. Con el repo público eso es una clave en el
  repo: pasaron a `VALIDACION_{ADMIN,RESIDENTE,OPERADOR}_CLAVE` por entorno, y
  el script aborta con un mensaje claro si falta alguna. La URL base también
  quedó parametrizable (`VALIDACION_BASE_URL`).

Lo que sí se agregó es **`lib/url-sitio.ts`**, el único lugar donde se decide
cuál es la URL pública del sitio:

1. `NEXT_PUBLIC_SITE_URL` si está definida — **en Vercel solo en Production**,
   con `https://vecitap.com`.
2. Si no, el origen real del navegador. Es lo único que acierta en local y en un
   Preview, porque la URL de un Preview cambia en cada deploy.
3. Si no hay `window` (servidor), `VERCEL_URL` / `NEXT_PUBLIC_VERCEL_URL`.
4. Último recurso, `http://localhost:3000`.

**Por eso `NEXT_PUBLIC_SITE_URL` NO se define en Preview ni en `.env.local`:**
definirla ahí mandaría los correos de un Preview al dominio de producción.

`components/admin/Accesos.tsx` pasó de `location.origin` a `urlDelSitio()` en
los dos mensajes que se copian al portapapeles (invitar residente, invitar
vigilante): son textos que se le mandan a una persona real, así que tienen que
llevar el dominio público aunque quien los copie esté mirando un Preview.

**b) `emailRedirectTo` y `redirectTo`, con una ruta de aterrizaje propia.**

Al revisarlo apareció algo que no estaba anotado y que importa: **`@supabase/ssr`
fija el flujo PKCE** (`createBrowserClient.js:44`, no es configurable), así que
el enlace del correo **no** vuelve con `#access_token=…&type=recovery` sino con
`?code=…`, que hay que canjear. El código viejo solo miraba
`window.location.hash`, y el canje quedaba en manos de `detectSessionInUrl` del
cliente del navegador — que avisa por el evento `PASSWORD_RECOVERY`, y ese
evento puede dispararse **antes** de que el componente alcance a suscribirse
(el cliente del navegador es un singleton que ya puede estar creado por otra
parte de la página). Carrera real, invisible en la prueba feliz.

Se resolvió con **`app/auth/confirmar/route.ts`**, que canjea del lado del
servidor y recién entonces redirige. Cuando la pantalla aparece, la sesión ya
está en las cookies y la URL dice sin ambigüedad en qué modo abrir el
formulario. Detalles que valen:

- Acepta **los dos formatos**: `?code=…` (plantillas por defecto,
  `{{ .ConfirmationURL }}`, exige el mismo navegador porque el verificador PKCE
  vive en una cookie) y `?token_hash=…&type=…` (`{{ .TokenHash }}`, que **no**
  depende de esa cookie y por eso funciona si alguien pide el enlace en la
  computadora y abre el correo en el teléfono). El segundo queda soportado de
  antemano para poder cambiar las plantillas de Supabase sin tocar código.
- La respuesta de redirección se **arma antes** del canje, para que las cookies
  de la sesión nueva se escriban sobre ella — mismo motivo por el que `proxy.ts`
  redirige siempre con `redirigirConCookies()`.
- `siguiente` viaja dentro del enlace del correo y vuelve por la URL, así que se
  trata como entrada ajena: `rutaInterna()` (en `lib/url-sitio.ts`) solo acepta
  rutas internas. Sin eso, el enlace de confirmación de Vecitap sería un
  redirector abierto a cualquier dominio.
- Falla cerrado: enlace vencido, ya usado o abierto en otro navegador →
  `/entrar?error=enlace`, con un mensaje en castellano y sin detalle técnico.

En `FormularioEntrar.tsx`: `signUp` lleva
`emailRedirectTo: urlDelSitio("/auth/confirmar?siguiente=<volver>")` y
`resetPasswordForEmail` lleva
`redirectTo: urlDelSitio("/auth/confirmar?siguiente=/entrar?clave=nueva")`. La
detección por `#type=recovery` y el evento `PASSWORD_RECOVERY` **se
conservaron** como red de seguridad para enlaces del flujo viejo que sigan
vivos en la bandeja de alguien.

**Para que esto funcione hay que cargar la lista blanca de Supabase**
(Authentication → URL Configuration), en **vecitap-produccion**:

- Site URL: `https://vecitap.com`
- Redirect URLs: `https://vecitap.com/**`, `http://localhost:3000/**`,
  `https://*.vercel.app/**`

**c) `/design-system` cerrado en producción.** `app/(marketing)/design-system/layout.tsx`
llama a `notFound()` salvo que el build no sea de producción (`npm run dev`) o
que Vercel diga que el deploy es un **Preview** (`VERCEL_ENV === "preview"`).
Falla cerrado: `next start` local, producción de Vercel y cualquier otro
hosting dan **404 de verdad**, no un redirect ni un "no autorizado" — desde
afuera la ruta no existe. Va en el layout y no en la página para que cubra
cualquier subruta futura. **Verificado sobre el build**: el prerender
`.next/server/app/design-system.html` es la página de 404.

**d) `.env.example` reescrito**, con todas las variables y en qué entorno de
Vercel va cada una (Production / Preview / ninguna), incluidas las que inyecta
Vercel sola y, sobre todo, una sección **"Nunca acá"** con el porqué:
`SUPABASE_SERVICE_ROLE_KEY` (saltea RLS; hoy la app no la usa),
`RESEND_API_KEY` (el correo lo despacha la base, no esta app) y la contraseña
de la base (solo para respaldos, se pide en el momento).

**Verificado:** `npm run lint`, `npx tsc --noEmit` y `npm run build`, los tres
en verde.

**Archivos del punto 1** — nuevos: `lib/url-sitio.ts`,
`app/auth/confirmar/route.ts`, `app/(marketing)/design-system/layout.tsx`.
Modificados: `.env.example`, `app/(marketing)/entrar/FormularioEntrar.tsx`,
`components/admin/Accesos.tsx`, `scripts/validacion-bloque0.mjs`.

### Punto 2 — Sección "Producción" en `AGENTS.md` ✅ (29-sep)

Va **antes de "Stack"**, que es lo primero que lee cualquier asistente que abre
el repo: la regla más peligrosa de todas es que `integration` está en vivo, y
esa no puede estar en la mitad del documento. Cuatro bloques, escritos para que
los siga cualquier asistente sin contexto previo:

1. **`integration` publica vecitap.com. Cada push llega a usuarios reales.** No
   hay staging entre medio. De ahí las tres reglas: los **tres** comandos en
   verde antes de cada push (`build`, `lint`, `tsc --noEmit` — un error de tipos
   no rompe `npm run dev` pero sí el build de Vercel, y un build roto deja el
   sitio en la versión anterior sin avisar); todo lo que dependa del **método
   HTTP o del status** se prueba contra `next start` o un Preview, nunca solo
   contra `npm run dev` (la lección del 405 de "Salir"); y ante la duda, un
   Preview, que es gratis y no toca a nadie.
2. **Los cambios de base van como archivo**: migración en
   `supabase/migrations/`, reverso en `supabase/rollbacks/` (**sin rollback la
   migración no está terminada**), verificación dentro del propio archivo. Y en
   este orden: primero **vecitap-pruebas**, después **producción**. **Nunca
   directo en el dashboard de producción** — con el porqué dicho, que es lo que
   hace que la regla se respete: un cambio hecho ahí no queda en el repo, no
   tiene rollback, no pasó por pruebas, y la próxima migración que asuma el
   estado anterior se rompe o pisa el cambio en silencio.
3. **Respaldo antes de cualquier migración en producción**, sin excepción por
   "es un cambio chiquito" — que son justamente los que se aplican sin
   pensarlos. Remite a `docs/respaldo.md`.
4. **Ninguna clave en el repo: es público.** Con la consecuencia dicha (una
   clave commiteada está comprometida desde el push; borrarla después no la
   saca del historial, hay que rotarla), la lista de las cuatro que nunca van
   (Resend, service_role, contraseña de la base, claves de las cuentas de
   prueba), y la única excepción explicada: la anon/publishable es pública por
   diseño, y aun así vive en variables de entorno.

De paso se corrigieron en **"Stack"** cuatro cosas que habían quedado
desactualizadas y que un asistente nuevo leería como verdad:

- El repo dice ahora que es **público**, y que `integration` **publica
  producción** (antes solo decía que era la rama de trabajo).
- `main` figura como **congelada**.
- Se agregaron los dos **refs de Supabase**, el dominio y la forma del
  despliegue (la raíz sirve los cuatro módulos, `www` redirige), y Resend con
  la aclaración de que el correo lo despacha **la base**, no la app Next.
- Se dejó anotada la **tensión real** entre las dos viñetas de planes y el
  piloto: Vercel Hobby prohíbe uso comercial y Supabase Free pausa el proyecto
  tras una semana sin actividad, pero el 30-sep se sale con los dos planes
  Free. Es **decisión tomada de Nicolás**, así que queda marcada como tal —
  "no volver a proponerlo como pregunta, sí tenerlo presente" — en vez de
  borrar las viñetas (que haría perder el pendiente) o dejar el archivo
  contradiciéndose solo.

**Archivos del punto 2** — modificados: `AGENTS.md`.

### Punto 3 — Migración: segunda ronda de fechas ✅ (29-sep, sin aplicar)

`supabase/migrations/20260929120000_segunda_ronda_dia_local.sql` +
`supabase/rollbacks/20260929120000_segunda_ronda_dia_local_rollback.sql`.
**Escrita, no aplicada** — la corre Nicolás, primero en vecitap-pruebas y
después en producción, con respaldo previo.

Cierra el pendiente "Segunda ronda de zona horaria" que estaba en
"Decisiones abiertas". Las cinco funciones, en orden de consecuencia:

| Función | Qué tenía | Qué quedó |
|---|---|---|
| `libro_edificio` | `p.cerrado_en::date between p_desde and p_hasta` | ventana `>= inicio_dia_local(p_desde)` / `< inicio_dia_local(p_hasta + 1)`, y `dia_local(p.cerrado_en)` en la columna que se muestra |
| `historial_unidad` | `p.cerrado_en::date` ×4 | `dia_local(p.cerrado_en)` ×4 |
| `cerrar_periodo` | `current_date` ×2 (ajustes de redondeo) | `hoy_local()` ×2 |
| `generar_cobros_vencidos` | `current_date` ×2 | `hoy_local()` ×2 |
| `generar_cobro_interno` | `coalesce(p_desde, …, current_date)` | `coalesce(p_desde, …, hoy_local())` |

**Cómo se escribió, que es lo que da la garantía:** los cuerpos **no se
transcribieron a mano**. Un script extrajo los cinco `prosrc` de
`esquema_inicial.sql`, aplicó cada reemplazo exigiendo el número exacto de
ocurrencias (1, 1, 2, 2, 4 — aborta si no coincide), verificó que no quedara
ningún `current_date` ni ningún `cerrado_en::date` en líneas de código, y
emitió los dos archivos. Después se comprobó el **viaje de ida y vuelta**:
los cinco cuerpos del rollback tienen exactamente los md5 del volcado, o sea
que revertir deja la base byte a byte como estaba.

#### Las dos guardas

1. **Dependencia de 20260928140000.** Si `hoy_local()` o
   `inicio_dia_local(date)` no existen, aborta con el nombre del archivo que
   hay que aplicar primero.
2. **La base tiene que ser la del volcado.** Compara el cuerpo actual de las
   cinco contra el del 27-sep y aborta la transacción entera si alguno
   cambió, diciendo cuál y los dos hashes. También compara lenguaje,
   volatilidad y `SECURITY DEFINER`. Hace falta porque la migración
   **reescribe cada función entera**: sin la guarda, un cambio que alguien
   hubiera hecho después del volcado se borraría en silencio.

**Se usa `md5(prosrc)`, no `md5(pg_get_functiondef(oid))`, y no es un
atajo.** `pg_get_functiondef` no devuelve el texto del dump: lo **reimprime**
—escribe `CREATE OR REPLACE`, resangra la cabecera, cambia el delimitador a
`$function$` y agrega un salto final—, así que un valor precalculado desde
`esquema_inicial.sql` **nunca** coincidiría con el de la base, ni con la
función intacta: la guarda abortaría siempre. `prosrc` sí se puede
precalcular: `pg_dump` lo escribe **verbatim** entre los delimitadores de
dollar-quoting, byte a byte igual a lo que guarda `pg_proc`. Lo que `prosrc`
no cubre (lenguaje, volatilidad, SECURITY DEFINER) se comprueba aparte en el
mismo bucle, así que entre las dos cosas queda cubierto todo lo que
verificaría comparar el `pg_get_functiondef` completo, sin la fragilidad del
formato. De todos modos la guarda **imprime** el `md5(pg_get_functiondef)` de
cada función con un `raise notice`, para dejarlo registrado; la comparación
entre las dos bases va por el bloque (a) de `docs/consultas-produccion.sql`.

Los md5 del volcado, por si hay que rehacer el cálculo:

```
cerrar_periodo           374ad9f13bbb10b2c75b471837514bfc
generar_cobro_interno    0357eccd663e3de660c46c79f94d0900
generar_cobros_vencidos  a62a6621783b77e25971b493738399a6
historial_unidad         b0243caf2ccb0efc4409b75c33cbe8bd
libro_edificio           21ba3a6d8b9b2e877b329c5a0a270be2
```

#### `dia_local(timestamptz)`: hizo falta una tercera auxiliar

`hoy_local()` e `inicio_dia_local(date)` no alcanzaban. `libro_edificio` e
`historial_unidad` no preguntan "qué día es hoy" sino "de qué día local es
este instante guardado", que es la conversión **inversa**. Las opciones eran
escribir `(x at time zone 'America/Caracas')::date` inline en cinco lugares
o agregar la auxiliar. Se agregó, por el mismo motivo por el que existen las
otras dos: que la zona viva en un solo lugar. Mismos atributos que sus
hermanas — **no** `SECURITY DEFINER`, `STABLE`, `SET search_path = ''`.

`STABLE` y no `IMMUTABLE` aunque no dependa de `now()`: las reglas de zona
salen de `pg_timezone_names` y cambian con una actualización de tzdata;
marcarla inmutable permitiría indexarla y congelaría un resultado que puede
dejar de ser cierto.

#### `vinculos.desde`: se cambia el DEFAULT — decisión revertida, con motivo

El 28-sep se decidió **no** tocarlo ("DDL de tabla sobre la base compartida
por un beneficio cosmético"). **Acá se revierte**, y queda
`default hoy_local()`. Los tres motivos:

- `hoy_local()` va a existir en producción igual, por esta misma migración.
  El costo marginal es una línea, más una en el rollback.
- La alternativa (mandar `desde: hoyLocalISO()` desde el cliente) toca tres
  componentes —`AltaUnidad.tsx:79`, `DatosUnidad.tsx:81`,
  `ImportarUnidades.tsx:97`— y deja el agujero abierto para el próximo
  `insert` que se olvide de la columna. El default lo cierra de una vez.
- La objeción original era el riesgo de DDL sobre la base compartida con
  Gustavo trabajando en vivo. **Cambiar un DEFAULT no reescribe la tabla ni
  toca una sola fila**: es una actualización de catálogo, instantánea. No es
  el tipo de DDL que motivaba la cautela.

La severidad del bug sigue siendo baja y conviene no inflarla: nada en la app
filtra por `desde` (`vigente()` mira solo `!v.hasta`), el único uso es un
`order by v.desde desc` dentro de `destinatarios_de`. Las filas ya guardadas
**no se migran**.

**Consecuencia de orden que hay que recordar:** a partir de acá la tabla
`vinculos` depende de `hoy_local()`, así que Postgres no deja borrar esa
función sin quitar antes el default. **El rollback de esta migración tiene
que correr antes que el de 20260928140000.** Está escrito en los dos
archivos.

#### Verificación

Ocho pasos al final del archivo de migración, todos de solo lectura salvo uno
envuelto en `begin`/`rollback`: que las tres auxiliares existan con los
atributos correctos; que sean consistentes entre sí (`dia_local(inicio_dia_local(d)) = d`
a cualquier hora); que no quede ningún `current_date` ni `cerrado_en::date`;
el default de `vinculos.desde`; **qué cierres históricos cambian de fecha en
el libro** (la consulta que muestra a la vez que no rompió nada y que arregló
algo); las cuatro funciones corriendo; los ajustes de redondeo del primer
cierre real; y los md5 nuevos para comparar las dos bases. El rollback tiene
sus propios tres pasos, incluidos los md5 esperados para confirmar que la
reversión fue exacta.

**Archivos del punto 3** — nuevos:
`supabase/migrations/20260929120000_segunda_ronda_dia_local.sql`,
`supabase/rollbacks/20260929120000_segunda_ronda_dia_local_rollback.sql`.

### Punto 4 — `docs/consultas-produccion.sql` ✅ (29-sep)

Ocho bloques (a–h) más el orden de aplicación (z). **Todas de solo lectura**:
ni un `insert`, `update`, `delete`, `create` ni `alter` en todo el archivo. Se
pueden correr con la base en uso y sin respaldo. Cada bloque dice en qué base
se corre y qué resultado se espera; los `order by` son fijos para que el diff
entre los dos CSV salga limpio.

**Ninguna consulta devuelve el valor de un secreto.** El bloque (f) trae
nombre, fecha y longitud —la misma información que ya expone `hay_secreto()`—
y el de vault pide columnas explícitas a propósito, porque un `select *`
sobre las vistas de vault puede traer el secreto descifrado. Está dicho en el
archivo para que nadie lo "simplifique".

| Bloque | Qué trae | Lo que más importa mirar |
|---|---|---|
| a | Funciones de public: md5 de la definición y del cuerpo, SECURITY DEFINER, search_path, lenguaje, volatilidad | **(a.3)**: SECURITY DEFINER **sin** search_path fijo. Esperado cero filas; cualquier fila es bloqueante. **(a.2)**: una huella de una sola fila para comparar las dos bases de un vistazo |
| b | Tablas con RLS y todas las políticas | `rls_activo` en todas; `politicas = 0` **solo** en `operadores`, `secretos` y `tasa_pendiente` |
| c | Triggers y extensiones | **pg_net** (sin ella no sale un correo ni se actualiza la tasa), **pg_cron**, **pgcrypto** |
| d | `cron.job`, las últimas corridas y `cron.timezone` | Si producción se armó desde un volcado, lo más probable es que **no tenga ninguna tarea**: `pg_dump` no exporta `cron.job`, y no falla nada — simplemente no pasa nada nunca |
| e | `storage.buckets` y políticas de `storage.objects` | `comprobantes` tiene que existir y estar con `public = false` |
| f | La cadena de despacho del correo y dónde vive la clave | Ver abajo |
| g | URLs dentro de la base | **El bloque crítico del cambio de dominio.** Ver abajo |
| h | Qué migraciones ya están aplicadas | Comprueba la existencia del objeto que crea cada una |

#### Lo que se confirmó sobre el correo, leyendo el volcado

El bloque (f) quedó escrito para **confirmar** esto, no para descubrirlo:

- **No hay Edge Function.** El repo no tiene `supabase/functions/` y el envío
  ocurre entero dentro de la base.
- La cadena es `despachar_ahora()` → `despachar_correos(20)`, y esa última
  llama **directo** a `net.http_post` (pg_net) contra
  `https://api.resend.com/emails`. Sin intermediario.
- Es **asíncrona en dos pasos**: una corrida manda la tanda y guarda el
  `request_id`; la **siguiente** recoge la respuesta de `net._http_response`.
  O sea que hace falta que el cron corra periódicamente — con una corrida
  suelta los correos salen pero la cola nunca pasa a `enviado`.
- La clave **no está en vault**: sale de `public.secretos` con
  `nombre = 'resend_api_key'`. El remitente, de `secretos.correo_remitente`.
  El nombre visible por organización, de `ajustes_correo.remitente`, con el
  nombre de la organización como respaldo.
- `secretos` tiene RLS activo y **cero políticas**, así que no se lee desde
  el cliente; solo la alcanza `despachar_correos`, que es SECURITY DEFINER.
- **Si falta `resend_api_key`, no falla nada visible:** `despachar_correos`
  escribe `{"error":"falta la clave de Resend"}` en `tareas_log` y se va en
  silencio. Por eso (f.6) mira `tareas_log`.

#### El hallazgo del bloque (g): el enlace de los correos

`correo_recibo` arma el enlace del recibo así (volcado, líneas 776-777):

```
v_enlace := coalesce(ajustes_correo.enlace_base,
                     (select valor from secretos where nombre = 'correo_enlace'))
```

O sea que **el dominio que le llega al residente en el correo no sale del
código de la app: sale de la base**, y puede ser distinto por organización.
El punto 1 dejó el código sin ninguna URL escrita a mano, pero eso no toca
esto. Si `secretos.correo_enlace` o cualquier `ajustes_correo.enlace_base`
quedó apuntando a `mi.vecitap.com`, los recibos que salgan de producción van
a mandar a la gente **al sitio de respaldo**, y el correo va a salir bien: no
hay error que lo delate.

La consulta (g.2) lista los dos orígenes con una columna
`apunta_al_respaldo`. Toda fila en `true` hay que corregirla **antes de
mandar el primer recibo**. La corrección es un `UPDATE`, así que no está en
este archivo (es de solo lectura): la hace Nicolás o va como migración.

#### El bloque (z): qué aplicar y en qué orden

Solo lo que (h) devuelva en `false`, y en este orden:

1. `20260926120000_membresias_multiples_por_organizacion` — primera porque es
   la única que **toca datos existentes**; si algo va a fallar por el estado
   de los datos, que falle con la base recién respaldada. Probablemente ya
   salga aplicada si producción viene del volcado del 27-sep.
2. `20260928130000_correos_malos_ver_solo_operador` — independiente y chica.
3. `20260928140000_garita_bitacora_dia_local` — crea las auxiliares. **La 4
   depende de esta.** Avisarle a Gustavo.
4. `20260929120000_segunda_ronda_dia_local` — trae sus dos guardas, así que
   es seguro intentarla.
5. `20260928120000_puede_ver_garita` — **NO aplicar todavía**: es del bloque
   13, que no arrancó.

Y una lista aparte, igual de importante, de **lo que no es una migración y
tampoco viaja en un `pg_dump`**, con el bloque que lo detecta al lado: las
tareas de `cron.job`, el bucket `comprobantes` y sus políticas, los tres
secretos, los `enlace_base` apuntando a vecitap.com, y la lista blanca de
Authentication → URL Configuration.

**Archivos del punto 4** — nuevos: `docs/consultas-produccion.sql`.

### Punto 5 — `docs/respaldo.md` ✅ (29-sep)

Runbook de respaldo diario para Windows + PowerShell, un comando por línea.
Ocho secciones: instalar, la cadena de conexión, la contraseña, dónde se
guardan, el respaldo, **qué no cubre**, cómo restaurar, la comprobación de que
no se coló nada en el repo, y el guion completo.

**El dato que cambia la urgencia de todo:** en el plan **Free de Supabase no
hay respaldos automáticos** — ni diarios ni point-in-time; eso llega con Pro.
Hasta que se pase a Pro, este procedimiento **es el único respaldo que tiene
Vecitap**. Está dicho en la primera línea del archivo.

**Los tres volcados** (`supabase db dump --db-url`), con la fecha y la hora en
el nombre (`yyyy-MM-dd-HHmm`, para poder hacer más de uno por día): `--role-only`,
esquema, y `--data-only --use-copy` (`COPY` en vez de un `INSERT` por fila:
archivo mucho más chico y restauración mucho más rápida).

**La cadena de conexión:** Session pooler (puerto **5432**, usuario
`postgres.<ref>`), no el de transacciones (6543, no soporta las sentencias
preparadas que necesita `pg_dump`) y no la conexión directa
(`db.<ref>.supabase.co`, que puede ser solo IPv6).

**La contraseña sin dejarla escrita:** `Read-Host -AsSecureString`, y la URI
se arma en memoria reemplazando el `[YOUR-PASSWORD]` que trae la que copia del
dashboard. Tres motivos dichos en el archivo, y el primero no es obvio:
**PowerShell guarda todo lo que uno escribe en `ConsoleHost_history.txt`**, en
texto plano y para siempre; esa carpeta está sincronizada con OneDrive; y el
repo es público. La contraseña pasa por `[uri]::EscapeDataString` — sin eso,
una contraseña con `@`, `/`, `#` o `?` rompe la URI y el error habla de "host
desconocido", que no ayuda.

#### Qué NO cubre — la sección larga a propósito

Un respaldo que uno cree completo y no lo es, es peor que no tener ninguno.

- **`auth.users` no está en los tres volcados.** Es lo más grave: al restaurar
  sobre un proyecto nuevo, la base vuelve con todas las unidades, recibos y
  membresías **y sin una sola cuenta** — cada `usuario_id` de `membresias`
  apunta a un usuario que no existe. La app queda intacta e inaccesible al
  mismo tiempo. Se cubre con `--schema auth` (que sí quedó en el guion) más un
  CSV legible de las cuentas, sin contraseñas.
- **Los archivos de Storage tampoco.** El bucket `comprobantes` guarda los
  comprobantes de pago de los residentes; ni los archivos ni la lista de
  objetos viajan en un `pg_dump`. Se bajan con `supabase storage cp`, que
  **cambió entre versiones del CLI** — por eso el archivo manda a mirar
  `supabase storage --help` primero, y por eso **no** está en el guion
  automático: meterlo sin comprobarlo daría la falsa impresión de que los
  comprobantes están respaldados.
- **Todo lo que no vive en una tabla**, en una tabla que remite al bloque de
  `docs/consultas-produccion.sql` que lo detecta: tareas de `cron.job`,
  buckets y sus políticas, los tres secretos, las extensiones, la config de
  Auth (Site URL, Redirect URLs, plantillas) y las variables de Vercel.

**La conclusión práctica, dicha explícitamente:** los tres volcados alcanzan
para **deshacer una migración que salió mal** —el 99 % de los casos y para lo
que se usan todos los días— y **no** alcanzan para **levantar el proyecto de
cero en otra cuenta**.

#### Restaurar

Un solo comando con `psql`, en el orden roles → esquema → datos, con
`--single-transaction`, `ON_ERROR_STOP=1` y
`SET session_replication_role = replica`. Los tres están explicados, porque
parecen ruido y no lo son: sin `ON_ERROR_STOP`, **`psql` sigue después de un
error** y la restauración "termina bien" con la mitad de las tablas vacías.

También dice lo que casi siempre es la respuesta correcta: para deshacer una
migración **no se restaura nada**, se usa el rollback de
`supabase/rollbacks/`. Y recomienda probar el respaldo una vez, con calma,
restaurando el de **pruebas** en un proyecto descartable — un respaldo que
nunca se restauró no se sabe si sirve.

#### La comprobación con `git check-ignore`, y la trampa que tiene

Los archivos van **fuera del repo**, sin negociación: un volcado de producción
tiene nombres, cédulas, correos, teléfonos y pagos de personas reales, y el
repo es **público**.

Las cuatro respuestas de `git check-ignore -v` **se probaron contra este
repo**, no se escribieron de memoria — y la tabla salió al revés de lo que
parecía:

| Respuesta | Código | Significa |
|---|---|---|
| `fatal: … is outside repository` | 128 | ✅ Lo que se busca |
| `fatal: Invalid path …` | 128 | ✅ Igual, pero ese archivo todavía no existe |
| `.gitignore:54:/*.sql …` | 0 | ⚠ Está **dentro** del repo, en la raíz, tapado por esa regla |
| **nada** | 1 | 🚨 Está **dentro** del repo y **no** ignorado |

**El silencio es la respuesta mala, no la buena.** Y pasa de verdad: la regla
`/*.sql` del `.gitignore` empieza con `/`, así que cubre **solo la raíz** — un
respaldo guardado en `docs/` o en `supabase/` no queda ignorado y
`check-ignore` se calla. Por eso la comprobación que manda es
`git status --porcelain`, y `check-ignore` queda como la que explica *por qué*
un archivo está o no protegido.

**Archivos del punto 5** — nuevos: `docs/respaldo.md`.

---

## Salida a producción — 29-sep, segunda tanda (puntos 6 a 9)

| # | Punto | Estado |
|---|---|---|
| 6 | Revisión de seguridad de `/auth/confirmar` | ✅ Hecho (4 correcciones) |
| 7 | Secretos en el historial de git | ✅ Hecho (1 hallazgo, rotar 2 claves) |
| 8 | Plantillas de correo de Auth | ✅ Hecho (3 plantillas + README) |
| 9 | `enlace_base` y los enlaces de los correos de la base | ✅ Hecho |

### Punto 6 — Revisión de `/auth/confirmar` ✅ (29-sep)

Cuatro cosas encontradas, las cuatro corregidas. Las dos primeras son reales;
las dos últimas son endurecimiento.

**1. `rutaInterna()` era evadible (real, no explotable hoy).** Dejaba pasar
`/⇥/ajeno.com` con **tabulador, salto de línea o retorno de carro**, y
`/..//ajeno.com`. Comprobado contra el parser de URL de verdad, no de
memoria:

```
"/\t/evil.com"   -> rutaInterna vieja devolvía "/\t/evil.com"
new URL("/\t/evil.com", base)  ->  origin http://evil.com
```

El parser de URL (y los navegadores) **borran** tab, `\n` y `\r` antes de
interpretar la dirección, así que `/⇥/ajeno.com` se convierte en
`//ajeno.com` **después** de que el `startsWith("//")` ingenuo ya dijo que
estaba bien. `/..//ajeno.com` normaliza a un `pathname` que arranca con `//`.

**No era explotable en esta ruta**, porque el destino se armaba copiando solo
`pathname`/`search` sobre una URL de este origen, y asignar `.pathname` nunca
reescribe el host (comprobado). Pero `rutaInterna()` es un helper exportado y
de uso general: estaba mal por sí solo, y la seguridad de la ruta dependía de
una propiedad implícita del parser que no se veía en el código.

Ahora: limpia los tres caracteres **antes** de comprobar nada, rechaza
cualquier `\`, y después **parsea contra un origen centinela
(`http://interno.invalid`, TLD reservado por RFC 2606) y exige que el origen
resultante siga siendo ese**. Esa última red hace que la lista de casos no
tenga que ser exhaustiva: cualquier forma nueva de escaparse cae ahí. Devuelve
la forma normalizada, sin fragmento. En la ruta quedó además la comprobación
explícita de origen, como defensa en profundidad.

**2. La rama de error perdía las cookies (real).** La respuesta de éxito se
armaba antes del canje y Supabase le escribía las cookies encima; pero **la
rama de fallo devolvía otra respuesta**, creada después, sin esas cookies. Es
exactamente la clase de bug que `redirigirConCookies()` existe para evitar en
`proxy.ts`, y `AGENTS.md` dice que **toda** rama de redirect tiene que llevar
las cookies. Importa porque en un canje fallido `@supabase/ssr` emite cookies
de **borrado** (limpiar un verificador PKCE ya usado, o una sesión rota), y se
perdían: el navegador se quedaba con cookies inválidas que reintentaba en cada
petición.

Corregido cambiando la forma, no parchando la rama: las cookies se juntan en
una lista y se aplican **a la respuesta que se devuelva**, sea cual sea. Ya no
hay forma de agregar una rama nueva y olvidarse.

**3. `type` llegaba del URL sin validar.** Se casteaba directo a
`EmailOtpType` y se pasaba a `verifyOtp`. Supabase lo habría rechazado, pero
un valor sin validar no debería llegar a una llamada de autenticación. Ahora
hay lista blanca de los seis tipos.

**4. El mensaje de error daba el consejo equivocado la mitad de las veces.**
Decía siempre «Pida uno nuevo con "Olvidé mi contraseña"», también cuando el
enlace que falló era de confirmación de cuenta. Ahora el enlace lleva
`de=registro|clave|correo` y el mensaje se adapta. **`de` solo cambia el
texto**: no toca destino ni permisos.

Lo que ya estaba bien y se confirmó: nunca se muestra `error.message` (la
diferencia entre "token inválido" y "token vencido" le sirve más a quien
prueba enlaces a mano que a la persona que se equivocó), y el caso de
`?error=access_denied&error_code=otp_expired` que manda Supabase cuando el
enlace venció cae solo en la rama de error sin leer ese texto de terceros.

Agregado de paso: `Cache-Control: no-store` — un aterrizaje de autenticación
depende de un token de un solo uso y trae cookies de sesión.

### Punto 7 — Secretos en el historial de git ✅ (29-sep)

Barrido de solo lectura sobre **72 commits** (`--all`: `integration`, `main`,
`optimization`). No se reescribió nada.

> Nota de método: el primer intento usó
> `git rev-list --all | xargs git grep -n "patrón" --`, que **no busca nada** —
> el `--` convierte los SHA en pathspecs. Se detectó con una búsqueda de
> control de un texto que se sabía presente. La forma correcta pone las
> revisiones **antes** del `--`. Si alguien repite esta auditoría, use primero
> un control positivo.

**Un solo hallazgo, y hay que rotar dos claves:**

| Qué | Dónde | Commits | Acción |
|---|---|---|---|
| Claves de las 3 cuentas de prueba: `admin.prueba` y `operador.prueba` = `temporal.1234`; `residente.prueba` = `12345678` | `scripts/validacion-bloque0.mjs:29-31` | Introducidas en **`e0f3dd0`** (27-sep, "Destino por rol, validación automatizada Bloque 0") y presentes en los 9 commits siguientes hasta `135e13c` | **Rotar las 3 claves** en Supabase Auth. Están en `origin/integration`, o sea **publicadas en GitHub desde el 27-sep** |

Siguen en el historial aunque el punto 1 las haya sacado del código actual:
borrarlas de un archivo no las borra del pasado. Como no se reescribe el
historial, **la única mitigación es rotarlas**. Son cuentas de prueba sobre
vecitap-pruebas, con datos ficticios, así que el daño posible es bajo — pero
`admin.prueba` tiene rol `administrador` sobre Administradora Baja y
`operador.prueba` es staff interno, así que no es cero. Rotar y sumar a la
limpieza de Fase 9, que ya las tiene listadas para eliminar.

**Lo que se buscó y NO está, que es la mejor noticia:**

| Buscado | Resultado |
|---|---|
| JWT con forma de clave (`eyJ….eyJ….`) | **Cero**, en los 72 commits |
| `sb_secret_` (service_role nueva) | **Cero** |
| `service_role` | 12 commits, **todos prosa**: avisos de "nunca use la service_role" en los HTML y en `.env.example`. Ninguna clave |
| Claves de Resend (`re_` + 16 o más) | **Cero** |
| Cadenas `postgresql://` / `postgres://` | **Cero** |
| Archivos `.env` versionados alguna vez | Solo `.env.example`. `.env.local` nunca entró |
| Clave de `vigilante.prueba` | **Nunca estuvo en el repo.** Aparece el correo en `docs/estado-migracion.md`, nunca la clave |

**La clave anon/publishable sí está** (`sb_publishable_75OWc-…`, 227
apariciones en los 4 HTML), y **no hay que rotarla**: es pública por diseño,
la seguridad la dan las políticas de RLS. Coincide con lo que ya decía
`AGENTS.md`.

**Dato tranquilizador sobre producción:** en todo el historial hay **una sola**
clave publishable y **un solo** ref de proyecto, los dos de **vecitap-pruebas**
(`hdivffuorclzulijkyry`). El ref de producción (`sudghmerriewjmmnlcrf`) **nunca
apareció** en ningún commit.

### Punto 8 — Plantillas de correo de Auth ✅ (29-sep)

`docs/plantillas-correo/`: tres plantillas más un README con dónde se pega
cada una.

| Archivo | Pestaña del dashboard | Asunto sugerido |
|---|---|---|
| `confirmacion-registro.html` | Confirm signup | `Confirme su cuenta de Vecitap` |
| `recuperar-clave.html` | Reset password | `Recupere su clave de Vecitap` |
| `cambio-de-correo.html` | Change email address | `Confirme su correo nuevo en Vecitap` |

**Magic link: la app no lo usa, así que se omite.** Se entra con correo y
clave (`signInWithPassword`); no hay ninguna llamada a `signInWithOtp` en todo
el código. El README lo dice y explica cómo derivarla si algún día hace falta.
Lo mismo con **Invite user** (Vecitap tiene su propio sistema de invitaciones:
tabla `invitaciones`, `crear_invitacion`/`aceptar_invitacion`, y el
administrador copia el código desde Admin → Accesos) y **Reauthentication**
(manda un código de 6 dígitos, ningún flujo lo pide).

**El enlace usa `{{ .TokenHash }}`, no `{{ .ConfirmationURL }}`**, y ese es el
motivo de que las plantillas existan:

```
{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=<tipo>&de=<intención>&siguiente=<ruta>
```

La plantilla por defecto pasa por `/auth/v1/verify` y vuelve con `?code=`, que
es PKCE y **exige el mismo navegador que pidió el enlace** (el verificador
vive en una cookie). En la práctica: pide el enlace en la computadora, abre el
correo en el teléfono, no funciona, y el mensaje no explica por qué. Con
`token_hash` el token viaja en la dirección y la ruta lo valida con
`verifyOtp`: **funciona en cualquier dispositivo**. La ruta acepta los dos
formatos, así que los correos con `?code=` que ya estén en una bandeja no se
rompen al cambiar las plantillas.

HTML de correo de verdad: tablas, estilos inline, botón con el color en el
`<td>` (Outlook ignora el `background` del `<a>`), preencabezado, el enlace
también en texto plano, y `Helvetica/Arial` en vez de Inter/Poppins (una
fuente web no se carga de forma fiable en un correo).

**Los colores van escritos a mano, y es la única excepción a la regla de
`AGENTS.md`** de que la paleta vive solo en `globals.css`. No hay alternativa:
el correo no entiende `var(--tinta)` y muchos clientes tiran el `<style>` del
`<head>`. El README trae la tabla de qué token es cada hex y el aviso de que
si cambia la paleta hay que venir a cambiarla acá.

### Punto 9 — `enlace_base` y los enlaces de los correos ✅ (29-sep)

Recorridos todos los `insert into cola_correo` del volcado. Son **tres
funciones**, y salen **dos** correos distintos:

| Correo | Lo arma | `tipo` | Enlace | Ruta que le agrega a `enlace_base` |
|---|---|---|---|---|
| **Recibo del mes** | `correo_recibo` vía `encolar_recibos(p_periodo)` (Admin → Cortes) | `recibo` | `<a href="{enlace_base}">` | **NINGUNA** |
| **Prueba de recibo** | `correo_recibo` vía `encolar_prueba(p_recibo, p_destino)` (Admin → Cortes) | `prueba` | igual | **NINGUNA** |
| **Aviso de visita en la puerta** | `garita_avisar(p_visita)` | `visita` | **no tiene enlace** | — |

**El hallazgo que cambia la respuesta: `enlace_base` se usa TAL CUAL, sin
concatenarle nada.** El volcado (L776-777 y L849) hace
`v_enlace := coalesce(ajustes_correo.enlace_base, secretos.correo_enlace)` y
lo mete directo en `<a href="%s">`. No es una "base" a la que se le pega una
ruta: es **la dirección completa y final** del botón "Véalo y reporte su pago
aquí".

Los tipos `mora`, `pago_confirmado` y `pago_rechazado` existen **solo** en el
CHECK de `cola_correo` (L4248): **ninguna función los produce**. Son valores
permitidos sin productor — la funcionalidad no está construida. Conviene
saberlo para no salir a buscar la plantilla que los arma.

Las invitaciones (residente y vigilante) **no salen por correo desde la
base**: el administrador copia el mensaje desde Admin → Accesos, y ese texto
ya usa `urlDelSitio()` desde el punto 1. Las invitaciones de visita de "Mis
visitas" tampoco: la tarjeta con el QR se genera en el navegador.

#### El valor exacto de `enlace_base` en producción

```
https://vecitap.com/mi
```

**Sin barra final.** Tres decisiones dentro de ese valor:

- **No `https://vecitap.com` a secas.** La raíz de la app nueva es la página
  "Sitio en construcción" (`app/(marketing)/page.tsx`). Un residente que toca
  el botón de su recibo llega a un callejón sin salida. **Éste es el riesgo
  concreto del punto 4 (g.2)**, y el correo sale bien: no hay ningún error que
  lo delate.
- **`/mi` y no `/entrar?volver=/mi`.** `/mi` está protegido por `proxy.ts`, así
  que quien no tenga sesión va igual al login y vuelve; y quien ya la tenga
  cae **directo en su recibo** sin ver una pantalla de login de más. Además se
  lee mejor en un correo.
- **Sin barra final.** Con `/mi/`, Next (que tiene `trailingSlash: false`)
  contesta un 308 a `/mi`: funciona, pero agrega un salto a cada enlace de
  cada recibo, y encima antes del salto de autenticación.

Hay que ponerlo en **los dos lugares**: `secretos.correo_enlace` (el global) y
cada fila de `ajustes_correo.enlace_base` que no sea NULL (el de cada
organización, que **pisa** al global). La consulta que las lista está en
`docs/consultas-produccion.sql`, bloque (g.2).

#### Rutas viejas que no existen en la app nueva

No hay ninguna ruta que el correo del recibo arme y que falte, porque no arma
ninguna. El desajuste real es otro: **las direcciones de la app vieja que la
gente ya tiene guardadas** — `index.html`, `admin.html`, `app.html`,
`operador.html`, `garita.html`. En `main` eran archivos servidos por GitHub
Pages; en la app nueva dan 404.

Corrección más chica, sin tocar la base: **seis redirecciones en
`next.config.ts`**, `/index.html` → `/mi`, `/admin.html` y `/app.html` →
`/admin`, `/operador.html` → `/operador`, `/garita.html` → `/garita`. Con
`permanent: false` (307) a propósito: un 308 se cachea en el navegador de cada
persona y cambiarlo después sale carísimo; durante el piloto conviene poder
corregir.

`mi.vecitap.com` sigue en pie y no se toca, así que los enlaces viejos a **ese**
dominio siguen funcionando solos. Esto cubre el caso de que alguien complete
la dirección de memoria sobre `vecitap.com`, que es lo que va a pasar apenas
se empiece a repartir el dominio nuevo.

**Lo que las redirecciones NO arreglan, dicho para que quede claro:** la raíz
`/` sigue siendo la página en construcción. Por eso `enlace_base` no puede
quedar apuntando ahí.

**Archivos de esta tanda** — nuevos: `docs/plantillas-correo/README.md`,
`docs/plantillas-correo/confirmacion-registro.html`,
`docs/plantillas-correo/recuperar-clave.html`,
`docs/plantillas-correo/cambio-de-correo.html`. Modificados:
`app/auth/confirmar/route.ts`, `lib/url-sitio.ts`,
`app/(marketing)/entrar/FormularioEntrar.tsx`, `next.config.ts`.

---

## Limpieza de `integration` — 29-sep

**La referencia de paridad pasa a ser `main`, congelada.** Los HTML salieron de
esta rama. Se leen sin cambiar de rama y sin restaurarlos:

```bash
git show main:admin.html | sed -n '3899,3960p'
git show main:index.html | grep -n "papelRecibo"
```

Cuando un comentario del código dice `admin.html:3899`, se refiere a ese
archivo **en `main`**. Como `main` está congelada, las líneas no se mueven: una
referencia escrita hace semanas sigue apuntando a lo mismo. La regla completa
quedó en `AGENTS.md`, sección "En esta rama no hay HTML".

### Verificación previa: nada del código dependía de los HTML

Hecha **antes** de borrar. Búsquedas sobre `app/`, `components/`, `lib/`,
`hooks/`, `scripts/`, `public/`, `types/`, `tests/`, `next.config.ts` y
`proxy.ts`:

```bash
# 1. toda mención de .html en código
grep -rniE "\.html" --include=*.ts --include=*.tsx --include=*.mjs \
  --include=*.js --include=*.json --include=*.css app components lib hooks \
  scripts public types tests next.config.ts proxy.ts tsconfig.json \
  package.json eslint.config.mjs

# 2. cualquier forma de leer/servir/redirigir un archivo de la raíz
grep -rniE "readFile|readFileSync|fetch\(|require\(|import\(|createReadStream|process\.cwd|__dirname|path\.join|rewrites|redirects|CNAME|logo-claro|logo-oscuro|favicon-180|favicon-32" \
  --include=*.ts --include=*.tsx --include=*.mjs --include=*.js \
  app components lib hooks scripts next.config.ts proxy.ts
```

**Resultado: ningún archivo lee, importa, sirve, redirige ni hace fetch de un
`.html`.** Los ~40 aciertos de la primera búsqueda son **todos comentarios** de
portabilidad (`* Portado de Accesos() en admin.html:3899-4252`) — documentación,
no dependencias. La segunda búsqueda devolvió solo referencias a `public/`
(`/logo-claro.png`, `/logo-oscuro.png`), imports diferidos de paquetes de npm
(`xlsx`, `pdfjs-dist`, `qrcode`, `jsqr`) y las redirecciones de
`next.config.ts` que se eliminaron en esta misma limpieza.

Comprobaciones puntuales antes de cada borrado:

- **Logos:** `sha256sum` confirmó que la copia de la raíz y la de `public/`
  eran **idénticas byte a byte** (`4cbdbf9d…` y `8243090d…`). Nada apunta a la
  raíz; los cinco usos del código (`Logo.tsx`, `papel-cortes`,
  `papel-estadisticas`, `recibo-papel`, `tarjeta-visita`) piden
  `/logo-claro.png`, que Next sirve desde `public/`.
- **`scripts/validacion-bloque0.mjs` no abre ningún HTML.** Lo único que
  miraba de la raíz eran los hashes de los logos, y como las dos copias eran
  idénticas los valores no cambian. Se ajustó el texto (decía "== raíz del
  repo", ahora "== public/ del repo") y el comentario que lo explicaba. **No
  hizo falta extraer nada de `main` a una carpeta temporal.**
- **`main` tiene todo lo que se borró**, verificado con
  `git ls-tree --name-only main` antes de tocar nada.

### Borrado

| Archivo | Por qué |
|---|---|
| `admin.html`, `index.html`, `garita.html`, `operador.html` | La referencia es `main`. Nada del código los usa |
| `CNAME` | GitHub Pages publica desde `main`; en esta rama no cumple ninguna función |
| `logo-claro.png`, `logo-oscuro.png` (de la raíz) | Duplicados byte a byte de `public/`, que es lo único que sirve Next |
| `hooks/useSesion.ts` | **Huérfano real**: ningún archivo lo importa. Resolvía el patrón `getSession()` + `onAuthStateChange()` de la Fase 3, que la sesión en cookies + Server Components dejó sin uso |
| Las 6 redirecciones `.html` de `next.config.ts` | Nadie usó nunca esas direcciones en vecitap.com: vivían en mi.vecitap.com, que sigue en pie. Eran una respuesta a un problema que no existe |

### Modificado

- **`AGENTS.md`** — sección nueva "En esta rama no hay HTML. La referencia de
  paridad es `main`", con los comandos `git show`, y las dos reglas que salen
  de ahí: los HTML son de solo lectura y de otra rama; todo cambio va en la
  app de Next.
- **`README.md`** — decía que los HTML "se mantienen en la raíz sin tocar".
  Ahora remite a `main`. De paso se actualizó la estructura, que no
  mencionaba `garita`, `auth/confirmar`, `proxy.ts`, `public/`, `docs/` ni
  `supabase/`.
- **`lib/formato.ts`** — el comentario decía que las copias de `nf`/`usd` en
  los HTML no se tocaban "porque los archivos quedan en la raíz como línea
  base". Ahora dice que ésta es la única copia de esta rama y que la
  referencia está en `main`.
- **`scripts/validacion-bloque0.mjs`** — el comentario y las dos etiquetas de
  los hashes de logos.
- **`docs/estado-migracion.md`** — las tres afirmaciones que quedaron falsas
  (Fase 1 "quedaron intactos en la raíz"; Fase 3 "la duplicación desaparece
  cuando cada HTML se reemplace"; Operador "sigue intacto como línea base"), y
  la del punto 1 de la salida a producción que decía "No se tocaron".
- **`next.config.ts`** — sin configuración propia otra vez, con el motivo
  anotado para que nadie las vuelva a agregar.

### Lo que NO se borró, y por qué

**Los 14 `eslint-disable` se quedan todos: ninguno está de más.** No se juzgó
a ojo, se midió:

```bash
npx eslint --report-unused-disable-directives   # exit 0, sin salida
```

Cero directivas inútiles. Son 6 de `react-hooks/exhaustive-deps` (el patrón de
cargar al montar sin volver a disparar) y 5 de `@next/next/no-img-element`
(imágenes de origen dinámico: logo de la administradora, comprobantes, tarjetas
de visita, donde `next/image` no aporta).

**`setModo` no está huérfano.** Se revisó por pedido explícito: tiene cuatro
llamadores vivos en `FormularioEntrar.tsx` (líneas 80, 87, 98 y 120), dos de
ellos en la red de seguridad del flujo implícito de recuperación de clave.

Y los candidatos que el análisis de imports marcó pero **no son** huérfanos:

- `app/(garita)/garita.css` — lo importa `app/(garita)/layout.tsx:2`.
- `app/(marketing)/page.module.css` — lo importa `app/(marketing)/page.tsx:1`.
- `types/jsqr.d.ts`, `types/barcode-detector.d.ts` — **declaraciones de tipos
  ambientales**. No se importan nunca: los toma TypeScript por el `include`
  del `tsconfig.json`. Borrarlos rompe el typecheck de
  `await import("jsqr")` y del lector nativo de QR.

### Dejados con duda, para que los decida Nicolás

| Qué | Motivo |
|---|---|
| `favicon-180.png`, `favicon-32.png` (raíz) | **No tienen copia en `public/`**, así que quedan fuera de la regla de borrado. Ahora sí están huérfanos: los referenciaban solo los cuatro HTML. La app usa `app/favicon.ico` y **no tiene ícono para pantalla de inicio en el teléfono** — algo que `main` sí tenía. Lo limpio no es borrarlos: es moverlos a `app/apple-icon.png` y `app/icon.png`, que es como Next los toma por convención. Es un cambio de producto (cambia lo que se ve al guardar la app en el teléfono), así que no se hizo sin aprobación |
| `estadoUnidadDesdeSaldo()` y `UMBRAL_SALDO` (`lib/estados-unidad.ts`) | `estadoUnidadDesdeSaldo` **no tiene ningún llamador**, y `UMBRAL_SALDO` solo se usa dentro de esa función: borrar una deja huérfana a la otra. Pero `UMBRAL_SALDO` es, por decisión escrita de la Sesión 1 de Admin, **la fuente única del umbral de saldo** que reemplazó a los literales `0.01`/`0.009` de `app.html`. Borrarla sería deshacer esa decisión en silencio, no limpiar. Lo que hay acá es una deriva —el umbral quedó sin usar— que merece revisarse, no un borrado |
| `ROLES_GARITA_ADMIN_ORG` (`lib/admin/constantes.ts`) | Sin usar hoy, pero está puesta para el **bloque 13** (vista de Garita dentro de Admin), que todavía no arranca. Borrarla es tirar trabajo ya hecho |
| ~20 `type`/`interface` exportados que nadie nombra fuera de su archivo (p. ej. `Cruce`, `LineaRecibo`, `MetricasCartera`) | Son la API declarada de cada módulo y no cuestan nada en el bundle: los tipos desaparecen al compilar. Tocar veinte archivos el día antes del lanzamiento, para no ganar nada en tiempo de ejecución, es riesgo sin beneficio |

### Verificado al cerrar

`npm run lint`, `npx tsc --noEmit` y `npm run build`, los tres en verde
después de los borrados. El análisis de imports se volvió a correr y no
apareció ningún huérfano nuevo. Nada de `docs/`, `supabase/migrations/`,
`supabase/rollbacks/`, `scripts/`, `.env.example` ni de los archivos ignorados
por Git (`esquema_inicial.sql` incluido) se tocó.

---

## Propietarios con varias unidades — fase 1 (30-sep)

Origen: `PARA_NICOLAS_propietarios_varias_unidades.md` (Claude de Gustavo,
30-sep). **Solo la fase 1** ("¿quién paga el condominio?" por unidad + total
en el portal). La fase 2 (pago agrupado) queda **fuera de alcance**.

Decisión de Nicolás: `paga` va en **`unidades`**, no en `vinculos`
(`mis_unidades()` y `saldo_visible()` no leen `vinculos`, y
`vinculos.persona_id` apunta a `personas`, no a usuarios de Auth).

### Paso 1 — Lectura ✅ (30-sep)

Consulta de `pg_get_functiondef` / `pg_policies` corrida por Nicolás en las
**dos** bases: coinciden entre sí y con `esquema_inicial.sql`. "Vigente" en
`vinculos` es **`hasta is null`** en toda la base (`destinatarios_de`,
`garita_directorio`, `garita_vehiculos`, el índice parcial, `vigente()` del
cliente); ninguna función compara `hasta` con la fecha. En pruebas no hay
ningún `hasta` cargado; en producción `vinculos` está vacía.

### Paso 2 — Migración ✅ construida, sin aplicar (30-sep)

`supabase/migrations/20260930120000_unidades_paga.sql` + su rollback. El
detalle y el porqué de cada decisión están en el encabezado del archivo. En
corto:

- `unidades.paga` (`'propietario'` | `'inquilino'`, default `'propietario'`).
- **Guarda B** (BEFORE en `unidades`): `paga = 'inquilino'` exige un inquilino
  vigente. Mensaje en castellano para mostrar tal cual en Admin.
- **Disparador A** (AFTER en `vinculos`): cuando se va el último inquilino
  vigente (se le pone `hasta` —aunque sea futuro—, se borra, cambia de tipo,
  de unidad o de organización), `paga` vuelve a `'propietario'`.
- A bloquea la fila de la unidad antes de contar, para que dos cambios
  simultáneos no dejen `paga = 'inquilino'` sin inquilinos.
- **Ninguno de los dos es SECURITY DEFINER** (justificado en el archivo:
  quien escribe ya pasa `puede_operar` y ve todo lo que hace falta contar).
- `mis_unidades()`: DROP + CREATE con `paga` al final; mismos atributos y
  permisos.
- **Política de `unidades`: sin hueco.** La única de escritura es
  `unidades_escribir` (`puede_operar` = propietario_cuenta/administrador) y
  ninguna función escribe en `unidades`. No se corrigió nada.

**Probada en un Postgres embebido (PGlite), no contra ninguna base:** esquema
mínimo con las mismas políticas, `puede_operar`/`tiene_rol` y permisos del
volcado. 24 casos en verde: B acepta/rechaza (también en INSERT y con un
vínculo de otra organización), A en sus cinco disparos, A con dos inquilinos,
cascada al borrar la unidad, todo de nuevo **con RLS como administradora y
como residente**, `anon` sin EXECUTE, el ACL de `mis_unidades()` idéntico
antes y después, y el rollback. **No se probó la concurrencia** (una sola
conexión): el razonamiento está en el archivo.

La prueba encontró un bug antes de aplicar: con `search_path = ''` en los
disparadores, las políticas de RLS fallaban porque `puede_operar` no fija su
propia ruta (ver pendientes). Quedaron con `search_path TO 'public'`.

**Supuesto pendiente de confirmar con Gustavo:** "inquilino vigente" se
define por `vinculos`, no por `membresias` (un inquilino puede estar en el
directorio sin cuenta en la app).

### Paso 3 — UI ✅ construida, sin validar (30-sep)

Construida **sin esperar la regeneración de tipos** (pedido de Nicolás):
`paga` se agregó a mano en `types/supabase.ts` (Row/Insert/Update de
`unidades` y el `Returns` de `mis_unidades`), en el mismo orden alfabético
que usa el generador y con un comentario `// PROVISORIO (30-sep)` encima de
cada línea. Al regenerar, el diff contra la edición manual tiene que ser
**solo la desaparición de esos cuatro comentarios**.

- **`lib/paga.ts`** (nuevo): `type Paga = "propietario" | "inquilino"`,
  `pagaDe()` (cualquier otro valor, incluido `undefined` si la migración no
  está aplicada, se lee como `propietario`) y `leerPagaPegado()` para el
  importador.
- **Admin, ficha de la unidad (`DatosUnidad`)**: selector "¿Quién paga el
  condominio?". Si se elige Inquilino sin inquilino cargado, aviso y no
  guarda (y si la base rechaza igual, se muestra su mensaje tal cual).
  **Orden de guardado:** unidad → propietario → inquilino → `paga` al final,
  con `.select()` para detectar un UPDATE que RLS filtra en silencio.
- **Admin, ficha: "El inquilino ya no ocupa la unidad"** (caso 32): con
  confirmación, le pone `hasta = hoyLocalISO()` al vínculo vigente. **No toca
  la membresía**: el texto de confirmación y el de éxito le recuerdan a la
  administradora que la cuenta sigue entrando hasta darla de baja en Accesos.
  Al terminar vacía el formulario del inquilino (si no, el próximo "Guardar
  cambios" recrearía al que se fue como inquilino nuevo).
- **Admin, Propietarios**: etiqueta "Paga: inquilino" bajo el nombre del
  inquilino. `UnidadConPaga` (en `lib/admin/tipos.ts`) solo la piden
  Propietarios y la ficha; Inicio y Cortes no dependen de la columna.
- **Admin, importar unidades**: cuatro columnas opcionales **después** de
  las seis de `main`: quién paga, nombre, teléfono y correo del inquilino
  (un pegado con el formato de `main` se lee igual que antes). Ver
  "Decisiones tomadas sin consultar" abajo.
- **Residente, `/mi`**: `ResumenUnidades` arriba del selector, con la lógica
  en `lib/residente/resumen.ts`. "Lo que usted paga" (saldo de cada unidad y
  total) y "Lo paga su inquilino" (solo "Al día" / "Debe"). Unidad con
  `saldo` null → "ver recibo", fuera de la suma.
- **"Debe N cuotas": no se construyó.** `mis_unidades()` no trae ningún dato
  que lo diga, y calcularlo en el navegador está prohibido. Se muestra solo
  "Al día" / "Debe". Para tenerlo hace falta una columna nueva en
  `mis_unidades()` (decisión de Nicolás).

**Probado:** typecheck, lint y build en verde. La lógica pura
(`leerPagaPegado`, `pagaDe`, `resumenPropietario`) con 18 casos en el
scratchpad, incluida la prueba 1 del documento de Gustavo (3 unidades, el
total suma solo 2). **Nada probado en el navegador.**

### Decisiones tomadas sin consultar (Nicolás no estaba; la más conservadora)

1. **El total suma solo las deudas.** Un saldo a favor en una unidad **no**
   se descuenta del total de las otras: no paga la deuda de otra unidad, y
   restarlo invitaría a pagar de menos. La unidad a favor se sigue
   mostrando con su monto, y una nota lo explica.
2. **El resumen aparece solo si es propietario de 2 o más unidades.** Las
   que alquila quedan "como hoy" (fuera de los dos grupos y fuera del
   umbral). Con 1 propia + 1 alquilada, la pantalla no cambia. La regla 3 de
   Gustavo (el inquilino que alquila varias ve un total) **no se construyó**,
   porque el pedido fue "el inquilino ve sus unidades como hoy".
3. **Umbral de "debe": `saldo > 0`, sin margen**, el mismo de
   `TarjetaSaldo` (paridad con `main`), para que el resumen y la tarjeta
   digan lo mismo de la misma unidad. No se usó `UMBRAL_SALDO`.
4. **Importador: el inquilino entra con columnas nuevas.** El de `main` no
   tenía columnas de inquilino, así que una fila con "inquilino" en quién
   paga no podía ser válida nunca. Se agregaron nombre, teléfono y correo
   del inquilino al final. Errores por fila: palabra ilegible en quién paga,
   "paga el inquilino, pero la fila no trae su nombre", datos de inquilino
   sin nombre, correo del inquilino inválido. Las unidades se crean con el
   default y `paga` se fija al final, cuando los vínculos ya existen: la
   guarda B nunca rechaza una importación válida. Si falla un paso
   intermedio, el mensaje dice qué quedó cargado y qué no (la carga no es
   atómica, igual que en `main`).
5. **4b: disparador, no FK compuesta.** Ver el encabezado de la migración: una
   segunda FK entre `unidades` y `vinculos` hace ambiguo el embed
   `vinculos(...)` de PostgREST (PGRST201) y tumbaría Propietarios, la
   ficha, Inicio y Cortes, salvo que se borre la FK actual.
6. **4a: `puede_operar` NO es SECURITY DEFINER** (el pedido decía
   "conservá SECURITY DEFINER"). Según el volcado es de invocador; se
   conserva como esté, con `ALTER FUNCTION ... SET`, que no toca nada más.

### Migraciones 4a y 4b ✅ construidas, sin aplicar (30-sep)

- **`20260930130000_puede_operar_search_path.sql`**: `ALTER FUNCTION
  public.puede_operar(uuid) SET search_path TO 'public'`. Guarda: md5 del
  cuerpo = el del volcado, `sql`/`STABLE`, sin `SET` previo; si no, aborta.
  Por qué no cambia quién pasa: explicado en el encabezado. **Costo:**
  `puede_operar` deja de inlinearse en las políticas (confirmado con EXPLAIN
  en PGlite: antes `Filter: tiene_rol(...)`, después
  `Filter: puede_operar(...)`). Una llamada más por fila; la verificación 5
  da la consulta para medirlo en pruebas. Alternativa anotada en el archivo.
- **`20260930140000_vinculos_org_coherente.sql`**: disparador en `vinculos`
  (la unidad tiene que ser de la misma org) y en `unidades` (no cambiar de
  org una unidad con vínculos). Guarda: aborta si ya hay filas cruzadas.
  Consulta previa incluida en el archivo.

**Probadas en PGlite** (`puede_operar`, `tiene_rol`, políticas y permisos
copiados del volcado; para la guarda md5, el cuerpo byte a byte): 30 casos,
incluidos la guarda que aborta (cuerpo distinto, aplicar dos veces, fila
cruzada existente), RLS como administradora de cada org y como residente,
los dos rollbacks, y **las tres migraciones del 30-sep aplicadas juntas y
revertidas en orden inverso**. La de `paga` volvió a pasar sus 24 casos.
`package.json` del proyecto sin tocar (PGlite vive solo en el scratchpad).

### Pendientes que dejó este trabajo

1. **Un inquilino que se va conserva su membresía.** Ahora hay una acción
   que cierra el vínculo (caso 32) y dispara A, pero la membresía en la app
   sigue apagándose a mano en Accesos (decisión de Nicolás: no tocarla).
   Si la administradora se olvida, el ex-inquilino sigue viendo la unidad,
   reportando pagos y creando invitaciones de visita a la garita.
2. ~~Un vínculo puede apuntar a una unidad de otra organización~~:
   migración escrita (4b), sin aplicar.
3. ~~`puede_operar` no fija `search_path`~~: migración escrita (4a), sin
   aplicar.
4. **`vinculos.persona_id` tampoco está atado a la organización**: un
   vínculo podría apuntar a una persona de otra org. Mismo tipo de hueco, del
   lado de la persona. La consulta previa de 4b lo cuenta, pero no se
   bloquea. Candidato para la Fase 5.
5. **`puede_ver_garita()`** (20260928120000) se creó sin
   `REVOKE ... FROM PUBLIC`. Devuelve un booleano y mira `auth.uid()`, así
   que no filtra nada; anotado por consistencia.
6. **Importador, heredado de `main`:** separa columnas por coma, punto y coma
   o tabulación, así que un decimal con coma (`2,41144`) se parte en dos
   columnas; el propio ejemplo del placeholder lo hace. **Corregido el
   04-oct:** esto vale también para el pegado desde Excel. La expresión
   corta en cualquier coma aunque la línea venga con tabulaciones, así que
   un Excel en español (coma decimal) tampoco funciona. Detalle y el resto
   de los hallazgos en "Importar unidades y Cargar saldos con la planilla
   real del piloto (04-oct)", al final de este archivo.
7. **"Debe N cuotas"**: ver arriba.
8. **Supuesto pendiente con Gustavo:** "inquilino vigente" se define por
   `vinculos`, no por `membresias`.

---

## Fase 1 de varias unidades: ajustes de Gustavo y aplicación en pruebas — 01-oct

Rama de trabajo: **`dev`** (Nicolás hizo commit y push del trabajo del 30-sep
ahí, no en `integration`). Nada pasa a `integration` hasta que las
migraciones estén aplicadas en las dos bases. **El 01-oct a la tarde se carga
el edificio piloto en producción: ese día no se toca `integration` ni
producción.**

Ojo para el merge futuro: `integration` tiene 3 commits de la cuenta
`vecitap` posteriores a la base de `dev` (portada y marca, el último
`0bcb42c` del 30-sep 19:19). Hay que traerlos a `dev` antes de mergear.

### MCP de Supabase (alcance local, fuera del repo)

- `supabase-pruebas` → `hdivffuorclzulijkyry`, con escritura (usuario `postgres`).
- `supabase-produccion` → `sudghmerriewjmmnlcrf&read_only=true`. Confirmado
  de solo lectura: usuario `supabase_read_only_user`,
  `transaction_read_only = on`, y `create temp table` falla con
  `ERROR 25006 … read-only transaction`.
- Configurados con `claude mcp add --scope local` (en `~/.claude.json`,
  nunca en `.mcp.json`: el repo es público). Tropezón: la extensión de VS Code
  abre el proyecto como `c:\…` y el CLI como `C:\…`, y `~/.claude.json` los
  guarda como dos entradas distintas; hubo que copiar los servidores a la
  entrada `c:/…`.
- **`execute_sql` con un `DROP` volvía `declined`** desde la sesión de VS Code
  (la confirmación de sentencias destructivas del servidor de Supabase no
  llegaba a mostrarse). Al retomar la sesión, pasó. Si se repite: correr el
  bloque en el SQL Editor de pruebas.

### Comparación de estructura pruebas ↔ producción (esquema `public`)

Idénticas en columnas (385), restricciones (171), índices (82), políticas (63)
y disparadores (25). Diferencias:

- `aceptar_invitacion`, `crear_invitacion`: mismo contenido, solo cambia el fin
  de línea (CRLF en pruebas, LF en producción).
- **Permisos de tabla:** en producción `anon` tiene `Dxtm` (TRUNCATE,
  REFERENCES, TRIGGER, MAINTAIN) en casi todas las tablas, y `secretos` le da
  `Dxtm` a `authenticated`; en pruebas no. Ninguno lee ni escribe filas y
  PostgREST no hace TRUNCATE, así que no es explotable por la API. Candidato
  para la Fase 5: quitarlos.

### Chequeos previos (las dos bases, iguales)

`proacl` de `mis_unidades()` = `{postgres=X/postgres,authenticated=X/postgres}`;
`paga` no existía; md5 de `puede_operar` = `84d6594f…` (no SECURITY DEFINER,
sin `SET`); consulta previa (a) de la 140000 = 0; vínculos con persona de otra
org = 0; membresías con edificio o unidad de otra org = 0.

### Cambios por las respuestas de Gustavo ✅ construidos

1. **"Inquilino vigente" = el del directorio**, con o sin cuenta: confirmado,
   deja de ser supuesto.
2. **Se va el último inquilino → se apagan los accesos de inquilino de esa
   unidad.** Parte **3b** de `20260930120000_unidades_paga.sql`:
   `vinculos_inquilino_sale_accesos()`, **SECURITY DEFINER** y acotada (una
   sola actualización, `activo = false`, solo rol residente / relación
   inquilino / esa unidad / esa org; solo si el vínculo era de la org de la
   unidad y no queda otro inquilino; sin EXECUTE para nadie;
   `search_path TO 'public'`). Hace falta porque la política `mem_admin`
   (leída por MCP) solo deja escribir `membresias` a `propietario_cuenta`: con
   permisos de una `administrador`, el UPDATE afectaría 0 filas. La pantalla
   dice "También se le quitó el acceso a la app" solo si el conteo de accesos
   activos bajó.
3. **Saldo a favor en línea aparte** ("Saldo a favor en 05A: $ X"), sin
   descontarlo del total.
4. "Debe N cuotas": no hace falta.
5. **Regla 3 dentro de la fase 1:** "Lo que usted paga" = propietario con paga
   propietario + inquilino con paga inquilino; "Lo paga su inquilino" =
   propietario con paga inquilino; aparece con 2 o más unidades en total.

Probado en PGlite: 41 casos de las migraciones (11 nuevos de 3b, entre ellos
"sin 3b una administradora no puede; con 3b sí") y 24 de `paga`, con
rollbacks; 22 de lógica pura del resumen.

### Aplicadas en vecitap-pruebas ✅ (01-oct), con `execute_sql`, no `apply_migration`

| Migración | Resultado de sus verificaciones |
|---|---|
| `20260930120000_unidades_paga` | 1–8 todas como se esperaba. Las 56 unidades en `propietario`; B rechaza con su mensaje; A devuelve `paga` al cerrar o borrar; un residente actualiza 0 filas; 3b como **administradora**: su UPDATE directo a `membresias` = 0 filas, y al cerrar el último inquilino los accesos pasan de 1 a 0, sin tocar los de propietario ni otras unidades |
| `20260930130000_puede_operar_search_path` | Guarda pasó. Solo cambió `proconfig = {search_path=public}`; mismo cuerpo, permisos y dueño. Administradora sobre su org = true, sobre otra = false, residente = false, sin sesión = false, con `search_path` vacío = true (antes, error). El filtro de RLS pasó de `tiene_rol(...)` a `puede_operar(...)` (dejó de inlinearse); con 6 pagos el tiempo no es medible |
| `20260930140000_vinculos_org_coherente` | Consulta previa (a) = 0, guarda pasó. Vínculo cruzado rechazado (como postgres y como administradora con RLS), cambiar de org una unidad con vínculos rechazado, el alta legítima aceptada |

Las verificaciones con escritura corrieron dentro de bloques `DO` que terminan
en `raise exception` (todo se deshace); donde faltaban datos de prueba
(administradora de esa org, membresía de inquilino, persona de la org) se
crearon temporales dentro del mismo bloque. Controles posteriores: nada quedó
escrito.

`types/supabase.ts` regenerado contra pruebas (PowerShell, `Out-File
-Encoding utf8`): desaparecen las 4 líneas `// PROVISORIO`, y aparecen
`dia_local`, `hoy_local` e `inicio_dia_local`, que existen en las dos bases
desde las migraciones del 28 y 29-sep y no estaban en la última regeneración.
Typecheck, lint y build en verde.

### Hallazgos nuevos (sin tocar)

1. **"Dar de baja" en Accesos no funciona para una `administrador`**: el
   UPDATE a `membresias` afecta 0 filas por `mem_admin` y no muestra error.
   Hoy en producción hay una sola membresía (`propietario_cuenta`), así que no
   afecta al piloto todavía.
2. **El correo del recibo dice "a la tasa de hoy" pero usa la tasa del
   período** (`correo_recibo` usa `periodos.tasa_bcv`). El recibo en papel y
   el portal usan la tasa viva (caso 17, portado). Ver la propuesta del correo.
3. Los permisos `Dxtm` de `anon` en producción (arriba).

### Falta para producción (después de la carga del piloto)

1. Respaldo (`docs/respaldo.md`).
2. Las tres migraciones en el mismo orden (120000, 130000, 140000), cada una
   con su consulta previa y sus verificaciones. La corre Nicolás.
3. Validar en el navegador contra pruebas (Preview de `dev`): ficha (selector,
   "ya no ocupa la unidad"), importador, resumen del portal.
4. Traer los 3 commits de `integration` a `dev`, y recién entonces mergear
   `dev` → `integration`.

---

## Importar unidades y Cargar saldos con la planilla real del piloto (04-oct)

Diagnóstico contra la planilla con la que Gustavo cargó el edificio piloto
(CSV y `.xlsx`, 54 filas). Se probó la lógica de la rama `dev` copiada tal
cual en un script, sin tocar ninguna base y sin cambiar código. La planilla
tiene datos personales reales: **no está en el repo** y no se la usa en
pruebas. Para eso hay una copia anonimizada fuera del repo, con el mismo
formato byte a byte salvo nombres, teléfonos y correos; el importador da
fila por fila el mismo resultado con las dos. Las unidades se nombran por
su código.

Formato de la planilla: separada por comas, con comillas en los campos que
tienen coma. Alícuota con coma decimal (`"1,48768"`). Saldo como texto con
punto de miles, `$` y negativo con espacio (`"- 2.096,66 $"`, `"- 0,00 $"`,
`-   $`). Siete columnas: código, alícuota, saldo, propietario, teléfono,
correo y "Correo 2". Finales de línea CRLF. En el `.xlsx` la alícuota es un
número y el saldo un texto, y los encabezados son otros (`COPROPIETARIOS`,
`Celular`, `Correo 1`).

**"Importar unidades" no tiene subida de archivo**, ni en `dev` ni en
`integration` ni en `main`: solo un cuadro de texto. El único lugar que
acepta `.csv`/`.xlsx` es "Cargar saldos", que no crea unidades.

### Importar unidades (`components/admin/ImportarUnidades.tsx`)

Pegado desde Excel: **0 de 55 filas cargables**. El CSV abierto como texto
y pegado: también 0 de 55.

| # | Problema | Filas | Causa |
|---|---|---|---|
| 1 | Cualquier coma corta la columna, aunque el pegado venga con tabulaciones. La alícuota queda en su parte entera y todo lo demás se corre. | Las 53 con alícuota. Nombres con coma: PB. L-B, 01C, 01D, 03A, 03B, 03D, 04A, 04C, 07A, 09A, 09B, 10A, 11C, 12B, Mz. L-B | `:68`, `split(/[\t;,]/)` |
| 2 | Las comillas del CSV no se interpretan: la alícuota llega como `"14` y es ilegible. | Todas (CSV pegado) | `:68` |
| 3 | `num()` no entiende `$` ni el espacio de `- 0,00 $`: el saldo da `null`, **no se marca error** y se carga 0 sin avisar. | Todas las que tienen saldo; las de más riesgo, las de miles y las negativas | `lib/formato.ts:66-71`, `:126` (`f.saldo \|\| 0`). `parseMonto` ya lee este formato |
| 4 | **Regresión de la fase 1:** la columna 7 ("Correo 2") se lee como "quién paga" y da error. `integration` la ignoraba. | 30 filas con Correo 2 | `:75`, `:86` |
| 5 | El encabezado aparece como una fila con error. | CODIGO | `:61-64` |
| 6 | Fila sin alícuota: rechazada, que es lo correcto. | Estacionamiento | `:82` |
| 7 | Teléfonos sin validar, guardados tal cual: con un nombre adentro (10C, 10D) y extranjeros (+52) que `normalizarTel` no entiende (12C, 12D). | 10C, 10D, 12C, 12D | `lib/admin/personas.ts:27` |
| 8 | Un propietario repetido se crea como una persona por unidad. | 13 grupos; el mayor, 02A–02D, 08C, 08D | `vincular()`, `:107-110` |

Lo que sí carga: 6 columnas separadas por tabulaciones, punto decimal, sin
`$`, sin comas en el nombre y sin encabezado. Así cargan 53 de 54
(Estacionamiento queda afuera).

### Cargar saldos (`components/admin/ImportarSaldos.tsx`)

`leerCSV` y SheetJS leen bien las columnas, pero **el monto es el último
número de la fila** (`:88`). Con esta planilla escribe saldos falsos sin
avisar: sale del teléfono (por ejemplo `0414-…` da 414) en 26 filas y de los
dígitos de un correo en 19. Solo en 9 sale del saldo. El CSV y el `.xlsx` dan
el mismo resultado.

### Estado

Nada corregido todavía: es el insumo del importador nuevo (bloque de mejoras
para la próxima carga del piloto). Los datos que Gustavo cargó en producción
fueron una prueba y se van a reemplazar.

**Para quien pegue antes de que esté el importador nuevo**, con la fase 1 en
producción: solo 6 columnas, porque una séptima ahora se lee como "quién
paga".

### Borrado de las dos organizaciones de prueba en producción

`supabase/scripts/20261004_borrar_orgs_prueba_piloto.sql`. No es una
migración (borra datos, no cambia el esquema) y no tiene rollback: el reverso
es el respaldo. Por omisión corre en **modo ensayo**: hace todo, informa y
termina con un error que deshace la transacción. Solo borra de verdad con
`v_confirmar = true`. Lo corre Nicolás en producción, después del respaldo.

- Un solo `DELETE` sobre `organizaciones`. Las 27 tablas que dependen de ella
  tienen `ON DELETE CASCADE`, y `membresia_ultimo_admin()` deja pasar el
  borrado cuando la organización ya no existe. Después se borra `auditoria`,
  que tiene `org_id` sin clave foránea y además recibe filas nuevas del
  propio borrado.
- No toca usuarios de Auth ni Storage: el informe dice cuántas cuentas
  quedan sin membresía y cuántos comprobantes hay que borrar a mano.
- **Ensayo en vecitap-pruebas (04-oct)**, con dos organizaciones de pruebas
  que tienen pagos, recibos, cortes, vínculos y personas (las relaciones
  `RESTRICT` internas): borró 25 tablas con datos, todo quedó en 0, sin
  errores. Después se comprobó que nada quedó escrito (las 5 organizaciones
  y sus filas intactas).

## Validación de la fase 1 en el Preview: tres problemas bloqueantes (05-oct)

Nicolás los encontró al validar la fase 1 en el Preview de `dev` (base
vecitap-pruebas), el 04-oct a la noche. Se arreglaron en `dev` antes de
subir la fase 1 a producción. Causas confirmadas con los logs de pruebas
(Auth, API y Postgres), solo lectura.

### 1. Una cuenta no podía aceptar una segunda invitación

**Causa:** no era la base. `aceptar_invitacion()` ya acepta una segunda
unidad de la misma organización y una de otra organización: la membresía es
única por (organización, usuario, rol, unidad, edificio), así que cada
unidad nueva es una fila nueva. Lo que faltaba era la pantalla: el
formulario del código solo aparecía en `/mi` para una cuenta **sin**
unidades ("Falta un paso"). Una cuenta con una unidad no tenía dónde pegar
el segundo código.

**Arreglo:**
- **Ruta nueva `/mi/agregar`**: el mismo formulario, con el título "Agregar
  otra unidad" cuando la cuenta ya tiene unidades. Al aceptar, lleva al
  recibo de la unidad nueva. `aceptar_invitacion()` devuelve la
  organización, no la unidad, así que se compara `mis_unidades()` antes y
  después.
- **Botón "+ Agregar otra unidad"** en `/mi/[unidadId]`, visible siempre,
  también con una sola unidad.
- **"Copiar el mensaje completo" (Accesos)** ahora lleva a
  `/entrar?volver=/mi/agregar?codigo=…`. El campo aparece ya lleno, pero
  hay que tocar el botón para aceptar. Sirve con o sin unidades previas, y
  con la sesión abierta `/entrar` sigue de largo (ver el punto 3).
  - El código viaja en la URL. Es el mismo que va en el texto del mensaje,
    atado a ese correo, de un solo uso y válido 7 días.
  - `/mi/agregar` solo pone en el campo un valor hexadecimal.
- **Sin migración** para este punto.

**Límite conocido:** si alguien abre `/mi/agregar?codigo=…` directo y sin
sesión, `proxy.ts` lo manda a `/entrar?volver=/mi/agregar` sin el código,
porque el proxy guarda solo el camino en `volver`. Hay que pegarlo a mano. El
enlace que arma Accesos no tiene este problema: ya va por `/entrar`.

### 2. Accesos: "[object Object]", tarjeta de un código viejo y revocar que no anduvo

**Causa (logs, 05-oct UTC):**
- **02:53** La administradora genera dos invitaciones para el mismo correo:
  03C y después 04D.
- **02:58–02:59** En el **mismo navegador** se crea y se abre la cuenta del
  inquilino. Las cookies de sesión son una sola por navegador, así que la
  pestaña de Accesos pasó a llamar a la base como inquilino, aunque seguía
  mostrando la pantalla de la administradora.
- **03:00** El inquilino acepta la invitación de 04D.
- **03:02:42** `crear_invitacion` → 400 **"Sin permiso para invitar"**, con
  el usuario del inquilino.
- **03:04:02 y 03:04:05** `revocar_invitacion` → 400 **"Sin permiso"**, dos
  veces, con el usuario del inquilino.
- **03:04:59** Vuelve a entrar la administradora: revocar (03:05:11) y
  generar (03:05:34) funcionan.

O sea: no fue una invitación pendiente duplicada, ni otra restricción, ni un
tiempo agotado. El error salió como "[object Object]" porque `supabase.rpc()`
devuelve `error` como **objeto plano** (postgrest-js 2.116), y el patrón
`e instanceof Error ? e.message : String(e)` lo convertía en texto así. La
tarjeta que quedó a la vista era la del código de 04D, generado antes: la
generación fallida no la limpiaba.

**Arreglo:**
- **`lib/errores.ts` → `mensajeDeError()`**: la regla única para mostrar
  errores, aplicada en los 13 lugares con el patrón de "[object Object]" y
  en los que mostraban `error.message` crudo (Cobros, CrearOrganizacion,
  Edificio nuevo, Primer edificio, Logo, Cargar saldos, Mis vehículos,
  Reportar pago y las cuatro vistas de Garita). Qué devuelve:
  - Los `raise exception` de nuestras funciones salen tal cual: ya están en
    español.
  - Los errores conocidos de Postgres salen con una frase fija en español.
  - Los de conexión dicen "No pudimos conectar. Reintente."
  - El resto, un texto genérico. El detalle va a la consola.
  - No se tocaron `FormularioEntrar.tsx`, que tiene sus propios textos de
    Auth, ni las comparaciones por mensaje de `CierreMes.tsx`.
- **La invitación nueva reemplaza a la pendiente** del mismo correo y la
  misma unidad (`20261005120000_crear_invitacion_reemplaza_pendiente.sql`,
  con rollback).
  - Dentro de `crear_invitacion`, antes del INSERT, se anulan las
    pendientes de la misma organización, correo, rol y alcance, igual que
    lo hace `revocar_invitacion` (`expira_en` en el pasado).
  - Todo va en la misma transacción: si el INSERT falla, la anterior sigue
    viva.
  - Accesos avisa: "El anterior para … quedó anulado".
- **La tarjeta del código** se limpia:
  - al generar (antes de pedir el código nuevo), así que también cuando la
    generación falla;
  - al cambiar la unidad;
  - al escribir otro correo.
- **Revocar** muestra "Revocando…" en el botón y después "Invitación
  revocada. Ese código ya no sirve." o "No se pudo revocar: <motivo>".
- **Aviso de cambio de cuenta** (`components/AvisoCambioDeCuenta.tsx`, en
  los layouts de `/admin/[orgId]` y `/mi/[unidadId]`).
  - Si la sesión del navegador ya no es la de la cuenta con la que se armó
    la página (otra cuenta abierta, o sesión cerrada desde otra pestaña),
    aparece abajo un aviso con el botón "Recargar".
  - No cambia permisos: la base ya rechazaba bien esas llamadas. Lo que
    faltaba era que se viera.

### 3. "La app me volvió a sacar de la sesión"

**El segundo caso (04-oct, ~23:07 de Venezuela) no fue lo mismo que el
primero.**
- **Entre 02:45 y 03:30 UTC:** ninguna respuesta 5xx de la API ni de Auth.
  La más lenta tardó 861 ms.
- **03:06:21** Hay un `logout` de la cuenta del inquilino, en el mismo
  navegador. Cerró la única sesión que había, y al recargar Accesos el
  proxy no encontró sesión y mandó a Entrar.
- **03:06:41** Se vuelve a entrar como inquilino.

Es el mismo mecanismo que el punto 2: dos cuentas en un navegador. Lo cubre
el aviso de cambio de cuenta. Para validar con dos cuentas, usar una ventana
privada o un navegador distinto para la segunda.

**El primero (04-oct, 21:52–21:54)** sí fue la base: la instancia gratuita,
en swap y con el CPU en IOwait (confirmado en el panel).
- Consultas de 15 a 59 s y `/auth/v1/user` con 504 y 500.
- `usuarioActual()` trataba ese error igual que "no hay sesión" y mandaba a
  /entrar, aunque la sesión seguía viva.
- Producción sigue en el plan gratuito hasta terminar las correcciones, así
  que el caso puede repetirse. El arreglo es que la app no lo confunda con
  un cierre de sesión.

**Arreglo:**
- **`usuarioActual()`** (`lib/supabase/cache.ts`) devuelve el usuario si
  hay sesión y `null` si no la hay (sin cookies, token inválido, 4xx de
  Auth). Si Auth no contesta (`AuthRetryableFetchError`: red, tiempo
  agotado, 500-504 y 520-530), **lanza `ErrorSinConexion`**
  (`lib/sin-conexion.ts`).
  - Los seis lugares que llamaban a `getUser()` por su cuenta pasan a usar
    `usuarioActual()`: `/admin`, `/mi`, `/garita`,
    `/garita/[edificioId]`, `/operador` y `/destino`.
- **`app/error.tsx`** (nuevo, para toda la app) reconoce ese error por su
  `digest` y muestra "No pudimos conectar. Reintente" con el botón
  "Reintentar", que vuelve a pedir la página con `retry()`.
  - Por qué el `digest`: en producción Next borra el mensaje de los errores
    de servidor, pero respeta un `digest` propio.
  - Se comprobó contra `next start`, con un navegador sin interfaz y una
    página de prueba temporal (ya borrada): la pantalla sale bien.
  - Cualquier otro error cae en la misma pantalla, con un texto genérico.
- **`/entrar` con la sesión válida sigue de largo** a `volver`, saneado con
  `rutaInterna()` y nunca de vuelta a /entrar, o a `/destino`.
  - Excepción: `?clave=nueva` (la sesión especial de recuperar la clave).
  - Si Auth no contesta, muestra el formulario.

**Revisión cruzada pendiente (toca autenticación).** Puntos a mirar:
- **Falla cerrado.** Con un error de conexión no se devuelve ningún
  usuario. Cambia la pantalla (reintentar en vez de Entrar), no quién pasa.
- **`proxy.ts` no cambió.** Si el token de acceso ya venció y el refresco
  falla por la caída, `getClaims()` sigue sin sesión y el proxy manda a
  /entrar. Ahí, con Auth caído, `/entrar` muestra el formulario. Este caso
  queda abierto.
- **Posible bucle /entrar ↔ ruta protegida.** Solo pasaría si el proxy y
  `getUser()` no coincidieran sobre si hay sesión. No se encontró un caso
  así, pero conviene revisarlo.
- **El aviso de cambio de cuenta** llama a `getSession()` en el navegador,
  que puede refrescar el token en paralelo con el proxy. Ya pasaba con
  cualquier cliente del navegador, y Supabase tolera el reuso del refresh
  token dentro de su intervalo.

### Estado

- **Código:** en `dev`, sin commit. `npm run build`, `npm run lint` y
  `npx tsc --noEmit` en verde (05-oct).
- **Migración `20261005120000`:** escrita, **sin aplicar**. Primero en
  pruebas, con la aprobación de Nicolás. Antes de aplicarla, el cuerpo
  actual de `crear_invitacion` era el mismo en las dos bases (md5 sin `\r`
  `f29847e7…`), y el rollback lo restaura exacto (verificado).
