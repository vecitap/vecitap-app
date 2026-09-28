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
   (29-sep). Las cuatro vistas de Garita (bloques 11 y 12) están
   **construidas y completas, sin validar** — sus 4 acciones de escritura
   (`garita_entrada`, `garita_avisar`, `garita_salida`, `garita_nota`) se
   conectaron el 28-sep, después de confirmar el SQL real de las cuatro con
   `pg_get_functiondef`.
5. Endurecimiento multi-tenant y escala — Pendiente (revisión cruzada obligatoria)
6. Observabilidad y operación — Pendiente
7. CI/CD — Pendiente
8. Pruebas — Pendiente
9. Seguridad y lanzamiento — Pendiente (revisión cruzada obligatoria)

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
  se tocó — sigue intacto como línea base de la Fase 4, decisión de la
  Fase 1):**
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
| 10 | Garita · fundaciones: ruta, gate en `proxy.ts`, tema, armazón y "falta un paso" — **validado en lectura y navegación** (29-sep, ver abajo) |
| 11 | Garita · **Entrada**: cámara, lectura de QR, veredicto a pantalla completa, visita sin anunciar — completo, con escritura (ver abajo) |
| 12 | Garita · **Adentro**, **Consultar** y **Bitácora** — completo, con escritura (ver abajo) |

Los 12 bloques de la reescritura están construidos y completos. Lo que falta
es validar manualmente los módulos que todavía no se probaron con una cuenta
real — Garita incluida (ver "Bloques 11 y 12" abajo).

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

  **Tema: la garita usa el de toda la app** (revisión del 29-sep, ver abajo).
  `ThemeProvider` y el script anti-parpadeo quedaron **como estaban antes del
  bloque 10** — una sola clave, `vecitap-tema`, sin parametrizar. Lo que sí es
  propio del módulo son los tamaños (`app/(garita)/garita.css`) y los tokens
  `--veredicto-si`/`--veredicto-no`, agregados a `globals.css` en los dos temas;
  `--verde`/`--rojo` **no** se pisaron.

  **Andamio temporal, a propósito:** las cuatro vistas eran `<EnConstruccion>`
  (`components/garita/EnConstruccion.tsx`) hasta que los bloques 11 y 12 las
  reemplazaron — el archivo se borró en el bloque 12, cuando ya no quedaba
  ningún `<nav>` que llevara a él.

- **Bloques 11 y 12 (Garita · las cuatro vistas), construidos y completos
  (28-sep).** Las cuatro vistas de `garita.html:630-896` están reescritas
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

**Los bloques 0 a 9, 11 y 12 siguen sin validar.** Ninguno ejecutó una escritura
contra la base con una cuenta real; la validación manual la hace Nicolás — Garita
incluida, ahora que sus 4 acciones de escritura ya están conectadas (ver
"Bloques 11 y 12" arriba). **La excepción es el bloque 10**, validado el 29-sep
en lectura y navegación (ver "Qué quedó verificado del bloque 10" más abajo) —
y, de paso, el `PanelModulos` del bloque 9, que quedó probado en escritura al
prender el módulo `garita` en Torre Ida.

#### Pendientes concretos que dejan estos bloques

Lo que queda abierto y hay que retomar, además del alcance de los bloques 7 a 12:

- **Validar manualmente las 4 acciones de escritura de Garita** con una
  cuenta de vigilante real (`garita_entrada`, `garita_avisar`, `garita_salida`,
  `garita_nota`) — conectadas y con build/lint/typecheck verdes, pero sin
  ejecutar todavía contra la base.
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

## Ruta de la garita (decidida el 28-sep, **resuelta el 29-sep**)

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

#### Tema — REVISADO el 29-sep: la garita usa el tema de toda la app

> La decisión del 28-sep (proveedor y clave propios) **queda sin efecto**.
> Confirmado con Gustavo: lo que la garita necesita es **legibilidad**, y eso son
> los tamaños, no el color.

`garita.html` guarda el tema bajo `vecitap-tema-garita` y arranca en oscuro, y el
28-sep se decidió replicarlo con un proveedor propio acotado al route group más
un script anti-parpadeo consciente de la ruta. Eso se construyó en el bloque 10 y
**se deshizo el 29-sep**.

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

#### Verificación de RLS del vigilante — hecha el 29-sep, con evidencia

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

- Cuenta **`vigilante.prueba@vecitap.com`** (Auth, confirmada), creada el 29-sep.
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

#### Bloque 10 — VALIDADO EN LECTURA Y NAVEGACIÓN (29-sep)

Nicolás lo probó en el navegador el 29-sep y **pasó todo**. El alcance de esa
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
- Tras la revisión del tema (29-sep): en el código de la app la única clave de
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
