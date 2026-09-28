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
- **Estado:** aplicado en `components/admin/Accesos.tsx`. La ruta en sí se
  construye en el bloque 10.
