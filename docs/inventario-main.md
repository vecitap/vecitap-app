# Inventario de `main` → app Next.js

Referencia funcional de la Fase 4 **a partir de este documento**: los cuatro HTML
de la rama `main` tal como están hoy (`admin.html` 6.093 líneas, `index.html`
1.774, `garita.html` 1.021, `operador.html` 1.174). Gustavo ya los probó a fondo;
la app Next tiene que hacer **exactamente lo mismo**, con la estructura modular
del proyecto.

Este archivo se actualiza al cerrar cada bloque de implementación. Reemplaza a
`docs/inventario-admin.md` como referencia viva — ese otro se dejó tal cual
porque es el registro de cómo se cortó la Sesión 1/2 de Admin, pero **está
basado en una versión vieja de `app.html` (5.318 líneas, 09-sep)**; el socio
subió ~775 líneas más entre el 09-sep y el 22-sep que ese inventario no vio.

## Por qué hay tanto "falta" en módulos ya validados

| Módulo | HTML que se migró | HTML de `main` hoy | Diferencia |
|---|---|---|---|
| Residente | `residente.html` 1.159 líneas (09-sep) | `index.html` 1.774 | +615 |
| Operador | `operador.html` 918 líneas (07-sep) | `operador.html` 1.174 | +256 |
| Admin | `app.html` 5.318 (inventario) / 6.093 (construcción) | `admin.html` 6.093 | — |
| Garita | no existía | `garita.html` 1.021 | módulo nuevo completo |

"Residente VALIDADO" y "Operador VALIDADO" en `docs/estado-migracion.md` siguen
siendo ciertos **contra el HTML que se migró**, no contra `main` de hoy.

## Leyenda

- **ya está** — portado y equivalente a `main`.
- **distinta** — portado pero se comporta distinto a `main`; hay que igualarlo.
- **falta** — sin portar.
- 🔴 irreversible desde la app · 🌐 alcance global (afecta a otras organizaciones)

---

## 1. Admin (`admin.html`)

### 1.1 Armazón, sesión y navegación

| Pieza | `admin.html` | Estado | Qué falta / qué cambia |
|---|---|---|---|
| Conexión manual a Supabase (`Conexion`, `CONFIG` editable) | 743–777 | **no se porta** | Obsoleto por arquitectura: variables de entorno (criterio 4). |
| Login propio (`Entrar`) | 793–880 | **ya está** (bloque 5) | `/entrar` compartido, con clave mínima de 8, "Olvidé mi contraseña" y campo con ojo (`components/ui/CampoClave.tsx`). |
| Clave nueva tras el correo de recuperación (`ClaveNueva`) | 881–927 | **ya está** (bloque 5) | Es un modo de `/entrar`: detecta `type=recovery` en el hash y `PASSWORD_RECOVERY`, y no tiene más salida que poner la clave o cerrar sesión. Sirve a los tres roles. |
| Elegir/crear administradora (`Organizaciones`) | 928–981 | **distinta** | `app/(admin)/admin/page.tsx` + `CrearOrganizacion.tsx` cubren el caso. Falta la lista de varias organizaciones como pastillas para elegir cuando hay más de una (hoy se listan como enlaces). |
| Selector de edificio en el lateral | 1339–1350 | **ya está** (bloque 5) | `<select>` dentro de la columna lateral, siempre visible, con los colores propios que necesita sobre fondo oscuro. |
| Columna lateral oscura (244 px, `--lat-*`, menú + tema + salir + logo) | 1310–1408 | **ya está** (bloque 5) | `components/admin/MarcoAdmin.tsx` + estilos `.admin-*` en `ui.css`, con hamburguesa y velo en ≤900 px. |
| Menú: Inicio · Propietarios · Cobros · Cierre del mes · **Pagos** · **Cortes de cuenta** · **Estadísticas** · Accesos, y abajo **Ajustes** | 1188–1199 | **ya está** (bloque 5) | Las 9 entradas, con Ajustes al pie del lateral. |
| Gate por módulo contratado (`mis_modulos`, `hayModulo`) | 1027–1047 | **ya está** (bloque 5) | `cortes` y `estadisticas` se esconden si el módulo está apagado; si la consulta falla no se esconde nada; estar parado en una sección apagada devuelve a Inicio. Accesos usa el mismo dato para la pestaña Vigilantes. |
| Tasa BCV en el encabezado (`tasa_atrasada` + respaldo DolarAPI) | 1148–1216, 1442–1470 | **ya está** (bloque 5) | Valor, fuente, fecha, "atrasada N días" en rojo si `dias > 2` y botón de refrescar (`lib/tasa.ts`). Ficha y Cortes la piden por su cuenta del lado del servidor. |
| Aviso global (`notificar`/`fallo`, autocierre 3,6 s) | 1052–1058 | **distinta** | Hoy cada componente tiene su propio `Aviso` local y no se autocierra. |
| Cambio de tema y "Salir" en el lateral | 1382–1400 | **ya está** (bloque 5) | Los dos al pie del lateral, con el logotipo de Vecitap en crema. |

### 1.2 Pantallas

| Pantalla | `admin.html` | Estado | Detalle |
|---|---|---|---|
| **Inicio** | 1549–1648 | **ya está** (bloque 6) | `conDeuda` y `morosos` vuelven al literal `> 0.01` de main. La métrica "Mes abierto" es un `<Link>` en vez de un `onClick` — equivalente. Falta el ícono (caso 13). |
| **Propietarios** (lista) | 1650–1766 | **ya está** (bloque 6) | Filtros, color del saldo y alícuota (`nf(5)` sin `%`) vuelven a lo de main. |
| Alta de unidad (`AltaUnidad`) | 1768–1854 | ya está | Verificar campo a campo al revertir umbrales. |
| Importar unidades (`ImportarUnidades`) | 1856–1987 | ya está | — |
| Cargar saldos (`ImportarSaldos`) | 1989–2123 | **ya está** (bloque 6) | Lee Excel, CSV y PDF como main. El CSV va sin librería; Excel con `xlsx` 0.20.3 (desde cdn.sheetjs.com) y PDF con `pdfjs-dist`, los dos por importación diferida. Ver casos 14, 23 y 24. |
| Ficha de unidad (`Ficha`) | 2178–2332 | **ya está** (bloque 6) | Pastilla y tarjeta "Total" vuelven a los literales de main. La tasa ya le llegaba desde el Server Component, así que el estado de cuenta impreso sale con el equivalente en Bs. En main es un drawer; acá es subruta — decisión de ruteo ya tomada, se mantiene. |
| Datos de la unidad (`DatosUnidad`) | 2334–2470 | ya está | — |
| Estado de cuenta imprimible (`imprimirEstado`) | 2125–2176 | ya está | Colores nuevos y tasa. El umbral `0.009` es el mismo que main. |
| **Cobros** | 2472–2634 | ya está | — |
| **Cierre del mes** | 2636–3280 | ya está | Pantalla de mayor riesgo (`cerrar_periodo`). Revisar al final campo a campo. |
| **Pagos** | 3289–3897 | **ya está** (bloque 1) | 3 pestañas (Registrar · Conciliar con el banco · Exoneraciones) + tabla de movimientos con filtros + visor de comprobante + purga de comprobantes vencidos. Detalle en 1.3. |
| **Accesos** | 3899–4252 | **ya está** (bloque 5) | Las cuatro pestañas, incluida Vigilantes (solo con el módulo `garita`). Los dos enlaces de los mensajes copiados (`/entrar?volver=/mi` y `/garita`) son **equivalencias de arquitectura**, se mantienen — casos 20 y 25. |
| **Cortes de cuenta** | 4918–5617 | **ya está** (bloque 2) | Detalle en 1.4. |
| **Estadísticas** | 4596–4916 | **ya está** (bloque 3) | Detalle en 1.5. La pestaña se esconde por módulo en el bloque 5. |
| **Ajustes** (+ `LogoOrg`) | 5619–6031 | **ya está** (bloque 4) | Detalle en 1.6. |
| `NuevoEdificio` | 6033–6091 | **ya está** (bloque 4) | Volvió a su lugar de main: se abre desde el encabezado de "Datos del edificio" en Ajustes (caso 21 revertido). |
| `Edificio` (cuadrícula de unidades) | 663–741 | ya está | main también usa `estado` acá — no hay nada que revertir. |
| `PrimerEdificio` | 1493–1547 | ya está | — |

### 1.3 Pagos — desglose

**Lee:** `pagos` del edificio (`.in("unidad_id", ids)`, límite 300, orden fecha desc),
`bancos` activos por `orden`, `comprobantes` por lote de unidades (límite 500),
`comprobantes_caducados()`, `tasa_de_esa_fecha(p_fecha)`, URL firmada de
`storage.comprobantes` (120 s).

Pestaña **Registrar** (`PIDE` decide qué campos se piden por método):
unidad · fecha · moneda (USD/VES) · monto · **tasa del BCV de esa fecha** (solo
VES, de solo lectura, con el texto de ayuda según `propia`/heredada/ausente) ·
método (`METODOS`: Pago móvil, Transferencia, Zelle, Punto de venta, Efectivo…) ·
abona a (condominio/honorarios/servicio) · referencia · banco de origen ·
teléfono de origen · cédula o RIF · correo de origen. Con VES + monto + tasa
muestra el equivalente en USD y la explicación de por qué se usa la tasa del día
del pago. Si no hay tasa **propia** de esa fecha, aparece el recuadro para
cargarla (`completar_tasa`). `monto_usd: 0` y `tasa_aplicada` los calcula la base
a propósito — el navegador no decide cuánto vale un pago.

Pestaña **Conciliar con el banco**: archivo `.xlsx/.xls/.csv/.pdf`, detección
automática de columnas (`PISTAS`/`detectarColumnas`) con corrección a mano,
cruce por referencia (`a === b || a.endsWith(b) || b.endsWith(a)`), tolerancia de
monto `max(1, monto × 1%)`, tres grupos (Cuadran / Monto distinto / Del banco sin
pago reportado) y conciliación en lote.

Pestaña **Exoneraciones**: unidad · monto (positivo baja la deuda) · aplica a ·
motivo obligatorio → `insert ajustes`.

Tabla de movimientos: filtros reportado/conciliado/anulado/todos; columnas
Fecha · Unidad · Método (con Bs y tasa si VES) · Ref. · Origen (banco, teléfono,
correo, botón "ver comprobante") · Abona a · USD · Estado (+ "· en cierre") ·
acciones (Conciliar / Anular; nada si ya está en un cierre).

Visor de comprobante: imagen o `<iframe>` según `tipo`, más la huella `sha256` y
la explicación de para qué sirve.

Acciones de escritura:

| # | Acción | Cómo | Notas |
|---|---|---|---|
| P1 | Registrar pago | `insert pagos` (estado `reportado`) | — |
| P2 | Conciliar / anular un pago | `update pagos` (`conciliado_en` al conciliar) | — |
| P3 | Conciliar en lote | `update pagos` fila por fila | — |
| P4 | Registrar exoneración | `insert ajustes` | 🔴 |
| P5 | Completar la tasa de una fecha | `completar_tasa(p_fecha, p_tasa)` | 🌐 **global** — NO ejecutar sin coordinar |
| P6 | Purgar comprobantes vencidos | `storage.remove` + `marcar_comprobante_borrado` | 🔴 borra el archivo para siempre |

### 1.4 Cortes de cuenta — desglose

**Lee:** `recibos` del período cerrado elegido, `resumen_correos(p_org)`,
`ajustes_correo` (nota de la administradora), y `correo_recibo(p_recibo)` para la
vista previa (es lectura pese al nombre: devuelve el correo armado por la base).

Piezas: selector de mes (solo cerrados) · **Listado en PDF** · **CSV** ·
**Imprimir los N recibos** (un documento, uno por página) · **Probar el correo**
(vista previa real + envío a un correo propio) · **Enviar por correo** (con
`Confirmar`) · marcar/desmarcar "enviados" · panel de la cola (enviados / en cola
/ fallidos / rebotados / último envío + "Enviar ahora los pendientes") · nota de
la administradora con fecha de caducidad · plantilla de **WhatsApp** editable
(guardada en `localStorage` como `vecitap_plantilla`, con los marcadores
`{nombre} {unidad} {periodo} {recibo} {cuota} {anterior} {mora} {total}
{totalBs} {tasa}`) · tabla "A quién se le envía" con botones de WhatsApp y
mailto por persona (propietario e inquilino, respetando `enviar_corte`), vista
previa del recibo y enlace a la Ficha.

`htmlRecibo()` (4282–4518) es la plantilla del recibo en papel. **Usa la tasa de
HOY, no la congelada del período** (caso 17, sin portar), y estampa la fecha de
esa tasa. El pie cambió: "la cifra en bolívares vale para el día que dice
arriba". Es la misma plantilla que `index.html:papelRecibo` — conviene una sola
copia en `lib/`.

| # | Acción | Cómo | Notas |
|---|---|---|---|
| C1 | Guardar/quitar la nota del correo | `upsert ajustes_correo` (`onConflict: org_id`) | — |
| C2 | Encolar recibos | `encolar_recibos(p_periodo)` | idempotente (`ya_estaban`) |
| C3 | Despachar la cola ahora | `despachar_ahora()` | 🌐 **global** — 3 botones llaman a esto |
| C4 | Encolar un envío de prueba | `encolar_prueba(p_recibo, p_destino)` | luego despacha |
| C5 | Marcar/desmarcar mes enviado | `marcar_enviado(p_periodo, p_enviado)` | toggle |

### 1.5 Estadísticas — desglose

Pantalla nueva del socio. **Ningún número se calcula en el cliente**: todo sale
de la base.

**Lee** (en paralelo, y el primer error se muestra tal cual en vez de fingir
"todavía no hay datos"): `estadisticas_periodo(p_periodo)`,
`gastos_por_categoria(p_periodo)`, `top_gastos(p_periodo, p_n: 6)`,
`serie_edificio(p_edificio, p_meses: 12)`, `morosidad_edificio(p_edificio)`.

Piezas: selector de mes cerrado · **Informe para la asamblea** (documento
imprimible propio) · 4 cifras (Gasto del mes vs presupuesto · Facturado +
promedio por unidad · **Cobrado %** con semáforo 80/60 · Deuda al cierre) ·
"En qué se gastó" (barras de un solo color + % + variación contra el mes
anterior) · "Los gastos más grandes" · "Cómo está la morosidad" (tramos con
punto de color y fondo rojo en el tramo 4) · "Los últimos meses"
(`SerieAnual`, barras pareadas facturado/cobrado con leyenda).

Sin escrituras. Se esconde si el módulo `estadisticas` está apagado.

### 1.6 Ajustes — desglose

- **Logo de la administradora** (`LogoOrg`): archivo → `redimensionarLogo()`
  (canvas, 320 px de ancho, PNG) → `update organizaciones.logo_url` con un
  **data-URL base64** (no usa Storage). Vista previa con el nombre de la
  organización.
- **Datos del edificio**: nombre · RIF · prefijo del recibo (se guarda en
  mayúsculas) · interés de mora · tolerancia de alícuotas (vacío → `0,01`) ·
  **perdón de centavos USD** (`tolerancia_redondeo`, por omisión `0,5`) ·
  dirección. Botón "+ Otro edificio" en el encabezado de esta tarjeta.
- **Categorías y partidas fijas**: reordenar categorías (`mover_categoria`) y
  partidas (`mover_partida`), agregar/editar/borrar partidas, agregar categorías
  (acepta varias pegadas, una por línea).
- **Pegar categorías y partidas**: pega desde Excel/Sheets (tab, `;`, `|` o dos
  espacios), la última columna numérica es el monto, una línea sola sin monto es
  una categoría nueva; previa completa con "qué se va a hacer" por fila y
  categoría por omisión para las filas sin categoría.

| # | Acción | Cómo | Notas |
|---|---|---|---|
| A1 | Guardar logo | `update organizaciones.logo_url` | — |
| A2 | Guardar datos del edificio | `update edificios` | — |
| A3 | Agregar categorías | `insert categorias` (lote) | 🔴 |
| A4 | Reordenar categoría / partida | `mover_categoria` / `mover_partida` | — |
| A5 | Agregar / editar / borrar partida fija | `insert`/`update`/`delete partidas_fijas` | — |
| A6 | Carga masiva pegada | `insert categorias` + `insert partidas_fijas` | 🔴 |
| A7 | Crear edificio | `insert edificios` | 🔴 |

---

## 2. Residente (`index.html`)

| Pieza | `index.html` | Estado | Detalle |
|---|---|---|---|
| Conexión manual (`Conexion`) | 362–388 | **no se porta** | Criterio 4. |
| Login (`Entrar`) | 390–479 | **distinta** | Falta: "Olvidé mi clave" (`resetPasswordForEmail`) y el campo de clave con ojo. El botón "No tengo cuenta todavía" (signUp) ya está y coincide con main. |
| Clave nueva tras recuperación (`ClaveNueva`) | 481–528 | **falta** | Igual que en Admin: mínimo 8, repetición, sin salida salvo guardar o salir. |
| Aceptar invitación (`Invitacion`) | 530–573 | ya está | El enlace extra "¿Viene a registrar su administradora?" no está en main (main tiene un archivo por rol): **se mantiene**, es consecuencia de compartir `/entrar` (caso 20). |
| Banda superior oscura (logo crema, "Mi condominio", correo, tema, salir) | 307–333 | **ya está** (bloque 7) | `EncabezadoResidente.tsx`, ahora fuera del contenedor de 640px (franja de ancho completo, igual que main), con los tokens `--lat-*` — sin íconos, ver caso 13 más abajo. |
| Selector de unidad | 344–353 | ya está | — |
| Tarjeta de la unidad (código, relación, alícuota 4 dec, saldo) | 646–675 | **ya está** (bloque 6) | Vuelve a los 2 tonos de main (caso 1). |
| Pestañas: Mi recibo · Reportar un pago · Mis pagos · **Mis visitas** | 678–683 | **ya está** (bloque 7) | `PestanasResidente.tsx` agrega la pestaña "Mis visitas" cuando `mis_modulos(edificio).garita` está activo, igual que `verVisitas` en main. **El enlace todavía lleva a un 404**: la ruta `/mi/[unidadId]/visitas` se construye en el bloque 8 — mismo tipo de pendiente que el enlace `/garita` de Accesos. |
| Recibo en pantalla (`Recibo`) | 1328–1481 | **ya está** (bloque 2) | Portada la **tasa de hoy** (`tasa_atrasada`): main muestra "Si paga hoy" con la tasa viva y solo cae a `tasa_bcv` del recibo si la base no dio ninguna. Cambió también el pie ("cambia todos los días… Si paga mañana, el monto en bolívares será otro"). |
| Recibo en papel (`papelRecibo`) | 1115–1326 | **ya está** (bloque 2) | Unificado en `lib/recibo-papel.ts` con el de Admin (en main el mismo código está dos veces, byte a byte), con la paleta nueva y `tasaHoy`. |
| Reportar un pago (`Reportar`) | 1522–1717 | **ya está** (bloque 6) | Casos 4 y 5 revertidos (un solo campo de texto para cédula/RIF, sin marcas de obligatorio ni scroll). El caso 3 (validación por firma real del archivo) se mantiene: es la excepción de seguridad. |
| Mis pagos (`MisPagos`) | 1719–… | **ya está** (bloque 6) | Se quitó la línea "Su saldo no cambia hasta que se confirme" (caso 2). |
| **Mis visitas** (`Visitas`) | 725–1113 | **falta** | Módulo nuevo completo, ver 2.1. |

### 2.1 Mis visitas — desglose

**Lee:** `invitaciones_visita` de la unidad (límite 20, orden `creada_en` desc),
`mis_visitas(p_unidad, p_limite: 20)`, `vehiculos` de la unidad por placa.

- **Invitar a alguien**: nombre (obligatorio) · hasta cuándo vale
  (`datetime-local`, por omisión **dentro de 2 horas**) · cédula · placa ·
  cuántas entradas (mínimo 1) → `crear_invitacion_visita`.
- **Tarjeta del código**: QR dibujado en el teléfono (`qrcode` por ESM) compuesto
  en un `<canvas>` de 760×1060 con el edificio, la unidad, el nombre, el código
  en letras, el vencimiento, "Muéstrelo en la garita" y el pie "powered by" con
  `logo-claro.png`. Botones: WhatsApp (comparte el archivo si el navegador puede,
  si no abre `wa.me` con el texto), Descargar, Copiar imagen. Si no se puede
  dibujar el QR queda el código en letras grandes. Hace `scrollIntoView` al
  aparecer (bug real que el socio arregló).
- **Invitaciones activas** (activa + no vencida + usos < usos_max): ver el código
  otra vez, anular.
- **Mis vehículos**: lista + alta (placa en mayúsculas, marca, modelo, color,
  puesto) + quitar.
- **Quién ha entrado**: nombre, fecha/hora, placa, "anunciada"/"sin anunciar",
  y "Adentro" o "Salió HH:MM".

| # | Acción | Cómo | Notas | Estado |
|---|---|---|---|---|
| V1 | Crear invitación de visita | `crear_invitacion_visita` | — | ✅ construido (bloque 8) |
| V2 | Anular invitación | `anular_invitacion_visita(p_invitacion)` | 🔴 no hay "des-anular" | ✅ construido (bloque 8) |
| V3 | Agregar vehículo | `insert vehiculos` | — | ✅ construido (bloque 8) |
| V4 | Quitar vehículo | `delete vehiculos` | 🔴 | ✅ construido (bloque 8) |

**Bloque 8, completo.** `app/(residente)/mi/[unidadId]/visitas/page.tsx` gatea
por el módulo `garita` del lado del servidor (`notFound()` si no está
activo) y trae `invitaciones_visita`, `mis_visitas` y `vehiculos` en
paralelo. Las cuatro secciones de main están portadas:
`InvitarVisitas.tsx` (V1/V2), `MisVehiculos.tsx` (V3/V4, con el detalle del
campo único "Marca y modelo" — ver el comentario del componente) y
`QuienHaEntrado.tsx` (lectura). El QR/canvas de la tarjeta vive en
`lib/residente/tarjeta-visita.ts`, con `qrcode` 1.5.4 instalado por npm
(`--save-exact`, misma versión que `main` baja por CDN).

El SQL de `crear_invitacion_visita`/`anular_invitacion_visita` (traído con
la consulta del bloque 8 en `docs/estado-migracion.md`) confirmó reglas que
no estaban en el inventario original y que ahora aplica el cliente:

- `p_hasta` tiene que ser futura y a lo sumo 30 días adelante — lo valida
  la función, el formulario no agrega un `max` al `datetime-local` (igual
  que main, que tampoco lo hace del lado del cliente).
- `p_documento`/`p_placa` se normalizan en la base (mayúsculas, sin
  caracteres raros) y `p_usos` se clampa entre 1 y 50 — el cliente manda el
  valor tal cual lo escribió la persona.
- El código lo genera la base (`gen_random_bytes`), nunca el navegador.
- `anular_invitacion_visita` autoriza por `unidades_visibles()` (mismo
  criterio de RLS que ya filtra qué unidades ve la sesión) o `puede_operar`
  — alcanza con mandarle el id de la invitación, sin repetir el id de la
  unidad.

---

## 3. Operador (`operador.html`)

| Pieza | Estado | Detalle |
|---|---|---|
| Consola, KPIs, morosidad, tasa BCV, cobros automáticos, cartera, CSV | ya está | — |
| Ficha de cliente (6 secciones) | ya está | El campo controlado de "Cobro dentro del recibo" (caso 7) **se mantiene**: riesgo de pérdida de datos. |
| Login | **ya está** — no hace falta código nuevo | Operador **no tiene pantalla de login propia** en el port: `/operador` redirige a `/entrar?volver=/operador` (ese redirect ya existía desde antes del bloque 9). `/entrar` es compartido por los cuatro roles desde el bloque 5 y ya usa `CampoClave` (el campo con ojo) en todas partes — lo que en `operador.html` es un `<input type="password">` pelado, en el port ya es el mismo componente que usan Admin y Residente. Nada que construir acá; era un pendiente que la arquitectura compartida ya había resuelto sin que el inventario lo reflejara. |
| `ClaveNueva` (recuperación) | ya está | Comparte `/entrar`, modo `clave-nueva` — ver el bloque 5. |
| **`PanelModulos`** (709–849) | **ya está** (bloque 9) | Dentro de la ficha del cliente, entre "Suscripción" y "Contacto" (mismo lugar que main): lista de módulos con su nombre y descripción, los de núcleo marcados "siempre incluido" y sin interruptor, los demás con botón Habilitado/Apagado, marca "fijado a mano", bloque de **excepciones por edificio** (mandan sobre la regla general) con "Quitar la excepción", y —solo con 2+ edificios— alta de excepción ("Habilitar solo ahí" / "Apagar solo ahí"). RPCs `modulos_de(p_org)`, `fijar_modulo(p_org, p_clave, p_activo, p_edificio, p_nota)`, `soltar_modulo(p_org, p_clave, p_edificio)` — todas ya estaban tipadas en `types/supabase.ts`. `components/operador/PanelModulos.tsx`. |

---

## 4. Garita (`garita.html`) — módulo nuevo · fundaciones validadas, las 4 vistas faltan

**Se construye como un módulo propio**, igual que Residente, Operador y Admin:
route group en `app/`, componentes en `components/garita/`, lógica en
`lib/garita/`, React/Next y los tokens de `app/globals.css`, dividido en rutas y
componentes. Nunca un solo archivo que replique `garita.html`. Ocupa los bloques
10, 11 y 12.

Que `garita.html` esté escrito en JavaScript pelado es un dato **del original**,
no una instrucción para el port: lo único que se hace con eso es avisarle al
socio que en Next la garita deja de arrancar en el primer segundo en una tableta
vieja. El detalle completo —qué significa eso, el tema propio, los dos roles de
color del veredicto y cómo gatea `proxy.ts`— está en la sección "Ruta de la
garita" de [`docs/estado-migracion.md`](estado-migracion.md).

**Ruta elegida (resuelta el 29-sep):** `/garita/[edificioId]/{entrada,adentro,consultar,bitacora}`,
grupo `app/(garita)/`, con gate sobre `edificioId` en `proxy.ts` contra
`edificios_del_vigilante()` (mismo patrón fail-closed que `/operador` y
`/admin/[orgId]`). **Sin `orgId`**: la verificación de RLS que quedaba pendiente
se hizo con una sesión de vigilante real y dio `edificios_que_ve = 0` — el
vigilante no ve esa tabla, así que el `org_id` no se puede resolver desde el
cliente. Evidencia completa en `estado-migracion.md`, "Ruta de la garita".

| Pieza | `garita.html` | Detalle |
|---|---|---|
| Tema | 34–49, 247–257 | **Revisado (29-sep), confirmado con Gustavo:** la garita usa **el tema de toda la app** (clave `vecitap-tema`, mismo valor por omisión). La decisión del 28-sep —proveedor y clave propios, arranque en oscuro— se construyó y se deshizo: lo que la garita necesita es legibilidad, no color. La paleta usa los tokens de `globals.css`; `--verde`/`--rojo` en oscuro **no se pisan**, porque en la garita son **superficies** del veredicto con letra blanca y no colores de texto: van como `--veredicto-si`/`--veredicto-no` nuevos. Lo propio del módulo son los **tamaños** (base 17 px, campos 56 px, botones 60–64 px): es para tocar de pie, con guantes. Caso 29 de `casos-de-uso-mejorados.md`; detalle en `estado-migracion.md`. |
| Login | 364–455 | Tres modos: entrar · **"Es mi primera vez"** (signUp) · "Olvidé mi clave". Campo con ojo. |
| Clave nueva | 457–524 | Igual que los otros módulos, mínimo 8. |
| "Falta un paso" | 936–981 | Cuenta sin garita asignada: pega el código de invitación → `aceptar_invitacion(p_token)`. |
| Selector de edificio | 983–993 | Solo visible con 2+ garitas asignadas. |
| **Vista Entrada** | 630–731 | Cámara con QR (`BarcodeDetector` nativo, respaldo `jsQR`, 4–5 lecturas/s; si no se puede, el código se escribe a mano) · `garita_validar` · **veredicto a pantalla completa** (verde ✓ / rojo ✕, letra `clamp(90px,22vw,190px)`, pitido con `AudioContext` — 880 Hz si pasa, 220 Hz si no — y vibración) · "Registrar entrada" (`garita_entrada` + `garita_avisar`) · **visita sin anunciar** con autocompletado por cédula (`garita_visitante`, debounce 350 ms, dice "ya vino N veces · la última a la 01A"). |
| **Vista Adentro** | 733–774 | `garita_dentro`, "Registrar salida" (`garita_salida`), refresco automático cada 60 s (para el relevo de turno). |
| **Vista Consultar** | 776–836 | Vehículos autorizados (`garita_vehiculos`, debounce 280 ms, mínimo 2 caracteres) y directorio del edificio (`garita_directorio`, filtrado en memoria, máximo 60 filas). |
| **Vista Bitácora** | 838–899 | Anotar novedad/ronda/relevo (`garita_nota`) — **no se puede borrar ni corregir**, y el día completo (`garita_bitacora(p_edificio, p_fecha, p_limite: 200)`). |
| Cámara | 526–589 | Se apaga al cambiar de vista y en `pagehide`. |

Notas de comportamiento a preservar: un código pegado como enlace completo se
limpia con `replace(/^.*\//, "")`; el error de la base **nunca** se traga en
silencio ("en una puerta, 'no pasó nada' es peor que un mensaje feo"); y la
página **no** funciona sin internet a propósito (una caché vieja que pinta verde
a un invitado ya revocado no es una comodidad).

| # | Acción | Cómo | Notas |
|---|---|---|---|
| G1 | Validar un código | `garita_validar(p_edificio, p_codigo)` | lectura |
| G2 | Registrar entrada | `garita_entrada(p_edificio, p_unidad, p_nombre, p_documento, p_placa, p_invitacion, p_nota)` | 🔴 |
| G3 | Avisar al residente | `garita_avisar(p_visita)` | — |
| G4 | Registrar salida | `garita_salida(p_visita)` | 🔴 |
| G5 | Anotar en la bitácora | `garita_nota(p_edificio, p_texto, p_tipo)` | 🔴 inmutable por diseño |
| G6 | Usar una invitación de vigilante | `aceptar_invitacion(p_token)` | 🔴 se gasta una sola vez |

---

## 5. `types/supabase.ts` — regenerado el 28-sep, completo

Nicolás lo regeneró contra `vecitap-pruebas`. **No falta nada**: las 16 funciones
y las 2 tablas que la app necesitaba están todas. Verificado cruzando el archivo
nuevo contra la lista completa de `rpc("…")` y `from("…")` de los cuatro HTML —
cero faltantes en las dos direcciones, y ninguna función desapareció.

Llegaron 564 líneas nuevas: tablas `bitacora`, `invitaciones_visita`,
`vehiculos`, `visitantes`, `visitas`, y 29 funciones, entre ellas las 11
`garita_*`, `mis_visitas`, `crear_invitacion_visita`,
`anular_invitacion_visita`, `vigilantes_de`, `fijar_vigilante` y
`edificios_del_vigilante`. `npx tsc --noEmit` queda limpio contra el archivo
nuevo, así que nada del código ya escrito se rompió.

Dos cosas que conviene tener a mano al escribir Garita (bloque 10):

- `garita_edificios()` devuelve `{ edificio_id, nombre, org }` — `org` es el
  **nombre** de la organización, no su id. Para armar `/garita/[orgId]/[edificioId]`
  hay que resolver el `org_id` por otro lado (la tabla `edificios`, o
  `edificios_del_vigilante()` cruzado con `organizaciones`).
- `garita_entrada` declara `p_unidad: string` sin marcar nullable (el generador
  nunca lo hace), pero `garita.html:721` le manda `null` cuando la visita no dice
  a qué unidad va. Hay que pasarle `undefined` en vez de `null`, que es como
  PostgREST omite el parámetro y deja que tome su valor por omisión.

---

## 6. Criterio del 28-sep — paridad también en lo visual

Nicolás corrigió el criterio: la app tiene que parecerse a los HTML de `main`,
no solo comportarse igual. Eso cerró dos cosas que estaban abiertas:

- **Caso 1 (tarjeta de saldo).** `docs/estado-migracion.md` decía que los 3 tonos
  eran una decisión aprobada con un "no revertir" explícito. El criterio nuevo la
  reemplaza: la tarjeta vuelve a los 2 tonos de `main`. Queda anotado acá y en
  `docs/casos-de-uso-mejorados.md` para que no parezca un olvido.
- **Caso 13 (íconos). ✅ Resuelto en el bloque 7.** Deja de ser "consistencia con
  el resto de la migración" y pasa a ser una brecha visual real. Nicolás
  **aprobó `lucide-react` el 28-sep** (misma versión que `main` carga por CDN,
  0.469.0, fijada con `--save-exact`). Solo `admin.html` usa lucide en `main`
  (verificado: cero usos en `index.html`, `operador.html`, `garita.html`), así
  que el alcance es exclusivamente Admin: los 9 íconos del menú lateral
  (`House`/`Users`/`ListChecks`/`ReceiptText`/`Wallet`/`Send`/`ChartColumn`/
  `KeyRound`/`Settings2`), `Sun`/`Moon`/`LogOut`/`RefreshCw`/`Building2`/`X` del
  armazón, las 4 métricas y la flecha de fila de Inicio, los botones de
  Propietarios/Ficha/Cobros/CierreMes/Estadísticas/Cortes/Ajustes, y
  `Flechas.tsx` (`ChevronUp`/`ChevronDown` en vez de ▲▼ Unicode) y `Vacio.tsx`
  (prop `icono` nueva, opcional). La banda oscura de Residente **no** lleva
  íconos: `index.html` tampoco los usa ahí, así que llevarlos habría sido una
  mejora no pedida, no paridad.

El resto de los desvíos quedó marcado uno por uno en
`docs/casos-de-uso-mejorados.md`, con su motivo en una línea.

---

## 7. Estado de los bloques

| Bloque | Alcance | Estado |
|---|---|---|
| 0 | Este inventario | ✅ construido |
| 1 | Admin · Pagos | ✅ construido |
| 2 | Admin · Cortes de cuenta (+ recibo en papel compartido) | ✅ construido |
| 3 | Admin · Estadísticas | ✅ construido |
| 4 | Admin · Ajustes (+ logo, NuevoEdificio de vuelta a su lugar) | ✅ construido |
| 5 | Admin · armazón: lateral oscuro, `mis_modulos`, tasa en el encabezado, Accesos/Vigilantes, recuperación de clave | ✅ construido |
| 6 | Reversión de desvíos (umbrales, alícuota, 2 tonos, cédula, obligatorios) + Excel/PDF reales | ✅ construido |
| 7 | `lucide-react` (íconos, caso 13) + Residente: banda oscura y pestañas | ✅ construido |
| 8 | Residente · **Mis visitas** (invitar, QR en canvas, vehículos, quién entró) | ✅ construido |
| 9 | Operador · `PanelModulos` + campo de clave con ojo en su login | ✅ construido |
| 10 | Garita · fundaciones: ruta, gate en `proxy.ts`, tema, armazón y "falta un paso" | ✅ **validado en lectura y navegación** (29-sep) |
| 11 | Garita · **Entrada**: cámara, lectura de QR, veredicto a pantalla completa, visita sin anunciar | pendiente |
| 12 | Garita · **Adentro**, **Consultar** y **Bitácora** | pendiente |

**Quedan 2 bloques.** Garita se abre en tres (10, 11 y 12) porque es un módulo
propio, del tamaño de Residente, no un archivo suelto: ver la sección "Ruta de la
garita" de `docs/estado-migracion.md`.

**"Construido" no es "validado".** Salvo el bloque 10, ningún bloque ejecutó una
escritura contra la base: no se registró un pago, no se encoló un correo, no se
creó una invitación. La validación manual la hace Nicolás, y hasta entonces todo
lo marcado "✅ construido" acá significa solamente que compila, pasa el lint y
está escrito contra la referencia correcta.

**El bloque 10 sí está validado, pero solo hasta donde llega:** Nicolás lo probó
en el navegador el 29-sep —control de acceso con cuatro sesiones distintas, y
tema— y eso es **lectura y navegación**. La única escritura del bloque, "Falta un
paso" (`aceptar_invitacion` con un código real), sigue sin probarse: hace falta
una segunda cuenta de vigilante sin garita asignada.

Los pendientes concretos que dejan estos bloques —`lucide-react`, el enlace
`/garita` que todavía no resuelve, qué probar de la conciliación, y los patrones
nuevos de React para reusar— están en
[`docs/estado-migracion.md`](estado-migracion.md), en la sección "Reescritura
contra `main` — 28-sep".
