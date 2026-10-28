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
| 13 | Íconos de `lucide` no portados | **HECHO** (28-sep, bloques 7 a 9: `lucide-react` 0.469.0 en uso) |
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

> **HECHO (corregido el 28-oct).** `lucide-react` 0.469.0 (la misma librería que `main` carga por CDN) se instaló el 28-sep (commit `e5122f4`, «Integración Bloques 7 a 9») y hoy lo usan 13 pantallas y componentes (Cortes, Cierre del mes, Cobros, Ajustes, Inicio…). Este caso decía «pendiente» por error. Lo de abajo es el registro de cómo estaba antes.

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

## Ronda 4 del tramo 2 (18-oct)

> Arreglos de lo que Gustavo probó en las rondas 2 y 3 (24 OK, 4 OK con observaciones,
> 1 falla menor), monto exacto en bolívares y propietarios con varias administradoras.
> **Estado: construidos, sin validar en el navegador.** Una migración nueva
> (`20261018120000_periodo_cerrado_exige_tasa.sql`), **aplicada en vecitap-pruebas**
> el 18-oct; falta producción. El importador «Cargar datos» va en la ronda 5.

### 50. Los montos en los campos se escriben como en Venezuela, y Cobros avisa bien

Prueba 21 de Gustavo (Cobros).

- **`main`:** los campos que se llenan con un valor guardado mostraban el número como
  lo guarda la computadora: «1234.56», con punto. Pasaba en Cobros (monto e IVA de cada
  fila), la ficha de la unidad (alícuota y saldos iniciales), Ajustes (partidas fijas,
  mora, tolerancias), Cierre del mes (presupuesto, tasa, gastos) y la suscripción en
  Operador.
- **Ahora:** se escriben «1.234,56». **Ningún decimal se pierde:** la alícuota 1,48768
  se muestra entera, no «1,49», y un saldo de 24,1144 se muestra con sus cuatro
  decimales. Guardar sin tocar el campo deja exactamente el mismo número en la base
  (comprobado con montos, alícuotas, tasas, negativos y millones).
- **El aviso «No se pudo guardar» se borra al empezar a corregir** cualquier campo de
  Cobros. Antes quedaba arriba aunque ya estuviera corregido.
- **Un cobro no puede quedar sin nombre**, ni al crearlo ni al editarlo en la fila: es
  lo que se lee en el recibo. Si se borra el nombre, avisa y vuelve al que tenía.
- Lo mismo que el caso 49 en dos lugares que faltaban: el monto de una partida fija
  (Ajustes) y el de un gasto del mes ya cargado. Un valor que no se entiende vuelve a lo
  guardado en vez de guardarse como 0.
- Las cifras que solo se leen (tablas, tarjetas, recibos) ya salían «1.234,56»: se
  revisaron todas y no cambian.

### 51. Recibo con saldo a favor: termina en lo que queda a favor, no en «Total $ 0,00»

Observación 02D de Gustavo.

- **`main`:** si el saldo a favor cubría todo el mes, el recibo terminaba en «Total
  $ 0,00» y el sobrante no aparecía en ningún lado. La 02D tenía $ 50 a favor y un mes
  de $ 14,88: el recibo decía $ 0,00 y la tarjeta «A favor $ 35,12».
- **Ahora** el recibo (en pantalla y en papel) termina en **«Saldo a favor $ 35,12 ·
  Este mes no tiene que pagar»**. El recuadro grande del papel dice «Saldo a favor»
  en vez de «Total a pagar», y no muestra bolívares ni vencimiento: no hay nada que
  pagar.
- **La previa de Cierre del mes** suma una columna «A favor» y, en una unidad así, el
  total dice «A favor $ 35,12 · no paga este mes» en lugar de $ 0,00.
- No cambia ninguna cuenta: la base ya emitía `total = 0`. El sobrante se calcula con
  las mismas líneas que muestra el recibo (a favor menos lo cargado en el mes).

### 52. Tasa del BCV del mes: el campo explica cuál se va a usar

Observación de Gustavo: «la tasa del mes viene en 0».

- **Lo que se encontró en la base (18-oct):** cerrar con el campo en 0 **no** deja los
  bolívares en cero. Si la tasa del mes es 0, `cerrar_periodo()` toma la del BCV del
  **último día del mes** (o la última publicada antes) y la guarda; si no hay ninguna,
  no deja cerrar. El 0 que se veía era el campo del mes abierto.
- **Decisión de Nicolás (18-oct): mostrar, no fijar.** El campo queda vacío
  («Automática») y debajo dice: «En blanco, al cerrar se toma la del BCV del último día
  del mes. La última publicada es 880,12 (del 17 de octubre de 2026)». **Un fin de
  semana o un feriado** se muestra la última disponible con su fecha. Se puede escribir
  otra a mano. No se fija la tasa del día al abrir: eso habría cambiado la regla de que
  el recibo usa la tasa de fin de mes.
- **Dos errores que se corrigieron de paso:**
  - en la corrección del mes abierto, dejar el campo vacío guardaba la tasa **1** (un
    bolívar por dólar). Ahora vacío vuelve a «automática al cerrar»;
  - una tasa mal escrita («abc») se mandaba como 0 sin avisar. Ahora avisa y no guarda.
- **Nueva regla de la base:** un mes cerrado tiene que tener tasa mayor que cero
  (restricción `periodos_cerrado_con_tasa`). Por la pantalla ya no se podía llegar a
  eso; la restricción cubre cualquier otro camino.
- **Cómo se revierte:** `CierreMes.tsx` y
  `supabase/rollbacks/20261018120000_periodo_cerrado_exige_tasa_rollback.sql`.

### 53. Imprimir un recibo: se abre en la misma pestaña, con «Volver»

- **`main`:** «Descargar o imprimir mi recibo» abría una ventana en blanco
  (`about:blank`) con el recibo. Con la app instalada en el teléfono, esa ventana no
  tenía forma de volver y la persona quedaba atrapada. Lo mismo en Admin, desde Cortes.
- **Ahora:** el recibo tiene **su propia dirección** y se abre en la misma pestaña, ya
  listo para imprimir o guardar como PDF:
  - arriba, una barra con **«← Volver»** y **«Imprimir o guardar PDF»**, que **no sale
    en el papel**;
  - en computadora, la hoja a **ancho carta, centrada** sobre fondo gris; en el
    teléfono, a todo el ancho.
- **Residente:** `/mi/[unidad]/recibo/papel`. «Volver» lleva a «Mi recibo».
- **Admin:** `/admin/[administradora]/[edificio]/cortes/papel`, un recibo o todos los
  del mes. «Volver» lleva a Cortes, en el mismo mes que estaba elegido. **Es otra
  dirección, con su propio control:** comprueba que la cuenta administre esa
  organización y que el edificio sea de ella. Comparten la plantilla del papel, no la
  ruta.
- El listado en PDF y el informe de asamblea siguen abriéndose en una ventana aparte
  (son de computadora), pero ahora traen la misma barra, con «← Cerrar».
- Los bolívares del papel y de «Mi recibo» usan el mismo redondeo que «Reportar un
  pago» (caso 54), así las tres pantallas dicen la misma cifra.

### 54. Reportar un pago: cuánto transferir, exacto, en bolívares

- **`main`:** la persona tenía que hacer la cuenta: deuda en dólares por la tasa del
  día, y adivinar el redondeo. Si transfería de menos, quedaba debiendo céntimos que
  nadie entiende.
- **Ahora**, arriba del monto: **«Para pagar su deuda de $ 98,63 transfiera
  Bs 86.803,02»**, con la tasa del BCV y su fecha, y dos botones:
  - **«Pagar deuda total»**: llena el monto con esa cifra;
  - **«Copiar el monto»**: la copia lista para pegar en la app del banco
    (`86803,02`, sin puntos de miles);
  - y el recordatorio: «Transfiera el monto exacto, con los céntimos. Si paga otro día,
    la tasa cambia y el monto también».
- **La cifra cambia al cambiar la fecha del pago**, con la tasa de esa fecha: es la
  misma con la que la base convierte el pago.
- **Redondeo:** hacia arriba al céntimo, para que el pago nunca quede corto. Se
  comprobó con 200.000 combinaciones de deuda y tasa contra la conversión de la base.
  Lo más que se paga de más es menos de un céntimo de bolívar, dentro de lo que acepta
  la conciliación.
- **Por unidad, nunca la suma:** quien tiene varias unidades ve la deuda de la unidad
  que está reportando.
- **No aparece** si la unidad está al día o con saldo a favor, si la base no muestra el
  saldo, si se paga en dólares, ni para el propietario de una unidad que paga su
  inquilino (esa pantalla sigue cerrada para él, caso 35).

### 55. Propietario con unidades en dos administradoras: un total por edificio

Ajusta el caso 31.

- **Antes:** el resumen de /mi sumaba **todas** las unidades en un solo total, aunque
  fueran de administradoras distintas, que se pagan a cuentas distintas. Confirmado en
  la base el 18-oct: `mis_unidades()` trae las unidades de todas las administradoras de
  la cuenta.
- **Ahora**, si las unidades son de **más de una administradora**, el resumen va **por
  edificio**: el nombre del edificio, «Administra …», sus unidades y **su propio
  total**. **No hay total general.** Abajo: «Cada edificio se paga aparte, a su propia
  administración».
- **Con una sola administradora, /mi se ve exactamente igual que antes**, aunque tenga
  unidades en varios edificios de esa administradora.

## Ronda 5 del tramo 2 (18-oct)

> El importador «Cargar datos» y el tipo de unidad. **Estado: construidos, sin validar en
> el navegador.** Dos migraciones nuevas (`20261018130000_unidades_tipo_correo_respaldo.sql`,
> `20261018140000_importar_unidades.sql`), **aplicadas en vecitap-pruebas** el 18-oct;
> falta producción. La segunda la revisó Nicolás el 24-oct: aprobada con ajustes,
> reaplicada en pruebas el 25-oct.

### 56. «Cargar datos» reemplaza a «Importar unidades»

**Caso de uso:** la administradora tiene su planilla de Excel con las unidades, sus
alícuotas, saldos, propietarios, teléfonos, correos e inquilinos, y quiere cargar el
edificio entero de una vez.

- **`main` (y la app hasta la ronda 4):** «Importar unidades» era un cuadro para pegar
  texto con las columnas en un orden fijo. Con la planilla real del piloto cargaban **0 de
  55 filas** (diagnóstico del 04-oct): las comas de los nombres y de las alícuotas partían
  las columnas, los saldos con `$` se cargaban como 0, el «Correo 2» se leía como «quién
  paga», el Estacionamiento quedaba fuera sin aviso, y un propietario de seis unidades se
  registraba seis veces. Además guardaba en varios pasos: si fallaba uno del medio,
  quedaba la mitad cargada.
- **Ahora, «Cargar datos»:**
  - **Un solo botón** que lee el archivo completo (Excel o CSV), o lo pegado desde Excel.
  - **El sistema propone qué es cada columna** aunque los encabezados estén mal escritos
    («Telefomo»), tengan otro nombre («COPROPIETARIOS», «Celular», «Correo 1»), estén en
    otro orden o no estén (entonces lo deduce por el contenido: el @ es un correo, los
    números que suman 100 son la alícuota, el `$` es el saldo). Dice por qué lo propuso, y
    la administradora lo corrige con un selector por columna.
  - **La previa muestra todos los datos de cada fila**, con lo dudoso en **ámbar** y la
    razón debajo: un teléfono con texto adentro («se guarda tal cual, revíselo»), uno de
    otro país, un correo que no es válido («no se guarda»), un tipo de unidad deducido del
    código.
  - **Cada fila que no se carga, con su motivo**, en una lista aparte: sin código, código
    repetido, alícuota que no se entiende, la fila de totales, una unidad dada de baja. El
    número de fila es el mismo que se ve en Excel.
  - **Código repetido en el archivo** (revisión del 24-oct): no se carga **ninguna** de
    esas filas, y la lista dice en qué filas está. Cuál es la buena lo decide la
    administradora en su archivo, no el orden de las filas.
  - **Unidad dada de baja:** una fila cuyo código es el de una unidad inactiva no se carga
    ni la crea de nuevo: «está dada de baja: reactívela desde su ficha».
  - **Ningún dato se pierde sin aviso.** El teléfono de 10C (con el nombre adentro) ahora
    se guarda tal cual, marcado para revisar.
  - **Nada se guarda hasta confirmar**, y entonces **todo o nada**: si algo falla, no queda
    nada a medias.
- **Personas** (reglas de Nicolás del 18-oct):
  - Se juntan solas si coinciden el **correo, el correo de respaldo o el teléfono**: un
    propietario de seis unidades queda como una sola persona.
  - Si coincide el contacto pero el nombre es otro, la previa pregunta (por omisión: es la
    misma). Si **solo** coincide el nombre, pregunta (por omisión: son personas distintas).
    La pregunta nombra **todas** las filas con las que coincide (25-oct): contestar «Sí»
    las junta a todas.
  - **Solo el teléfono en común y otro correo** (revisión del 25-oct): la pregunta sale
    **sin respuesta por omisión**, con los dos correos a la vista, y la carga espera a que
    la administradora elija. Un «Sí» equivocado mandaría el recibo y los avisos de la
    garita de esa unidad al correo de la otra persona. Vale también contra una ficha que
    ya está en la administradora. «No, son personas distintas» separa solo de los de otro
    nombre.
  - Juntar a una persona con una ficha **no le da acceso a la app** a nadie: el acceso es
    por unidad y sale solo de una invitación aceptada (Accesos). Verificado el 25-oct.
  - Si la persona **ya existe en la administradora** (mismo correo o teléfono), se usa su
    ficha: solo se **completan** los datos que tenga vacíos; nunca se pisa uno distinto (la
    previa lo muestra: «la ficha dice X, el archivo Y»).
  - Si varias fichas coinciden por correo o teléfono, se usa la que **se llama igual** que
    en el archivo. Si la fila termina con una ficha de otro nombre, la previa lo marca en
    ámbar para que la administradora lo revise (25-oct, al probar con la planilla del
    piloto).
  - **Empresas y juntas sin «Sr.»** (revisión del 24-oct): una persona nueva cuyo nombre
    tiene C.A., S.A. o S.R.L., o empieza con «Junta», se registra sin tratamiento. Antes
    quedaba «Sr. Inversiones Uno, C.A.». (La ficha, caso 58.)
- **Unidades que ya existen:** por omisión **se omiten**. La previa muestra qué cambiaría,
  campo por campo, con el valor anterior y el nuevo («alícuota 9,00000 → 10,00000»,
  «quién paga Propietario → Inquilino»), y «Actualizar» por fila o «Actualizar todas».
- **Alícuotas:** la previa dice cuánto sumarían con esta carga, con los 5 decimales
  («99,99993 %»). Si no es 100 exacto, avisa siempre con la suma real: en azul si está
  dentro de la tolerancia del cierre, en ámbar si no («el mes no se podrá cerrar hasta que
  cuadren»; la confirmación lo repite). **Nunca bloquea la carga.** Antes solo avisaba fuera
  de la tolerancia, y sin el número.
- **El importador no cambia de propietario ni de inquilino.** Si el archivo trae otro, la
  fila se carga sin ese cambio (si se actualiza, solo con lo demás) y la previa dice
  «cámbielo desde la ficha», que pide confirmación y le quita el acceso al anterior (casos
  38 y 44). Tampoco da ni quita accesos a la app.
- **Saldo inicial:** con meses cerrados no se aplica (después del primer cierre no se usa)
  y se avisa arriba, igual que en «Cargar saldos».
- **Decisión provisional, para confirmar con Gustavo:** una fila **sin alícuota** (el
  Estacionamiento del piloto) se muestra marcada y por omisión **no** se carga, siempre con
  aviso; se puede elegir «Cargarla como estacionamiento con alícuota 0».
- «Cargar saldos» queda como estaba.
- **Cómo se revierte:** `components/admin/CargarDatos.tsx`, `lib/admin/cargar-datos/` y
  `supabase/rollbacks/20261018140000_importar_unidades_rollback.sql`.

### 57. Tipo de unidad y correo de respaldo

- **Tipo de unidad** (pedido de Gustavo del 04-oct): apartamento, casa, local, oficina,
  estacionamiento, depósito u otro. Se elige en «Nueva unidad» y en la ficha, y «Cargar
  datos» lo deduce del código («PB. L-B» y «Mz. L-B» son locales; «Estacionamiento») o lo
  toma de una columna «Tipo». Es solo informativo: el reparto sigue siendo por alícuota.
  Las unidades que ya existían quedaron como apartamento.
- **Correo de respaldo** (el «Correo 2» de las planillas): se ve y se edita en la ficha, y
  sirve para reconocer a la persona al importar. **No se usa para mandar nada:** los
  recibos y avisos siguen yendo solo al correo principal.
- **Cómo se revierte:**
  `supabase/rollbacks/20261018130000_unidades_tipo_correo_respaldo_rollback.sql` (borra los
  tipos y correos de respaldo cargados; el archivo dice cómo exportarlos antes).

### 58. La ficha ya no le pone «Sr.» a quien no tiene tratamiento

**Caso de uso:** la administradora abre la ficha de una unidad cuyo propietario es una
empresa o una junta registrada sin tratamiento, y le corrige el teléfono.

- **`main` (`admin.html:2338`, y la app hasta el 24-oct en `DatosUnidad.tsx`):** el
  formulario llenaba el tratamiento con `prefijo || "Sr."`. A una persona sin tratamiento
  le mostraba «Sr.» en el selector, y al guardar cualquier cambio de la ficha se lo
  **volvía a guardar**: «Sr. Inversiones Uno, C.A.» de nuevo, sin que nadie lo eligiera.
- **Ahora:** la ficha muestra el tratamiento que la persona tiene, y «sin tratamiento» si
  no tiene ninguno; al guardar queda así. «Sr.» es solo el valor inicial al registrar a
  una persona que todavía no existe (como en «Nueva unidad»).
- **Por qué ahora:** hacía falta para que valga la regla de empresas y juntas del
  importador (caso 56). Sin esto, la primera vez que se guardaba la ficha se perdía.
- **Cómo se revierte:** `components/admin/DatosUnidad.tsx`, función `aForm`.

## Ronda 5 — ajustes después de la ronda 4 (25-oct)

> Pedidos de Gustavo al cerrar la ronda 4 (0 fallas graves). **Estado: construidos, sin
> validar en el navegador.** Sin migraciones: todo es de pantalla.

### 59. Los montos se ven «1.234,56» al salir del campo

**Caso de uso:** la administradora escribe un saldo inicial en «Nueva unidad» como
«1234.56» o «1234,56».

- **`main` (y la app hasta hoy):** el campo quedaba como se escribió. Solo los campos que
  se vuelven a cargar desde la base después de guardar (la ficha, las partidas) se veían
  con el formato de Venezuela, y solo después de recargar.
- **Ahora:** al salir del campo, el monto se reescribe «1.234,56». El número no cambia
  (solo cómo se ve), y lo que no se entiende («12,3,4», «abc») queda tal cual para que el
  formulario lo marque al guardar, como siempre.
- **Dónde:** «Nueva unidad» y la ficha (saldos iniciales); Cierre del mes (presupuesto,
  tasa, gasto nuevo y los montos de cada gasto); Cobros (monto del cobro nuevo y de cada
  fila, el porcentaje sin decimales); Ajustes (montos de las partidas fijas); Pagos (monto,
  exoneración, tasa que falta); «Reportar un pago» del residente; y en Operador, el precio,
  el monto del servicio y la tasa manual. No se tocan alícuotas, mora ni tolerancias: no
  son montos.
- **Cómo se revierte:** `montoAlSalir` en `lib/formato.ts` y los `onBlur` que la llaman.

### 60. «Reportar un pago» avisa cuando el mes no tiene que pagarse

**Caso de uso:** un residente con saldo a favor entra a «Reportar un pago».

- **`main`:** el formulario no decía nada; el residente podía reportar un pago que no
  debía.
- **Ahora:** arriba del formulario, en el color de «a favor»: «Este mes no tiene que
  pagar: tiene $ 35,12 a favor». **Solo avisa; no bloquea** (puede querer adelantar).
- **La condición es la misma del recibo:** se lee el último recibo cerrado (el mismo de
  «Mi recibo») y se usa `favorQueQueda()`, la cuenta con la que el recibo dice «Este mes
  no tiene que pagar» (caso 51). El monto es el que dice el recibo como «Saldo a favor».
- **Cómo se revierte:** `app/(residente)/mi/[unidadId]/reportar/page.tsx` y el aviso al
  principio de `FormularioReportarPago.tsx`.

### 61. Imprimir en el teléfono: «Volver» e «Imprimir» a tamaño de dedo

**Caso de uso:** con la app instalada en el teléfono, el residente abre su recibo para
imprimir (o la administradora, un listado).

- **Ronda 4 (caso 53):** la barra con «← Volver» e «Imprimir o guardar PDF» ya existía,
  pero la página no decía su ancho (faltaba `<meta name="viewport">`), así que el teléfono
  la dibujaba a ancho de computadora y la achicaba entera: los botones quedaban diminutos.
- **Ahora:** la página va al ancho del teléfono y los botones tienen 44 px de alto como
  mínimo (el tamaño recomendado para el dedo) y letra de 15 px; si no entran en una línea,
  bajan a una segunda. **La hoja** sigue a ancho carta y es la única que se achica para
  entrar, sin desplazamiento horizontal. En el papel no cambia nada.
- **De paso:** la letra de los botones no se aplicaba (una regla de CSS mal escrita desde
  la ronda 4); ahora sí.
- **Cómo se revierte:** `paraPantalla()` en `lib/recibo-papel.ts`.

### 62. La fecha del pago se elige con calendario

**Caso de uso:** la administradora registra un pago, o el residente lo reporta.

- **`main`:** las dos usaban el campo de fecha del navegador. En computadora, el calendario
  solo se abría desde un iconito; un clic en el texto editaba día, mes y año a mano. En el
  tema oscuro, el iconito no se veía (negro sobre fondo oscuro). En Admin se podía elegir
  una fecha futura.
- **Ahora:** tocar o hacer clic en cualquier parte del campo abre el calendario del
  navegador. El calendario y su iconito siguen al tema (claro u oscuro). **No hay fechas
  futuras** en ninguno de los dos: el calendario no las ofrece, y si se escribe una a
  mano, el formulario no la deja guardar (Admin: «La fecha del pago no puede ser futura.»;
  el residente ya tenía esa regla).
- **Cómo se revierte:** `components/ui/InputFecha.tsx`, su uso en `Pagos.tsx` y
  `FormularioReportarPago.tsx`, y `color-scheme` en `app/globals.css`.

### 63. «Cómo se reparte»: el encabezado queda fijo al bajar

**Caso de uso:** en Cierre del mes, la administradora baja por las 54 unidades de la
previa y quiere saber qué columna es cuál.

- **`main` (y la app hasta hoy):** el encabezado se iba con las filas. Gustavo lo pidió en
  la ronda anterior y no se había hecho: la tabla está dentro de una caja con alto máximo
  que se desplaza sola, y el encabezado no tenía `position: sticky`.
- **Ahora:** el encabezado queda arriba de la caja mientras las filas pasan por debajo.
  Comprobado en Chrome con las 54 unidades de la planilla del piloto: con la caja bajada
  900 px, el encabezado sigue en su lugar (sin el cambio, quedaba 900 px más arriba, fuera
  de la vista).
- **Lo mismo en** las otras tablas con caja propia: la previa de «Cargar datos», la de
  «Cargar saldos» y las dos de Pagos (conciliación).
- **Cómo se revierte:** la clase `.tabla-fija` en `components/ui/ui.css` y en esas tablas.

### 64. «A favor» con su propio color

**Caso de uso:** la administradora y el residente distinguen de un vistazo una unidad al
día de una con saldo a favor.

- **`main`:** el saldo a favor iba en marino (el color del texto). Desde la ronda 2 iba en
  `--a-favor`, que en el tema claro era el mismo verde de «al día»; y en algunos lugares
  seguía en verde o en azul (la columna «A favor» de «Cómo se reparte», el recibo del
  residente, el mapa del edificio).
- **Ahora:** `--a-favor` es un verde oliva propio: **#4D7C0F** en el claro y **#84CC16**
  en el oscuro. Contraste (WCAG, mínimo 4,5:1 para texto): claro 4,99:1 sobre blanco,
  4,77:1 sobre el fondo de la página, 4,57:1 sobre su fondo de etiqueta; oscuro 8,98:1
  sobre las tarjetas, 9,86:1 sobre el fondo, 7,01:1 sobre su fondo de etiqueta. Única
  salvedad: en el claro, sobre una fila con el mouse encima, baja a 4,28:1.
- **Dónde:** Propietarios, la ficha, Inicio («Saldos a favor»), el mapa del edificio,
  Cierre del mes («A favor» y «no paga este mes»), el portal del residente (tarjeta,
  resumen, recibo, el aviso del caso 60) y el recibo impreso («Este mes no tiene que
  pagar»).
- **Cómo se revierte:** `--a-favor` y `--a-favor-bg` en `app/globals.css`.

### 65. Cobros: «Monto $» o «Porcentaje %» según cómo se calcula

**Caso de uso:** la administradora agrega un cobro y no sabe si el número es en dólares o
un porcentaje.

- **`main`:** el título decía «Monto o %» siempre.
- **Ahora:** al agregar, el título sigue a «Cómo se calcula»: «Porcentaje %» para «% de lo
  que paga de condominio», «Monto $» para los demás. En los modos que no usan el número
  (presupuesto o gasto del mes) lo dice: «No se usa: sale del mes». En la tabla, el título
  es «Monto $» o «Porcentaje %» si todos los cobros son del mismo tipo; si se mezclan,
  dice «Monto $ o porcentaje %» y cada celda lleva su unidad debajo.
- **Cómo se revierte:** `components/admin/Cobros.tsx`.

## Ronda 5 — plantilla oficial de carga y respuestas de Gustavo (25-oct)

> Gustavo respondió las preguntas de la ronda 5 y mandó la plantilla oficial
> (`Vecitap-plantilla-carga.xlsx`). Decisiones de Nicolás del 25-oct. **Estado:
> construidos y probados con los archivos y contra la base de pruebas (M4); sin validar en
> el navegador.** Migración M4: `20261025120000_importar_unidades_plantilla.sql`, aplicada
> en pruebas. Lo marcado **«para aprobar»** no lo pidió nadie: lo decidí al construir y lo
> revisa Nicolás.

### 66. «Cargar datos» reconoce la plantilla oficial

**Caso de uso:** la administradora descarga la plantilla, llena la hoja «Unidades» y la
sube sin tocar nada.

- **`main`:** no había plantilla. El importador leía la primera hoja del Excel y
  reconocía siete columnas.
- **Ahora:**
  - **Botón «Descargar plantilla»** en «Cargar datos»: entrega el archivo de Gustavo tal
    cual (`public/Vecitap-plantilla-carga.xlsx`; solo trae datos de ejemplo, revisado: sin
    datos personales en las propiedades del archivo).
  - **Qué hoja se lee:** la que se llama «Unidades». Si está vacía, no se carga nada y se
    avisa. Si el archivo no la tiene, la primera hoja con encabezados reconocibles (o, si
    ninguna los tiene, la primera con datos, como antes). «Ejemplo» no se carga nunca.
    **Para aprobar:** «Léame primero» tampoco se toma como datos.
  - **Las 21 columnas** se reconocen por el encabezado. Antes, «PROPIETARIO TRATAMIENTO»
    se tomaba como el nombre del propietario y «PROPIETARIO NOMBRE» como el inquilino.
  - **NOTA** *(cambió el 26-oct: ahora se guarda, ver caso 74)*: «No usar esta columna», con la razón «Vecitap no guarda notas de la unidad»
    (no hay campo). Su texto se muestra en la fila de la previa, como información.
  - **Lo que la plantilla pide** (código, alícuota, saldo de condominio, nombre y correo
    del propietario): si falta en una fila, aviso en ámbar; solo bloquea lo que ya
    bloqueaba (sin código o sin alícuota). **Para aprobar:** si el archivo no trae una de
    esas columnas, un aviso arriba («Faltan columnas que la plantilla pide»); y el aviso de
    saldo vacío sale solo en unidades nuevas (en una que ya existe, vacío es «no cambiar»).
- **Cómo se revierte:** `elegirHoja()` y la detección en
  `lib/admin/cargar-datos/columnas.ts`, `leerHojas()` en `lib/admin/archivos-tabla.ts`, y
  el botón en `components/admin/CargarDatos.tsx`.

### 67. Personas: un dato en común con otro nombre espera respuesta

**Caso de uso:** dos filas (o una fila y una ficha que ya existe) comparten correo,
teléfono o cédula, pero tienen otro nombre. Un «Sí» equivocado manda los recibos y avisos
de esa unidad al correo de la otra persona.

- **Antes (ronda 5):** «¿Es la misma persona?» con «Sí» por omisión, salvo cuando
  coincidía solo el teléfono con otro correo. Contra una ficha existente, se usaba la
  ficha sin preguntar.
- **Ahora (confirmado por Gustavo):**
  - mismo nombre y un dato en común: se juntan solas, como antes;
  - un dato en común y **otro nombre**: la pregunta sale **sin respuesta por omisión** y
    la carga espera (si esa fila se carga). Entre filas del archivo y contra fichas;
  - solo el mismo nombre, sin datos en común: por omisión, distintas, como antes.
- **La cédula es un dato más** (agregado nuestro; decisión para Gustavo). Se compara sin
  guiones, puntos ni espacios y sin importar mayúsculas: «V-11.111.111» = «v11111111». Se
  guarda como viene.
- **Para aprobar:**
  - **Mismo nombre con otra cédula** cuenta como otra persona (padre e hijo que se llaman
    igual y comparten el correo de la casa): también pregunta sin respuesta por omisión.
  - **Contra la administradora**, si alguna ficha **con el mismo nombre** comparte el
    dato, se usa esa sin preguntar, y las fichas de otro nombre que también lo comparten
    se nombran como información («también comparte datos con…: es otra persona, esa ficha
    no se usa»). Sin esto, en la administradora de Gustavo (cargada con el importador
    viejo, una ficha por unidad) casi cada fila preguntaba: 26 preguntas sin respuesta en
    vez de 10. La pregunta sale cuando **ninguna** ficha que comparte el dato tiene el
    mismo nombre.
  - **Arreglo de paso:** cada fila se comparaba solo con la **primera** fila que tenía ese
    dato. 12D (mismo nombre y correo que 12C) se comparaba con 10A, de otro nombre, y
    quedaba separada de 12C. Con el «Sí» por omisión no se notaba. Ahora se compara con
    todas.
  - Las preguntas nombran a cada persona una vez, con todos sus datos y filas: «el mismo
    correo y teléfono que «X» (filas 12, 13: 03A, 03B)».
- **Cómo se revierte:** la sección «Personas» de `lib/admin/cargar-datos/analisis.ts`.

### 68. Tratamiento: el del archivo manda; «Sres.», «Ing.», «Lic.» y «Sin tratamiento»

**Caso de uso:** la plantilla trae el tratamiento en su columna, de una lista.

- **`main` y M3:** la lista era Sr., Sra., Sres., Dr., Dra. y «sin tratamiento». La regla
  de empresas de M3 (C.A., S.A., S.R.L., «Junta» → sin tratamiento) pisaba el
  tratamiento que mandaba la pantalla: «Sres.» de «Comercial XYZ, C.A.» (hoja «Ejemplo»)
  se perdía.
- **Ahora:**
  - la lista es la de la plantilla, igual en la ficha, en Nueva unidad y en el importador:
    Sr., Sra., Sres., Dr., Dra., **Ing.**, **Lic.** y **Sin tratamiento** (se guarda null).
    «Sres.» y «Sin tratamiento» ya estaban; faltaban Ing. y Lic.;
  - el tratamiento del archivo **manda**, incluido «Sin tratamiento». La regla de
    empresas aplica solo si el archivo no trae tratamiento (M4);
  - **para aprobar** *(cambió el 26-oct: ahora se carga sin tratamiento, ver caso 72)*: un tratamiento que no es de la lista («Srta.») sale en ámbar y no se
    usa (queda «Sr.», o sin tratamiento si es una empresa). La ficha muestra tal cual un
    tratamiento que ya tiene y no está en la lista, para no cambiarlo sin querer al
    guardar.
- **Cómo se revierte:** `TRATAMIENTOS` en `lib/admin/personas.ts` y el rollback de M4.

### 69. Saldo de administración, cédula y «recibe corte» desde el archivo

**Caso de uso:** la plantilla trae datos que tienen su campo en la base y que el
importador no recibía.

- **Antes:** se cargaban a mano, ficha por ficha.
- **Ahora (M4):**
  - **SALDO ADMINISTRACION $** → `unidades.saldo_inicial_hon`, con la regla del saldo de
    condominio: solo antes del primer cierre;
  - **CEDULA O RIF** → `personas.documento`. Ficha existente: solo se completa si está
    vacía, como el resto;
  - **RECIBE CORTE** → `vinculos.enviar_corte`. Vínculo nuevo: lo que diga el archivo, o
    «sí» si está vacío. Uno que ya existe no se toca salvo con «Actualizar», y el cambio
    se muestra («propietario recibe el corte: No → Sí»);
  - **correo de respaldo del inquilino**, también en la pantalla;
  - avisos en ámbar, sin bloquear: unidad donde **nadie recibe el corte**; unidad que
    **paga el inquilino** y no tiene su correo (sin nombre del inquilino ya no se cargaba).
  - **Para aprobar:** «recibe corte» que no dice Sí o No sale en ámbar y no se usa.
- **Cómo se revierte:** el rollback de M4
  (`supabase/rollbacks/20261025120000_importar_unidades_plantilla_rollback.sql`) y la
  pantalla.

## Ronda 5 — pedidos de Gustavo al cerrar la ronda 5 (26-oct)

> Gustavo terminó la ronda 5 con 0 fallas graves. Decisiones de Nicolás del 26-oct.
> Nicolás aprobó lo marcado «para aprobar» en los casos 66–69, con un cambio (caso 72).
> **Estado: construidos; la base, probada en vecitap-pruebas (M4 reaplicada); sin validar
> en el navegador.** El menta (caso 71) quedó resuelto en el caso 77. M4 revisada y
> aprobada por Nicolás el 26-oct.

### 70. Menú con los nombres de Gustavo; «Pagos recibidos» con lo registrado arriba

**Caso de uso:** la administradora encuentra cada cosa con el nombre que usa en su día.

- **`main`:** Inicio · Propietarios · Cobros · Cierre del mes · Pagos · Cortes de cuenta ·
  Estadísticas · Accesos.
- **Ahora:** Inicio · Propietarios · **Pagos recibidos** · **Gastos del mes** · Cortes de
  cuenta · Estadísticas · Accesos · Cobros. «Gastos del mes» es el nuevo nombre de «Cierre
  del mes» y «Pagos recibidos» el de «Pagos». Cobros queda al final hasta que sus reglas
  pasen a Ajustes (después del piloto). Las direcciones no cambian (`/mes`, `/pagos`).
  - Los textos que nombraban las secciones también: el aviso «Falta el presupuesto del mes»
    de Inicio («…en «Gastos del mes» antes de cerrar») y el de Cortes («Desde «Gastos del
    mes», reabrirlo…»).
  - **«Pagos recibidos»:** «Movimientos registrados» va arriba, destacado (título más
    grande y una franja naranja arriba); debajo, las pestañas Registrar · Conciliar con el
    banco · Exoneraciones, con «Registrar un pago» abierto y visible.
- **Cómo se revierte:** `SECCIONES` en `components/admin/MarcoAdmin.tsx` y el orden de las
  tarjetas en `components/admin/Pagos.tsx`.

### 71. «A favor» en verde #15803D; el menta, por decidir

**Caso de uso:** el único verde de la app dice «a favor».

- **Antes (caso 64):** `--a-favor` #4D7C0F en el claro.
- **Ahora:** **#15803D** en el claro (#84CC16 en el oscuro, sin cambio), también en el
  recibo impreso. Contraste (AA ≥ 4,5:1): 5,02:1 sobre las tarjetas, 4,79:1 sobre el fondo
  de la página, 4,59:1 sobre su fondo de etiqueta; 4,30:1 sobre una fila con el mouse
  encima (la misma salvedad que antes). En el oscuro: 8,98:1, 9,86:1 y 7,01:1.
- **Resuelto en el caso 77** (decisión de Nicolás del 26-oct). Hasta entonces: quitar el menta (`--verde`) de toda la app y
  dejar «al día» en un color neutro. Dónde se usa hoy está en `docs/estado-migracion.md`
  («Cierre de la ronda 5»), con la propuesta para los mensajes de éxito.
- **Cómo se revierte:** `--a-favor` en `app/globals.css` y `nota-fav` en
  `lib/recibo-papel.ts`.

### 72. Tratamiento: fuera de la lista, sin tratamiento; «s.n.» y «&» también sin tratamiento

**Caso de uso:** el archivo trae un tratamiento raro, o el nombre es de una firma.

- **Antes (caso 68):** un tratamiento que no estaba en la lista («Srta.») no se usaba y
  quedaba «Sr.». Solo C.A., S.A., S.R.L. y «Junta» quedaban sin tratamiento.
- **Ahora (Nicolás, 26-oct):**
  - fuera de la lista: **se carga sin tratamiento** (null), con el aviso en ámbar «no está
    en la lista: se carga sin tratamiento». Nunca «Sr.» por omisión en ese caso;
  - cuando el archivo **no** trae tratamiento, quedan también sin tratamiento los nombres
    con **«s.n.»** (como palabra suelta, con o sin puntos) o con **«&»** («Rerozo, Ropopar &
    Vumulinog»). Si el archivo trae tratamiento, manda el del archivo. En M4.
  - Lo mismo que con «Sa» y «Ca» sueltos: un nombre con «Sn» como palabra suelta queda sin
    tratamiento. No hay ninguno en la planilla del piloto.
- **Cómo se revierte:** `leerTratamiento` en `lib/admin/cargar-datos/analisis.ts` y la
  regla en M4.

### 73. «Reabrir» un mes dice cuántos recibos emitió

**Caso de uso:** la administradora va a reabrir un mes y tiene que saber qué borra.

- **`main`:** «Reabrir» pedía confirmación con un texto general.
- **Ahora:** antes de preguntar se cuentan los recibos de ese mes, y la confirmación
  empieza con «Este mes ya emitió 53 recibos. ¿Seguro?». Si el conteo falla, la
  confirmación sale igual, sin el número. La confirmación aparte para un mes ya enviado no
  cambió.
- **Cómo se revierte:** `pedirReabrir` en `components/admin/CierreMes.tsx`.

### 74. La nota de la unidad se guarda (solo la ve la administración)

**Caso de uso:** la administradora anota algo de la unidad («llave en conserjería») y lo
trae en la planilla.

- **Antes (caso 66):** la columna NOTA no se guardaba; se mostraba en la previa.
- **Ahora (decisión de Gustavo):**
  - tabla nueva **`notas_unidad`**, aparte de `unidades`, porque un residente puede leer la
    fila de su unidad (y la junta y el contador, las de su edificio u organización). RLS:
    solo `puede_operar` (propietario de la cuenta y administrador) la ve y la escribe;
    `authenticated` solo con select/insert/update/delete (sin TRUNCATE); `anon`, nada. En
    M4;
  - en la ficha, «Nota (solo la ve la administración)», editable, hasta 1.000 caracteres;
    vacía, se borra;
  - en «Cargar datos», NOTA se reconoce por el encabezado y se carga: unidad nueva, se
    guarda; una que ya existe, «nota: se completa con «…»» si no tenía, o «nota «A» →
    «B»» si tenía otra, y solo se aplica con «Actualizar». Más larga que el límite: se
    recortan los primeros 1.000, con aviso en ámbar.
  - **Verificado en la base** con la cuenta `+propietario` (residente de 02A), con una nota
    en 02A: no la ve (0 filas), no puede escribirla (RLS), no puede vaciar la tabla, su
    fila de `unidades` no la trae, y `mis_unidades()` y `saldos_actuales` tampoco.
    Ninguna pantalla del residente ni el recibo leen `notas_unidad`.
- **Cómo se revierte:** el rollback de M4 (borra la tabla y las notas) y la pantalla.

### 75. La previa: preguntas en una línea, «Lo que dice su archivo» y «Se queda»

**Caso de uso:** la administradora revisa la carga rápido.

- **Antes:** cada pregunta era un párrafo con una lista desplegable; la tabla se titulaba
  «La previa, fila por fila»; lo que no se cambiaba decía «no se cambia» sin decir qué
  quedaba.
- **Ahora:**
  - cada pregunta en una línea: «¿Es la misma persona? Archivo: «X» (03D) · Archivo: «Y»
    (03A, 03B) [Sí] [No]», o «· Ficha: …» contra una ficha que ya existe. Con varias
    fichas posibles, una línea por ficha con [Sí] y un «No, ninguna: es otra persona» al
    final; las fichas iguales (mismo nombre, correo y cédula, del importador viejo) en
    una sola línea. Si con «Sí» los recibos cambian de correo, lo dice debajo, en chico;
  - la tabla se titula **«Lo que dice su archivo»**;
  - donde algo no se cambia, la fila dice lo que queda: «Se queda: Sr. Mefaz…» (otro
    propietario), «Se queda: 0414-…» (un dato de la ficha distinto del archivo), «Se queda:
    paga el propietario».
  - La prueba 18 de Gustavo (77X contra la ficha de Sr. Boso) ahora pregunta sin nada
    marcado: «¿Es la misma persona? Archivo: «Otro Nombre Prueba» (77X) · Ficha: Sr.
    Boso… [Sí] [No]».
- **Cómo se revierte:** `PreguntaPersona` y `NotaCelda` en
  `components/admin/CargarDatos.tsx`, y `lineas`/`queda` en `analisis.ts`.

### 76. El mensaje para el vigilante nombra el botón que existe

**Caso de uso:** la administradora le copia al vigilante el mensaje de la invitación.

- **Antes:** decía «Toque "Es mi primera vez"», el botón de `garita.html` en `main`. En la
  app, la garita usa la pantalla de Entrar de todos, donde el enlace dice «No tengo cuenta
  todavía». Encontrado al escribir los pasos de G6; no pedido, **aprobado por Nicolás el 26-oct**.
- **Ahora:** «Toque "No tengo cuenta todavía", cree su clave con el correo…».
- **Cómo se revierte:** el texto de «Copiar el mensaje completo» en
  `components/admin/Accesos.tsx`.

### 77. Sin menta: «al día» en neutro, éxito en «ok», la garita en #15803D

**Caso de uso:** el único verde de la app es «a favor» (decisión de Nicolás del 26-oct,
sobre la propuesta del caso 71).

- **Antes:** el menta (`--verde`, #0E7C6B / #00D1B2) marcaba «al día», los mensajes de
  éxito y los estados «bien».
- **Ahora:**
  - **«Al día» y los estados** (Confirmado, Activa, enviados, aceptada, habilitado, el
    total en cero, «Por cobrar» en 0, los abonos del historial, «Se carga»): en neutro,
    con la etiqueta gris (`neutro`) o el color del texto. En el mapa del edificio, las
    unidades al día van con borde gris y su punto en la leyenda, gris.
  - **Mensajes de éxito:** tono nuevo **«ok»**: marino (`--tinta`) sobre gris claro
    (`--lienzo-alt`), con un ✓ adelante. «Guardado ✓» en `--tinta-2`. El aviso de Entrar
    («revise su correo») también.
  - **Estadísticas:** cobrado ≥ 80 % y la variación a la baja, en neutro; lo malo sigue en
    ámbar y rojo.
  - **Operador:** módulo habilitado, cobro pagado, servicio activo y los puntos de estado,
    en neutro.
  - **El «Puede pasar» de la garita:** #15803D en los dos temas (antes #0E7C6B en el
    claro y #0E9C86 en el oscuro). Con la letra blanca: **5,02:1**. **De paso:** el del
    oscuro, #0E9C86, daba 3,43:1, debajo del mínimo de 4,5:1. **Decisión para Gustavo**:
    si prefiere uno más oscuro, #166534 da 7,13:1.
  - Los tokens `--verde` y `--verde-bg` y la etiqueta `badge-verde` ya no existen: si
    alguien los vuelve a usar, `tsc` lo marca (el tono «verde» salió de `Aviso` y `Badge`).
  - **Fuera de este cambio:** `public/inicio.html`, la página de venta, con su propia
    paleta.
- **Cómo se revierte:** los tokens en `app/globals.css`, el tono en
  `components/ui/Aviso.tsx` y `Badge.tsx`, y los reemplazos en cada pantalla.

### 78. «Descartar» recuerda que el mes había emitido recibos

**Caso de uso:** la administradora reabrió un mes y ahora lo va a descartar.

- **Antes:** «Descartar» decía lo mismo para un mes nuevo que para uno que se había
  cerrado, emitido recibos y reabierto.
- **Ahora:** al tocar «Descartar este mes», la pantalla busca en `auditoria` si ese mes
  pasó de cerrado a abierto. Si pasó, el recuadro dice primero, en rojo: «Este mes ya se
  había cerrado y emitió recibos: se reabrió el 26 de octubre de 2026 y esos recibos se
  borraron. Si alguien llegó a verlos, va a dejar de encontrarlos.» La base no guarda
  cuántos recibos eran (los borra al reabrir), así que no dice el número. Sin migración:
  `auditoria` ya registra cada cambio de `periodos`, y la administradora la puede leer.
  Verificado en pruebas, en una transacción deshecha: la administradora ve la reapertura;
  el residente, no.
- **Cómo se revierte:** `pedirDescartar` en `components/admin/CierreMes.tsx`.

---

## Ronda 7 del tramo 2 — lo que necesita el piloto de GRUPO ING3 (26-oct)

> Pedido de Nicolás del 26-oct, en nueve bloques. Todo en `dev`, sin commit. Las
> migraciones están aplicadas en vecitap-pruebas y **no** en producción. Lista de
> migraciones y pruebas: `docs/estado-migracion.md`, «Ronda 7 del tramo 2».

### 79. «Cargar datos»: avisos en una línea, agrupados, y corregir en la previa

**Caso de uso:** la administradora sube su planilla y aparecen avisos. Hoy tiene que
corregir el Excel y volver a subirlo.

- **Antes:** cada aviso iba escrito debajo de su celda, en la tabla de la previa. Para
  corregir un correo había que volver al Excel, corregir y subirlo de nuevo. Las filas
  que no se cargaban iban en una lista aparte.
- **Ahora:**
  - **Arriba, una línea:** «41 filas bien · 12 con avisos · 1 con errores» (con avisos en
    ámbar, con errores en rojo). Se cuenta por fila: una fila con dos avisos es una.
  - **«Avisos»:** una línea por tipo de aviso, con cuántas filas lo tienen («10 filas
    que esperan una respuesta en «Personas para revisar»», «2 filas con un teléfono que no
    parece de Venezuela»). Primero lo rojo (no se carga) y después lo más repetido.
    «ver más» muestra las filas: número de fila, unidad y el aviso completo.
  - **Corregir ahí mismo:** si el aviso es de un campo que el archivo trae (correo,
    teléfono, cédula, nombre, alícuota, saldo, quién paga, «recibe corte»…), la fila trae
    el campo con lo que dice el archivo y un botón «Corregir». Al tocarlo, la previa
    entera se vuelve a revisar **con la misma función que lee el archivo**
    (`analizar()`): no hay reglas aparte para lo corregido. Si se corrigió un correo, un
    teléfono o una cédula, la pregunta «¿es la misma persona?» se vuelve a hacer sola
    (verificado con la planilla anonimizada: al darle a 03D otro teléfono y otros
    correos, su pregunta desaparece y quedan 9 de 10). La línea de arriba y los avisos se
    actualizan. Las filas que no se cargan por un campo (alícuota que no se entiende,
    saldo, quién paga) también se corrigen así.
  - Lo corregido es lo que va a `importar_unidades()`. **Nada se guarda antes de
    confirmar la carga**, y «Descartar» o subir otro archivo borra las correcciones. En
    la tabla de abajo, la celda corregida dice «corregido en la previa».
  - Si el campo no está en el archivo (por ejemplo, no hay columna de correo), el aviso
    lo dice y no ofrece corregir: la columna se elige arriba.
  - Una fila que espera «¿es la misma persona?» ofrece corregir sus datos de contacto
    (teléfono, correos y cédula del propietario y del inquilino que la fila trae): es lo que
    decide si se juntan.
  - La fila sin alícuota sigue pudiéndose cargar como estacionamiento con alícuota 0,
    ahora desde su aviso.
  - **En el teléfono:** los avisos son una columna, sin tabla; el campo y el botón bajan
    de línea si no caben.
- **Arreglado en la validación en el navegador (26-oct, noche):** después de «Descartar»,
  volver a elegir el mismo archivo no hacía nada (el campo conservaba la selección y el
  navegador no avisa de un cambio con el mismo archivo); ahora el campo se vacía después de
  leer cada archivo. Y los avisos «el archivo dice X, no se cambia» de una ficha que ya
  existe se agrupan como «con un dato distinto al de la ficha que ya existe (no se
  cambia)», sin el dato de la primera fila en el título.
- **Cómo se revierte:** `components/admin/CargarDatos.tsx` (estado `ediciones`,
  `GrupoAvisos`, `CorregirCelda`), `lib/admin/cargar-datos/avisos.ts` y los campos
  `grupo`/`campo`/`motivoCampo` de `lib/admin/cargar-datos/analisis.ts`. Sin migración.

### 80. Datos para pagar, por edificio: en el portal, en el recibo impreso y en el correo

**Caso de uso:** el propietario abre su recibo y no sabe a qué cuenta transferir. Hoy se
lo pregunta a la administradora por WhatsApp.

- **Antes:** no había dónde cargar las cuentas del edificio. El correo del recibo daba el
  total en $ y los Bs «a la tasa de hoy», calculados en realidad con la tasa del recibo.
- **Ahora:**
  - **Ajustes → «Datos para pagar»** (por edificio): una tarjeta por cuenta con «Para
    pagar» (condominio u honorarios de administración), tipo (transferencia, pago móvil
    u otro), banco (de la lista de bancos, u «Otro…»), titular, RIF o cédula, cuenta o
    teléfono y una nota. Se agregan, se cambian y se quitan. Solo la propietaria de la
    cuenta y la administradora (`puede_operar`).
  - **Portal (/mi):** debajo del saldo, «Datos para pagar», con un botón «Copiar» al
    lado de la cuenta y del RIF. Con dos cuentas, dice cuánto va a cada una. No le sale
    al propietario cuya unidad paga el inquilino (él no paga).
  - **«Reportar un pago»:** si el edificio tiene cuenta de honorarios, pregunta «¿A qué
    cuenta pagó?» y el pago se abona a esa parte del saldo (`pagos.destino`), con la
    deuda de esa cuenta en «Pagar deuda total». Sin cuenta de honorarios, no pregunta
    nada y todo sigue yendo a condominio, como antes.
  - **Recibo impreso** (Admin y portal): el bloque «Datos para pagar» debajo del
    resumen, con el monto de cada cuenta en $ y en Bs. No sale si el recibo dice «Este
    mes no tiene que pagar».
  - **Correo del recibo:** el total en USD; debajo, **el monto en Bs calculado con la
    tasa del día en que se encola**, tomada de `tasas_bcv` con su fecha, y la frase
    «Calculado a la tasa oficial BCV del dólar del 23/10/2026. Si paga en bolívares, use
    la tasa BCV del día en que pague.»; los datos para pagar; sin desglose y sin PDF. Se
    quitó «El monto en bolívares es referencial» del pie (lo dice la frase nueva).
  - **A qué cuenta va cada parte (decisión por defecto):** el honorario y el honorario
    anterior, a la cuenta de honorarios; todo lo demás, servicio incluido, a la de
    condominio. Si el edificio no tiene cuenta de honorarios, todo a la de condominio.
  - **El residente no lee la tabla:** ve los datos de su edificio con `datos_pago_de()`,
    acotada a sus unidades. Verificado en pruebas: el residente lee 0 filas de la tabla y
    2 por la función; no puede insertar; la administradora lee e inserta; un edificio de
    otra organización se rechaza.
- **Decidido por mi cuenta:** los Bs del correo se redondean hacia arriba al céntimo, como
  en «Reportar un pago» (así el pago nunca queda corto). Con cuenta de honorarios y un
  recibo sin honorarios, el correo muestra la cuenta de honorarios con «$ 0,00».
- **Arreglado en la validación en el navegador:** dos cuentas agregadas seguidas quedaban
  con el mismo orden; ahora el orden sale de la base.
- **Cómo se revierte:** `supabase/rollbacks/20261026120000_datos_pago_rollback.sql`
  (borra la tabla: se pierden las cuentas cargadas) y, en la app, `DatosPago.tsx`,
  `DatosParaPagar.tsx`, `lib/datos-pago.ts` y los usos en el papel, Cortes, el portal y
  el formulario.

### 81. El correo del recibo trae el código de invitación a quien todavía no tiene acceso

**Caso de uso:** el primer mes del piloto, casi nadie tiene usuario. La administradora
tendría que mandar un código por WhatsApp a cada propietario desde Accesos.

- **Antes:** el correo del recibo decía «si es la primera vez que entra, use este mismo
  correo para crear su clave», pero sin código no se puede agregar la unidad.
- **Ahora:**
  - Si quien recibe el recibo **no tiene acceso a esa unidad** (no hay una membresía
    activa de residente en esa unidad con una cuenta de ese correo), el correo trae
    «Todavía no tiene usuario en la app», el código y el enlace «Crear mi usuario» (el
    mismo de Accesos: `/entrar` con el código ya puesto).
  - **Reutiliza** la invitación pendiente y vigente de ese correo y esa unidad. Solo crea
    una nueva si no hay, con `crear_invitacion()` (aparece en Accesos como cualquier
    otra). Verificado en pruebas: al encolar dos veces el mismo mes, la segunda vez no
    se crea ninguna.
  - **No se crea una por mes:** la invitación del recibo vence a los 45 días, y cada vez
    que vuelve a salir en un recibo se extiende 45 días desde ese día.
  - **Cuando ya tiene acceso, deja de traer el código** (verificado: la propietaria de
    prueba, que tiene cuenta, recibe el correo sin código).
  - Quien tiene dos unidades recibe un código por unidad (cada código agrega una).
  - Si la invitación no se puede crear (la organización está atrasada con Vecitap, por
    ejemplo), ese correo sale igual, sin código: el recibo nunca se frena por esto.
  - «Enviar una prueba» muestra el código si ya existe, pero nunca crea invitaciones.
- **Decidido por mi cuenta:**
  - Para poder reutilizar un código hay que guardarlo (la base guardaba solo su hash).
    Va en una tabla aparte, `invitaciones_codigo`, cerrada a la app (RLS sin políticas,
    como `secretos`), y solo para invitaciones de residente. El código solo no sirve:
    `aceptar_invitacion()` exige que la cuenta tenga el correo de la invitación.
  - Las invitaciones hechas desde Accesos **desde ahora** también guardan su código, así
    que el recibo las reutiliza (y las extiende a 45 días; Accesos lo dice). Una pendiente
    de antes de este cambio no tiene código guardado: el correo dice «use el código de
    invitación que le envió su administración» y no se crea otra, para no anular la que
    ya le mandaron. En producción no hay ninguna.
  - 45 días: un poco más que un mes, para que el recibo siguiente la encuentre viva.
- **Cómo se revierte:** `supabase/rollbacks/20261026130000_invitacion_en_recibo_rollback.sql`.
  Las invitaciones ya creadas no se borran; solo se pierde el código guardado.

### 82. Cobro solo en dólares, por organización

**Caso de uso:** una administradora cobra en dólares y no quiere que sus propietarios vean
ni paguen en bolívares.

- **Antes:** el recibo, el portal y el correo siempre mostraban el equivalente en Bs, y el
  formulario de pago ofrecía bolívares por omisión.
- **Ahora:** Ajustes → «Cómo cobra la administradora» → **«Cobrar solo en dólares»**,
  apagado por omisión, para toda la organización (tabla nueva `ajustes_cobro`, que escribe
  `puede_operar`: la propietaria de la cuenta y la administradora).
  - **Encendido:** el recibo impreso no trae el bloque en bolívares ni los Bs de los datos
    para pagar, y el pie dice «Lo que se debe está en dólares y se paga en dólares»; «Mi
    recibo» no muestra «Si paga hoy» en Bs ni la nota de la tasa; el correo del recibo
    sale sin el monto en Bs ni la frase de la tasa; «Reportar un pago» no ofrece moneda
    («Su administración cobra solo en dólares») y arranca en Zelle. **La base también lo
    exige:** un residente no puede reportar un pago en bolívares (verificado en pruebas:
    en Bs lo rechaza, en dólares lo acepta).
  - **Apagado:** todo sigue como hoy (verificado: el correo trae los Bs).
- **Decidido por mi cuenta:** la administradora **sí** puede registrar a mano un pago en
  bolívares con la opción encendida, por si igual le llega una transferencia en Bs. La
  opción va en una tabla aparte y no en `organizaciones` porque ahí solo escribe la
  propietaria de la cuenta.
- **Cómo se revierte:** `supabase/rollbacks/20261026140000_cobro_solo_usd_rollback.sql` y,
  en la app, `AjustesCobro.tsx`, `lib/cobro.ts` y la prop `soloUsd` en el papel, «Mi
  recibo» y el formulario.

### 83. Cuotas extraordinarias en N cuotas

**Caso de uso:** la junta aprueba una cuota extraordinaria de $ 3.000 para el ascensor,
a pagar en 3 meses.

- **Antes:** Cobros ya permitía un cobro con nombre propio, repartido por alícuota o igual
  para cada unidad, pero se cobraba **todos los meses** hasta que alguien lo apagara, y no
  se podía dividir: había que cargar $ 1.000 y acordarse de apagarlo al tercer mes.
- **Ahora:** Cobros → **«Cuotas extraordinarias»**: nombre, cómo se reparte (**por
  alícuota**, con el monto total del edificio, o **monto fijo por unidad**), el monto, y
  **en cuántas cuotas** (1 por omisión).
  - Cada cierre de mes cobra el monto ÷ N. En el recibo es una línea aparte: «Cuota
    extraordinaria ascensor (cuota 2 de 3)» (con N = 1, solo el nombre). La última cuota
    se lleva el resto del redondeo: la suma de las N da el monto exacto (verificado: 3
    cuotas de $ 100 por alícuota en una unidad de 50 % = 16,6667 + 16,6667 + 16,6666).
  - Completas las N, **deja de cobrarse sola** (verificado: el cuarto mes no la cobra) y
    la tarjeta dice «Terminada». Mientras tanto dice «1 de 3 cuotas cobradas».
  - **Reabrir un mes no descuadra la cuenta:** cuántas van se cuenta en los recibos de los
    meses cerrados, no en un contador (verificado: reabrir y volver a cerrar diciembre
    sigue diciendo «cuota 2 de 3»).
  - Va en el bolsillo de condominio: **se suma al saldo y cuenta para la mora** igual que
    la cuota normal. Los saldos siguen saliendo de `saldos_actuales`.
  - La vista previa del cierre (`simular_cierre`) usa la misma regla.
  - Se puede apagar (no se cobra mientras esté apagada) y eliminar solo si todavía no se
    cobró ninguna cuota.
  - De paso, «Agregar un cobro» ya no se sale de la pantalla en el teléfono.
- **Decidido por mi cuenta:** solo con «por alícuota» o «monto fijo por unidad» y en el
  bolsillo de condominio (la base lo exige). Con «monto fijo por unidad», el monto que se
  escribe es el de cada unidad, dividido en las N cuotas. Sin IVA.
- **Cómo se revierte:** `supabase/rollbacks/20261026150000_cuotas_extraordinarias_rollback.sql`
  (antes, apagar o borrar las extraordinarias: sin la columna se volverían cobros de todos
  los meses) y `CuotasExtraordinarias.tsx`.

### 84. Redondeo de cuotas, con la diferencia al fondo de reserva

**Caso de uso:** la administradora prefiere cuotas redondas ($ 65 en vez de $ 61,73): son
más fáciles de pagar y de cuadrar.

- **Antes:** no existía. El único redondeo era el «perdón de centavos» del edificio, que va
  al revés (perdona deudas chicas).
- **Ahora:** Ajustes → «Cómo cobra la administradora» → **«Redondeo de las cuotas»**: sin
  redondeo (por omisión), al dólar entero o a múltiplos de $ 5, para toda la
  organización.
  - **Siempre hacia arriba.** Lo que se emite ese mes a cada unidad (cuota,
    extraordinarias, cargos de la unidad, honorario y servicio; **sin** la mora ni lo que
    venía de meses anteriores) se redondea al cerrar el mes.
  - **La diferencia va al fondo de reserva** y sale en el recibo como una línea aparte,
    «Fondo de reserva por redondeo», en el bolsillo de condominio (verificado en pruebas:
    61,725 → 65 con 3,275 al fondo; al dólar → 62 con 0,275).
  - Se aplica al cerrar el mes: **no cambia meses ya cerrados** (verificado: octubre
    queda igual). La vista previa del cierre ya muestra la cuota redondeada.
- **Decidido por mi cuenta:**
  - **El fondo de reserva no existía** como concepto. Se crea como una línea más de los
    cobros del recibo, que es como el recibo muestra cada cobro, y no como una fila de
    Cobros: su monto no se configura, sale del redondeo de cada unidad.
  - Se redondea lo emitido en el mes, no el total con deuda anterior: si se redondeara el
    total, la diferencia cambiaría con cada pago atrasado.
- **Cómo se revierte:** `supabase/rollbacks/20261026160000_redondeo_cuotas_rollback.sql`.

### 85. Mensajes masivos por correo, con el tope diario de Resend

**Caso de uso:** la administradora tiene que avisar a todo el edificio de un corte de
agua, o recordarles a los que deben.

- **Antes:** no había cómo. Solo salían los recibos y los avisos de la garita. El
  despachador mandaba 20 correos cada 5 minutos sin mirar el límite del plan de Resend:
  pasado el cupo, Resend los rechaza y quedaban como fallidos.
- **Ahora:** Admin → **«Mensajes»** (en el menú, después de «Cortes de cuenta»; sale si el
  edificio tiene el módulo de correo).
  - Asunto, texto y **para quién**: todo el edificio (propietarios e inquilinos), solo
    propietarios, solo inquilinos o **solo quienes deben** (de cada unidad que debe, quien
    paga: el propietario o el inquilino, según «¿quién paga?»).
  - **Vista previa:** cuántas personas, cuántas con copia, cuántos correos, y si sale hoy
    o se reparte en varios días. Debajo, cómo se va a ver. Después, **confirmación**
    («¿Enviar este mensaje?… Una vez enviado no se puede retirar»).
  - Cada persona recibe uno solo aunque tenga varias unidades, **con su correo de
    respaldo en copia**. Se saltan los correos que rebotaron. Un doble toque no lo manda
    dos veces (verificado). Las respuestas van al correo de respuesta de la
    administración.
  - **Historial:** «Mensajes enviados», con cuántos salieron, cuántos esperan y cuántos
    fallaron; al tocar el asunto se ve el texto.
  - **Tope diario:** el plan gratuito de Resend permite **100 correos por día**. El
    despachador cuenta lo mandado en las últimas 24 horas (una copia cuenta como otro
    correo) y no pasa de ahí: lo demás espera en la cola y sale al día siguiente. **Un
    envío más grande que el cupo se reparte en varios días en vez de fallar**, y la vista
    previa lo avisa. Los recibos y los avisos salen primero; los mensajes masivos,
    después. Verificado en pruebas con el tope en 3: de 5 pendientes salieron 3 (primero
    las pruebas) y el mensaje esperó.
  - Solo la administración (`puede_operar`): un residente no puede enviar ni ver el
    historial (verificado).
- **Decidido por mi cuenta:**
  - El tope vale para **toda la cuenta de Resend**, que es una sola para todas las
    organizaciones. Se puede subir sin tocar código con el secreto `correo_tope_diario`
    (cuando se pase al plan pago).
  - Ventana de 24 horas corridas, no «el día»: no depende de a qué hora reinicia Resend
    su cuenta, y nunca se pasa.
  - **Ojo para el piloto:** con 53 unidades y dos destinatarios por unidad, los recibos
    de un mes ya son ~100 correos: el cupo de un día. Ver los riesgos en
    `docs/estado-migracion.md`.
- **Cómo se revierte:** `supabase/rollbacks/20261026170000_mensajes_masivos_rollback.sql`
  (cancela los mensajes que sigan en la cola y borra el historial) y `Mensajes.tsx`.

### 86. Estado financiero del edificio, en PDF y en Excel

**Caso de uso:** la junta pide cuánto entró y cuánto salió en octubre, o en el trimestre.

- **Antes:** Estadísticas tenía el «informe para la asamblea» de un mes, pero no un
  estado con saldo inicial y final, ni un rango de meses, ni Excel.
- **Ahora:** Admin → **«Estado financiero»** (en el menú, después de Estadísticas). Se
  elige «Desde» y «Hasta» (un mes o un rango) y se ve:
  - **saldo inicial** (lo cobrado menos lo gastado antes del período), **ingresos** (los
    pagos **confirmados** con fecha en el período), **egresos** (los **gastos del mes** de
    los meses del período, los comunes y los cargados a una unidad) y **saldo final**;
  - aparte, lo cobrado para **honorarios** de administración, que no es del edificio y no
    entra en el saldo;
  - si algún mes del período sigue abierto, un aviso: sus gastos todavía pueden cambiar.
  - **«Descargar PDF»** abre la hoja lista para imprimir, con la barra «← Volver» como el
    recibo (y vuelve al mismo rango); **«Descargar Excel»** baja un libro con tres hojas:
    Resumen, Ingresos y Egresos.
  - Verificado en pruebas: con un pago de $ 30 en septiembre, uno de $ 40 en octubre, $ 5
    a honorarios, un pago sin confirmar de $ 99 y $ 100 de gastos en octubre: octubre da
    30 + 40 − 100 = −30; los $ 5 aparte y los $ 99 no cuentan. Un residente no tiene
    acceso.
- **Decidido por mi cuenta:** el saldo es el del registro de Vecitap (cobrado menos
  gastado), no el del banco: no hay un saldo bancario inicial cargado. Los pagos a
  servicio cuentan como ingresos del edificio (se pagan a la cuenta del condominio). Lo
  ven la administración, el contador y la junta de ese edificio.
- **Cómo se revierte:** `supabase/rollbacks/20261026180000_estado_financiero_rollback.sql`,
  la ruta `estado/` y `lib/admin/estado-financiero.ts`.

### 87. Pago agrupado: una transferencia repartida entre varias unidades

> Es la «fase 2» del caso 31 (propietarios con varias unidades), que había quedado fuera
> de alcance. Hace falta antes del primer pago real: en el edificio piloto un propietario
> con varias oficinas paga todas con una transferencia.

**Caso de uso:** un propietario con tres oficinas transfiere una sola vez por las tres.

- **Antes:** tenía que reportar la misma transferencia tres veces, partiendo el monto a
  mano. Para la administradora eran tres pagos con la misma referencia que el banco
  muestra como uno: la conciliación no los casaba.
- **Ahora:**
  - **«Reportar un pago»**, si quien mira paga dos o más unidades del **mismo edificio**:
    «Esta transferencia paga varias de mis unidades». Se marcan las unidades; **cada una
    propone su saldo** (en Bs a la tasa de la fecha del pago) y se puede cambiar. La suma
    tiene que ser igual al total de la transferencia («Usar la suma como monto» lo copia).
    Un solo comprobante.
  - **Una transacción, N pagos:** un pago por unidad con el mismo `grupo_id`, en una sola
    llamada (entran todos o ninguno). La base exige que sean una sola transferencia: mismo
    edificio, fecha, moneda, método y referencia, y unidades distintas.
  - **En Bs, los centavos cuadran:** cada parte se pasa a dólares redondeada a centavos y
    la diferencia la absorbe la parte más grande, así **la suma de las partes es
    exactamente el total** (verificado: 3 × Bs 500 a 886,2271 = 0,56 + 0,56 + 0,57 = 1,69).
  - **Admin → Pagos recibidos:** cada parte dice «Agrupado con 02B, 03A · total $ …» y
    muestra el comprobante de la transferencia. **Confirmar o anular uno confirma o anula
    el grupo completo**; la base no deja cambiar una parte sola (verificado).
  - **Conciliación con el banco:** el movimiento del banco se compara contra **la suma
    del grupo**, y al conciliar se concilia el grupo entero.
  - `pagos_posible_duplicado()` ignora los pagos del mismo grupo (comparten referencia a
    propósito).
  - **La administradora también puede registrar uno agrupado**: «Una sola transferencia
    para varias unidades», con una fila por unidad y su monto, y el total.
  - Los saldos siguen saliendo de `saldos_actuales`: cada parte es un pago normal de su
    unidad.
- **Decidido por mi cuenta:** solo unidades del mismo edificio (una transferencia va a una
  sola cuenta); las partes en Bs se guardan a centavos (un pago suelto, a 4 decimales:
  la diferencia es de menos de medio centavo); el comprobante queda con la primera parte.
- **Cómo se revierte:** `supabase/rollbacks/20261026190000_pago_agrupado_rollback.sql`
  (los pagos agrupados quedan como pagos sueltos, con su monto ya cuadrado) y los cambios
  en `FormularioReportarPago.tsx` y `Pagos.tsx`.

## Ronda 8 del tramo 2 — arreglos de las rondas 6 y 7 antes del piloto de GRUPO ING3 (27-oct)

> Pedido de Nicolás del 27-oct, con los resultados de Gustavo de la ronda 7 (6 OK, 6 OK con
> pedidos, 3 fallas, 1 no hecha) y lo pendiente de la ronda 6. Migraciones R8-1 a R8-5 en
> `docs/estado-migracion.md`, «Ronda 8».

### 88. «Cargar datos»: lo corregido en la previa es lo que queda, también en una ficha que ya existe

**Caso de uso:** la administradora corrige el teléfono de 10C en la previa; la persona de
10C ya existe en su administradora.

- **Antes (prueba 5 de Gustavo):** la celda decía «corregido en la previa», pero al cargar
  la fila iba a la ficha existente y la carga **solo completaba lo vacío**: el teléfono
  viejo se quedaba. La corrección se perdía en silencio.
- **Ahora:**
  - Si la fila va a una ficha que ya existe, la previa lo dice en la misma fila: «Cambia
    el teléfono de la ficha de Sr. …: 04245551666 → 0414-5551234», y la celda: «corregido
    en la previa: cambia en la ficha de …». Al cargar, `importar_unidades()` **reemplaza**
    ese dato (R8-1: `cambiar`). Vale para teléfono, correo, correo de respaldo, cédula y
    nombre. Lo que no se corrigió sigue igual: solo completa lo vacío.
  - **Nunca dice «corregido» si no se guarda:** con la unidad omitida dice «corregido en
    la previa, pero no se guarda: la unidad ya existe y se omite (marque «Actualizar»)»;
    con meses cerrados, que el saldo no se guarda; si la unidad tiene otro propietario,
    que no se guarda; un dato borrado en la previa no borra la ficha (lo dice).
  - Con varias filas de la misma persona, el dato corregido manda sobre el de las otras.
- **Decidido por mi cuenta:** un valor vacío no borra nada de una ficha; el tratamiento
  (Sr., Sra.…) de una ficha existente no se cambia desde la carga (lo dice la celda). Y
  **ojo**: si la administradora corrige una fila y después contesta «Sí» a una ficha de
  otro nombre, lo corregido se aplica a esa ficha (es lo que la previa anuncia en la fila;
  pasó en la validación con 03D y «Vonepomecen Tolip F, c.a.»).
- **Cómo se revierte:** `supabase/rollbacks/20261027120000_importar_corrige_fichas_rollback.sql`
  y los cambios en `analisis.ts` y `CargarDatos.tsx`.

### 89. «Personas para revisar»: la tabla muestra lo que va a quedar, y nunca usa sin preguntar una ficha de otro nombre

**Caso de uso:** 05C («Livofesupi Sonopu») comparte el teléfono con 01A («Bumagi
Tovavade/Camebogig Zazufuni»).

- **Antes (prueba 6.3):** con «Sí», el aviso decía que los recibos iban al correo de 01A,
  pero la tabla seguía mostrando el correo de 05C. La observación decía «se usa la de Sr.
  Bumagi…»: dos causas. (1) `mismoNombre()` aceptaba que un nombre **empezara** como el
  otro, así «Bumagi Tovavade» era igual a «Bumagi Tovavade/Camebogig Zazufuni». (2) Al
  juntar con «Sí» filas de dos nombres, la ficha se elegía con el nombre de la primera fila
  del grupo, sin preguntar. También: «son otras personas (otro nombre u otra cédula)»
  sobre fichas que se llamaban igual que la fila, unidades repetidas («01B, 01A, 01B, 01A…»)
  y notas que estiraban la fila.
- **Ahora:**
  - Al elegir «Sí», «No» o una ficha, la tabla muestra **al momento** el propietario, el
    correo y el teléfono que van a quedar, con «el archivo dice …» debajo.
  - Un nombre solo es igual a otro si son el mismo, o si lo que sobra es la forma de la
    empresa («Inversiones Uno» = «Inversiones Uno, C.A.»).
  - Si un «Sí» junta filas de nombres distintos y hay fichas de los dos nombres, **se
    pregunta cuál** (sin respuesta por omisión; la carga espera).
  - La nota «también comparte el teléfono con …: es otra persona» nombra solo fichas que se
    llaman distinto que esa fila; las unidades de una ficha, sin repetir; las notas largas,
    en una línea con «ver más».
- **Cómo se revierte:** los cambios en `analisis.ts` y `CargarDatos.tsx` (no hay base).

### 90. Las filas que esperan «¿misma persona?» se corrigen siempre

- **Antes (prueba 2.2):** el grupo «… filas que esperan una respuesta» solo salía si la
  fila se iba a cargar. En un edificio con las unidades ya cargadas (el Edificio Ronda 6)
  las filas se omiten, el grupo no salía y no había dónde corregir 03D.
- **Ahora:** las filas con una pregunta sin responder salen igual en Avisos («… con una
  pregunta en «Personas para revisar» (no frenan: se omiten)»), con su teléfono, correos y
  cédula para corregir; y cada pregunta de «Personas para revisar» tiene «Corregir los
  datos de esta fila». Al corregir, la pregunta se vuelve a evaluar.

### 91. Mensajes: a qué unidades va, a mano, y cuándo sale lo que espera el cupo

- **Antes (prueba 13):** con «Solo quienes deben» no se veía a quiénes iba (el filtro sí
  funcionaba: 31 personas contra 36 de «Todos» en el Edificio Gustavo, pero los números se
  parecían). Enviado a «Todos», «0 enviados» y nada más: el despachador corre cada 5
  minutos y ese día ya se había llegado a los 100 correos (58 recibos de la prueba 9 y otros
  mensajes); 14 quedaron esperando sin que la pantalla dijera hasta cuándo. Y 2 fallaron con
  «Too many requests» (el despachador mandaba 20 de una vez; Resend acepta 10 por segundo).
- **Ahora:** «Va a 33 unidades: 01A, 01B…» con «Ver y cambiar» para marcar o desmarcar
  unidades (y «Todas», «Ninguna», «Volver al filtro»); la vista previa cuenta sobre esas.
  El historial dice «N enviados · N salen en los próximos minutos · N esperan el cupo
  diario» y «Salen solos a medida que se libera cupo: lo último, hoy a las 11:55 p. m.». El
  despachador hace como mucho 8 pedidos por vuelta.

### 92. Cortes de cuenta: cómo va el correo de cada unidad y «Reenviar recibo»

- **Ahora:** columna «Correo» por unidad y destinatario: «Saliendo», «Espera el cupo: sale
  hoy a las …», «Enviado», «No salió», «Rebotó» (y «Entregado» / «Abierto» si se enciende
  la consulta a Resend, ver estado-migracion). Botón «Reenviar recibo» por unidad (uno cada
  10 minutos). Arriba: cuántos correos lleva el mes con los de respaldo y cuántos quedan
  hoy; la confirmación de «Enviar» dice si sale todo de una vez. Cuando se acaba el cupo, se
  le avisa a Vecitap una vez por día (consola del operador, y un correo si existe el secreto
  `correo_operador`), no unidad por unidad.
- **Decidido por mi cuenta:** el reenvío va a los mismos destinatarios del envío del mes.

### 93. El recibo: sin bolívares, copia al correo de respaldo, código solo a los titulares

- **Antes:** el correo y el papel traían el total en Bs a la tasa de un día. El recibo **no
  le llegaba al correo de respaldo** (solo los mensajes lo copiaban). Si la unidad tenía dos
  propietarios vigentes, los dos recibían código. El código quedaba guardado aunque la
  invitación se usara o anulara.
- **Ahora (decisiones de Gustavo):** correo, recibo impreso y PDF traen solo los dólares y
  «Se paga en bolívares a la tasa oficial BCV del día del pago», con el enlace al portal
  (el «Monto exacto en Bs» del portal sigue). Los datos para pagar, sin montos en Bs. El
  recibo va también al correo de respaldo, **en un correo aparte y sin código**. Código solo
  al propietario principal (el vínculo vigente más reciente) y al inquilino. Al usar o
  anular una invitación, su código se borra.
- **Ojo con el cupo:** cada correo de respaldo es un correo más por unidad.

### 94. Redondeo sobre el total a pagar

- **Antes (ronda 7):** se redondeaba solo lo del mes; con deuda anterior el total no daba
  redondo.
- **Ahora:** se redondea el **total a pagar** (con la deuda anterior, la mora y lo de
  administración), siempre hacia arriba; la diferencia va a «Fondo de reserva por
  redondeo» de ese mes. Total 0 (o un saldo a favor que lo deja en 0): no se redondea. La
  previa del cierre calcula lo mismo, y ahora también la misma mora que el cierre.
  Verificado: 534,915 → $ 535 (fondo 0,085); 1,585 → $ 5; 0 → 0.

### 95. Detalles de la ronda 6

- Cerrar un mes con gastos y una unidad con la cuota de condominio en $ 0,00: aviso con las
  unidades, y la confirmación pide «Sí, cerrar igual».
- «Sí, descartar» y los botones de peligro: texto blanco, sobre el rojo oscuro de la
  garita (en tema oscuro el rojo de texto es claro y no se leía blanco encima).
- «Las alícuotas suman 111,99 %; deben sumar 100 %. Revise las unidades en Propietarios.»
- «Puede pasar» en la garita: #166534 (letra blanca 7,1:1).
- La página sube sola hasta un error o un «listo» que aparece fuera de la pantalla después
  de tocar algo (todas las pantallas que usan el aviso de siempre).
- «Cargar saldos» y el extracto del banco leen otra vez el mismo archivo; «Abrir un mes»
  propone el siguiente al cerrado; «Conciliar 1 pago».

## Ronda 9 del tramo 2 (28-oct)

Decisiones de Gustavo del 28-oct, que enmarcan esta ronda: **Resend sigue en el plan
gratis para GRUPO ING3**, aceptando que el envío de recibos se reparta en dos días si hace
falta (el plan pago se contrata al sumar otro edificio), y **solo el operador (Vecitap)
crea administradoras**.

### 96. «Al día» en vez de «Debe $ 0,00»

- **Antes:** el portal comparaba el saldo contra cero sin margen. La base guarda 4
  decimales, y 02C del Edificio Gustavo, con un resto de $ 0,0021, decía «Debe $ 0,00» en
  rojo.
- **Ahora:** menos de medio centavo es cero. Sin deuda, la tarjeta de la unidad y el
  resumen dicen «Al día» en gris, sin monto.

### 97. «Si paga hoy» cuenta los pagos confirmados después del recibo

- **Antes:** «Si paga hoy» convertía a bolívares el **total del recibo**. 02A del Edificio
  Gustavo, con $ 50 a favor, decía «Si paga hoy Bs 109.127,86»: un propietario real pagaba
  dos veces. Reportar un pago avisaba «no tiene que pagar» solo si el *recibo* quedaba a
  favor.
- **Ahora:** el recibo sigue mostrando el total del día en que se emitió, pero «Si paga
  hoy», «Reportar un pago», el monto exacto en Bs, los datos para pagar del portal y el
  recibo impreso desde el portal usan **lo que se debe hoy**. Sin deuda no hay monto a
  pagar: «Está al día» o «A favor $ X». Debajo del total, «Después de este recibo, su
  administración confirmó pagos por $ X. Hoy debe $ Y». Los pagos reportados sin confirmar
  se avisan («si ya pagó, no vuelva a pagar»), sin descontarlos.
- **El inquilino con «Solo el recibo del mes»** no ve el saldo acumulado (saldo_visible()
  no cambia): ve lo que queda **de su recibo**, el total menos lo confirmado después. Para
  eso, la función nueva `pagos_desde_cierre()` le da solo esas dos sumas (RLS no le deja
  leer los pagos que no reportó él).

### 98. Corregir otra vez o deshacer una corrección en la previa

- **Antes:** al tocar «Corregir», el aviso desaparecía y con él el campo: si la
  administradora se equivocaba, la única salida era descartar todo.
- **Ahora:** una tarjeta «Correcciones hechas» lista cada celda corregida, con su campo para
  volver a editarla, «Deshacer» (vuelve al valor del archivo) y «En el archivo: …».

### 99. La página sube también cuando el aviso cambia de texto

- **Antes:** la regla de la ronda 8 (subir hasta el aviso) corría solo cuando el aviso
  aparecía. Si ya había uno («Recibo de 01B reenviado…») y cambiaba
  («Ese recibo ya se reenvió hace un momento»), la página no subía.
- **Ahora:** un aviso que cambia de texto cuenta como nuevo, en todas las pantallas. Los
  dos avisos hechos a mano que no usaban el componente (el error general de Reportar un
  pago y el aviso de la consola del operador) usan la misma regla.

### 100. Las unidades en orden natural en todas las listas

- **Antes:** cada lista salía en el orden en que llegaba (en Cortes, 01A, 01B, 01D, 05C,
  04A…).
- **Ahora:** por piso y letra en Cortes, Propietarios, Inicio, Pagos, Accesos, Mensajes, el
  cierre y el listado impreso: 01A, 01B, 01C, 01D, 02A…, y 2A antes que 10A. En Cortes,
  además: el monto en una línea; «WhatsApp prop.» y «Correo prop.»; y antes de enviar,
  «No se ha enviado. Va a: …» con el correo de respaldo marcado «(respaldo)».

### 101. Entregado, abierto, rebotó: los avisos de Resend

- **Antes (ronda 8):** «Enviado» solo decía que Resend lo había aceptado.
- **Ahora:** Resend avisa cada evento a `/api/resend`, que verifica la firma; la base lo
  guarda en el correo de la cola (sin retroceder: un «entregado» tardío no pisa un
  «abierto») y anota los rebotes y las quejas de spam en `correos_malos`. Cada base ignora
  los correos de la otra (la cuenta de Resend es la misma). «Abierto» depende de que el
  programa de correo cargue las imágenes: no es del todo confiable.

### 102. Solo Vecitap crea administradoras

- **Antes:** cualquier cuenta sin administradora veía «Nueva administradora» y podía crear
  una y quedar de dueña.
- **Ahora (decisión de Gustavo):** la base lo exige (`crear_organizacion()` solo para el
  operador) y la pantalla dice «Para usar Vecitap como administradora, hay que escribirle a
  Vecitap». **Pendiente de Nicolás:** los datos de contacto (`CONTACTO_VECITAP` en
  `components/admin/SinAdministradora.tsx`).

### 103. «Dar de baja» funciona también para una `administrador`

- **Antes:** el botón hacía un UPDATE directo que la base solo le permite a la dueña de la
  cuenta: con una `administrador`, no pasaba nada y no salía ningún error.
- **Ahora:** pasa por `dar_de_baja_acceso()`, que deja dar de baja solo accesos de
  propietario o inquilino de una organización que la persona administra.

### 104. Redondeo: la regla de Gustavo

- **Antes:** «Al dólar entero» o «A múltiplos de $ 5», a elección.
- **Ahora:** «Sin redondeo» o «Redondear»: si el total a pagar pasa de $ 20, hacia arriba
  al múltiplo de $ 5; si es de $ 20 o menos, al dólar entero. Las organizaciones que
  tenían una de las dos opciones viejas pasan a «Redondear» (no había ninguna).
  Verificado con cierres reales en pruebas: 18,40 → 19; 20,00 → 20; 20,01 → 25;
  122,99 → 125, con y sin saldo anterior y con una cuota extraordinaria en el mismo mes.

### 105. Sin «estacionamiento con alícuota 0» en la previa

- **Antes:** una fila sin alícuota se podía cargar como estacionamiento con alícuota 0.
- **Ahora (decisión de Gustavo):** una fila sin alícuota no se carga y el aviso lo dice. Un
  estacionamiento con alícuota propia se carga como cualquier unidad.

### 106. El cupo de correos: cada administradora ve lo suyo

- **Antes:** `cupo_correo()` le mostraba a cualquier administradora los correos de toda la
  cuenta de Resend, incluidos los de otros clientes.
- **Ahora:** ve lo que mandó su organización, lo que tiene esperando, cuándo sale lo
  último suyo y el cupo que le queda hoy. El operador sigue viendo todo. Cuando un envío se
  reparte, Cortes dice «Hoy salieron N correos de este mes; M esperan el cupo» y cuándo sale
  el último; el aviso a Vecitap sale una vez por día de Venezuela.
