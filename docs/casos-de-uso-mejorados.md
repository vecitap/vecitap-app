# Casos de uso donde la versión migrada se comporta distinto al original

Registro de cada punto donde `app.html`/`residente.html`/`operador.html` (los 4 HTML
originales) y la versión migrada (Next.js) hacen algo distinto a propósito — para
revisarlo con el socio comercial al terminar la migración. No es un changelog técnico:
cada caso está en lenguaje de negocio primero, con la cita de código como respaldo.

No confundir con `docs/estado-migracion.md` (estado del plan por fase) ni con
`AGENTS.md` (convenciones que no cambian de fase). Este archivo es solo la lista de
desvíos de comportamiento frente al original.

---

## Criterio del 28-sep — paridad con `main`

Cambio de criterio de Nicolás: **la referencia es la versión actual de los HTML
de `main`, en funcionalidad y también en estética.** Todo desvío de esta lista se
revierte, salvo los que corrigen un riesgo de pérdida o corrupción de datos, o de
seguridad. Cada caso de abajo lleva su marca (REVERTIDO / MANTENIDO / PORTADO /
RESUELTO / PENDIENTE) justo debajo del título, con el motivo en una línea.

| # | Caso | 28-sep |
|---|---|---|
| 1 | Tarjeta de saldo con 3 tonos | REVERTIDO |
| 2 | Aviso "su saldo no cambia" | REVERTIDO |
| 3 | Validación del comprobante por firma de bytes | **MANTENIDO** (seguridad) |
| 4 | Cédula/RIF como selector V/E/G/J | REVERTIDO |
| 5 | Obligatorios visibles + scroll al error | REVERTIDO |
| 6 | Registro retirado de `/entrar` | MANTENIDO (ya era paridad) |
| 7 | "Cobro dentro del recibo" controlado | **MANTENIDO** (pérdida de datos) |
| 8 | Varias membresías por organización | **MANTENIDO** (modelo de datos) |
| 9 | `aceptar_invitacion` no sobrescribe | **MANTENIDO** (pérdida de datos) |
| 10 | Normalización de `unidad_id`/`edificio_id` | **MANTENIDO** (corrupción de datos) |
| 11 | Umbral de saldo unificado | REVERTIDO |
| 12 | Alícuota a 4 decimales en Propietarios | REVERTIDO |
| 13 | Íconos de `lucide` no portados | **APROBADO, pendiente** (bloque 7) |
| 14 | `ImportarSaldos` solo CSV | RESUELTO |
| 15 | Columna lateral oscura no portada | PORTADO |
| 16 | Paleta de `main` | MANTENIDO (es la de `main`) |
| 17 | Recibo con la tasa de hoy | PORTADO |
| 18 | `porCobrar`/`aFavor` suman en la app | MANTENIDO (es lo que hace `main`) |
| 19 | Alta de administradora abierta | MANTENIDO (es lo que hace `main`) |
| 20 | Enlace "¿Viene a registrar su administradora?" | MANTENIDO (arquitectura) |
| 21 | `NuevoEdificio` movido al selector | REVERTIDO |
| 22 | `/destino` y `/admin` deciden por rol | **MANTENIDO** (corrección de bug) |
| 23 | `pdfjs-dist` más nuevo que el de `main` | **APROBADO** (seguridad) |
| 24 | Librerías empaquetadas, no traídas de un CDN | **NUEVO** (seguridad) |
| 25 | Enlace de la garita a `/garita` | NUEVO (arquitectura) |
| 26 | La garita comparte la sesión de los otros módulos | NUEVO (arquitectura) |
| 27 | La garita no tiene login propio | NUEVO (arquitectura) |
| 28 | Cada vista de la garita es una URL | NUEVO (arquitectura) |
| 29 | La garita comparte el tema de la app | **APROBADO 28-sep** (revierte el tema propio) |
| 30 | Las fechas se deciden en hora de Venezuela, no en UTC | **MANTENIDO** (riesgo de datos) |
| 31 | "¿Quién paga el condominio?" por unidad + total del propietario | **NUEVO** (funcionalidad, 30-sep) — construido, sin validar |
| 32 | "El inquilino ya no ocupa la unidad" (y su acceso a la app) | **NUEVO** (funcionalidad, 30-sep; confirmado por Gustavo el 01-oct) — construido, sin validar |


## Residente

### 1. Tarjeta de saldo con 3 tonos en vez de 2

> **28-sep — REVERTIDO.** Vuelve a los 2 tonos de `main` (rojo si debe, verde para todo lo demás, comparado contra cero sin margen). El criterio nuevo pide paridad también en lo visual, y eso pesa más que la decisión de diseño anterior.

**Caso de uso:** cuando un residente tiene saldo a favor (le deben a él, no al revés),
la tarjeta de saldo se lo muestra con un color propio, distinto del verde que usa el
original para "todo lo que no es deuda".

- **Antes:** `residente.html` — 2 tonos: rojo si debe, verde para cualquier otro caso
  (solvente o a favor, sin distinguir).
- **Ahora:** `components/residente/TarjetaSaldo.tsx` — 3 tonos: verde (solvente), azul
  (a favor, con color propio), rojo (debe).
- **Motivo:** mejora aprobada — decisión de diseño tomada y documentada en
  `docs/estado-migracion.md` ("Decisiones de arquitectura ya tomadas"), no una deriva
  accidental.
- **Estado:** aplicado.
- **Cómo se revierte:** volver `TarjetaSaldo.tsx` a 2 tonos (tratar "a favor" igual que
  "solvente"). El equipo ya decidió no hacerlo — revertir requeriría deshacer esa
  decisión explícitamente, no solo "por parecerse más al original".

### 2. Aviso "su saldo no cambia hasta que se confirme"

> **28-sep — REVERTIDO.** La línea no existe en `main`; se quitó de `MisPagos.tsx`.

**Caso de uso:** un residente que acaba de reportar un pago ve, junto al estado
"Esperando revisión", una aclaración de que su saldo no se va a actualizar todavía —
para que no piense que el sistema falló si el número no cambia de inmediato.

- **Antes:** `residente.html:1104-1138` (`MisPagos`) — muestra el estado del pago
  (badge "esperando revisión") pero sin ninguna aclaración sobre el saldo.
- **Ahora:** `components/residente/MisPagos.tsx:49-53` — agrega la línea "Su saldo no
  cambia hasta que se confirme." cuando `estado === "reportado"`.
- **Motivo:** mejora aprobada — evita que el residente interprete el saldo sin cambios
  como un error.
- **Estado:** aplicado.
- **Cómo se revierte:** quitar el bloque condicional de `MisPagos.tsx:49-53`.

### 3. Validación real del comprobante (firma de bytes, no extensión)

> **28-sep — MANTENIDO.** Excepción de seguridad: sin esto, un archivo cualquiera renombrado a `.jpg` entra como comprobante válido y ensucia la evidencia de una conciliación.

**Caso de uso:** si alguien sube un archivo que no es una foto ni un PDF real (por
ejemplo un archivo de texto renombrado a `.jpg`), el sistema lo rechaza aunque el
nombre y el tipo que reporta el navegador digan que es una imagen válida.

- **Antes:** `residente.html:1089` — `<input type="file" accept="image/*,application/pdf">`,
  una restricción que el navegador puede ignorar o que un archivo mal etiquetado puede
  burlar; no hay verificación del contenido real.
- **Ahora:** `lib/archivos.ts` + `components/residente/FormularioReportarPago.tsx:71-72` —
  lee los bytes de cabecera del archivo y valida la firma real de jpg/png/pdf. Probado
  en runtime: un `.txt` renombrado a `.jpg` fue rechazado (ver `docs/estado-migracion.md`,
  Fase 4/Residente).
- **Motivo:** bug que arriesgaba datos — un comprobante inválido guardado como si fuera
  válido dificulta la conciliación con el banco.
- **Estado:** aplicado.
- **Cómo se revierte:** volver a validar solo por extensión/`type` del navegador en
  `FormularioReportarPago.tsx`, quitando la llamada a `lib/archivos.ts`.

### 4. Cédula/RIF como selector V/E/G/J + número, en vez de texto libre

> **28-sep — REVERTIDO.** `main` usa un solo campo de texto libre (`index.html:1683-1688`), con la ayuda "Solo los números, sin puntos.".

**Caso de uso:** al reportar un pago móvil, la persona elige el tipo de documento
(V/E/G/J) de una lista y escribe solo los números — no puede escribir el guion, letras
sueltas u otro formato que después no case con lo que espera la administración.

- **Antes:** `residente.html:1067-1071` — un solo campo de texto libre
  (`inputMode="numeric"`, pero sin `<select>` de tipo ni bloqueo de caracteres).
- **Ahora:** `components/residente/FormularioReportarPago.tsx` — `<select>` V/E/G/J
  (`documentoTipo`) + input numérico que descarta cualquier no-dígito
  (`documentoNumero`, línea 411), obligatorio solo cuando el método es "Pago móvil".
  El valor final se arma con guion (`` `${documentoTipo}-${documentoNumero}` ``,
  línea 209).
- **Motivo:** mejora aprobada — mismo objetivo que el caso 3, reportes que la
  administración pueda cruzar contra el banco sin ambigüedad de formato.
- **Estado:** aplicado.
- **Cómo se revierte:** volver a un solo `<input>` de texto libre para cédula/RIF.

### 5. Formulario de pago: obligatorios visibles y validados antes de enviar

> **28-sep — REVERTIDO.** Sin marcas de obligatorio ni scroll automático al aviso: `main` no los tiene.

**Caso de uso:** si a alguien le falta llenar un campo obligatorio, la pantalla se lo
señala con un asterisco desde el principio y, si igual intenta enviar, hace scroll
automático hasta el aviso de error — no se queda con el formulario vacío sin
explicación.

- **Antes:** `residente.html:907-1102` (`Reportar`) — validaciones puntuales, sin
  marca visual sistemática de "obligatorio" ni scroll al error.
- **Ahora:** `components/residente/FormularioReportarPago.tsx:125` (scroll al aviso) y
  el prop `obligatorio` de `Campo` en cada campo requerido, validados antes de enviar.
- **Motivo:** mejora aprobada — menos fricción y menos envíos incompletos.
- **Estado:** aplicado.
- **Cómo se revierte:** quitar el scroll automático y las marcas/validación de
  `obligatorio`.

### 6. Registro de residentes retirado de `/entrar`

> **28-sep — MANTENIDO.** Ya estaba deshecho: `main` expone "Crear cuenta" en las tres pantallas de Entrar, así que el botón reactivado ES la paridad.

**Caso de uso:** hoy nadie puede crear su propia cuenta de residente desde la pantalla
de acceso — las cuentas las sigue creando la administración por fuera del sistema. El
código para que la persona cree su cuenta y acepte una invitación existe, pero no tiene
botón que lo active.

- **Antes:** `residente.html:316-332` — pantalla "Entrar" con modo `crear` (`signUp`),
  activable con un botón, encabezado "Crear mi cuenta" (línea 339).
- **Ahora:** `app/(marketing)/entrar/FormularioEntrar.tsx:8-24` — el modo `crear` sigue
  implementado (comentario explícito en el código, líneas 11-15) pero sin botón que lo
  active; `components/residente/Invitacion.tsx` (aceptar invitación) tampoco está
  conectado a ninguna ruta; `app/(residente)/mi/page.tsx` muestra un mensaje estático
  ("contacte a su administración") en vez de ofrecer registro.
- **Motivo:** capacidad fuera de alcance — el modelo de registro (con su rate limiting)
  todavía se está definiendo; queda para la Fase 5, no es un bug ni una mejora todavía
  cerrada.
- **Estado:** **actualizado 27-sep — reactivado como adelanto de Fase 5 para el
  piloto.** Ver docs/estado-migracion.md: mañana (28-sep) el socio carga datos reales
  y necesita que los residentes invitados puedan crear su cuenta. Se conectó el botón
  que ya existía (`FormularioEntrar.tsx`) y se enganchó `Invitacion.tsx` en
  `app/(residente)/mi/page.tsx` cuando la cuenta no tiene unidades — el mismo flujo de
  dos pantallas de `main` (crear cuenta, después pegar el código), sin cambios de
  fondo. El rate limiting propio sigue sin hacerse (Supabase Auth limita intentos por
  su cuenta, pero no hay nada adicional de este lado) — pendiente real de Fase 5, no
  bloqueante para un piloto de un solo condominio.
- **Cómo se revierte:** quitar el botón de `FormularioEntrar.tsx` y volver
  `app/(residente)/mi/page.tsx` al mensaje estático — los dos cambios son locales y
  no tocan ninguna función de la base.

---

## Operador

### 7. "Cobro dentro del recibo": campo controlado, sin doble-insert ni desfase

> **28-sep — MANTENIDO.** Excepción explícita de pérdida de datos: sin el campo controlado, entrar y salir del campo pisaba un monto real por 0 y apagaba el cobro.

**Caso de uso:** cuando el operador edita el monto de un servicio recurrente en la
ficha de un cliente, el campo siempre muestra el valor real guardado (no se queda
pegado en "0" mientras carga), y guardarlo dos veces seguidas no duplica el registro ni
deja la pantalla mostrando un valor distinto al que quedó en la base.

- **Antes:** `operador.html:823-826` — `<input defaultValue={...}>` no controlado; como
  el dato llega de forma asíncrona, el campo se queda en "0" aunque la base tenga otro
  monto, y guardar (`onBlur`) sobre ese "0" podía apagar el cobro sin que nadie lo
  hiciera a propósito. Guardar dos veces sin reabrir la ficha podía además insertar una
  fila duplicada en vez de actualizar la existente.
- **Ahora:** `components/operador/FichaCliente.tsx` — campo controlado, sincronizado
  con el dato real apenas llega; `guardarServicio` no escribe si el monto no cambió; la
  rama de `insert` y la de `update` piden la fila resultante (`.select().single()`) y
  refrescan el estado, para que un segundo guardado sin reabrir la ficha actualice en
  vez de duplicar. Detalle completo, con los 4 puntos numerados, en
  `docs/estado-migracion.md` (Fase 4 / Operador).
- **Motivo:** bug que arriesgaba datos — pisar en silencio un monto real por 0
  desactivaba un cobro sin que nadie lo editara a propósito.
- **Estado:** aplicado — aprobado el 2026-09-26 durante la validación manual de
  Operador.
- **Cómo se revierte:** volver el campo a no controlado (`defaultValue`), quitando la
  sincronización y el `.select().single()` de ambas ramas. No recomendado: reintroduce
  el riesgo de pérdida de datos documentado arriba.

---

## Multi-tenant / membresías (aplicado, 2026-09-26)

Origen: investigación de la restricción `UNIQUE (org_id, usuario_id)` de `membresias`
antes de migrar Admin (ver `docs/estado-migracion.md`, pendiente de Fase 5 sobre
esquema). Desvío deliberado del plan: estos cambios estaban pautados para la Fase 5 y
se adelantaron aquí porque bloqueaban una decisión de negocio necesaria antes de migrar
Admin. Aplicados y verificados estructuralmente el 2026-09-26; falta la prueba
funcional del flujo de invitaciones (se hará al preparar la cuenta de administrador y
la organización de prueba de Admin). Sujetos a revisión con el socio al terminar la
migración.

### 8. Una persona puede tener varias membresías en la misma organización

> **28-sep — MANTENIDO.** Corrección de modelo de datos ya aplicada en la base: sin ella, la segunda membresía de una persona pisaba la primera.

**Caso de uso:** un propietario con dos apartamentos en el mismo condominio, o alguien
que además de vivir en su unidad participa en la junta de condominio, va a poder tener
las dos membresías activas al mismo tiempo — hoy el sistema solo lo deja tener una.

- **Antes:** restricción `UNIQUE (org_id, usuario_id)` en `membresias` (confirmada por
  consulta directa a `pg_constraint` el 2026-09-26: es una constraint formal, no
  parcial por `activo`) — cualquier segunda fila para la misma persona en la misma
  organización es rechazada, sin importar si es una unidad distinta o un rol distinto.
- **Ahora (aplicado):** nueva restricción única sobre
  `(org_id, usuario_id, rol, unidad_id, edificio_id)` con `NULLS NOT DISTINCT` — ver
  `supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql`. Antes
  de crearla, la migración limpió 2 filas de rol `residente` que tenían `edificio_id`
  poblado (dato sobrante — ver caso 10): sin esa limpieza, la restricción nueva no se
  podía crear tal cual sobre datos existentes.
- **Motivo:** capacidad nueva — refleja casos de negocio reales que la restricción
  original no contemplaba.
- **Estado:** aplicado (2026-09-26, SQL Editor de Supabase, PostgreSQL 17.6).
  Verificado por consulta directa: única `UNIQUE` en `membresias` es ahora
  `membresias_persona_rol_alcance_key`. Pendiente la prueba funcional del flujo de
  invitaciones — sujeto a revisión con el socio al terminar la migración.
- **Cómo se revierte:** script de reversión en
  `supabase/rollbacks/20260926120000_membresias_multiples_por_organizacion_rollback.sql`.
  Antes de correrlo hay que resolver a mano cualquier persona que ya haya quedado con
  más de una membresía activa en la misma organización (el script trae la consulta para
  detectarlas); el mismo script restaura también los 2 valores de `edificio_id` que el
  caso 10 nula.

### 9. `aceptar_invitacion` ya no reemplaza una membresía existente en silencio

> **28-sep — MANTENIDO.** Pérdida de datos: sobrescribía una membresía existente en silencio.

**Caso de uso:** si alguien que ya tenía un rol en una organización (por ejemplo,
miembro de la junta) acepta una nueva invitación en esa misma organización (por
ejemplo, como residente de una unidad), va a quedar con las dos membresías — hoy la
nueva reemplaza a la vieja sin avisar, y la persona pierde su rol o unidad anterior sin
darse cuenta.

- **Antes:** `aceptar_invitacion` (función `SECURITY DEFINER`, confirmado por
  `pg_get_functiondef` el 2026-09-26) usa
  `ON CONFLICT (org_id, usuario_id) DO UPDATE SET rol, unidad_id, edificio_id,
  relacion, activo = true` — la fila nueva pisa a la vieja. Antes de eso, lee
  `select rol into v_actual from membresias where org_id=... and usuario_id=...` (una
  sola fila, sin `ORDER BY`) y bloquea el reemplazo solo en dos casos: si la persona ya
  es `propietario_cuenta`, o si ya es `administrador`/`contador` y la invitación nueva
  es de `residente`/`vigilante`.
- **Ahora (aplicado):** ver
  `supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql` (PASO
  4). Si la membresía exacta (misma organización, rol y alcance) ya existe inactiva, se
  reactiva; si existe activa con la misma relación, no cambia nada; si existe activa con
  una relación distinta, se rechaza con un error explícito en vez de sobrescribir. Se
  eliminó el `select rol into v_actual` y sus dos bloqueos — con varias membresías
  posibles por organización esa fila "actual" ya no representa "el rol" de la persona, y
  el riesgo que evitaban (perder un rol por sobrescritura silenciosa) desaparece solo
  con el nuevo modelo. **Nota para el socio, todavía sin confirmar:** esto también
  significa que un administrador que acepta una invitación de residente en su misma
  organización ya no se bloquea — queda con las dos membresías, que es justamente el
  caso "administrador + residente" que motivó este cambio. Confirmar que ese destrabe
  es lo que se quiere, no solo un efecto colateral de la limpieza técnica.
- **Motivo:** bug que arriesgaba datos — pérdida silenciosa de acceso o rol.
- **Estado:** aplicado (2026-09-26, SQL Editor de Supabase, PostgreSQL 17.6).
  Verificado que `aceptar_invitacion` y `crear_invitacion` quedaron con la versión
  nueva; falta probar el flujo real de invitaciones (invitar, aceptar, reactivar,
  rechazar un conflicto de relación) y que el socio confirme la nota de arriba.
- **Cómo se revierte:** `supabase/rollbacks/20260926120000_membresias_multiples_por_organizacion_rollback.sql`
  restaura la definición anterior completa. Si para ese momento ya se aceptaron
  invitaciones bajo el nuevo comportamiento (por ejemplo, alguien quedó con dos
  membresías activas en la misma organización), hay que decidir con el socio, antes de
  revertir, cuál de esas membresías se conserva y cuál se desactiva — la versión
  anterior no admite que coexistan.

### 10. Normalización de `unidad_id`/`edificio_id` según el rol de la membresía

> **28-sep — MANTENIDO.** Corrupción de datos ya observada (2 membresías con un edificio guardado de más).

**Caso de uso:** una membresía solo guarda el dato que le corresponde a su rol —
un residente nunca queda con un edificio pegado, ni un miembro de junta con una
unidad — para que no queden campos sobrantes que después confundan a quien mire la
tabla o rompan una restricción que sí depende de esos campos.

- **Antes:** solo se limpiaba `unidad_id` para el rol `vigilante`
  (`crear_invitacion`/`aceptar_invitacion`, antes del cambio del caso 9); ningún camino
  limpiaba `edificio_id` para el rol `residente`. Confirmado con datos reales el
  2026-09-26: 2 membresías de rol `residente` tenían `edificio_id` poblado. Ninguna ruta
  de `app.html` manda un edificio en una invitación de residente
  (`app.html:3721-3723` siempre manda `p_edificio: null`), así que el origen más
  probable es una carga manual o una versión anterior de la función — no se investigó
  más a fondo porque no bloqueaba nada hasta ahora.
- **Ahora (aplicado):** `crear_invitacion` y `aceptar_invitacion` normalizan
  `unidad_id`/`edificio_id` según el rol antes de guardar: `residente` → solo
  `unidad_id`; `junta`/`vigilante` → solo `edificio_id`; `propietario_cuenta`/
  `administrador`/`contador` → ninguno de los dos. Las 2 filas sucias existentes se
  limpiaron como parte de la misma migración (PASO 1 de
  `supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql`), no
  se dejaron para después.
- **Motivo:** bug de datos que además bloqueaba el caso 8 — sin esta limpieza, la
  restricción única nueva (que distingue por `unidad_id`/`edificio_id`) admitiría dos
  filas de la misma membresía que solo difieren en un campo que no le corresponde al
  rol.
- **Estado:** aplicado (2026-09-26, SQL Editor de Supabase, PostgreSQL 17.6).
  Verificado por consulta directa: las 2 filas quedaron con `edificio_id` en `NULL` y
  `unidad_id` intacto. Pendiente la prueba funcional del flujo de invitaciones — sujeto
  a revisión con el socio al terminar la migración.
- **Cómo se revierte:** el script de reversión quita la normalización de las dos
  funciones (restaura sus versiones anteriores) y restaura los 2 valores exactos de
  `edificio_id` que se limpiaron
  (`supabase/rollbacks/20260926120000_membresias_multiples_por_organizacion_rollback.sql`).
  No se recomienda revertir solo esto sin revertir también el caso 8: sin la
  normalización, la restricción del caso 8 vuelve a admitir los datos sucios que la
  motivaron.

## Admin — Sesión 1 (construida, sin validar)

Decisiones tomadas por Nicolás al revisar `docs/inventario-admin.md`, antes de
construir la Sesión 1 (2026-09-26). Provisionales — sujetas a la misma revisión
con el socio comercial que el resto de esta lista.

### 11. Umbral de saldo unificado contra `estado`/`UMBRAL_SALDO`, no contra literales

> **28-sep — REVERTIDO.** Vuelven los literales de `main` (`> 0.01` / `<= 0.01` / `< -0.01`) en Inicio (`metricas.ts`), Propietarios y Ficha. El widget `Edificio` sigue usando `estado`, porque `main` también lo hace ahí.

**Caso de uso:** qué unidades cuentan como "con deuda" (en el KPI de Inicio, en el
filtro de Propietarios, en la Ficha) ahora es siempre la misma clasificación que ya
calcula la base, sin un margen distinto según la pantalla.

- **Antes:** `app.html` usaba tres criterios distintos convivendo en el mismo
  archivo — la columna `estado` de `saldos_actuales` (correcta, usada solo en el
  widget `Edificio`), el literal `0.01` (Inicio, Propietarios, Ficha) y el literal
  `0.009` (`imprimirEstado`). Documentado en `docs/inventario-admin.md`, sección 5f.
- **Ahora:** todo el código migrado de Admin usa `estado` de `saldos_actuales`
  cuando está disponible (`lib/estados-unidad.ts`, `tonoEstadoUnidad()`/
  `contarPorEstadoUnidad()`) — cero literales `0.01`/`0.009` nuevos.
- **Motivo:** decisión de Nicolás, no un bug encontrado durante la construcción —
  ya estaba anotado como pregunta abierta en el inventario.
- **Estado:** aplicado en Inicio, Propietarios y Ficha (`app/(admin)/admin/[orgId]/[edificioId]/{inicio,propietarios,propietarios/[unidadId]}` y sus componentes).
  Cambia, en el margen 0,009–0,01, qué unidades cuentan exactamente como "con deuda"
  frente al `app.html` original — diferencia mínima, pero real.
- **Cómo se revierte:** volver a comparar `total` contra los literales originales en
  cada pantalla en vez de usar `estado`/`UMBRAL_SALDO`.

### 12. Alícuota siempre a 4 decimales, también en la lista de Propietarios

> **28-sep — REVERTIDO.** La lista de Propietarios vuelve a `nf(5)` sin `%`, como `admin.html:1731`. El resto de las pantallas sigue con `pct()`, que es lo que `main` usa en cada una.

**Caso de uso:** la alícuota se ve con el mismo formato en todas las pantallas de
Admin — antes la lista de Propietarios la mostraba distinto que el resto.

- **Antes:** `app.html:1532` mostraba la alícuota de la lista de Propietarios con
  `nf(5).format(u.alicuota)` — 5 decimales, sin el signo `%` — mientras que Ficha,
  el estado de cuenta impreso y `residente.html` usan 4 decimales con `%`
  (`pct()`/`nf(4)`). Ver `docs/inventario-admin.md`, sección 5e.
- **Ahora:** `components/admin/Propietarios.tsx` usa `pct()` (`lib/formato.ts`,
  nuevo) — 4 decimales con `%`, igual que el resto de Admin y que `residente.html`.
- **Motivo:** consistencia interna del propio `app.html` — no hay razón de negocio
  para que la lista muestre un decimal más que el resto de las pantallas.
- **Estado:** aplicado.
- **Cómo se revierte:** volver a `nf(5).format(...)` sin `%` en esa lista.

### 13. Íconos de `lucide` no portados

> **28-sep — APROBADO, pendiente de implementar (bloque 7).** Nicolás aprobó instalar `lucide-react` (la misma librería, `lucide` 0.469.0, que `main` carga por CDN) para igualar los íconos. Es la única brecha visual que queda frente a `main`.

**Caso de uso:** ninguno visible para quien usa la aplicación salvo estético — los
botones que en `app.html` llevan un ícono (Plus, Trash2, ChevronRight, Search,
etc.) ahora son solo texto o, donde el ícono era la única pista (Flechas de
reordenar), un carácter Unicode (▲▼).

- **Antes:** `app.html` carga `lucide` desde un CDN (`Ic`, `icono()`) y lo usa en
  decenas de botones y estados vacíos.
- **Ahora:** sin íconos — mismo criterio que ya aplicaron Residente y Operador
  (ninguno de los dos instaló `lucide-react`). No se instaló ningún paquete nuevo
  en esta sesión (instrucción explícita de Nicolás).
- **Motivo:** consistencia con el resto de la migración, no una limitación técnica
  — `lucide-react` existe y se puede instalar cuando se decida.
- **Estado (27-sep):** aplicado (ausencia deliberada). **Superado el 28-sep:**
  `lucide-react` aprobado, se instala y se aplica en el bloque 7 a las cuatro
  pantallas de una sola vez — ver la marca al principio de este caso.
- **Cómo se revierte:** instalar `lucide-react` y agregar los íconos donde
  corresponda — no hay nada que deshacer, es agregar lo que falta.

### 14. `ImportarSaldos`: solo lee CSV por ahora, no Excel ni PDF

> **28-sep — RESUELTO.** Ya lee Excel y PDF, igual que `main`: `xlsx` 0.20.3 desde `cdn.sheetjs.com` (no el 0.18.5 congelado del registro de npm) y `pdfjs-dist`. Ver el caso 23 por la versión de `pdfjs-dist`.

**Caso de uso:** cargar saldos iniciales desde un archivo `.csv` funciona igual que
en el original; desde `.xlsx`/`.xls`/`.pdf` todavía no — se muestra un aviso
explicando por qué en vez de fallar en silencio o fingir que se leyó.

- **Antes:** `app.html:1788-1976` lee Excel con `xlsx` (SheetJS), CSV con
  `PapaParse` y PDF con `pdf.js`, las tres cargadas por CDN sin paso de build.
- **Ahora:** `components/admin/ImportarSaldos.tsx` implementa la lectura de CSV a
  mano (sin librería) y el resto del flujo completo (previa, cruce por código,
  aplicar) — Excel/PDF muestran un aviso pidiendo ese paquete en vez de intentar
  leerlos. Ningún paquete nuevo instalado (instrucción explícita de Nicolás para
  esta sesión).
- **Motivo:** limitación temporal, no una decisión de producto — `xlsx` y un lector
  de PDF (`pdfjs-dist` u otro) no son dependencias de este proyecto todavía.
- **Estado:** aplicado (limitación deliberada, documentada en pantalla).
  **Actualizado 27-sep:** para mañana (28-sep, piloto con datos reales) se
  confirmó **no instalar `xlsx`** — el socio carga saldos en CSV, que ya
  funciona. Queda pendiente para más adelante, con una nota para cuando se
  retome: el paquete `xlsx` que se instala por `npm install xlsx` es una versión
  vieja (0.18, sin actualizar desde 2022); SheetJS dejó de publicar ahí y
  distribuye la versión mantenida desde su propio sitio
  (`https://cdn.sheetjs.com/`), no desde el registro de npm. Instalarlo a ciegas
  con `npm install xlsx` trae la versión vieja. PDF (`pdfjs-dist` u otro) sigue
  sin decisión, tampoco es para mañana.
- **Cómo se revierte:** no aplica — es un paso pendiente, no un cambio a deshacer.

### 15. Columna lateral oscura de `main` no portada — `NavAdmin` sigue horizontal

> **28-sep — PORTADO.** La columna lateral oscura está construida (`components/admin/MarcoAdmin.tsx` + los estilos `.admin-*` de `ui.css`), con el menú hamburguesa y el velo de ≤900 px.

**Caso de uso:** navegar entre secciones de Admin se ve igual que en la Sesión 1
(botones horizontales debajo del encabezado), no como el menú lateral oscuro que
el socio agregó en `main` entre el 09-sep y el 22-sep.

- **Antes (Sesión 1, y hoy):** `components/admin/NavAdmin.tsx` — fila horizontal de
  botones, mismo patrón que Residente/Operador.
- **`main` (socio, 22-sep):** columna lateral fija de 244px, con fondo oscuro
  (`--lat-fondo`) **en los dos temas** — decisión explícita del socio de separar
  "dónde estoy" (la columna) de "qué estoy haciendo" (el contenido) con un cambio
  de superficie en vez de una línea.
- **Motivo de no portarlo hoy:** decisión de Nicolás (27-sep) — prioridad del día
  es la carga de datos reales, no un rediseño de navegación. Los tokens `--lat-*`
  ya están en `app/globals.css` (traídos hoy junto con el resto de la paleta) para
  que el lateral se pueda construir después sin tener que volver a extraerlos de
  `main`.
- **Estado:** pendiente, sin fecha. No bloquea el piloto — la navegación funciona,
  solo se ve distinto.
- **Cómo se revierte:** no aplica — todavía no se portó nada que revertir.

### 16. Paleta de colores actualizada a la de `main` (slate frío, 27-sep)

> **28-sep — MANTENIDO.** Es la paleta de `main`. Lo que faltaba (`papel-recibo.ts` con los hex viejos) se resolvió al unificar el recibo en `lib/recibo-papel.ts`.

**Caso de uso:** el aspecto visual de toda la app (los tres módulos, no solo
Admin) cambió de la paleta original (crema `#F4F1EC` / marino `#111144`) a la
paleta slate que el socio subió a `main` (`#F8FAFC` / `#0A1128`).

- **Antes:** tokens de `app/globals.css` calcados byte a byte de la paleta
  original de `app.html`/`residente.html` (Fase 2).
- **Ahora:** tokens actualizados a los valores nuevos de `main:admin.html`
  (`TEMAS`), en los dos temas — ver el comentario en `app/globals.css`. Un token
  sin equivalente en `main` (`--lienzo-alt`, usado por `badge-tenue` y el hover de
  filas de tabla) se derivó a mano manteniendo la misma relación que tenía con
  `--linea` en la paleta anterior (no viene de ningún archivo de `main`).
- **Motivo:** decisión de Nicolás (27-sep) — evitar que el socio vea dos paletas
  distintas entre los HTML que va a usar mañana y la app Next.
- **Estado:** aplicado en `app/globals.css` y en `lib/admin/imprimir-estado.ts`
  (el estado de cuenta imprimible, que no puede leer variables CSS porque se abre
  en una ventana aparte). **Pendiente, fuera de alcance de hoy:**
  `lib/residente/papel-recibo.ts` (el recibo imprimible de Residente) sigue con
  los hex de la paleta vieja — Residente ya estaba validado antes de este cambio
  y no se tocó hoy a propósito.
- **Cómo se revierte:** los valores viejos quedan en el historial de git de
  `app/globals.css` y `lib/admin/imprimir-estado.ts` si hiciera falta volver atrás.

### 17. Recibo con la tasa del BCV de HOY, no la congelada del período — no portado

> **28-sep — PORTADO.** El recibo en papel y el de pantalla usan la tasa viva y estampan su fecha, igual que `main`. Sigue siendo un cambio con efecto en dinero: vale la pena mencionárselo al socio, aunque ya sea lo que sus HTML hacen.

**Caso de uso:** al imprimir un corte de cuenta desde Cortes, el equivalente en
bolívares seguiría calculándose con la tasa que quedó congelada al cerrar el
período, no con la de hoy.

- **`main` (socio, 22-sep):** `Cortes` pasa `tasaHoy` (la tasa viva que ya se ve
  en la pantalla) a `htmlRecibo()`, y el papel usa esa en vez de `r.tasa_bcv`
  (la del período), con la fecha de la tasa estampada para que el documento
  "envejezca a la vista". Cambia el pie de página: de "se convierte a la tasa del
  día en que usted pague" a "la cifra en bolívares vale para el día que dice
  arriba".
- **Motivo de no portarlo hoy:** decisión de Nicolás (27-sep) — es un cambio de
  comportamiento con efecto en dinero (qué tasa ve el propietario al pagar), no
  una limitación técnica ni un bug. Cortes tampoco se construye hoy (queda para
  "si hay tiempo", punto 6 de la sesión).
- **Estado:** sin portar. Pendiente de confirmar con el socio antes de aplicarlo
  — no alcanza con la aprobación de Nicolás porque cambia lo que ve el propietario
  al pagar, no solo código.
- **Cómo se revierte:** no aplica — todavía no se portó nada que revertir.

### 18. `porCobrar`/`aFavor`/`sumaAlicuotas` de Inicio: suma en la app, no en la base

> **28-sep — MANTENIDO.** Es exactamente lo que hace `main`; no hay nada que revertir.

**Caso de uso:** los tres números de la pantalla Inicio de Admin (por cobrar, a
favor, suma de alícuotas) siguen calculándose sumando en el navegador, igual que
en `app.html`.

- **Qué hace hoy:** `lib/admin/metricas.ts` — `porCobrar`/`aFavor` suman
  `saldos_actuales.total` por unidad (con `Math.max`/`Math.min` en 0);
  `sumaAlicuotas` suma `unidades.alicuota` de las unidades activas. Los tres son
  sumas de valores que la base ya calculó por fila — no se reinventa ninguna
  fórmula de negocio, pero sí es aritmética de dinero ejecutada en el cliente.
  (`conDeuda`, el cuarto número de esa pantalla, sí quedó resuelto del lado de la
  base — ver caso 11.)
- **Por qué no se movió a la base:** Inicio es una vista viva del mes en curso,
  no un período cerrado — `estadisticas_periodo()` (la RPC que sí sirve números
  ya cerrados sin cálculo en el cliente, ver la sección "Estadísticas" nueva de
  `main`) no aplica acá. Movería esto a la base requeriría una función nueva que
  no existe hoy.
- **Estado:** caso conocido, sin cambios — decisión de Nicolás (27-sep) de dejarlo
  así por ahora. Si en algún momento se define una función de base para esto, se
  actualiza `lib/admin/metricas.ts` para leerla en vez de sumar.
- **Cómo se revierte:** no aplica — no hay nada portado que revertir, es el mismo
  comportamiento que `app.html` siempre tuvo.

### 19. El alta de administradora queda abierta a cualquier cuenta registrada

> **28-sep — MANTENIDO.** Es exactamente lo que hace `main`. La decisión de producto (si el alta debe pasar por Vecitap) sigue abierta.

**Caso de uso:** con el registro reactivado (caso 6), cualquiera que cree una cuenta
en `/entrar` y entre a `/admin` ve el formulario de "Nueva administradora". La
organización que cree es suya, y aparece en la cartera que ve el operador de Vecitap.

- **Antes (y en `main` hoy):** exactamente lo mismo. `app.html:782-820` muestra el
  alta de organización a cualquier sesión que llegue sin organizaciones, y
  `crear_organizacion` no exige más que estar autenticado. No es una puerta que
  abrimos nosotros — es la que el original ya tenía, y que la Sesión 1 había tapado
  sin querer al no portar el alta.
- **Ahora:** `app/(admin)/admin/page.tsx` + `components/admin/CrearOrganizacion.tsx`
  reponen esa pantalla. El registro de `/entrar` (caso 6) la vuelve alcanzable sin
  que nadie invite a la persona.
- **Motivo:** es el modelo de autoservicio del producto (quien quiere administrar un
  condominio se da de alta solo). Lo que cambia respecto a la Sesión 1 no es la
  política, es que ahora hay camino para llegar.
- **Estado:** **aceptado para el piloto** (decisión de Nicolás, 27-sep). El riesgo
  real es bajo mientras el Preview de Vercel esté protegido y el piloto sea de un
  condominio: lo peor que puede pasar es una organización basura en la cartera del
  operador. **Pendiente de decisión de producto:** si el lanzamiento comercial
  requiere que el alta pase por Vecitap (invitación, lista blanca, aprobación del
  operador) o si se queda en autoservicio. Es conversación con el socio, no un bug.
- **Cómo se revierte:** sacar `<CrearOrganizacion />` de `app/(admin)/admin/page.tsx`
  (vuelve el mensaje "sin administradora asociada"), o cerrarlo del lado de la base
  agregando una verificación dentro de `crear_organizacion`. Lo segundo es lo que
  corresponde si la decisión de producto es cerrarlo de verdad: mientras la función
  siga abierta, cualquiera con la clave anon puede llamarla sin pasar por la pantalla.


### 20. Enlace "¿Viene a registrar su administradora?" en la pantalla de invitación

> **28-sep — MANTENIDO.** Equivalencia de arquitectura: `main` tiene un archivo por rol y nunca comparte esta pantalla; la app comparte un solo `/entrar`, así que sin el enlace esa cuenta no tiene cómo llegar a `/admin`.

**Caso de uso:** alguien que se acaba de registrar para administrar un condominio
(no para vivir en uno) y cae en "Falta un paso" (la pantalla de aceptar una
invitación de residente) ahora tiene un enlace visible a `/admin` en vez de quedar
atascado pegando un código que no tiene.

- **Antes (en `main`):** esta ambigüedad no existía — `admin.html`, `index.html` y
  `garita.html` son tres archivos separados, cada rol entra por el suyo. Nunca hay
  una sola pantalla de "sin nada asociado" compartida entre roles.
- **Ahora:** `components/residente/Invitacion.tsx` — enlace de texto discreto al
  pie de la tarjeta, `href="/admin"`. Es consecuencia directa de compartir un solo
  `/entrar` entre los tres roles (decisión ya tomada en Fase 3): con `signUp`
  reactivado hoy (caso 6), una cuenta recién creada para dar de alta una
  administradora también tiene cero unidades, y sin este enlace no tenía cómo
  llegar a `/admin`.
- **Motivo:** capacidad nueva, necesaria para el piloto de mañana — Nicolás va a
  crear su propia cuenta desde cero para probar el alta de organización (bloque 1
  de los casos de validación).
- **Estado:** aplicado.
- **Cómo se revierte:** quitar el bloque del enlace en `Invitacion.tsx` — no toca
  nada más.

### 21. `NuevoEdificio` movido de Ajustes al selector de edificio

> **28-sep — REVERTIDO.** `NuevoEdificio` vuelve a abrirse desde el encabezado de "Datos del edificio" en Ajustes, como `admin.html:5817-5819`, y se quitó del selector de edificio.

**Caso de uso:** una organización que ya tiene al menos un edificio puede crear
otro sin pasar por Ajustes (que no está portado) — el botón "+ Otro edificio"
vive junto al selector de edificio, arriba de cada sección.

- **Antes:** `app.html:6033-6067` (`NuevoEdificio`) se abre desde dentro de
  Ajustes, una pantalla completa que no se portó (fuera de alcance de la Sesión 2,
  ver `docs/estado-migracion.md`).
- **Ahora:** `components/admin/NuevoEdificio.tsx`, con los mismos 4 campos que el
  original (nombre, prefijo, interés de mora, tolerancia de alícuotas — sin RIF ni
  dirección, así es en `main` también, no es un recorte nuestro). Se engancha en
  `app/(admin)/admin/[orgId]/[edificioId]/layout.tsx`, siempre visible — antes el
  selector de edificio (`SelectorEdificio.tsx`) solo aparecía con 2 o más
  edificios, así que una organización con exactamente uno no tenía ningún punto de
  la interfaz donde crear el segundo.
- **Motivo:** decisión de Nicolás (27-sep) — portar solo esta pieza de Ajustes en
  vez de la pantalla completa, para no ampliar el alcance de hoy. `admin.html` de
  `main` no sirve como alternativa para producción porque apunta a
  `vecitap-pruebas`.
- **Estado:** aplicado. El resto de Ajustes (edición de la organización, logo,
  módulos, etc.) sigue sin portar.
- **Cómo se revierte:** quitar `<NuevoEdificio>` del layout — el componente en sí
  no tiene otro punto de entrada.

### 22. `/destino` y `/admin` decidían "es administrador" por visibilidad de tabla, no por rol

> **28-sep — MANTENIDO.** Corrección de un bug propio de compartir sesión entre roles, que `main` no necesita resolver porque cada rol tiene su archivo y su clave de `localStorage`.

**Caso de uso:** un residente que entra sin decir a dónde va (o que escribe `/admin`
a mano) ahora cae siempre en su recibo, no en el panel de administración de su
propio edificio.

- **Antes (bug, no una decisión de `main` — `main` nunca comparte sesión entre
  roles):** `app/destino/page.tsx` decidía si alguien "administra algo" con
  `organizaciones.select().limit(1)`. Esa tabla es visible por RLS a cualquiera
  con una membresía ahí, **sin importar el rol** — un residente ve el nombre y el
  RIF de su propio edificio (lo necesita para su recibo). Con esa consulta,
  `residente.prueba@vecitap.com` entrando sin `volver` terminaba en `/admin` en
  vez de `/mi`. `app/(admin)/admin/page.tsx` (AdminHome) tenía el mismo problema:
  listaba como "administrables" organizaciones donde el usuario solo es
  residente — no era una falla de seguridad (`/admin/[orgId]/*` sigue gateado por
  `tiene_rol()`, así que hacer clic ahí no entraba a ningún lado), pero sí una
  lista incorrecta.
- **Ahora:** `/destino` usa `administra_algo()` (RPC que sí distingue por rol,
  ya existía en la base). `AdminHome` filtra la lista de organizaciones
  candidatas con `tiene_rol(org.id, ROLES_ADMIN)` — la misma función que gatea
  el acceso real, para que la lista y el acceso sean siempre la misma cosa.
  `ROLES_ADMIN` se unificó en `lib/admin/constantes.ts` (antes duplicado en
  `proxy.ts` y en `[orgId]/layout.tsx`).
- **Motivo:** bug de esta migración, no algo heredado de `main` — es consecuencia
  de compartir una sola sesión/un solo `/entrar` entre los tres roles (decisión
  de Fase 3), algo que `main` nunca necesitó resolver porque cada rol tiene su
  propio archivo HTML y su propia clave de `localStorage`.
- **Cómo se encontró:** Nicolás lo confirmó a mano (residente.prueba entrando
  sin `volver` caía en `/admin`); se reprodujo y se verificó la corrección con
  el script de validación automatizada del Bloque 0
  (`scripts/validacion-bloque0.mjs`, ver docs/estado-migracion.md).
- **Estado:** corregido y validado (dos corridas del script, 21/21 casos, dos
  veces seguidas).
- **Cómo se revierte:** no aplica — es la corrección de un bug real, no una
  decisión de producto a reconsiderar.

---

## Desvíos nuevos del 28-sep

### 23. `pdfjs-dist` en una versión más nueva que la de `main`

**Caso de uso:** ninguno visible — se lee el mismo PDF del banco. Lo que cambia es
que el lector no tiene una vulnerabilidad conocida.

- **`main`:** carga `pdf.js` **3.11.174** desde cdnjs (`admin.html:350-373`).
- **Ahora:** `pdfjs-dist` **6.3.289**, como dependencia del proyecto.
- **Motivo:** **CVE-2024-4367** (severidad alta, 8,8) afecta a `pdfjs-dist ≤ 4.1.392`
  y se corrigió en 4.2.67. Con la configuración por omisión, un PDF preparado a
  propósito puede ejecutar JavaScript en el dominio que lo abre. Acá el PDF lo sube
  quien concilia, se lee **en el navegador** y en el mismo origen que la sesión de
  Supabase — es exactamente el escenario del CVE. Entra por la excepción de
  seguridad del criterio del 28-sep.
- **Estado:** aplicado y **aprobado por Nicolás el 28-sep**. La API que se usa
  (`getDocument`, `getTextContent`, `transform`) es la misma en las dos versiones,
  así que el texto extraído no cambia.
- **Cómo se revierte:** `npm install pdfjs-dist@3.11.174`. **No recomendado**:
  reintroduce el CVE.

### 24. Excel y PDF se empaquetan con la app, no se bajan de un CDN

**Caso de uso:** la conciliación y la carga de saldos funcionan aunque la red del
edificio bloquee cdnjs o cdn.jsdelivr, y no hay un tercero que pueda cambiar el
código que lee los archivos del banco.

- **`main`:** baja SheetJS, PapaParse y pdf.js por CDN en el momento de usarlos
  (`admin.html:350-387`); si el CDN falla, la pantalla dice "lector no disponible".
- **Ahora:** las dos librerías son dependencias reales y viajan en el build. Se
  importan de forma diferida (`await import(...)`), así que su peso —480 KB de
  SheetJS, 433 KB de pdf.js— solo se baja cuando alguien elige de verdad un
  archivo, y nunca entra al bundle del residente (verificado contra los manifiestos
  del build: los dos chunks solo los referencian `/admin/.../pagos` y
  `/admin/.../propietarios`).
- **Motivo:** el CSV se lee sin librería (`leerCSV` en `lib/admin/archivos-tabla.ts`,
  reemplaza a PapaParse). Para Excel, `npm install xlsx` trae la 0.18.5, congelada
  desde 2022 y con vulnerabilidades conocidas; la versión mantenida se instala
  desde `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, que es lo que quedó
  en `package.json`.
- **Estado:** aplicado.
- **Cómo se revierte:** no aplica — es la forma de portar lo que `main` ya hacía.

### 25. El enlace de la garita apunta a `/garita`, no a `garita.html`

**Caso de uso:** el mensaje que Accesos copia para el vigilante lleva a la pantalla
de la garita de esta app.

- **`main`:** `admin.html:4190` arma el enlace como `…/garita.html`, un archivo
  suelto al lado de `admin.html`.
- **Ahora:** `/garita`, que es la ruta equivalente en la app.
- **Motivo:** equivalencia de arquitectura, igual que el enlace al portal del
  residente (`/entrar?volver=/mi` en vez de la raíz del sitio). No es un cambio de
  comportamiento: es la misma pantalla en la dirección que le corresponde acá.
- **Estado:** aplicado en `components/admin/Accesos.tsx`. La ruta se construyó en
  el bloque 10 (28-sep), así que el enlace ya lleva a una pantalla real.

### 26. La garita no tiene sesión propia: comparte la de los otros tres módulos

**Caso de uso:** el vigilante entra por el mismo `/entrar` que todos, y su sesión
vale para toda la app.

- **`main`:** cada HTML crea su cliente con una `storageKey` propia
  (`garita.html:231-232` usa `"vecitap-garita"`), a propósito: con la clave por
  omisión, entrar en una página cerraba la sesión de otra. Eso permite tener
  abiertas en el mismo navegador una sesión de admin y una de vigilante a la vez.
- **Ahora:** una sola sesión en cookies para los cuatro módulos (decisión de la
  Fase 3). Entrar como vigilante en el mismo navegador donde había una sesión de
  administrador la reemplaza.
- **Motivo:** consecuencia directa de unificar en una sola app con sesión en
  cookies — es lo que permite que el proxy y los Server Components autoricen del
  lado del servidor, que es de donde sale el gate de `/garita/[edificioId]`. En
  uso real no se cruza: la garita vive en la tableta de la puerta y la
  administración en otro equipo. Donde sí se nota es **probando**: para ver los
  dos roles a la vez hace falta una ventana privada o dos navegadores.
- **Estado:** aplicado (heredado de la Fase 3, se hace visible con la garita).
- **Cómo se revierte:** no aplica sin deshacer la sesión en cookies de toda la app.

### 27. La garita no tiene pantalla de login propia

**Caso de uso:** el vigilante entra, crea su clave la primera vez y recupera la
clave olvidada — por las mismas pantallas que el resto del sistema.

- **`main`:** `garita.html:364-450` tiene su propio login con tres modos (entrar ·
  "Es mi primera vez" · "Olvidé mi clave") y campo con ojo, duplicando el de los
  otros tres HTML.
- **Ahora:** `/garita` sin sesión redirige a `/entrar?volver=/garita`. El
  `/entrar` compartido (bloque 5) ya tiene esos tres modos más `clave-nueva`, y
  `CampoClave` es el campo con ojo.
- **Motivo:** mismo criterio que ya se aplicó a Operador (bloque 9) y que fijó el
  punto 3 del criterio del 28-sep: lo que quedó obsoleto por arquitectura no se
  porta. Un login por módulo era necesario cuando cada módulo era un archivo
  suelto con su propia sesión; con `/entrar` compartido, no.
- **Estado:** aplicado. No hizo falta escribir código en el bloque 10.
- **Cómo se revierte:** no aplica.

### 28. Cada vista de la garita es una URL, no estado en memoria

**Caso de uso:** el vigilante recarga la tableta y se queda en la vista donde
estaba; el botón de atrás vuelve a la anterior.

- **`main`:** `garita.html:901-911` cambia de vista con `estado.vista` y vuelve a
  dibujar. Recargar siempre devuelve a Entrada y el botón de atrás sale de la
  página.
- **Ahora:** `/garita/[edificioId]/{entrada,adentro,consultar,bitacora}`. Cambiar
  de garita con el `<select>` del encabezado además **conserva la vista abierta**,
  en vez de volver a Entrada.
- **Motivo:** mismo patrón que ya usan las pestañas de Residente y las secciones
  de Admin (subrutas, no estado de pestaña). En una tableta que se reinicia sola
  importa más que en una laptop.
- **Estado:** aplicado.
- **Cómo se revierte:** no aplica — es la forma de portar la navegación a Next.

### 29. La garita comparte el tema de la app, en vez de arrancar en oscuro con clave propia

> **28-sep — APROBADO** (Nicolás, confirmado con Gustavo). Revierte la decisión
> del 28-sep, que sí pedía tema propio. Lo que la garita necesita es legibilidad,
> y eso son los tamaños, no el color.

**Caso de uso:** el vigilante ve la garita en el mismo tema que el resto del
sistema, y el botón "Tema" se comporta igual que en los otros módulos. Lo que
cambia respecto de las demás pantallas es el **tamaño**: letra base de 17 px,
campos de 56 px y botones de 60-64 px, para tocar de pie, con guantes o con
lluvia.

- **`main`:** `garita.html:247-255` guarda la preferencia bajo
  `vecitap-tema-garita` —clave propia, distinta de la `vecitap-tema` que usan los
  otros tres— y **arranca en oscuro** en vez de claro. Es deliberado: la usa otra
  persona, en otro equipo, parada en una puerta de noche. Efecto secundario: un
  vigilante y un administrador en el mismo navegador no se pisan la preferencia.
- **Ahora:** una sola clave, `vecitap-tema`, y el mismo valor por omisión que el
  resto. El grupo `(garita)` no lleva proveedor de tema: hereda el del layout
  raíz. Sí se conservan los tamaños propios (`app/(garita)/garita.css`) y los
  tokens `--veredicto-si`/`--veredicto-no`, que son legibilidad, no preferencia.
- **Motivo:** el color no es lo que hace usable una garita; el tamaño sí. Una
  segunda clave de tema es una preferencia más que mantener, un segundo camino en
  el script anti-parpadeo y una fuente de confusión al probar, a cambio de una
  diferencia que a nadie le importa. El vigilante puede poner oscuro con el mismo
  botón de siempre, y queda guardado.
- **Qué se pierde:** en el mismo navegador, vigilante y administrador ahora
  comparten la preferencia de tema. En uso real no se cruza (la garita vive en la
  tableta de la puerta), y va en la misma línea que el caso 26, donde también
  comparten la sesión.
- **Estado:** aplicado. La versión con clave propia llegó a construirse en el
  bloque 10 y se deshizo el 28-sep: `lib/theme/ThemeProvider.tsx` y
  `THEME_INIT_SCRIPT` volvieron a como estaban antes de ese bloque.
- **Cómo se revierte:** volver a parametrizar `ThemeProvider` con
  `clave`/`porOmision` y envolver el grupo `(garita)`. **Ojo con la trampa que
  hizo fallar el primer intento en silencio:** las constantes no pueden vivir en
  `ThemeProvider.tsx`, que es `"use client"` — un Server Component que las importe
  recibe una referencia de cliente y lee `undefined`. Detalle en
  `docs/estado-migracion.md`, "Ruta de la garita".

---

### 30. Las fechas se deciden en hora de Venezuela, no en la de Greenwich

> **28-sep — MANTENIDO.** Excepción explícita de riesgo de datos: en `main`, un pago
> registrado después de las 8 de la noche queda guardado con la fecha del día
> siguiente. Aprobado por Nicolás el 28-sep.

**Caso de uso:** cuando un residente reporta un pago, o la administración registra uno,
o el operador exporta la cartera, la fecha que se guarda y se muestra es **el día que
es en Venezuela** — no el día que ya es en Greenwich. Antes, de 8 de la noche a
medianoche, todas esas fechas salían con un día de más.

- **Antes:** los cuatro HTML y la primera versión del port usan
  `new Date().toISOString().slice(0,10)`, que devuelve el día **en UTC**. Venezuela es
  UTC−4, así que entre las 20:00 y las 00:00 hora local ya es el día siguiente en UTC.
  Afectaba:
  - la fecha propuesta al registrar un pago (`components/admin/Pagos.tsx`) y al
    reportarlo (`components/residente/FormularioReportarPago.tsx`) — **este es el
    riesgo de datos**: la fecha queda escrita en la tabla `pagos`;
  - el `max` del input de fecha y la validación "la fecha no puede ser futura" del
    mismo formulario, que por eso **dejaban pasar el día siguiente**;
  - la fecha con la que el operador carga la tasa del BCV a mano y el nombre del CSV de
    cartera (`components/operador/ConsolaOperador.tsx`);
  - la fecha de inicio de una suscripción y la de pago de un cobro
    (`components/operador/FichaCliente.tsx`);
  - la pastilla "vencido" de la cartera, que aparecía hasta 4 horas antes.
- **Ahora:** `lib/formato.ts` — `hoyLocalISO()` está fijada a `America/Caracas` con
  `Intl.DateTimeFormat`, y la vieja `hoyISO()` (la de UTC) **se eliminó** en vez de
  dejarla al lado invitando a elegir la equivocada. La zona vive en **una sola
  constante** (`ZONA_VECITAP`) de ese archivo.
- **Motivo:** riesgo de datos. Una fila de `pagos` con la fecha equivocada no se nota
  en pantalla y desordena la conciliación con el banco, que se hace por fecha. Los
  demás puntos (CSV, pastilla "vencido") son cosméticos y se corrigen de paso porque
  salen de la misma función.
- **Lo encontró la validación de Garita**, por otro camino: una nota de bitácora de las
  22:59 aparecía en el día siguiente. Esa mitad del problema estaba en la base
  (`garita_bitacora`) y se corrige con
  `supabase/migrations/20260928140000_garita_bitacora_dia_local.sql`, que crea
  `hoy_local()` / `inicio_dia_local()` — el par de `hoyLocalISO()` del lado del
  servidor. Las dos puntas tienen que decidir el mismo día. Auditoría completa de qué
  otras funciones de la base deciden un día: `docs/estado-migracion.md`, "Zona horaria".
- **Estado:** aplicado del lado del cliente. La migración de la base queda **sin
  aplicar** (la corre Nicolás, avisándole antes a Gustavo: toca una función
  `SECURITY DEFINER` en la base compartida).
- **Lo que esto asume, a propósito:** una zona única escrita a mano, correcta mientras
  todos los clientes estén en Venezuela. El modelo a largo plazo es una zona por
  organización o edificio; queda anotado como decisión a revisar, no como olvido.
- **Cómo se revierte:** volver `hoyLocalISO()` a
  `new Date().toISOString().slice(0,10)`. No recomendado: reintroduce el riesgo de
  fechas de pago corridas un día.

---

## Funcionalidad nueva del 30-sep

### 31. "¿Quién paga el condominio?" por unidad, y el total de quien tiene varias unidades

> **30-sep — NUEVO; ajustado el 01-oct con las respuestas de Gustavo.** Capacidad que
> `main` no tiene. Reglas de negocio decididas por Gustavo; diseño técnico decidido por
> Nicolás. **Solo la fase 1** (el pago agrupado de varias unidades en una transferencia
> es la fase 2, fuera de alcance).

**Caso de uso:** en el edificio piloto (oficinas) es común que un propietario tenga
varias, y puede haber inquilinos que alquilen varias. Hoy cada uno ve sus unidades por
separado, nunca el total, y no hay dónde decir que una oficina la paga el inquilino.

- **`main`:** no existe. El residente elige una unidad a la vez en el selector; la
  ficha de la unidad registra propietario e inquilino y a quién le llega el recibo,
  pero no quién es responsable del pago.
- **Ahora:**
  - La administradora marca en la ficha de cada unidad **quién paga: propietario (por
    omisión) o inquilino**. Lo decide ella, no el residente: si lo eligiera el
    propietario, podría sacar unidades de su vista para no ver la deuda.
  - Quien tiene **dos o más unidades** (propias o alquiladas) ve arriba del selector:
    - **"Lo que usted paga"**: las que es propietario y paga el propietario, más las que
      alquila y paga el inquilino. Cada una con su saldo, y el total.
    - **"Lo paga su inquilino"**: las que es propietario y paga el inquilino. Solo si
      está al día o debe, sin montos.
  - Con una sola unidad, la pantalla no cambia.
  - **La base cuida la coherencia sola:** no deja marcar "paga el inquilino" si la
    unidad no tiene inquilino cargado, y si el inquilino se va, la unidad vuelve sola a
    "paga el propietario", así nunca queda una deuda que el propietario no ve y que
    nadie más paga.
- **Confirmado por Gustavo (01-oct):**
  - "Tiene inquilino" = el cargado en el directorio de la unidad, tenga o no cuenta en
    la app.
  - **El total suma solo lo que se debe.** Cada unidad es una cuenta aparte: un saldo
    a favor no se resta de las otras. Va en una **línea aparte**, "Saldo a favor en
    05A: $ X", para que no parezca perdido. **08-oct:** la unidad sale una sola vez,
    "05A · A favor $ X" (caso 36).
  - "Debe N cuotas" no hace falta para el piloto: se muestra al día / debe.
    **08-oct:** ya se muestra, ver caso 37.
  - El inquilino que alquila varias ve el mismo resumen (regla 3).
- Al **importar unidades** se pueden agregar, al final de cada línea, quién paga y los
  datos del inquilino. Si dice "inquilino" pero falta su nombre, la fila se marca con
  error y no se carga. Si la fase 1 no está a tiempo para la carga del piloto, se
  cargan las 6 columnas de siempre y "quién paga" se marca después en la ficha.
- **Estado:** **construido, sin validar en el navegador.** La migración
  (`supabase/migrations/20260930120000_unidades_paga.sql`) está **aplicada en
  vecitap-pruebas** el 01-oct, con sus 8 verificaciones; falta producción. Detalle
  técnico en `docs/estado-migracion.md`, "Propietarios con varias unidades — fase 1".
- **Cómo se revierte:** primero la app (quitar el selector, la etiqueta, las columnas
  del importador y el resumen), después
  `supabase/rollbacks/20260930120000_unidades_paga_rollback.sql` (borra lo cargado en
  "quién paga").

### 32. "El inquilino ya no ocupa la unidad"

> **30-sep — NUEVO; ajustado el 01-oct: confirmado por Gustavo, y ahora también quita
> el acceso a la app.** Capacidad que `main` no tiene.

**Caso de uso:** cuando un inquilino deja la oficina, la administradora lo indica desde
la ficha de la unidad con un botón, y el sistema deja de tratarlo como inquilino desde
ese día, sin borrar su historia, y le quita el acceso a esa unidad en la app.

- **`main`:** no hay forma de hacerlo. La ficha solo permite **sobrescribir** los datos
  del inquilino con los del siguiente: el que se fue desaparece sin dejar rastro de que
  estuvo, y si se vacía el nombre no pasa nada. Su acceso a la app sigue activo hasta
  que alguien lo dé de baja a mano.
- **Ahora:** en la ficha de la unidad (Admin → Propietarios → unidad → Datos), bajo los
  datos del inquilino, **"El inquilino ya no ocupa la unidad"**. Pide confirmación y
  registra la fecha de hoy como fin de su ocupación. Sus datos y su historia quedan
  guardados.
  - Si era el **último** inquilino de la unidad:
    - la unidad **vuelve sola a "paga el propietario"** (caso 31);
    - se **desactivan los accesos de inquilino de esa unidad** (no de otras). Su
      usuario sigue activo: si se muda a otro edificio con Vecitap, entra con el mismo
      usuario y un código nuevo.
    - La pantalla dice **"También se le quitó el acceso a la app"**, solo si de verdad
      se desactivó al menos uno (si el inquilino nunca creó su cuenta, no lo dice).
  - Si la unidad tiene **otro** inquilino registrado, los accesos no se tocan (no se
    puede saber cuál es "el del que se fue": los accesos son de la unidad, no de la
    persona del directorio). La confirmación lo avisa.
- **Lo hace la base**, no la pantalla: también vale si el vínculo se cierra o se borra
  por otro camino. Queda registrado en la auditoría.
- **Estado:** construido, sin validar en el navegador (`components/admin/DatosUnidad.tsx`
  + la parte 3b de `20260930120000_unidades_paga.sql`, aplicada en vecitap-pruebas el
  01-oct y verificada como administradora).
- **Cómo se revierte:** quitar el botón, y el rollback de la migración. Los vínculos ya
  cerrados quedan cerrados y los accesos ya apagados quedan apagados: no hay "deshacer".
  Si una salida se marcó por error, se vuelve a cargar al inquilino en la ficha y se le
  manda un código nuevo.

## Ronda 2 del tramo 2 (08-oct)

> Correcciones y mejoras que salieron de las pruebas de Gustavo del 06 y 07-oct en el
> Preview de `dev`. **Estado de todas: construidas, sin validar en el navegador.** Las
> dos migraciones nuevas (`20261008120000_reemplazar_inquilino.sql` y
> `20261008130000_mis_cuotas.sql`) están **aplicadas en vecitap-pruebas** el 08-oct;
> falta producción.

### 33. "Cargar saldos" toma el saldo de su columna, nunca "el último número"

**Caso de uso:** la administradora sube la planilla de saldos de su edificio.

- **`main`:** de cada fila tomaba el último número que encontrara
  (admin.html:2009-2016). En una planilla con teléfono o correo después del saldo, el
  teléfono se cargaba como deuda ("0414-…" → 414). Pasó con el archivo de Gustavo del
  04-oct.
- **Ahora:**
  - el saldo sale de la columna cuyo encabezado diga «Saldo», «Deuda» o «Monto»; sin
    encabezados, de la segunda columna; el código, de la columna «Unidad» o de la
    primera;
  - una celda que no es un monto (un teléfono, un correo) o que está vacía **no se
    carga**: queda marcada en la previa con lo que decía;
  - la previa dice de qué columna salió el saldo.
- El PDF sigue igual que en `main` (no tiene columnas).
- **Cómo se revierte:** `components/admin/ImportarSaldos.tsx` y `montoEstricto` en
  `lib/admin/archivos-tabla.ts`. Sin cambios en la base.

### 34. Quien ya tiene sesión nunca cae en la portada de venta

**Caso de uso:** Gustavo, con su cuenta Admin, entró y terminó en la página de venta
(prueba 7 del tramo 1).

- **`main`:** cada módulo era un archivo; no había una portada de venta en la misma
  dirección.
- **Ahora:**
  - después de entrar (o de poner una clave nueva) el navegador hace **una sola**
    navegación completa al destino, en lugar de dos pedidos en paralelo;
  - el destino se sanea igual que del lado del servidor: `/` o una dirección ajena no
    son un destino válido; se va a `/destino`, que decide por el rol (Operador, Admin,
    Garita o Mi unidad);
  - si alguien con sesión entra a una sección donde no tiene permiso (otra
    administradora, Operador sin serlo, una garita que no es suya), va a `/destino` y
    no a la portada.
    **Ronda 3:** ya no va a `/destino` sino a una pantalla propia, "Sin acceso" (caso 45).
- **Causa de la prueba 7:** no se pudo confirmar. Su rol estaba bien (dueña de la
  administradora, en los dos chequeos de rol). Los registros de la base muestran que
  después de un ingreso con clave (10:14) no se pidió ninguna página de la app durante
  22 segundos, lo que encaja con haber quedado en la portada. No hay registros de
  Vercel de ese día. El cambio cierra los caminos posibles.
- **Cómo se revierte:** `FormularioEntrar.tsx`, `rutaInterna()` en `lib/url-sitio.ts`,
  y `"/destino"` → `"/"` en `proxy.ts`, `admin/[orgId]/layout.tsx` y `operador/page.tsx`.
  Toca autenticación: pasa por revisión cruzada.

### 35. El propietario de una unidad que paga el inquilino ve solo el estado

**Caso de uso:** 08D la paga su inquilino. El resumen ya decía "Lo paga su inquilino",
pero la tarjeta de la unidad decía "Propietario · Debe $ 83,75" y ofrecía "Reportar un
pago".

- **`main`:** no existe "quién paga" (ver caso 31).
- **Ahora**, en esas unidades y solo para el propietario:
  - la tarjeta dice **"Lo paga su inquilino"** y el estado ("Al día", "Debe 2
    cuotas"), **sin monto**;
  - **no aparece "Reportar un pago"**, y si se entra por el enlace directo, lleva a
    "Mi recibo".
- **El bloqueo es solo de pantalla, a propósito** (decisión de Nicolás del 08-oct): la
  base sigue aceptando un pago del propietario en esa unidad, porque un propietario
  puede querer pagar por su inquilino. Si hiciera falta, la administradora lo carga
  desde Admin.
- "Mi recibo" y "Mis pagos" siguen mostrando el recibo completo de la unidad, como
  antes. **Para revisar con Gustavo:** si el propietario tampoco debería ver los montos
  del recibo en esas unidades.
- **Cómo se revierte:** `TarjetaSaldo.tsx`, `PestanasResidente.tsx`,
  `mi/[unidadId]/layout.tsx` y `reportar/page.tsx`.

### 36. Saldo a favor: "A favor $ X" en un verde sobrio

- **`main`:** en Admin, el saldo a favor se veía como "$ -50,00" en azul (que en el
  tema claro es casi negro); en Mi unidad, como "A su favor" en el verde de "al día"
  (menta en el tema oscuro).
- **Ahora:** en Propietarios, la ficha de la unidad, el resumen y la tarjeta de Mi
  unidad dice **"A favor $ 50,00"**, en un verde sobrio propio (`--a-favor` en
  `app/globals.css`). En el tema claro es el mismo verde de siempre; en el oscuro deja
  de ser menta.
- En el resumen de quien tiene varias unidades, la unidad con saldo a favor sale **una
  sola vez** ("02D · A favor $ 50,00"). Antes salía dos veces: "A su favor" sin monto
  y otra línea "Saldo a favor en 02D". Esto ajusta el caso 31. Sigue sin restarse del
  total.
- "- 0,00" se muestra "0,00" en toda la app (un residuo de redondeo conservaba el
  signo).

### 37. "Al día" o "Debe N cuotas" en las unidades que paga el inquilino

**Caso de uso:** "Lo paga su inquilino · Debe" era vago. Lo acordado era "al día" o
"debe N cuotas" (el caso 31 lo había dejado para después).

- **Ahora** la base cuenta las cuotas (`mis_cuotas()`): recorre los recibos de los
  meses cerrados, del más reciente al más viejo, hasta cubrir el saldo. Los pagos
  cubren primero lo más viejo, así que lo que se debe son los últimos meses.
- **Casos borde:**
  - saldo cero o a favor → **"Al día"** (el monto a favor no se muestra en esta parte);
  - saldo parcial, por ejemplo 1,3 cuotas → **"Debe 2 cuotas"**: son dos meses con
    algo pendiente, que es lo que el propietario verá en los recibos;
  - más deuda que todos los recibos (deuda de antes de Vecitap, cargada como saldo
    inicial) → **"Debe más de N cuotas"**;
  - sin ningún mes cerrado y con deuda → **"Con deuda"** (no hay cuota con qué
    medirla). **Es lo que se ve hoy en la organización de prueba**: no tiene meses
    cerrados.
- **Cómo se revierte:** `supabase/rollbacks/20261008130000_mis_cuotas_rollback.sql`.
  La pantalla aguanta sin la función: vuelve a "Con deuda" / "Al día".

### 38. Cambiar el correo del inquilino en la ficha pide confirmación

**Caso de uso:** en la ficha de la unidad, la administradora escribe el correo de
**otro** inquilino encima del que había.

- **`main`:** se sobrescribían los datos de la misma persona: el inquilino anterior
  "se convertía" en el nuevo, sin preguntar, y si tenía cuenta seguía entrando a la
  unidad.
- **Ahora**, al guardar con un correo distinto, se pregunta:
  - **"Sí, cambiar el inquilino"**: hace lo mismo que "El inquilino ya no ocupa la
    unidad" (caso 32): fecha de salida hoy, se le quita el acceso a la app y sus
    invitaciones pendientes dejan de servir. Después registra al nuevo. Si la unidad
    estaba en "paga el inquilino", sigue así. Todo pasa junto o no pasa nada.
  - **"Es el mismo, corregir el correo"**: el correo estaba mal escrito. Se corrige y
    no se le quita nada.
  - **"No"**: no guarda.
- Corregir el nombre o el teléfono, o completar un correo que faltaba, sigue
  editando a la misma persona, sin preguntar.
- **Cómo se revierte:** `DatosUnidad.tsx` y
  `supabase/rollbacks/20261008120000_reemplazar_inquilino_rollback.sql`.

### 39. El "Sr." no se repite

- **`main`:** la base pone "Sr." por omisión a toda persona nueva, y el importador
  guardaba el nombre tal como venía en la planilla ("Sr. Pérez"): se leía "Sr. Sr.
  Pérez".
- **Ahora:**
  - al importar, un tratamiento al principio del nombre ("Sr.", "Sra.", "Dr."…) pasa
    al campo de tratamiento y el nombre queda sin él;
  - en pantalla, si el nombre ya trae su tratamiento, no se le suma otro. Eso arregla
    también lo que ya está cargado, sin tocar los datos.

### 40. Los números de la ficha aceptan coma decimal, y avisan si no se entienden

- **`main`:** la coma decimal ya funcionaba ("1,5"). Pero "0.123" (una alícuota
  escrita con punto) se leía 123, y "1,234.56" se guardaba como 0 sin avisar.
- **Ahora:** con coma y punto, el último es el decimal; un punto solo es decimal salvo
  que parezca separador de miles ("1.500"); y en la ficha de la unidad un número que
  no se entiende **no se guarda**: la ficha dice cuál y cómo escribirlo. La lectura
  nueva vale para todos los montos de la app, que usan la misma función (`num()` en
  `lib/formato.ts`).

### 41. "Datos de la administradora" en Ajustes

- **`main`:** el nombre y el RIF de la administradora se escribían una vez, al
  crearla, y no había dónde corregirlos. Los ejemplos del formulario de alta parecían
  datos reales.
- **Ahora:** Ajustes tiene una tarjeta **"Datos de la administradora"** (nombre y RIF)
  al lado del logo. Solo la cuenta dueña de la administradora puede cambiarlos (así lo
  pide la base); para los demás roles se ve en modo lectura. Los ejemplos del alta son
  ficticios ("Administradora Ejemplo, C.A.", "J-00000000-0", "Residencias Ejemplo").

### 42. Accesos: menos pasos y menos avisos confusos

- **Otra cuenta abierta en el navegador** (prueba 5): Accesos ya no envía nada y queda
  solo el aviso de abajo. Antes la acción salía igual con la otra cuenta, y arriba se
  sumaba "Sin permiso para invitar".
- **El mensaje de invitación** dice "Entre o cree su cuenta con el correo…": quien ya
  tiene cuenta (por ejemplo, por otra unidad) no tiene que crear otra.
- **El correo se toma de la ficha de la unidad:** al elegir la unidad (y si es
  propietario o inquilino), el campo se llena con el correo cargado en la ficha. Si se
  escribe otro a mano, no se pisa.

### 43. Detalles menores

- **Propietarios:** toda la fila abre la ficha de la unidad, no solo el código y la
  flecha.
- **Edificio nuevo** (bloque D): al crear el primer edificio, el lateral y el selector
  se actualizan en el acto. Antes parecía que no se había guardado hasta recargar.
- **Ícono del sitio** (bloque F): la pestaña del navegador y el acceso directo del
  teléfono muestran el ícono de Vecitap, el mismo de la portada, en lugar del de Next.js.

## Ronda 3 (08-oct)

> Ajustes de la revisión cruzada de la ronda 2 y bloques nuevos. **Estado: construidos,
> sin validar en el navegador.** Las migraciones nuevas
> (`20261008140000_reemplazar_propietario.sql`, `20261008150000_indices_saldo_unidad.sql`)
> están **aplicadas en vecitap-pruebas** el 08-oct; falta producción. El importador
> nuevo (bloque A) y el tipo de unidad todavía no están.

### 44. Cambiar el propietario en la ficha pide confirmación, igual que el inquilino

**Caso de uso:** en la ficha de la unidad, la administradora escribe el correo de otro
propietario encima del que había (por ejemplo, la unidad se vendió).

- **`main`:** se sobrescribían los datos de la misma persona: el dueño anterior "se
  convertía" en el nuevo y, si tenía cuenta, seguía entrando a la unidad.
- **Ahora**, los mismos tres botones que en el caso 38:
  - **"Sí, cambiar el propietario"**: el anterior deja de figurar como propietario de
    esa unidad desde hoy, pierde el acceso a **esa** unidad en la app y sus invitaciones
    pendientes para esa unidad dejan de servir. Se registra al nuevo. Todo pasa junto o
    no pasa nada.
  - **"Es el mismo, corregir el correo"** y **"No"**, como en el caso 38.
- **Un propietario con varias unidades no pierde las otras:** se cierra solo el vínculo
  de esa unidad, se apaga solo el acceso a esa unidad y se anulan solo las invitaciones
  de esa unidad. Verificado en pruebas con la cuenta del propietario de 6 unidades.
- Lo que se debía hasta hoy sigue en la cuenta de la unidad (la deuda es de la unidad,
  no de la persona).
- **Regla nueva de la base, dicha explícitamente:** cuando se va el último propietario
  de una unidad —por la ficha o por cualquier otro camino—, se apagan los accesos de
  propietario de esa unidad. Es la misma regla que ya regía para el inquilino (caso 32).
- **Cómo se revierte:** `DatosUnidad.tsx` y
  `supabase/rollbacks/20261008140000_reemplazar_propietario_rollback.sql`.

### 45. Sin permiso para una sección: una pantalla propia, "Sin acceso"

Ajusta el caso 34.

- **Antes (ronda 2):** quien tenía sesión pero no el rol de la sección (otra
  administradora, `/operador` sin ser operador, una garita que no es suya) iba a
  `/destino`, que lo mandaba a lo suyo.
- **Ahora:** va a **`/sin-acceso`**: "La cuenta … no tiene acceso a la sección que
  abrió", con **"Ir a mi inicio"** y **"Salir"**. No salta sola a ningún lado.
- **Por qué** (revisión cruzada): la decisión de "a dónde va cada uno" y la de "puede
  entrar acá" usan criterios distintos, y un salto automático entre las dos podría dar
  vueltas sin fin el día que alguien agregue otro salto en `/admin` o `/garita`.

### 46. Crear una cuenta con un correo que ya tiene cuenta

- **Antes:** decía "Cuenta creada. Confirme su correo", y el correo nunca llegaba
  (Supabase no manda nada en ese caso, para no revelar qué correos existen). Le pasó a
  Gustavo el 04-oct.
- **Ahora:** "Ese correo ya tiene una cuenta. Entre con su clave, o use «Olvidé mi
  contraseña»". Es un desvío consciente: deja saber que ese correo está registrado, a
  cambio de no dejar a la persona esperando un correo que no va a llegar.
- Además (revisión cruzada): sin sesión abierta, la pantalla de entrar **nunca**
  navega, en ningún modo. Antes solo lo cuidaba al crear la cuenta.

### 47. Un solo patrón de botones en toda la app (bloque E)

- **Antes:** cada pantalla resolvía la espera a su manera: algunos botones cambiaban el
  texto ("Revocando…"), la mayoría solo se apagaba, y apagado se veía casi igual que
  prendido (el naranja a media opacidad). Después de guardar, unas pantallas mostraban
  un aviso arriba, otras nada.
- **Ahora:**
  - **Mientras la acción corre**, el botón muestra un indicador girando en lugar del
    texto, sin cambiar de tamaño, y no se puede volver a tocar.
  - **Desactivado** ("no se puede": faltan datos, no hay nada que cargar) se ve gris,
    sin el naranja, con el cursor de prohibido.
  - **Al guardar**, "Guardado ✓" aparece al lado del botón y se va solo a los 3
    segundos; si algo falla, el error queda ahí mismo. Está en: datos del edificio,
    logo, datos de la administradora, ficha de la unidad y suscripción (Operador).
  - Los avisos que dan un resultado con datos ("Se encolaron 12 correos", "3 pagos
    conciliados") siguen arriba, como antes.
- Los botones de la garita (más grandes, para tablet) siguen su propio estilo, con el
  mismo indicador mientras esperan.

### 48. Sin conexión con la base: "No pudimos conectar", también en la primera pantalla

- **Antes:** si la sesión estaba por renovarse justo cuando la base no contestaba, la
  app mandaba a Entrar, como si se hubiera cerrado la sesión. Los layouts ya lo
  distinguían desde el 05-oct; el primer filtro (el proxy) no.
- **Ahora:** muestra **"No pudimos conectar. Reintente"** sin cambiar la dirección de la
  página, así "Reintentar" vuelve a pedir la misma. La sesión no se toca. Verificado
  contra un build de producción local con la base apagada.

### 49. Un número mal escrito no se guarda como 0, en ningún formulario

Extiende el caso 40 (que lo había resuelto solo en la ficha de la unidad).

- **`main`:** en "Nueva unidad" (alícuota y saldos iniciales) y en Cobros (monto e IVA
  de un concepto, también al editarlo en la fila), un valor que no se entendía se
  guardaba como 0 sin avisar.
- **Ahora:** se avisa cuál campo no se entiende y no se guarda; en la fila de Cobros, el
  campo vuelve a lo que tenía. En los gastos del mes, "Falta el monto" se dice solo si
  está vacío; si hay algo escrito que no es un número, se dice eso. "Reportar un pago"
  ya avisaba ("El monto no se entiende").
