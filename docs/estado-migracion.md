# Estado de la migración — Vecitap

Fuente de verdad del **estado del plan**: qué fase está en curso, qué quedó
hecho, qué falta y qué correcciones puntuales están pendientes para más
adelante. Se actualiza al cerrar cada fase. Las reglas y convenciones que no
cambian de una fase a otra viven en [`AGENTS.md`](../AGENTS.md), no acá.

Vecitap-app se está migrando de 4 archivos HTML monolíticos (React 18 +
Babel standalone vía CDN, sin build step) a un proyecto Next.js (App
Router) real, en un plan de 9 fases.

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
   curso: Residente VALIDADO; Operador VALIDADO; Admin Sesión 1
   construida, sin validar (Sesión 2 sin empezar)
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
- [ ] Copiar `logo-claro.png` y `logo-oscuro.png` de la raíz de `main` a
  `public/` en `integracion` **después del merge** — `optimization` nunca
  tocó esos archivos, así que el merge deja `public/` con los blobs viejos
  del 09-sep mientras los HTML de raíz sirven los nuevos del socio.
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

Ninguno de estos cambios buscaba cambiar comportamiento, pero todos tocaron
archivos ya validados.

- [ ] **`/mi/[unidadId]` sigue entrando** (se le agregó `esUuid()`): con
  `residente.prueba@vecitap.com`, abrir su unidad de Baja y recorrer recibo,
  reportar pago y mis pagos. Debe verse igual que antes. Probar además un id
  inventado en la URL (`/mi/no-es-uuid`) — debe dar 404 limpio, no un error de
  Postgres.
- [ ] **`/admin/[orgId]/[edificioId]/*` sigue entrando** (mismo cambio, más los
  logs `[DIAG-ADMIN]` quitados): recorrer Inicio, Propietarios, Cobros y Cierre
  del mes con `admin.prueba@vecitap.com`. Probar también `/admin/no-es-uuid` y
  `/admin/<orgId>/no-es-uuid`.
- [ ] **Paleta nueva en los tres módulos.** Residente, Admin y Operador cambiaron
  de colores sin que se tocara ningún componente. Revisar que no quedó texto
  ilegible, sobre todo badges y montos en rojo / verde / ámbar.
- [ ] **Paleta en tema oscuro, recargando con la preferencia ya guardada** — no
  solo cambiando el tema en vivo. Es la lección de hidratación que ya dejó un bug
  real (ver `AGENTS.md`, Sistema de diseño).
- [ ] **Estado de cuenta imprimible** (Propietarios → una unidad → imprimir): los
  colores de ese papel se cambiaron a mano en `lib/admin/imprimir-estado.ts`.
  Comparar contra el mismo papel generado desde `admin.html` de `main`.
  *(El recibo imprimible del residente, `lib/residente/papel-recibo.ts`, quedó a
  propósito con la paleta vieja — ver caso 16 de `casos-de-uso-mejorados.md`. Se
  va a ver distinto del de Admin; no es un error, es un pendiente conocido.)*
- [ ] **Entrar sigue funcionando para los tres roles** (`FormularioEntrar.tsx`
  cambió): entrar como admin, como residente y como operador.
- [ ] **Entrar sin `volver`** (ir a `/entrar` a mano, sin parámetros): cada rol
  debe terminar en su panel — operador en `/operador`, admin en `/admin`,
  residente en `/mi`. Antes caían todos en `/`, la página en construcción.

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
