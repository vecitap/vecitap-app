# Inventario de Admin (`app.html` → Fase 4)

Documento de **solo lectura y análisis** — no se tocó código de la app ni se
commiteó nada al producirlo. Objetivo: sobrevivir al `/clear` entre las dos
sesiones de trabajo de Admin (ver plan de corte al final). `app.html` tiene
5.318 líneas; todas las citas de línea son contra ese archivo salvo que se
diga lo contrario.

Mapa de funciones de nivel superior (para ubicarse rápido):

| Función | Líneas | Rol |
|---|---|---|
| `Inicio` | 1348–1448 | pantalla "Inicio" |
| `Propietarios` | 1449–1566 | pantalla "Propietarios" (lista) |
| `AltaUnidad` | 1567–1654 | modal, hijo de Propietarios |
| `ImportarUnidades` | 1655–1787 | subpantalla, hija de Propietarios |
| `ImportarSaldos` | 1788–1976 | subpantalla, hija de Propietarios |
| `imprimirEstado` | 1924–1975 | helper de impresión, usado por Ficha |
| `Ficha` | 1977–2132 | panel lateral (drawer), hijo de Propietarios |
| `DatosUnidad` | 2133–2270 | pestaña "Datos" dentro de Ficha |
| `Cobros` | 2271–2434 | pantalla "Cobros" |
| `CierreMes` | 2435–3087 | pantalla "Cierre del mes" |
| `Pagos` | 3088–3697 | pantalla "Pagos" |
| `Accesos` | 3698–4146 | pantalla "Accesos" |
| `Cortes` | 4147–4843 | pantalla "Cortes de cuenta" |
| `LogoOrg` | 4844–4894 | subsección dentro de Ajustes |
| `Ajustes` | 4895–5257 | pantalla "Ajustes" |
| `NuevoEdificio` | 5258–5318 | modal, hijo de Ajustes |

---

## 1. Pantallas

Todas las pantallas (salvo la nota) reciben `unidades`/`saldos`/`conceptos`/
`periodos` ya cargados por `App()` (líneas 926–953, ver sección 4) — no
hacen su propio fetch de esas cuatro cosas. Lo que se lista abajo en "Datos
que lee" es lo que la pantalla o sus hijos leen **además** de eso.

### Inicio — 1348–1448
- **Lee:** nada propio; recibe `unidades`, `saldos`, `sumaAlicuotas`,
  `porCobrar`, `aFavor`, `conDeuda` como props ya calculados en `App()`
  (líneas 988–993).
- **Componentes de `components/ui/` reutilizables:** `Card` (Tarjeta),
  `Button` (Boton).
- **Falta crear:** `Metrica` (etiqueta/valor/pie/tono/icono/onClick) — hay
  un primo cercano en `components/operador/Kpi.tsx` pero sin `tono` ni
  `icono` ni `onClick`; conviene generalizar ese componente a
  `components/ui/` en vez de crear un tercero casi igual para Admin.
  `Vacio` (empty state) y `Aviso` (banner de alerta con tono ambar/rojo/
  verde) tampoco existen todavía en `components/ui/` — los usan Inicio,
  Cobros, CierreMes, Ficha y Cortes, así que conviene construirlos en la
  Sesión 1.

### Propietarios — 1449–1566 (+ helpers 1567–2270)
- **Lee:** nada propio en la lista principal (todo por props). El modal
  `Ficha` (1977–2132) sí hace fetch propio al abrirse: `historial_unidad`
  RPC (1990) + `pagos` filtrados por `unidad_id` y `estado='reportado'`
  (1991–1992). `AltaUnidad`/`ImportarUnidades`/`ImportarSaldos` no leen,
  solo escriben (ver sección 4).
- **Componentes reutilizables:** `Card`, `Button`, `Input` (Entrada),
  `Select` (Selector), `Campo`, `Table`.
- **Falta crear:** `Flechas` (par de botones subir/bajar, se repite en
  Cobros/CierreMes/Ajustes para reordenar filas) — no existe en
  `components/ui/`. El panel lateral de `Ficha` es un **drawer** (fijo a la
  derecha, altura completa, fondo semitransparente) — `components/ui/
  Dialog.tsx` envuelve `<dialog>` nativo centrado, no sirve para este
  patrón sin una variante nueva.

### Cobros — 2271–2434
- **Lee:** nada propio; `conceptos` viene de `App()` (línea 938,
  `conceptos_cobro`).
- **Escribe:** `conceptos_cobro` (update/insert/delete, ver sección 4).
- **Componentes reutilizables:** `Card`, `Table`, `Input`, `Select`,
  `Badge` (Pastilla) — aunque `Badge` en `components/ui/` solo soporta
  tonos `verde|ambar|rojo|azul|tenue` y aquí se necesita también `neutro`
  y `marca` (bolsillo del cobro: condominio/administración/servicio).

### Cierre del mes — 2435–3087
- **Lee propio:** `categorias` (2465), `gastos` del período abierto (2483),
  `partidas_fijas` (2613, al abrir un mes para rellenarlo).
- **Escribe:** `periodos` (`abrir_periodo`, `descartar_periodo`,
  `reabrir_periodo`, `cerrar_periodo`, update directo), `gastos`
  (insert/update/delete/`mover_gasto`). Ver sección 4 — es la pantalla con
  la acción de mayor riesgo de todo Admin (`cerrar_periodo`).
- **Componentes reutilizables:** `Card`, `Table`, `Input`, `Select`,
  `Campo`.
- **Falta crear:** `Flechas` (ya mencionado), `Confirmar` (diálogo de
  confirmación con tono) — hay `Dialog.tsx` como base pero no un componente
  de confirmación listo para usar; esta pantalla es la que más lo necesita
  (cerrar/reabrir/descartar un período).

### Pagos — 3088–3697
- **Lee propio:** `pagos` del edificio (3115), `bancos` activos (3126),
  `comprobantes` por lote de ids (3134), `comprobantes_caducados` RPC
  (3159, botón "purgar vencidos"), `tasa_de_esa_fecha` RPC (3172, por
  fecha).
- **Escribe:** `pagos` (insert/update), `ajustes` (insert, exoneraciones),
  `comprobantes` en Storage (subida y borrado), `marcar_comprobante_borrado`
  RPC, `completar_tasa` RPC (**alcance global**, ver sección 4).
- **Componentes reutilizables:** `Card`, `Table`, `Input`, `Select`,
  `Campo`, `Badge`.
- **Falta crear:** un componente de subida de comprobante con vista previa
  — ya existe un equivalente hecho para Residente
  (`FormularioReportarPago.tsx` valida la firma real del archivo vía
  `lib/archivos.ts`, ver `docs/estado-migracion.md` Fase 4/Residente); acá
  conviene **reusar `lib/archivos.ts`**, no reimplementar la validación de
  firma. También falta un lector de extracto bancario (CSV/PDF) para la
  conciliación por lote — es lógica de negocio nueva de esta pantalla, no
  hay nada parecido migrado todavía.

### Cortes de cuenta — 4147–4843
- **Lee propio:** `recibos` del período (4170), `resumen_correos` RPC
  (4182), `ajustes_correo` (nota de la administradora, 4190).
- **Escribe:** `ajustes_correo` (update), `encolar_recibos` RPC,
  `despachar_ahora` RPC (**alcance global**, 3 puntos de llamada),
  `correo_recibo` RPC (vista previa, es lectura pese al nombre — devuelve
  el correo armado sin enviarlo), `encolar_prueba` RPC, `marcar_enviado`
  RPC. Ver sección 4.
- **Componentes reutilizables:** `Card`, `Table`, `Button`, `Badge`.
- **Falta crear:** nada estructural nuevo — es la pantalla que más se
  apoya en RPCs (la lógica pesada ya vive en la base), la parte de UI es
  mayormente listas y botones que ya tienen equivalente en `components/ui/`.

### Accesos — 3698–4146
- **Lee propio:** `invitaciones_de` RPC (3707), `residentes_de` RPC (3711).
- **Escribe:** `crear_invitacion` RPC, `revocar_invitacion` RPC, update
  `unidades.inquilino_ve`, update `membresias.activo=false` (dar de baja).
- **Componentes reutilizables:** `Card`, `Table`, `Input`, `Select`,
  `Badge`, `Button`.
- **Nota de alcance de roles:** esta pantalla solo invita con
  `p_rol: "residente"` (línea 3722, hardcodeado) — no hay flujo de
  invitación para administrador/contador/junta desde `app.html`. Ver
  sección 3.

### Ajustes — 4895–5257 (+ `LogoOrg` 4844–4894, + `NuevoEdificio` 5258–5318)
- **Lee propio:** `categorias` con sus `partidas_fijas` anidadas (4908,
  4908 refetch en 5017).
- **Escribe:** `organizaciones.logo_url` (4856 — guarda un **data-URL
  base64** generado en el navegador con `redimensionarLogo()`, líneas
  388–403; no usa Supabase Storage como sí hace `comprobantes`), `edificios`
  (update de configuración, insert de uno nuevo vía `NuevoEdificio`),
  `categorias` (insert), `partidas_fijas` (insert/update/delete).
- **Componentes reutilizables:** `Card`, `Input`, `Select`, `Campo`,
  `Button`.
- **Falta crear:** `Flechas` (reordenar categorías/partidas), input de
  archivo con recorte/redimensión de imagen (patrón nuevo, no hay
  equivalente migrado).
- **Nota:** no hay ruta para **borrar** un edificio en ningún lugar de
  `app.html` — `NuevoEdificio` (5258–5318) crea, pero no existe el inverso.
  Ver sección 4 (irreversibilidad).

---

## 2. Ruteo

### Estructura propuesta

```
/admin                              → resuelve organización, redirige
/admin/[orgId]                      → resuelve edificio, redirige
/admin/[orgId]/[edificioId]         → redirige a /inicio
/admin/[orgId]/[edificioId]/inicio
/admin/[orgId]/[edificioId]/propietarios
/admin/[orgId]/[edificioId]/propietarios/[unidadId]   (Ficha como subruta, no drawer con estado)
/admin/[orgId]/[edificioId]/cobros
/admin/[orgId]/[edificioId]/mes
/admin/[orgId]/[edificioId]/pagos
/admin/[orgId]/[edificioId]/cortes
/admin/[orgId]/[edificioId]/accesos
/admin/[orgId]/[edificioId]/ajustes
```

**Índice `/admin`:** hoy `App()` resuelve la organización en memoria
(líneas 900–906: si `organizaciones` devuelve una sola fila, la elige sola;
si hay más, muestra `Organizaciones` para elegir, líneas 782–840). La
migración debería preservar ese comportamiento como redirect del lado del
servidor: una sola organización → `redirect` directo a
`/admin/[orgId]`; más de una → pantalla de selección en `/admin` mismo
(no hace falta subruta para eso, es análogo a como Residente maneja "sin
unidades asociadas").

**Índice `/admin/[orgId]`:** hoy `cargarEdificios()` (910–920) elige el
edificio ya guardado o el primero de la lista. Mismo patrón: redirect a
`/admin/[orgId]/[edificioId]/inicio` con el primer edificio (o el único).
Si la organización no tiene ningún edificio, la pantalla es
`PrimerEdificio` (1292–1347) — eso pasaría a vivir en
`/admin/[orgId]/[edificioId]` cuando no hay ningún edificio creado (edge
case: no hay `edificioId` para poner en la URL todavía; posiblemente
`/admin/[orgId]` se queda mostrando eso en vez de redirigir).

### El selector de edificio: ¿segmento, query param o estado?

El criterio ya validado en Residente es explícito: **botón atrás y recarga
tienen que funcionar** (`docs/estado-migracion.md`, Fase 4/Residente). Hoy
en `app.html` el edificio es puro `useState` (línea 858) — recargar la
página siempre vuelve al primer edificio y la pestaña "inicio"; no hay
historial de navegación entre pestañas ni entre edificios. Es exactamente
el mismo antipatrón que tenía Residente antes de migrar (tabs en memoria en
vez de subrutas), así que la recomendación es no repetirlo.

| Opción | Pros | Contras |
|---|---|---|
| **Segmento de URL** (`/admin/[orgId]/[edificioId]/cobros`) — recomendado | Recargar y compartir un link reproducen exactamente edificio+sección; mismo patrón ya validado en Residente (`/mi/[unidadId]/recibo`); todas las 8 secciones dependen del edificio elegido (no hay ninguna sección "solo organización" — hasta Ajustes mezcla edificio y organización), así que no hay ningún caso real donde el segmento estorbe. | URL más larga (dos segmentos dinámicos antes de la sección); cambiar de edificio implica navegar a una URL distinta, no solo actualizar estado. |
| **Query param** (`/admin/[orgId]/cobros?edificio=...`) | Un nivel menos de anidamiento. | Sin la misma garantía automática: si algún link interno olvida propagar el query param, recargar esa URL específica pierde el edificio elegido — el riesgo depende de que cada `Link` lo incluya siempre, no es gratis. No hay precedente de este patrón en el código ya migrado (Residente usó segmento, no query param, para `unidadId`). |
| **Estado en memoria** (como hoy) | Ninguno relevante — es el comportamiento que ya se decidió corregir en Residente. | Reproduce el bug ya conocido: recargar pierde la sección y el edificio; el botón atrás no hace nada. |

**Recomendación:** segmento de URL, por consistencia con el precedente ya
validado y porque las 8 secciones dependen del edificio sin excepción.

### La Ficha de unidad (drawer)

Hoy es un panel superpuesto controlado por estado (`fichaDe`, línea 876),
no una navegación real — abrirlo no cambia la URL. Con el mismo criterio
de "recarga funciona", debería ser una subruta
(`/admin/[orgId]/[edificioId]/propietarios/[unidadId]`) que Next.js puede
mostrar como panel lateral con
[Parallel Routes / rutas interceptoras](../node_modules/next/dist/docs/)
si se quiere conservar la sensación de drawer sin perder deep-linking —
revisar la documentación de Next 16 sobre este patrón antes de implementar
(alineado con la nota de `AGENTS.md` sobre leer la documentación local
antes de escribir código nuevo).

---

## 3. Roles

Roles válidos confirmados por el `CHECK` de `membresias` (comentario en
`supabase/migrations/20260926120000_membresias_multiples_por_organizacion.sql:11-12`):
`propietario_cuenta`, `administrador`, `contador`, `junta`, `residente`,
`vigilante`. `membresia_alcance` clasifica cada uno: `residente` → unidad;
`junta`/`vigilante` → edificio; el resto (`propietario_cuenta`,
`administrador`, `contador`) → organización completa.

### Hallazgo importante: `app.html` no distingue roles en el cliente

Búsqueda exhaustiva: `app.html` **no llama** a `tiene_rol`, `es_operador`
ni `puede_operar` en ningún lado (cero resultados). Todo el acceso se
resuelve por RLS al leer `organizaciones`/`edificios`/`unidades`/etc. — si
la fila es visible, `app.html` la muestra, sin ningún filtro de UI por rol.
Esto significa que **cualquier persona con una membresía visible en un
edificio** (sea `propietario_cuenta`, `administrador`, `contador` o
`junta`) ve exactamente la misma consola completa, con los mismos botones
de escritura habilitados — no hay una vista reducida para contador o
junta en el código del frontend.

**No se pudo confirmar desde el código estático si esto es intencional o
si la protección real vive del lado de la base** (por ejemplo, que las
funciones `SECURITY DEFINER` que invocan las acciones de escritura
rechacen a un `contador`/`junta` aunque el botón esté visible, o que
`edificios_visibles()`/`unidades_visibles()` ya filtren qué edificios ve
cada rol). Las definiciones SQL de esas funciones no están en este
repositorio (viven en Supabase). **Esto hay que verificarlo antes de
diseñar el gate de `proxy.ts` para Admin** — con una cuenta de prueba real
de rol `contador` o `junta`, no solo por lectura de código.

### Qué rol puede/debería ver qué (propuesta, sujeta a la verificación de arriba)

| Rol | Alcance de membresía | Uso esperado de Admin | Secciones |
|---|---|---|---|
| `propietario_cuenta` | organización | control total, incluida Ajustes/Accesos | las 8 |
| `administrador` | organización | operación diaria completa | las 8 |
| `contador` | organización | mirar y exportar, no gestionar accesos | dudoso si debería tener escritura en Cobros/CierreMes/Pagos o solo lectura + Cortes (exportar) — **decisión de producto pendiente, no de código** |
| `junta` | edificio | supervisión, probablemente sin escritura | dudoso si debería ver Ajustes/Accesos — **misma pendiente** |

`vigilante` (alcance edificio) no aparece en la lista de roles que el
usuario pidió comparar — por su semántica (control de acceso físico) no
parece un rol de Admin; no se encontró ninguna referencia a "vigilante" en
`app.html`, así que probablemente no tiene UI propia todavía en ningún
HTML.

### `proxy.ts` — qué cambia

Hoy (`proxy.ts:18-27`) `/admin/*` solo tiene gate de sesión, documentado
explícitamente como pendiente hasta que exista una estructura de URL con
`orgId`. Con `/admin/[orgId]/...` ya resuelto (sección 2), `proxy.ts` puede
agregar:

```
tiene_rol(p_org: orgId, p_roles: ["propietario_cuenta","administrador","contador","junta"])
```

para bloquear a quien no tiene ninguna de esas membresías en `orgId`
(cae al mismo patrón fail-closed que ya usa el gate de `/operador/*`,
líneas 64-81 de `proxy.ts`). Eso cubre "quién entra a `/admin/[orgId]` en
absoluto" — pero **no** puede diferenciar dentro de Admin qué ve un
`contador` vs. un `administrador` (proxy.ts no sabe de secciones). Si la
tabla de arriba termina pidiendo un contador con menos acceso que un
administrador, ese gate por sección tiene que vivir en cada Server
Component de la sección (mismo patrón que ya usa `/operador` como defensa
en profundidad, ver nota en `docs/estado-migracion.md`/Fase 4/Operador).

---

## 4. Acciones de escritura

Formato igual al usado para Operador en `docs/estado-migracion.md`. 🔴 =
irreversible desde la app (no hay acción inversa en la UI). 🌐 = alcance
global (afecta a organizaciones que no son la que está abierta).

| # | Acción | RPC / tabla | Parámetros | Línea | Idempotencia | Alcance |
|---|---|---|---|---|---|---|
| 1 | Alta de unidad | insert `unidades`+`personas`+`vinculos` | código, alícuota, datos del propietario | 1576–1598 | no — cada envío crea fila nueva | unidad |
| 2 | Importar unidades (csv) | insert `unidades`+`personas`+`vinculos` (lote) | filas parseadas | 1691–1712 | no | edificio |
| 3 | Importar saldos iniciales | update `unidades.saldo_inicial` (lote) | mapa código→monto | 1847–1852 | sí — vuelve a poner el mismo valor si se repite | edificio |
| 4 | Editar datos de unidad/propietario | insert `personas`/`vinculos`, update `unidades` | ficha completa | 2173–2192 | parcial (el update sí; el insert de persona nueva no) | unidad |
| 5 | Editar concepto de cobro | update `conceptos_cobro` | campo cambiado | 2277 | sí | edificio |
| 6 | Agregar concepto de cobro | insert `conceptos_cobro` | nombre/bolsillo/modo/monto/iva | 2283–2286 | no | edificio |
| 7 | Eliminar concepto de cobro | delete `conceptos_cobro` | id | 2292 | sí (delete) | edificio |
| 8 | Abrir período | rpc `abrir_periodo` | edificio | 2495 | no (crea el período) | edificio |
| 9 | Descartar período recién abierto | rpc `descartar_periodo` | periodo | 2509 | — es la reversa de #8 | edificio |
| 10 | Editar configuración del período abierto | update `periodos` | fecha, presupuesto | 2517 | sí | edificio |
| 11 | Agregar gasto | insert `gastos` | concepto/monto/categoría | 2532 | no | edificio |
| 12 | Eliminar gasto | delete `gastos` | id | 2545 | sí | edificio |
| 13 | Reordenar gasto | rpc `mover_gasto` | id, dirección | 2551 | sí | edificio |
| 14 | **Reabrir período cerrado** | rpc `reabrir_periodo` | periodo | 2561 | — reversa de #16, pero ver nota abajo | edificio |
| 15 | Editar gasto | update `gastos` | campos | 2577 | sí | edificio |
| 16 | **Cerrar el mes** | rpc `cerrar_periodo` | periodo | 2651 | no — genera recibos/snapshot | edificio 🔴* |
| 17 | Registrar pago | insert `pagos` | unidad/monto/método/comprobante | 3203 | no | unidad |
| 18 | Editar pago | update `pagos` | campos | 3223 | sí | unidad |
| 19 | Registrar exoneración/ajuste | insert `ajustes` | unidad/monto/motivo | 3233 | no | unidad |
| 20 | Conciliar pago (uno o por lote) | update `pagos.estado='conciliado'` | id(s) | 3223, 3290 | sí | unidad |
| 21 | Purgar comprobantes vencidos | storage.remove + rpc `marcar_comprobante_borrado` | rutas/ids | 3163–3165 | sí (repetir no hace nada nuevo) | edificio 🔴 (borra el archivo para siempre, según el comentario en 3155-3157) |
| 22 | **Completar tasa BCV de una fecha** | rpc `completar_tasa` | fecha, tasa | 3185 | sí (mismo valor) | 🌐 **global** — `p_fecha` sin `p_org`, misma tabla que usa Operador (ver `docs/estado-migracion.md`/Fase 5, bug de `traer_tasa_bcv`) |
| 23 | Invitar residente | rpc `crear_invitacion` | correo/unidad/relación, `p_rol` fijo en `"residente"` | 3721–3723 | no (cada llamada crea una invitación) | unidad |
| 24 | Revocar invitación | rpc `revocar_invitacion` | id | 3732 | sí | invitación |
| 25 | Cambiar visibilidad de saldo del inquilino | update `unidades.inquilino_ve` | nivel | 3738–3739 | sí | unidad |
| 26 | Dar de baja un acceso | update `membresias.activo=false` | id | 3746 | sí | membresía — sin botón de reactivar en esta pantalla |
| 27 | Guardar nota de correo del edificio | update/delete `ajustes_correo` | mensaje | 4198 | sí | edificio |
| 28 | Encolar recibos para envío | rpc `encolar_recibos` | periodo | 4214 | **sí, explícito** — la propia función devuelve `ya_estaban` (línea 4228) para los que ya se habían encolado | edificio |
| 29 | **Despachar cola de correo ahora** | rpc `despachar_ahora` | ninguno | 4218, 4258, 4531 (3 botones distintos llaman a la misma función) | sí (vacía la cola; repetir con la cola vacía no hace nada) | 🌐 **global** — sin parámetro de organización, despacha la cola completa del sistema, no solo la de este edificio |
| 30 | Encolar un envío de prueba | rpc `encolar_prueba` | recibo, correo destino | 4255 | no | recibo |
| 31 | Marcar/desmarcar período como enviado | rpc `marcar_enviado` | periodo, booleano | 4330 | sí (toggle) | edificio |
| 32 | Guardar logo de la organización | update `organizaciones.logo_url` | data-URL base64 | 4856 | sí | organización |
| 33 | Editar configuración de edificio | update `edificios` | prefijo/mora/tolerancias/dirección | 4926 | sí | edificio |
| 34 | Agregar categoría | insert `categorias` | nombre | 4943, 5010 | no | edificio |
| 35 | Agregar partida fija (una o en lote al crear categoría) | insert `partidas_fijas` | concepto/monto | 5034, 5047 | no | edificio |
| 36 | Editar partida fija | update `partidas_fijas` | campos | 5061 | sí | edificio |
| 37 | Eliminar partida fija | delete `partidas_fijas` | id | 5067 | sí | edificio |
| 38 | **Crear edificio nuevo** | insert `edificios` | nombre/prefijo/mora/tolerancia | 5263 | no | organización 🔴 — no existe ninguna acción de borrar edificio en `app.html` |

**\* Nota sobre #16 (cerrar el mes):** técnicamente no es irreversible —
existe `reabrir_periodo` (#14) como reversa explícita, y `app.html` avisa
que reabrir "pide confirmación aparte" cuando el período ya se marcó como
enviado (línea 4333). Se marca con 🔴 en la tabla de todos modos porque
reabrir un mes **después de que sus recibos salieron por correo** no
deshace los correos ya enviados — la reversa existe en la base de datos
pero no en el mundo real una vez que un propietario ya leyó su recibo. Es
la acción de mayor riesgo real de todo Admin, no solo la de mayor "peso"
técnico.

**Otras notas de alcance global, ya conocidas por Fase 4/Operador y Fase
5:** #22 y #29 confirman, del lado de Admin, la misma regla que ya está
escrita en `docs/estado-migracion.md` ("Regla mientras haya una sola base
de datos compartida: nada de... acciones de alcance global... sin
coordinarlo antes con el socio") — cualquier prueba de estas dos acciones
durante la validación de Admin afecta a **todas** las organizaciones de la
base compartida, incluida la que está usando el socio comercial.

---

## 5. Búsquedas específicas

### a. `defaultValue` sobre datos que llegan de forma asíncrona

Se encontró `defaultValue` en 4 puntos: `Cobros` (2352, 2358 — monto/iva
del concepto), `CierreMes` (2856–2924, dos veces por fila de gasto — común
y directo), `Ajustes` (5132–5138, partidas fijas). **Ninguno reproduce el
bug exacto de "Cobro dentro del recibo" de Operador** (`FichaCliente.tsx`,
donde `servicio` empezaba `null`/`undefined` y llegaba async *después* de
que ese input ya había montado con esa misma key). Acá las listas
(`conceptos`, `gastos`, `partidas_fijas`) ya están cargadas por el
componente padre antes de que estas filas se dibujen por primera vez — no
hay una fila que monte antes de tener dato real.

Los 4 puntos sí comparten un riesgo distinto y menor: cada fila usa
`key={id}` estable, así que si `recargar()` trae un valor nuevo para esa
misma fila (por ejemplo, otro administrador editó el mismo concepto en
paralelo) React reutiliza el nodo del input y el `defaultValue` no se
resincroniza — el campo se queda mostrando el valor viejo hasta que se
recargue la página entera. Los 4 casos ya tienen la guardia
`onBlur`-compara-antes-de-escribir (mismo patrón que el fix #2 de
Operador), así que salir del campo sin tocarlo no sobrescribe nada — el
riesgo es solo de visualización desincronizada entre dos sesiones
concurrentes, no de pérdida de datos.

### b. Lógica de `suscripciones.estado` / bloqueo por suscripción cancelada

**Ninguna.** Búsqueda de `suscripcion`/`cancelad` en `app.html`: cero
resultados. Coincide con lo ya anotado en `docs/estado-migracion.md`
(Fase 4/entorno de pruebas de Admin): "`modulo_activo` no consulta
suscripciones" — confirmado también para Admin, no solo para Operador.
Ninguna pantalla de `app.html` lee ni bloquea nada por el estado de la
suscripción de la organización.

### c. Cómo se acepta una invitación en los HTML originales

El flujo completo está partido entre dos archivos, no en uno solo:

1. **`app.html:3717–3729`** (`Accesos`, función `invitar`) — el
   administrador llama a `crear_invitacion` (`p_rol` fijo en
   `"residente"`, `p_edificio: null` siempre) y recibe un **token** que se
   muestra en pantalla para copiar/compartir a mano (`setCodigo`, línea
   3726) — no hay envío de correo automático de la invitación en sí (el
   correo automatizado es el de los recibos, sección Cortes; la invitación
   se comparte manualmente).
2. **`residente.html:380`** — quien recibe el código lo pega en una
   pantalla propia de `residente.html` que llama a
   `sb.rpc("aceptar_invitacion", { p_token: cod.trim() })`. El componente
   ya migrado y equivalente es `components/residente/Invitacion.tsx:26`
   (mismo RPC, mismo parámetro `p_token`) — **existe pero está
   deliberadamente sin punto de entrada** (ver
   `docs/estado-migracion.md`, "Fase 5 — Registro de residentes").

Para la prueba funcional pendiente de los casos 8/9/10 de
`docs/casos-de-uso-mejorados.md` hace falta habilitar temporalmente ese
punto de entrada (o probar `aceptar_invitacion` directo por RPC/SQL) — la
migración de Admin por sí sola no lo resuelve, porque el lado que **acepta**
la invitación vive en el módulo Residente, no en Admin.

### d. Qué lee o escribe `pagos.documento_origen`

- **Escribe:** solo `app.html:3209`
  (``documento_origen: (PIDE[f.metodo] || {}).documento ? f.documento.trim() : null``),
  con `f.documento` como texto libre (`<Entrada>` sin máscara, líneas
  3378–3379) — sin el patrón `tipo` + `número` con guion que sí tiene la
  versión migrada de Residente
  (`FormularioReportarPago.tsx:209`, `` `${documentoTipo}-${documentoNumero}` ``).
  Esto confirma directamente el pendiente ya anotado en
  `docs/estado-migracion.md` ("Admin es el único módulo que falta y que
  muestra/concilia pagos individuales").
- **Lee:** el `select` de `pagos` en `Ficha` (1991) y en `Pagos` (3117)
  incluye `documento_origen` para mostrarlo en tabla — la conciliación por
  lote (`cruce`, líneas 3265–3285) **no** lo usa para cruzar contra el
  extracto bancario, solo usa `referencia`. No se encontró ninguna lógica
  que dependa del formato exacto de `documento_origen` (ni validación, ni
  comparación) — es un campo de exhibición en Admin, no de cómputo. Esto
  simplifica la unificación pendiente: normalizar el formato al escribir
  no rompe ninguna lectura existente.
- **Nota para no confundir:** `personas.documento` (cédula/RIF del
  propietario/inquilino, líneas 1632–1633, 2209–2210) es un campo
  **distinto y sin relación** — también texto libre, pero no es el mismo
  dato ni tiene el mismo pendiente de formato.

### e. Formato de la alícuota en `residente.html`

Confirmado: **`residente.html` también usa cuatro decimales**, mismo
patrón `nf(4).format(...)` que `app.html` — líneas 472, 586 y 803 de
`residente.html`. `app.html` hace lo mismo en la ficha de unidad (línea
2036, vía `pct()`) y en el estado de cuenta impreso (línea 1956,
`nf(4).format(unidad.alicuota || 0)`). **Ya se corrigió
`docs/estado-migracion.md`** con este hallazgo — no es un redondeo que la
migración de Residente introdujo por error, es fiel a ambos originales.

### f. Comparaciones de saldo contra cero/umbral en vez de usar `estado` o `UMBRAL_SALDO`

`saldos_actuales` ya trae una columna `estado` calculada por la base
(seleccionada en `App()`, línea 936: `"...,total,estado"`). Solo **un**
lugar de `app.html` la usa: el widget `Edificio` (619–689, líneas 627 y
635, para colorear los bloques de unidades y contar
al_dia/debe/a_favor). El resto de `app.html` **ignora esa columna** y
recalcula la clasificación a mano, con umbrales que ni siquiera son
consistentes entre sí:

| Dónde | Umbral usado | Coincide con `UMBRAL_SALDO` (0.009, `lib/estados-unidad.ts`) |
|---|---|---|
| `Edificio` (627, 635) | usa `estado` de la vista — no recalcula | — (es la referencia correcta) |
| Inicio, `conDeuda` (993) | `> 0.01` | no |
| Propietarios, `morosos` (1362) | `> 0.01` | no |
| Propietarios, filtro deuda/al día/a favor (1470–1472) | `> 0.01` / `<= 0.01` / `< -0.01` | no |
| Ficha, pastilla y tarjeta de total (2031–2032, 2057) | `> 0.01` / `< -0.01` | no |
| `imprimirEstado` (1962–1963) | `> 0.009` / `< -0.009` | **sí** |
| `Edificio`, etiqueta "al día" bajo cada bloque (650) | `< 0.01` (solo cosmético, no cambia el color) | no, pero de bajo impacto |

Conclusión: hay **tres criterios distintos convivendo en el mismo archivo
original** (la vista vía `estado`, el literal `0.01`, y el literal
`0.009`), y solo uno de los dos literales coincide con la constante que ya
se fijó en el código migrado. Es una inconsistencia real del `app.html`
original, no algo que la migración de Residente haya introducido — vale
la pena decidir, al migrar cada pantalla, si se unifica todo contra
`UMBRAL_SALDO`/`estado` (recomendado, ya es la fuente de verdad que usa la
base) o si se documenta como comportamiento a preservar caso por caso.

### g. Uso de `mis_modulos`/`modulo_activo` para mostrar u ocultar secciones

**Ninguno.** Cero referencias a `modulo_activo` o `mis_modulos` en
`app.html`, `residente.html` ni `operador.html` — ambas funciones existen
en la base (`types/supabase.ts:2033,2061`) pero ningún HTML original las
llama. Ninguna sección de Admin se oculta o muestra en función de módulos
contratados; las 8 secciones del menú son siempre las mismas para
cualquiera que entre.

---

## 6. Plan de corte en dos sesiones

Línea de corte por función (ver mapa de la sección 1), no por línea exacta
de archivo — cada sesión se lleva funciones completas.

### Sesión 1 — el núcleo contable (~1.795 líneas de `app.html`: 1292–3087)

**Orden:** Inicio → Propietarios (+ AltaUnidad, ImportarUnidades,
ImportarSaldos, Ficha, DatosUnidad) → Cobros → Cierre del mes.

Razón del orden: es la cadena de dependencia real del negocio — hace falta
tener unidades (Propietarios) antes de poder ver saldos con sentido
(Inicio), hace falta tener cobros definidos (Cobros) antes de poder cerrar
un mes (CierreMes) con esos cobros. Es también el bloque de mayor riesgo
de la fase completa: `cerrar_periodo`/`reabrir_periodo` (acción #16/#14 de
la sección 4) y los 5 componentes hijos de Propietarios (el de más piezas
sueltas de toda Admin).

**Antes de escribir código de esta sesión:** construir los componentes
compartidos que le hacen falta a *todo* Admin, no solo a esta sesión —
`Aviso`/`Vacio`/`Cargando`/`Flechas`/`Confirmar` en `components/ui/` (ver
sección 1) — para no tener que volver a tocarlos en la Sesión 2.

**Punto de validación al cierre de la Sesión 1:** con la cuenta
`admin.prueba@vecitap.com` sobre Administradora Baja (ya preparada, ver
`docs/estado-migracion.md`) — build+lint limpios, alta/importación de
unidades, definición de cobros, y un ciclo completo abrir→cerrar un
período de prueba (sin enviar recibos todavía, eso es Sesión 2) comparado
campo a campo contra `app.html`. Sin este punto de validación no conviene
arrancar la Sesión 2, porque Pagos/Cortes de la Sesión 2 dependen de tener
períodos y conceptos reales para probar contra.

### Sesión 2 — operación y cierre administrativo (~2.231 líneas: 3088–5318)

**Orden:** Pagos → Accesos → Cortes de cuenta → Ajustes (+ LogoOrg,
NuevoEdificio).

Razón del orden: Pagos y Cortes dependen de que ya exista al menos un
período cerrado (de la Sesión 1) para tener algo real que conciliar y
enviar; Accesos es independiente de lo anterior así que puede ir en
cualquier momento de esta sesión sin bloquear nada; Ajustes queda al final
porque toca configuración de bajo tráfico (logo, categorías, partidas) que
no bloquea probar el resto.

**Cuidado especial de esta sesión:** las dos acciones de alcance global
(#22 `completar_tasa`, #29 `despachar_ahora`, sección 4) están en Pagos y
Cortes — coordinar con el socio comercial antes de ejecutarlas de verdad
durante la validación manual, igual que ya se hizo para las pruebas de
escritura de Operador.

**Punto de validación al cierre de la Sesión 2:** ciclo completo
registrar pago → conciliar → cerrar período (repitiendo el cierre de la
Sesión 1 ya con pagos reales) → encolar y enviar recibos de prueba (nunca
a destinatarios reales) → invitar y dar de baja un acceso, todo contra
Administradora Baja. Cierra la Fase 4 completa si este punto y el de la
Sesión 1 pasan.

### Estimación

Sin precedente a esta escala dentro del proyecto — Residente+Operador
juntos fueron 918 líneas y tomaron del orden de 1 a 3 días cada uno según
el historial de commits; Admin son 5.318 líneas (~5,8×). Cualquier número
de horas sería una falsa precisión. Lo que sí se puede afirmar con la
información disponible: la Sesión 1 y la Sesión 2 son de tamaño
comparable en líneas (1.795 vs. 2.231), pero la Sesión 1 concentra más
piezas movibles (5 componentes hijos en Propietarios, la acción de mayor
riesgo de toda la fase) — no conviene asumir que por tener menos líneas es
la sesión más corta.

---

## Preguntas abiertas para Nicolás (no se pueden cerrar solo con lectura de código)

1. **Roles (sección 3):** ¿`contador` y `junta` deberían ver Admin
   completo (como hoy en `app.html`, sin distinción) o una versión
   reducida? Si es reducida, ¿por sección o por acción de escritura?
2. **Roles (sección 3):** confirmar con una cuenta de prueba real qué ve
   hoy alguien con membresía `contador`/`junta` en Administradora Baja
   antes de decidir el gate de `proxy.ts` — el código de `app.html` no lo
   define, la respuesta puede estar solo en RLS/funciones de la base.
   Complementa la Nota 9 pendiente de confirmación en
   `docs/casos-de-uso-mejorados.md`.
3. **Umbral de saldo (sección 5f):** ¿unificar Inicio/Propietarios/Ficha
   contra `UMBRAL_SALDO`/`estado` (cambia ligeramente qué unidades cuentan
   como "con deuda" en el rango 0,009–0,01) o preservar el comportamiento
   exacto del original pantalla por pantalla?
4. **Formato de la alícuota (ya en `docs/estado-migracion.md`):** ahora
   confirmado que ambos HTML originales usan 4 decimales — ¿se mantiene
   así en la migración o se redondea?
