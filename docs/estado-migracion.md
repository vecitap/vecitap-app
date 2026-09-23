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
   curso: Residente VALIDADO; Operador y Admin sin empezar
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
probados — Residente ya está migrado y validado; Operador (918 líneas) y
Admin (5.318 líneas, el de mayor riesgo de cronograma) todavía no
empezaron.

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

---

## Pendientes para fases futuras

### Fase 4 — al migrar Operador y Admin

- Unificar el formato de `pagos.documento_origen` (`V-12345678`) en los
  tres módulos. Si Operador o Admin muestran o filtran por esa columna,
  tienen que contemplar los formatos legacy que ya conviven en la tabla
  (`"V12345MIJO"`, `"24223950"`, sin prefijo, etc.) — no migrar esos datos
  previos, solo normalizar lo que escriban los formularios nuevos.
- La alícuota se muestra como "100,0000%" (cuatro decimales) en
  `TarjetaSaldo`. Confirmar contra `residente.html` si el original
  redondeaba, y unificar el formato en `lib/formato.ts` si corresponde.

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

### Fase 5 — migración de esquema (decisión de negocio pendiente)

`membresias` tiene un índice único sobre `(org_id, usuario_id)`: un
usuario solo puede tener UNA membresía por organización. Consecuencia: un
propietario con dos unidades en el mismo condominio no se puede
representar. Puede ser intencional o una restricción que nadie revisó —
decisión de negocio pendiente con el socio; si hay que cambiarla es
migración de esquema.

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
