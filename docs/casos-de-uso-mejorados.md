# Casos de uso donde la versión migrada se comporta distinto al original

Registro de cada punto donde `app.html`/`residente.html`/`operador.html` (los 4 HTML
originales) y la versión migrada (Next.js) hacen algo distinto a propósito — para
revisarlo con el socio comercial al terminar la migración. No es un changelog técnico:
cada caso está en lenguaje de negocio primero, con la cita de código como respaldo.

No confundir con `docs/estado-migracion.md` (estado del plan por fase) ni con
`AGENTS.md` (convenciones que no cambian de fase). Este archivo es solo la lista de
desvíos de comportamiento frente al original.

---

## Residente

### 1. Tarjeta de saldo con 3 tonos en vez de 2

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
- **Estado:** pendiente de revisión con el socio (la decisión de producto sobre cómo
  debe funcionar el registro es de la Fase 5).
- **Cómo se revierte:** no aplica revertir — es simplemente conectar el botón ya
  existente cuando el modelo de registro esté definido.

---

## Operador

### 7. "Cobro dentro del recibo": campo controlado, sin doble-insert ni desfase

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
