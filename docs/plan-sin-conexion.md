# Plan · Cambio 3 de ING3: trabajar sin internet en Administración

Estado: **A, E, B, C y D construidas en la rama `app-sin-conexion` (18-nov)** (ver secciones 8,
9, 10 y 11). Lo que sigue es el plan tal como se aprobó el 17-nov.
Primera versión revisada por Nicolás el mismo día; sus respuestas y las correcciones que salieron
de ellas están incorporadas (ver «Cambios frente a la primera versión», al final).

Fuentes: propuesta a Gustavo (`vecitap-gestion/material/Vecitap - Propuesta 3 cambios (Gustavo).pdf`,
págs. 7 y 8), respuestas 3.1–3.8 (`respuestas-cambio-3-2026-11-17.md`), guías de Next 16
(`02-guides/offline-support.md`, `02-guides/progressive-web-apps.md`, `config/useOffline.md`) y el
código de `dev` en `bed443c`.

## Lo que ya está decidido

| | Decisión |
|---|---|
| Orden | **A** (instalable y consulta) → **E** («primero la copia» con conexión) → **B** (pagos) → **C** (gastos, cargos, notas, contactos). D (garita) después. E va justo después de A porque reusa casi todo de A (decidido el 18-nov). |
| Edificios con copia | **Automático:** el edificio que se abre queda «disponible sin conexión»; se puede desmarcar. |
| Qué tiene que aguantar | El caso de diseño es **«se cae el viernes y vuelve el lunes»**: se trabaja sin conexión unas horas, se cierra el navegador o se apaga la computadora, y al volver todo sigue ahí (copia, cosas por enviar, borradores). 2 días seguidos sin luz es extraordinario. Lo usual: horas. |
| Equipo | El **navegador de la computadora**. No se cuenta con datos móviles. |
| Guardar en el equipo | Sí, por edificio elegido («Disponible sin conexión»). Se borra al cerrar sesión. |
| Saldos sin conexión | Los de la última sincronización. Lo hecho sin conexión va aparte, en «cosas por enviar», y no los toca. |
| Fuera de alcance | Abrir, cerrar o reabrir el mes, generar el cobro, enviar correos y recibos, cambiar propietario o inquilino, accesos e invitaciones, importar oficinas, reglas de cobro. |
| Formularios | Lo que se está escribiendo no se pierde ni con un apagón (borrador en el equipo). |
| Cómo se tiene que sentir | **Como Google Drive**: se trabaja igual con o sin conexión, lo propio nunca se pierde y lo de los demás llega solo al tener señal. |
| Dependencias | Serwist (service worker) e `idb` (IndexedDB): aprobadas. |
| Primero | Un día de **prueba de concepto** (Propietarios sin conexión, en un Preview) antes de seguir con A. |
| Interruptor | `NEXT_PUBLIC_SIN_CONEXION`, apagado en producción hasta aprobarlo. |
| Salir con cosas por enviar | Se **bloquea** («Tiene 3 cosas por enviar. Conéctese y espere a que se envíen»). Si entra otro usuario en ese navegador, lo del anterior se **conserva**, oculto y sin enviarse, hasta que él vuelva. |
| Hora real | `hecho_en timestamptz` junto con `id_equipo`, para que la auditoría muestre cuándo se hizo de verdad. |
| Cifrado de la copia | **No.** Es parte del riesgo que asume la empresa; un PIN cada vez sería demasiado. El almacén igual pasa por un solo módulo, por si algún día cambia. |
| `copia_edificio` | Aprobada: una llamada por edificio, `SECURITY INVOKER`. |
| Aviso de posible duplicado | Aprobado, **también en línea** en Pagos de Administración: misma unidad, mismo monto, fecha a ±3 días. |
| Cierre con pendientes en otro equipo | **La base no deja cerrar el mes** si otro equipo tiene (o puede tener) cosas por enviar de ese edificio (2.7). |
| Liberar un equipo en riesgo | **Cualquier administrador** de la organización. Queda en la auditoría. |
| Equipo en riesgo | Con la app abierta y **3 minutos** sin contacto bueno. |
| Internet lento | Esperas máximas: 8 s para abrir una página (después, la copia) y 15 s para guardar (después, la bandeja). Se ajustan en la prueba de concepto (sección 6). |
| Rama | `cambio-3-sin-conexion`, desde `dev`. Nicolás prueba los cambios 1 y 2 en el Preview de `dev`; los conflictos los resuelvo yo. |

---

## Cómo están hoy las pantallas

Todas las páginas de `app/(admin)/admin/[orgId]/[edificioId]/*/page.tsx` son **Server
Components que solo cargan datos**: consultan Supabase con el cliente del servidor (cookies) y le
pasan filas planas por props a un componente cliente de `components/admin/` (`Pagos`, `Ficha`,
`Propietarios`, `CierreMes`, `CargosUnidad`, `Cortes`…). Los layouts encima (`[orgId]/layout.tsx`,
`[edificioId]/layout.tsx`) llaman a `usuarioActual()` / `tiene_rol` / `edificios_visibles`.

Las **escrituras** no pasan por el servidor de Next: los componentes cliente llaman directo a
Supabase desde el navegador (`crearClienteNavegador()`), con RLS, y después `router.refresh()`.
No hay Server Actions en Administración.

Consecuencias:

1. **Sin red no se puede abrir ninguna página de Administración**: el HTML lo arma el servidor
   con datos frescos. Es lo caro de la parte A.
2. **Los componentes cliente ya reciben datos planos.** Con las mismas props sacadas de una copia
   local se dibujan igual. No hay que reescribirlos.
3. **Las escrituras ya salen del navegador.** La bandeja puede repetir la misma llamada más
   tarde, con la misma sesión y la misma RLS.

Lo que hay hoy «sin conexión» (`app/sin-conexion`, `lib/sin-conexion.ts`) **es otra cosa**: la
pantalla de «No pudimos conectar. Reintente» cuando `proxy.ts` o un layout no logran hablar con el
servidor de Auth. Se queda como está; lo nuevo se llama distinto.

### Lo que dice la guía de Next 16, y por qué no basta

- `experimental.useOffline` deja **en espera** una navegación o Server Action que falla por red y
  la reintenta al volver. Es experimental, solo sirve para rutas ya precargadas y la propia guía
  dice que *una recarga completa sin conexión sigue fallando; para eso hace falta un service
  worker*. Además, al dejar la navegación esperando le quitaría al service worker la oportunidad
  de responder con la copia. **No se activa.** El aviso de conexión es un hook propio.
- La guía de PWA: manifiesto con `app/manifest.ts`, HTTPS y un service worker; recomienda
  Serwist, con ejemplo para Turbopack. Pide servir `sw.js` con `Cache-Control: no-cache`.

---

## 1. Parte A — app instalable, copia por edificio, aviso de conexión, borrado al salir

### 1.1 Piezas

**a) Manifiesto (`app/manifest.ts`).** «Vecitap», `start_url: /admin`, `display: standalone`,
colores de `globals.css`. Faltan íconos de 192 y 512 px (hay de 32 y 180). Con eso Chrome y Edge
ofrecen «Instalar Vecitap».

**b) Service worker, con alcance solo `/admin/`.** En `/sw.js` con
`Service-Worker-Allowed: /admin/` y `scope: "/admin/"`: no toca la portada, `/mi`, `/garita` ni
`/operador`. Hace tres cosas:

- Guarda **la cáscara** (pantalla sin datos) y sus archivos JS/CSS, logos y fuentes. Ningún dato
  de condominio va al caché del service worker.
- Las páginas de `/admin/*` van **siempre a la red primero**. Nunca se guarda el HTML de una
  página de Administración.
- Si la red falla, redirige a la cáscara: `/admin/sin-internet?ir=/admin/<org>/<edificio>/pagos`.

Además: encabezados de `sw.js` en `next.config.ts`, excluir `sw.js` y `manifest.webmanifest` del
`matcher` de `proxy.ts`, y **un `sw.js` de emergencia** que se desregistra solo.

**c) La cáscara: `app/(admin)/admin/sin-internet/page.tsx`.** Página cliente, estática. Lee
`?ir=`, abre la copia del edificio y dibuja **los mismos componentes de `components/admin/`**.
Dentro de la cáscara se navega cambiando `?ir=`. Al volver la conexión: «Volver a la versión en
línea» (después de mandar la bandeja). **La puerta es local**: sin sesión de Supabase en las
cookies del navegador, o con una copia de otro usuario, muestra «Sin conexión. Entre cuando vuelva
internet» y no lee nada.

**d) Una función de armado por pantalla, compartida.** Cada `page.tsx` se separa en consultas y
`armarProps…(filas)` en `lib/admin/pantallas/<pantalla>.ts`; la cáscara llama a la misma función
con las filas de la copia. **Una sola transformación**, para que en línea y sin conexión no
diverjan. En línea no cambia nada visible.

**e) La copia local por edificio (IndexedDB).** Una base por usuario, `vecitap-<user_id>`, con
`copias`, `bandeja`, `borradores` y `meta`. Se pide `navigator.storage.persist()`. Todo pasa por un
solo módulo (`lib/local/almacen.ts`) que lee y escribe. Sin cifrar (decidido); si algún día
cambia, se cambia ahí y en ningún otro lado.

Qué se guarda: unidades con vínculos y personas, saldos actuales, pagos (los 300 que muestra
Pagos, más todos los «reportados»), datos de comprobantes (**sin imágenes**), periodos, gastos y
cargos del mes abierto, conceptos, categorías, datos de pago, bancos, notas, tasas del BCV de 60
días, y por unidad el historial y la deuda por mes (cambio 2).

**f) Cómo se mantiene al día la copia («como Drive»).** Tres mecanismos, no una descarga fija cada
15 minutos:

1. **Lo que hace el propio administrador entra a la copia al instante.** Al registrar un pago, la
   copia se actualiza en ese mismo momento con lo que devolvió la base (y se vuelve a pedir lo que
   ese pago cambia: saldo, historial y deuda de esa unidad). Si se corta un minuto después, lo suyo
   ya está en la copia.
2. **Lo que hacen los demás llega en ~1 minuto.** Con conexión, cada minuto se pregunta a la base
   «¿cambió algo en esta administradora desde mi copia?». Es una consulta de una fila a
   `auditoria` (ya tiene índice por organización y fecha, y la RLS deja leerla a administración),
   de unos cientos de bytes. Solo si cambió algo se baja la copia de nuevo. `auditoria` registra
   pagos, gastos, ajustes, periodos (el cierre), unidades, conceptos, membresías e invitaciones;
   no registra `cargos_unidad`, `notas_unidad`, `personas` ni `vinculos`, así que esas se miran
   aparte (fecha más reciente de cargos y notas) y, como red de seguridad, la copia entera se
   renueva igual una vez por hora con la app abierta.
3. **Al abrir la app** con conexión, siempre.

En la franja se muestra la hora de la copia («Datos de las 10:42»).

**g) La descarga en una sola llamada (función nueva).** Bajar historial y deuda por unidad, una
RPC por unidad, son **≈ 2 llamadas por unidad**: para 53 unidades, unas 120 llamadas (la primera
versión decía «unas 25»: estaba mal contado). Se propone una función de solo lectura,
`copia_edificio(p_edificio) returns jsonb`, que arma todo en el servidor y lo devuelve en **una
llamada**. `SECURITY INVOKER` (lee con la RLS del usuario: devuelve lo mismo que hoy puede ver) y
`search_path` fijo; llama por dentro a `historial_unidad` y `deuda_por_mes`, sin copiar su lógica.
Es la única migración de A, con su rollback (pregunta 2).

**h) «Disponible sin conexión».** **Automático** (decidido): el edificio que se abre queda
marcado y su copia se baja en segundo plano. En el selector de `MarcoAdmin` se ve cuáles tienen
copia, con el peso y la hora, y cada uno se puede desmarcar (se borra su copia de ese equipo).

**i) Aviso de conexión.** Hook `useConexion()` y una franja en `MarcoAdmin` y en la cáscara: «Sin
conexión. Está viendo los datos de las 10:42. Lo que haga se guarda y se envía al volver».

**j) Borrado al cerrar sesión.** El «Salir» de `MarcoAdmin`, `sin-acceso` y `MarcoGarita` borra
primero la base `vecitap-<user_id>` y el caché de la cáscara y después deja seguir el POST. Con
cosas por enviar, no deja salir (decidido). Al entrar otro usuario, su base es otra; la del
anterior queda, sin enviarse, hasta que él vuelva. Se descartó `Clear-Site-Data: "storage"`:
borraría también `vecitap-tema`.

### 1.2 Qué pantallas cambian

| Pantalla | Sin conexión en A | Trabajo |
|---|---|---|
| `MarcoAdmin` | Franja, interruptor por edificio, contador, Salir que borra | Medio |
| Inicio, Propietarios | Consulta | Separar armado |
| Ficha (estado de cuenta, historial, deuda por mes, nota) | Consulta | Separar armado |
| Pagos | Consulta; registrar y validar llegan en B | Separar armado |
| Cierre del mes | Consulta de gastos y cargos; la simulación del cierre, deshabilitada | Separar armado |
| Cortes | Recibos del último mes, sin papel | Separar armado |
| Estadísticas, Estado financiero, Mensajes, Accesos, Ajustes, Cobros | «Necesita conexión» | Mínimo |
| `proxy.ts`, `next.config.ts` | `matcher` y encabezados de `sw.js` | Chico |
| Nuevo: manifiesto, `sw.js`, cáscara, `lib/local/*`, `copia_edificio` | — | El grueso |

### 1.3 Cuánto pesa la copia y cuánto tarda

**Medido en vecitap-pruebas** (JSON, que es lo que se guarda), Edificio Gustavo: 53 unidades, 9
meses, pocos pagos:

| Parte | Peso | Por fila |
|---|---:|---:|
| Unidades | 10 KB | |
| Propietarios, inquilinos y contactos | 28 KB | |
| Saldos actuales | 16 KB | |
| Pagos (8) | 7 KB | ~0,85 KB |
| Periodos | 4 KB | |
| Gastos (10) | 3 KB | ~0,35 KB |
| Historial de todas las unidades (519 movimientos) | 80 KB | ~0,15 KB |
| Deuda por mes de todas las unidades | 90 KB | |
| Recibos del último mes cerrado | 47 KB | ~0,9 KB |
| Tasas, conceptos, datos de pago, bancos | 12 KB | |
| **Total** | **≈ 0,3 MB** | |

**Medido en producción** (solo lectura, 17-nov). Hay un solo edificio, el de ING3 (53 unidades,
1 mes abierto): 33 pagos en los últimos 30 días (~0,7 KB cada uno) y 22 gastos. Unidades 10 KB,
contactos 25 KB, pagos 23 KB, gastos 9 KB. El historial y los saldos no se pudieron leer con el
usuario de lectura (las funciones de saldo no le dan permiso), se estiman con el tamaño por fila
de pruebas. **Hoy, ≈ 0,1 MB.**

**Proyección para ING3 con un año de uso** (33 pagos por mes, 22 gastos por mes): pagos ≈ 0,21 MB
(tope de 300), historial ≈ 0,16 MB, deuda ≈ 0,09 MB, recibos del último mes ≈ 0,05 MB, el resto ≈
0,07 MB → **≈ 0,6 MB**. La primera versión decía 0,9 MB para 60 unidades con más pagos y 1,5 MB
para un edificio de **100** unidades: esas cifras siguen siendo el techo, no lo de ING3.

**Cuánto tarda.** Es una estimación; se mide en la prueba de concepto:

- Con `copia_edificio`: **una llamada**. El JSON se comprime bien (texto repetido, 5 a 10 veces
  menos al viajar), así que 0,6 MB viajan como ~0,1 MB. Con el servidor armándolo en ~0,5 s y
  una conexión de 5 Mbps, **1 a 3 segundos**.
- Sin ella, ~120 llamadas de a 5 en paralelo: **5 a 10 segundos**, y más con conexión mala.

En los dos casos **va en segundo plano**: no bloquea la pantalla ni cambia nada mientras se
trabaja; la copia nueva reemplaza a la vieja de una vez cuando termina. Sacar las imágenes de
comprobantes es justo lo que lo deja así de liviano: una sola imagen puede pesar más que la copia
entera del edificio.

**Cuánto consume en el mes** (lo que cuenta para el plan de Supabase): la consulta de cada minuto
es despreciable; lo que suma son las copias completas, que solo se bajan cuando algo cambió. Un día
con 20 cambios de otros: 20 × ~0,1 MB ≈ 2 MB por edificio y por administrador. Con 50 edificios,
del orden de 2–3 GB al mes: entra holgado en el plan Pro (250 GB) y cerca del límite del Free
(5 GB), que con 50 edificios ya no aplicaría.

---

## 2. Parte B — bandeja de «cosas por enviar» (pagos)

### 2.1 Qué entra en B

Registrar un pago (de una unidad y agrupado), confirmar o anular, conciliar con el archivo del
banco (el archivo se lee en el equipo y se cruza con los pagos «reportados» de la copia) y
exonerar (`ajustes`).

**Reparto automático: sí, «al volver».** (Corrección: la primera versión lo dejaba deshabilitado.)
El reparto lo calcula la base con la deuda de cada unidad, y sin conexión la deuda de la copia
puede estar vieja. Pero no hace falta calcularlo en el equipo: el administrador escribe el total y
elige las unidades, toca **«Repartir al volver»**, y la cosa queda en la bandeja así. Al volver la
conexión, el envío pide el reparto a la base (`repartir_pago`, con la deuda de ese momento, que es
más exacta que la de la copia) y registra las partes. No contradice la 2.2 (el propietario decide):
si el propietario dijo cuánto va a cada oficina, el administrador escribe los montos a mano, igual
que en línea; «Repartir al volver» es para cuando no lo dijo, que es justo cuando la regla manda
repartir por antigüedad. Y el pago queda «reportado»: el administrador lo ve repartido antes de
confirmarlo, como hoy.

Sin conexión no están: ver la imagen del comprobante y borrar imágenes vencidas.

**Pagos en bolívares:** la tasa de esa fecha si está en la copia (60 días). Si no, o si el
administrador escribe otra, va como tasa manual con su motivo (cambio 1). `monto_usd` lo sigue
calculando la base.

### 2.2 Cada cosa por enviar

```
{ id_equipo,           // uuid creado en el equipo; viaja a la base
  usuario_id, org_id, edificio_id,
  tipo,                // "pago.registrar" | "pago.agrupado" | "pago.repartir" |
                       // "pago.estado" | "pago.conciliar" | "ajuste.registrar"  (C suma los suyos)
  datos,               // lo que hoy va en el insert/update
  antes,               // en las ediciones: los valores que había al editar (ver 2.5)
  hecho_en,            // hora del equipo
  estado,              // "por_enviar" | "enviando" | "enviado" | "revisar"
  intentos, motivo }
```

**Se muestra aparte, sin tocar saldos:** en Pagos, «Por enviar (3)» arriba de la lista; en la
Ficha, «Pagos por enviar de esta unidad». El contador de `MarcoAdmin` lleva a la lista completa.

### 2.3 El envío

- **Con conexión, se manda al instante**, como hoy. Si la red falla justo en el clic, la cosa cae
  sola en la bandeja: el administrador no tiene que hacer nada distinto.
- Arranca al volver la conexión, al abrir la app y después de entrar de nuevo. Necesita la app
  abierta (no se usa Background Sync).
- **Una pestaña a la vez** (`navigator.locks`). **En orden**, una cosa por vez, por edificio. Si una
  depende de otra (confirmar un pago registrado sin conexión), apunta a ella por su `id_equipo`.
- Respuestas:
  - **Falla de red** → queda «por enviar».
  - **Sesión vencida** → se renueva; si no se puede, «Entre de nuevo para enviar 3 cosas».
  - **La base lo rechaza** (RLS, mes cerrado, «Ese pago ya está reportado…») → **«Revisar»**, con
    el motivo. Las que dependían de esa, también. Las demás siguen.
  - **Posible duplicado** → «Revisar» (ver 2.4).
- En «Revisar»: «Corregir y reenviar» o «Descartar» (con confirmación). **Nada se borra solo.**
- Confirmar o anular va con `.eq("estado","reportado")`; si cambió 0 filas, «Revisar» con «Ese pago
  ya no estaba pendiente».
- **Con cosas por enviar de un edificio, «Cerrar el mes» queda deshabilitado** en ese equipo.

### 2.4 El pago que el residente ya reportó (verificado en pruebas, 17-nov)

Caso: el residente reporta su pago desde el portal; el administrador está sin conexión, le llega un
mensaje al teléfono y lo carga a mano. Su copia no tiene el reporte del residente, porque llegó
después del corte.

Hay dos cosas distintas que se suelen confundir:

- **`id_equipo`** (2.6) evita que **la misma cosa** entre dos veces cuando el equipo reintenta. No
  sirve acá: el reporte del residente y la carga del administrador son dos cosas distintas, con
  identificadores distintos.
- **`pago_no_repetido`** (un trigger que ya existe en la base) rechaza un pago de la misma unidad
  con **la misma referencia, el mismo día, el mismo monto y la misma moneda**, si el otro no está
  anulado. Eso es lo que se había trabajado antes.

Lo probé en pruebas (en una transacción que se deshizo al final, no quedó nada):

| El administrador carga… | Resultado hoy |
|---|---|
| Misma referencia, día y monto que el residente | **Rechazado**: «Ese pago ya está reportado: misma referencia, mismo día y mismo monto». |
| La referencia distinta (por ejemplo, solo los últimos 4 dígitos) | **Entra: queda duplicado.** |
| Sin referencia (efectivo) | **Entra: queda duplicado.** |

Esto **pasa igual hoy en línea**: no lo crea el modo sin conexión, pero sin conexión es más
probable, porque el administrador no ve el reporte del residente. Para el cambio 3 se propone:

1. Si la base lo rechaza por repetido, «Revisar» lo dice en claro y ofrece **«Es el mismo:
   confirmar el del residente»** (descarta el suyo y confirma el que ya estaba).
2. **Aviso de posible duplicado al enviar.** Antes de mandar un pago hecho sin conexión, el envío
   busca en la base un pago no anulado de **la misma unidad, el mismo monto y fecha a ±3 días**.
   Si lo encuentra, no lo manda: «Revisar» muestra los dos lado a lado con **«Es el mismo»** o
   **«Son distintos: enviar igual»**. No bloquea nada en la base (dos pagos iguales pueden ser
   legítimos), solo pregunta.
3. La conciliación con el archivo del banco sigue siendo la última red: un movimiento del banco
   casa con un solo pago; el duplicado quedaría «reportado» sin casar.

El punto 2 se puede usar también en línea, en Pagos de Administración (pregunta 3).

### 2.5 Dos administradores en el mismo edificio

Pasa: los roles `administrador` y `propietario_cuenta` pueden ser varias personas por
administradora (en pruebas, Administradora Baja tiene dos administradores). Cómo se cubre cada
caso:

| Caso | Qué pasa |
|---|---|
| Los dos cargan el mismo pago | Como el del residente (2.4): repetido → «Revisar»; posible duplicado → «Revisar» con los dos lado a lado. |
| Uno confirma y el otro anula el mismo pago sin conexión | El segundo en llegar encuentra el pago ya fuera de «reportado» → «Revisar»: «Ese pago ya no estaba pendiente». |
| Los dos editan el mismo gasto, nota o contacto | Cada edición viaja con los valores que había **antes** de editar. El envío actualiza solo si la base todavía tiene esos valores; si otro lo cambió, «Revisar» muestra **su versión y la del otro** para elegir. Nadie pisa a nadie en silencio. No necesita migración (se comparan los campos; en notas, `actualizada_en`). |
| Uno quiere cerrar el mes mientras el otro tiene cosas sin enviar de ese edificio | **La base no lo deja cerrar** (2.7). Si igual llegara algo de un mes ya cerrado (el caso que la base no puede ver, al final de 2.7), los gastos y cargos van a «Revisar» con **«Pasarlo al mes abierto»** y los pagos entran y van al cierre siguiente. |
| Uno trabaja en línea y el otro sin conexión | El que está en línea ve todo al momento; el que está sin conexión ve lo del otro hasta la hora de su copia y, al volver, en ~1 minuto. |

### 2.6 La migración: `id_equipo` y `hecho_en`, para que un reintento no duplique

El caso: el pago llega a la base pero la respuesta se pierde. El equipo no sabe si entró, y
reintenta.

`supabase/migrations/AAAAMMDDHHMMSS_id_equipo.sql` (+ su rollback), en `pagos`, `gastos`,
`cargos_unidad` y `ajustes`:

1. `id_equipo uuid null` con `unique` (los null no chocan: lo de hoy no cambia) y
   `hecho_en timestamptz null` (la hora del equipo; `creado_en` sigue siendo la de llegada).
2. Un trigger `BEFORE INSERT` por tabla que, si ya existe una fila con ese `id_equipo`, **devuelve
   `null`**: Postgres salta la fila sin error.

**Por qué un trigger y no `on conflict do nothing`.** Los `BEFORE INSERT` corren **antes** de que
Postgres mire los conflictos: `pago_no_repetido` rechazaría el reintento de un pago con referencia,
y `cargos_unidad_guarda` el de un cargo si el mes ya se cerró. El reintento terminaría en
«Revisar» por algo que sí entró. Los triggers corren **por orden alfabético**, así que se llaman
`pagos_0_id_equipo`, `gastos_0_id_equipo`, `cargos_unidad_0_id_equipo` y `ajustes_0_id_equipo`.

- `SECURITY INVOKER`, `search_path` fijo.
- El `unique` es la red final (dos pestañas a la vez → `23505`, que el envío trata como «ya
  estaba»). Después, el envío lee la fila por `id_equipo` para confirmar.
- En un pago agrupado cada parte lleva su `id_equipo`; `pagos_grupo_al_insertar` con `nuevos`
  vacío no hace nada (revisado).
- **No cambia ninguna función existente**: sin md5 nuevos que guardar.
- Verificación al final del archivo: el mismo pago con referencia y el mismo `id_equipo` dos veces →
  1 fila y ningún error; lo mismo con un cargo de un mes cerrado; dos filas con `id_equipo` null →
  entran las dos.
- Rollback: `drop trigger` ×4, `drop function` ×4, `drop column` ×8.

Desde que se aplica, **también en línea** los inserts llevan `id_equipo`.

### 2.7 La base sabe qué equipos tienen cosas por enviar

Decisión de Nicolás: no se puede cerrar el mes si hay pendientes **en otro equipo**. El límite
real: **un equipo sin conexión no le puede avisar nada a la base.** Si Ana pierde internet a las
10:00 y registra 3 pagos a las 11:00, la base no se entera de esos 3 hasta que Ana vuelva. Lo que
sí puede saber la base es **qué equipos están en riesgo**: los que tenían pendientes la última vez
que hablaron, y los que se quedaron sin conexión con la app abierta.

**Cómo:**

- Cada navegador con algún edificio «disponible sin conexión» tiene un identificador propio
  (`equipo_id`, creado una vez y guardado en su base local).
- Tabla nueva **`equipos_sin_conexion`** (`equipo_id`, `usuario_id`, `org_id`, `edificio_id`,
  `pendientes int`, `estado`, `ultimo_contacto`, `liberado_por`, `liberado_en`). Una fila por
  equipo y edificio. RLS: cada usuario escribe solo sus filas; administración de la organización
  las lee.
- El equipo la mantiene al día con la consulta de cada minuto que ya hace para la copia (1.1 f) y
  cada vez que cambia su bandeja: `pendientes` y `estado = 'en_linea'`.
- **Al cerrar la app con conexión** (cerrar la pestaña, el navegador o Salir), avisa
  `estado = 'cerrado'` con `fetch(…, { keepalive: true })`, que sale aunque la página se esté
  cerrando.
- Quedan **«en riesgo»** los equipos con `pendientes > 0`, o con `estado = 'en_linea'` y más de
  3 minutos sin contacto: esos se quedaron sin conexión (o sin luz) con la app abierta, y pudieron
  seguir trabajando.

**El bloqueo, en la base.** Un trigger nuevo `BEFORE UPDATE` en `periodos`, igual que el
`periodos_activo` que ya existe (`cierre_exige_activo`): cuando un periodo pasa de `abierto` a
`cerrado` y hay algún equipo en riesgo de ese edificio, aborta el cierre. **No se toca
`cerrar_periodo`**: su md5 no cambia. El mensaje dice quién y desde cuándo: «No se puede cerrar:
el equipo de Ana está sin conexión desde el viernes 16:10 y puede tener cosas por enviar».

**Liberar un equipo.** Si Ana no trabajó sin conexión (se le cortó la luz, apagó y se fue), el
equipo queda en riesgo hasta que vuelva a conectarse, y eso bloquearía el cierre sin motivo. Para
eso, en «Cerrar el mes» aparece la lista de equipos en riesgo con **«Ana confirma que no tiene
nada por enviar»**: marca el equipo como liberado (queda en la auditoría quién lo liberó y
cuándo). Si después ese equipo vuelve con cosas de ese mes, van a «Revisar» como en 2.5.
Puede liberarlo cualquier administrador de la organización (decidido).

**Lo que la base no puede ver**, y queda cubierto por «Revisar → Pasarlo al mes abierto»: un
equipo que cerró la app con conexión (`estado = 'cerrado'`, sin pendientes) y **se abrió más
tarde ya sin conexión**. Ese equipo nunca volvió a hablar con la base, así que para ella sigue
cerrado y sin riesgo. Para achicar el caso, la cáscara muestra en la franja: «Lo que haga ahora
puede llegar después del cierre del mes».

**Migración** (en la parte B, junto con `id_equipo`, o como archivo aparte):
`equipos_sin_conexion` con su RLS, la función `latido_equipo(...)` (la que llama el equipo cada
minuto), `liberar_equipo(...)`, y el trigger de `periodos` con su función. Las tres funciones
deciden si se puede cerrar un mes: **entran en la familia de revisión cuidadosa** de `AGENTS.md`.
Rollback: borrar trigger, funciones y tabla.

**Orden de los gastos (C): sin migración.** (Corrección: la primera versión pedía una función
nueva.) Sin conexión el orden se puede cambiar igual que en línea; el problema era solo cómo
mandarlo: `mover_gasto(id, arriba)` intercambia con el vecino, y repetirla lo mueve de nuevo. La
bandeja manda en cambio **la posición final** de cada gasto movido (`update gastos set orden = …`),
que se puede repetir sin cambiar el resultado. La RLS de `gastos` ya permite ese `update` (Cierre
del mes lo usa para editar).

---

## 3. Cómo no se pierde un formulario a medio llenar

Vale **con y sin conexión**: el apagón llega sin aviso.

- Hook `useBorrador(clave, valorInicial)` en lugar del `useState` del formulario. Guarda medio
  segundo después de cada cambio. Clave `usuario · edificio · formulario` (`pagos.registrar`,
  `pagos.exonerar`, `mes.gasto`, `ficha.nota`, `ficha.contacto`…).
- Al reabrir: «Recuperamos lo que estaba escribiendo (10:41). Seguir · Descartar».
- Se borra al guardar o al pasar a la bandeja. Vence a los 7 días. Se borra al cerrar sesión.
- No guarda archivos (comprobante, archivo del banco); si había uno, el aviso lo dice.
- Lo que se pierde en un apagón es, como mucho, el último medio segundo.

Va en la parte A.

---

## 4. La sesión, en el caso «viernes → lunes»

- El **access token** dura ~1 hora. Sin conexión vence y no importa: la cáscara lee la copia sin
  pedir nada a la base.
- El **refresh token** no vence solo en el plan Free (los límites de sesión son de Pro). Se
  invalida al cerrar sesión, cambiar la contraseña o revocarla. La cookie dura 400 días.
- Cerrar el navegador o apagar la computadora no borra nada: la copia, la bandeja y los borradores
  están en el disco.

El lunes:

1. **Lo normal:** al abrir, si hay señal, `supabase-js` renueva el token solo, la bandeja se manda
   y se ve todo al día. No hace falta entrar de nuevo. Si todavía no hay señal, abre la copia
   igual.
2. **Si la renovación falla** (sesión revocada, contraseña cambiada, o una regla futura de Pro): la
   bandeja se detiene, nada se borra, y la franja dice «Entre de nuevo para enviar 3 cosas
   pendientes». Al entrar con la misma cuenta, sigue sola.
3. **Si entra otro usuario:** lo del anterior queda guardado, sin enviarse, hasta que él vuelva.

Con Pro, si se activa un límite de sesión, conviene que sea de más de 3 días.

---

## 5. Riesgos, tamaño y orden de publicación

### 5.1 Riesgos

| Riesgo | Mitigación |
|---|---|
| Un service worker defectuoso deja Administración inaccesible y se queda en los navegadores. | Alcance solo `/admin/`; red primero; interruptor apagado en producción; `sw.js` de emergencia; probar con `next start` y en Preview. |
| La cáscara servida fuera del flujo normal del router de Next se porta distinto de lo esperado. | **Prueba de concepto primero** (decidido). |
| Serwist y Turbopack con Next 16.3 | Se comprueba en la prueba de concepto; si no, `sw.js` a mano. |
| Divergencia entre en línea y sin conexión | Una sola función de armado por pantalla. |
| Datos personales en el equipo | Solo edificios elegidos, base por usuario, borrado al salir. Sin cifrar: riesgo asumido por la empresa (decidido). |
| Un equipo que se abre ya sin conexión, después de haber cerrado bien, no le avisa a la base | Franja «Lo que haga ahora puede llegar después del cierre» + «Revisar → Pasarlo al mes abierto» (2.7). |
| Pago cargado dos veces (residente y administrador, o dos administradores) | `pago_no_repetido` + aviso de posible duplicado + conciliación (2.4). |
| Dos administradores editan lo mismo | Ediciones con los valores de antes → «Revisar» (2.5). |
| Reintentos duplicados | `id_equipo` + trigger + `unique` (2.6). |
| Dos pestañas mandando lo mismo | Web Locks + `unique`. |
| Un despliegue en medio del corte | El service worker viejo sigue con su cáscara y su copia; al volver se actualiza. |

### 5.2 Tamaño

| Parte | Qué incluye | Tamaño | Base |
|---|---|---|---|
| **A** | Manifiesto, service worker, cáscara, copia por edificio y su puesta al día, aviso, borrado al salir, borradores, armado separado en 6 pantallas | **Grande** (≈ 40 %) | `copia_edificio` (solo lectura) |
| **B** | Bandeja, envío, «Revisar», duplicados (también en línea), «Repartir al volver», Pagos y Ficha sin conexión, equipos en riesgo y bloqueo del cierre en la base | **Grande** (≈ 35 %; sube por 2.7) | `id_equipo` + `hecho_en` en 4 tablas; `equipos_sin_conexion` + trigger en `periodos` |
| **C** | Gastos del mes abierto (agregar, editar, borrar, ordenar), cargos, notas, contactos, con ediciones que no se pisan | **Mediana** (≈ 20 %) | Sin migración |
| **D** | Garita: invitaciones del día, ingreso aprobado sin conexión, hora enviada al volver | **Mediana** (≈ 10–15 %) | `garita_entrada` con hora del equipo e `id_equipo` |
| **E** | «Primero la copia» con conexión: pantallas al instante y reemplazo por lo fresco (sección 7) | **Mediana** (≈ 15–20 %, se suma al total) | Sin migración |

### 5.3 Ramas y publicación

Hoy `dev` tiene los cambios 1 y 2 commiteados y subidos (`2500cc7`, `bed443c`), dos commits por
delante de `integration`. Gustavo no los probó; los va a probar Nicolás.

Decidido: **rama aparte**, para que Nicolás pruebe tranquilo mientras avanza el cambio 3.

- **`dev`** queda como está: Nicolás prueba ahí los cambios 1 y 2, en su Preview. Lo que salga de
  esas pruebas se corrige en `dev`, y los cambios 1 y 2 van a producción cuando él los apruebe,
  sin esperar al 3.
- **`cambio-3-sin-conexion`** sale de `dev` (ya trae los cambios 1 y 2) y tiene su propio Preview.
  El service worker es por dirección: el de esta rama no llega al Preview de `dev`.
- **Conflictos, a mi cargo:** cada corrección que entre a `dev` la traigo a la rama del cambio 3 en
  el momento (`merge dev`). Los dos tocan los mismos archivos (`Pagos.tsx`, `Ficha.tsx`,
  `CierreMes.tsx`); traerla enseguida deja el conflicto chico.
- Cuando el cambio 3 esté listo, vuelve a `dev` con el interruptor apagado, y de ahí a producción
  como siempre.
- Las migraciones (`copia_edificio` en A, `id_equipo` en B) solo agregan: se pueden aplicar en
  pruebas en cualquier momento sin cambiar lo que hace la app de hoy.

Cada parte cierra con su entrada en `docs/casos-de-uso-mejorados.md` y en
`docs/estado-migracion.md`.

---

## 6. Internet muy lento

El plan está pensado para «hay» o «no hay» conexión. El caso más traicionero es el del medio:
**la conexión existe pero tarda 20 o 30 segundos en contestar.** El navegador no la da por caída,
así que sin cuidado la app se queda esperando, ni en línea ni sin conexión. Qué hace cada pieza:

| Pieza | Con internet lento |
|---|---|
| **Abrir una página de Administración** | El service worker espera la red **8 segundos como máximo**. Si no contestó, muestra la copia, con la franja «Conexión muy lenta: está viendo los datos de las 10:42», y sigue intentando por detrás. Cuando la red contesta, ofrece «Ver lo último». |
| **Guardar (pagos, gastos, cargos)** | Si la base no confirmó en **15 segundos**, la cosa pasa a la bandeja y el administrador puede seguir. Este es justo el caso en que el pago pudo haber llegado sin que llegara la respuesta: `id_equipo` evita que el reintento lo duplique. |
| **La consulta de cada minuto** | Una fila, unos cientos de bytes: anda bien aun con muy poca velocidad. Si un intento falla, el siguiente lo reemplaza. |
| **Bajar la copia** | ~0,1 MB comprimida: unos 3 o 4 segundos a 256 kbps, en segundo plano. Se baja cuando la app no está esperando otra cosa, y si se corta a la mitad se descarta: nunca queda una copia a medias. |
| **La cáscara del service worker** | Se descarga una sola vez por despliegue (los archivos JS y CSS de la app), en segundo plano. |
| **Equipos en riesgo (2.7)** | Los 3 minutos se cuentan desde el **último contacto bueno**. Una línea que va y viene, pero que logra conectar al menos una vez cada 3 minutos, no marca al equipo en riesgo. |

**Con conexión, A–D no cambian la velocidad:** cada clic sigue haciendo lo de hoy (navegador →
Vercel → Supabase → de vuelta). Para eso está la parte E (sección 7). Lo que se revisó:

1. **La región de Vercel ya está bien:** `iad1` (Washington), confirmada por Nicolás el 18-nov,
   junto a Supabase (East US). Los viajes entre Vercel y la base son cortos. Lo que queda es el
   tramo del navegador en Venezuela hasta Vercel: **un viaje por clic**, que con una línea lenta es
   lo que se siente.
2. **`staleTimes` no se propone.** Haría instantáneo volver a una sección vista hace unos
   segundos, pero la guía de Next 16 dice que `router.refresh()` (lo que hace la app después de
   guardar) limpia el caché **solo de la pantalla actual**. Ejemplo: se confirma un pago en Pagos,
   se va a Propietarios, que se había visto 10 segundos antes, y el saldo de esa unidad todavía
   aparece **sin el pago**, hasta que pasen los segundos o se recargue. Lo propio se vería viejo
   en otras pantallas: en contabilidad no conviene. La parte E logra lo mismo sin ese problema.

La prueba de concepto se prueba también con la conexión frenada a propósito (en Chrome, DevTools →
Network → «Slow 4G» y «3G»), además de desconectada, para medir los 8 y 15 segundos y ajustarlos.

---

## 7. Parte E — «primero la copia», también con conexión

Idea aprobada por Nicolás el 18-nov: si se construye la copia local, que también haga más rápida
la versión con conexión.

### Qué significa «los saldos los da la base»

El saldo de cada unidad (lo que debe, por mes, en cada cuenta) **lo calcula Postgres**, con
`saldo_unidad`, la vista `saldos_actuales`, `deuda_partidas` y `cerrar_periodo`, a partir de
todos los recibos, pagos, ajustes y cargos, con las reglas de la ronda 12 y del cambio 2 (mora →
cuotas extraordinarias → cuotas y cargos por antigüedad → multas). La app **nunca calcula un
saldo**: muestra el número que le dio la base.

La regla dice que eso **no se duplica en el navegador**: si la cuenta estuviera en dos lugares, un
día darían números distintos, y nadie sabría cuál es el bueno. Por eso, sin conexión, los saldos
son los de la última copia, y lo hecho sin conexión va aparte, sin sumarse ni restarse.

**La parte E no rompe esa regla.** La copia es una **foto de lo que dijo la base**: el navegador
no hace ninguna cuenta. Lo único que cambia es que, durante un segundo o dos, lo que se ve puede
ser la foto de hace un rato, mientras llega la nueva.

### Cómo funcionaría

- Al entrar a una pantalla de un edificio que tiene copia, **se dibuja al instante con la copia**,
  sin esperar al servidor. Al mismo tiempo se pide lo fresco a la base y, cuando llega (1 a 3
  segundos), **reemplaza** la foto.
- Mientras tanto, las cifras de saldo llevan una marca discreta, «Actualizando…», y no se puede
  hacer nada que dependa del saldo exacto (repartir un pago, cerrar el mes, simular el cierre):
  esos botones esperan lo fresco.
- **Lo propio nunca se ve viejo.** Lo que hace el administrador entra a la copia en el momento
  (1.1 f) y **todas las pantallas leen de la misma copia**. Si confirma un pago y se va a
  Propietarios, el pago ya está ahí (el problema de `staleTimes` no existe).
- Lo de los demás llega por la consulta de cada minuto, o al entrar a la pantalla.
- Las pantallas que no están en la copia (Estadísticas, Estado financiero, Mensajes, Accesos,
  Ajustes) siguen como hoy.

**Para qué edificios.** Para que valga en el día a día, la copia tiene que existir para el edificio
en que se trabaja. Propuesta: el edificio que se abre queda «disponible sin conexión»
automáticamente (se puede desmarcar), y cada administrador tiene sus edificios listos sin hacer
nada.

### Lo que cambia por dentro

Es el mismo mecanismo de la cáscara (1.1 c), usado también con conexión: dentro de
Administración, navegar entre secciones de un edificio con copia deja de pedirle la página al
servidor y la arma en el navegador. La **primera** entrada a `/admin` sigue pasando por el
servidor y por `proxy.ts` (sesión y rol); los datos frescos se piden con la sesión del usuario y
la misma RLS de hoy. Las páginas del servidor no se borran: siguen sirviendo para los edificios
sin copia y como respaldo.

### Riesgos y tamaño

- **Cambia lo que se ve con conexión**, todos los días, y no solo durante un corte: hay que
  probarlo más que el resto. Va detrás del mismo interruptor.
- **Ver un número viejo un segundo** puede confundir («¿no había pagado?»). La marca
  «Actualizando…» y el bloqueo de lo que depende del saldo exacto son para eso.
- **Tamaño: mediana** (≈ 15–20 % del total), porque reusa casi todo de A: la copia, las funciones
  de armado, la cáscara y el aviso.
- **Consumo:** cada entrada a una pantalla pide lo fresco, como hoy; no hay viajes de más.

### Dónde va en el orden

**Justo después de A** (decidido el 18-nov). Motivos:

- **Reusa casi todo de A** (copia, funciones de armado, cáscara, aviso): se hace con eso recién
  construido y probado, sin volver a abrirlo semanas después.
- **B y C se construyen una sola vez.** Con E hecha, las pantallas ya se arman desde la copia
  con o sin conexión. Las escrituras de B y C (con su bandeja) se agregan sobre ese único camino.
  Si E fuera al final, las pantallas de pagos y gastos se harían primero sobre el camino de hoy
  y después habría que rehacerlas.
- La mejora de velocidad llega a todos los administradores, todos los días, no solo en los cortes.

El costo: B (pagos sin conexión, lo de más valor para los cortes) llega más tarde, lo que dura E
(≈ 15–20 % del total). Y E cambia lo que se ve con conexión: se prueba más a fondo antes de
seguir con B.

---

## 8. Prueba de concepto (18-nov) — resultado

Rama **`app-sin-conexion`** (Nicolás eligió el nombre; reemplaza a `cambio-3-sin-conexion` en todo
este documento). Alcance: Propietarios sin conexión, de punta a punta.

### Qué se construyó

| Pieza | Archivo |
|---|---|
| Interruptor (`NEXT_PUBLIC_SIN_CONEXION`): encendido en Preview y con `SIN_CONEXION=1`, apagado en producción | `next.config.ts`, `lib/local/config.ts` |
| Service worker con Serwist, alcance `/admin/`: red primero, 8 s como máximo, y si falla, a la cáscara | `app/sw.ts`, `app/serwist/[path]/route.ts` |
| Manifiesto e íconos de 192 y 512 px | `app/manifest.ts`, `public/icon-192.png`, `public/icon-512.png` |
| Cáscara pública y sin datos | `app/(admin)/admin/sin-internet/` |
| `proxy.ts`: cáscara pública; `/serwist/*` y el manifiesto fuera del `matcher` | `proxy.ts` |
| Armado compartido de Propietarios (servidor y copia, una sola función) | `lib/admin/pantallas/propietarios.ts` |
| Copia local por usuario (IndexedDB), sesión leída sin red, conexión comprobada de verdad | `lib/local/*` |
| Copia automática del edificio abierto y aviso en el lateral; Salir borra la copia | `components/sin-conexion/ModoSinConexion.tsx`, `MarcoAdmin.tsx` |

Dependencias nuevas: `@serwist/turbopack` y `serwist` 9.5.15, `idb` 8.0.4, y para armar el
service worker en el build `esbuild` y `esbuild-wasm` 0.28.2 (de desarrollo). Todas con versión
exacta. `npm audit` muestra avisos que ya estaban (`next`, `sharp`, `source-map-js`), no de estas.

### Probado contra `next start` (localhost:3123, base de pruebas, cuenta `admin.prueba`)

El corte se simuló **apagando el servidor**: el navegador sigue «con internet», pero nadie contesta.
Es el caso más difícil, porque `navigator.onLine` sigue diciendo que hay conexión.

| # | Prueba | Resultado |
|---|---|---|
| 1 | Con conexión: service worker activo con alcance `/admin/`, 87 archivos guardados (3,2 MB, una vez por despliegue), copia del edificio guardada sola, lateral «Disponible sin conexión · 00:45» | ✅ |
| 2 | En el caché del service worker no hay ninguna página con datos: solo la cáscara y los archivos del build | ✅ |
| 3 | Sin servidor, **recargar** Propietarios (F5) → la cáscara con la copia: 101 y 102, $ 150,00 cada una | ✅ |
| 4 | Sin servidor, **clic en el menú** (Inicio) → Next falla la navegación, cae a navegación del navegador, el service worker lleva a la cáscara: «Esta sección todavía no se puede ver sin conexión» | ✅ |
| 5 | Dentro de la cáscara, sin red, «Ver Propietarios» → Propietarios desde la copia, sin pedir nada | ✅ |
| 6 | Franja: «Sin conexión: está viendo los datos de 00:48» mientras no hay servidor; con servidor, «Volvió la conexión» y «Ver lo último», que vuelve a la página real | ✅ (la primera versión decía «Volvió» con el servidor apagado: corregido con una comprobación real, `lib/local/conexion.ts`) |
| 7 | Salir → se borra la base local del usuario y la sesión | ✅ |
| 8 | Cáscara sin sesión → «No hay una sesión abierta en este equipo», sin datos | ✅ |
| 9 | Build con el interruptor apagado: en el código del navegador queda `SIN_CONEXION_ACTIVO = false`, no se registra nada | ✅ |
| 10 | `npm run build`, `npm run lint`, `npx tsc --noEmit` | ✅ los tres |

### Lo que aprendimos (y entra en la parte A)

- **El diseño funciona con el router de Next 16.** Era el riesgo más grande. Sin
  `experimental.useOffline`, cuando un clic no llega al servidor, Next hace una navegación normal
  del navegador (lo dice su código: «Falling back to browser navigation»), y ahí la toma el service
  worker. No hizo falta tocar nada de Next.
- **Serwist con Turbopack funciona** en Windows (esbuild nativo) y queda listo para Vercel (Linux,
  `esbuild-wasm`).
- **`navigator.onLine` no sirve para el aviso:** con el servidor caído decía «en línea». El aviso
  usa una consulta real con reintentos.
- **Los logos no se ven sin conexión:** `next/image` pasa por el optimizador del servidor. En la
  cáscara se sacó el logo; en A, el componente `Logo` va con `unoptimized` o como texto.
- **El panel del navegador del asistente** deja de dibujar cuando se apaga la pantalla; las
  pruebas siguieron leyendo el texto de la página.

### Lo que no se probó todavía

- **Internet lento de verdad** (los 8 segundos): se prueba en el Preview con Chrome, DevTools →
  Network → «Slow 4G» y «3G».
- **Corte real** (Wi-Fi apagado, modo avión) y **el caso viernes → lunes** (cerrar el navegador,
  abrirlo sin red con el token vencido). Por diseño debería abrir la copia: la sesión se lee de la
  cookie sin verificar su vencimiento.
- **Instalar la app** desde Chrome o Edge en el Preview.
- El manifiesto existe también con el interruptor apagado: Chrome podría ofrecer «Instalar» en
  producción. Inofensivo, pero se puede condicionar en A.

## 9. Parte A (18-nov) — resultado

Nicolás aprobó seguir con A después de la prueba de concepto. Rama `app-sin-conexion`.

### Qué se agregó a la prueba de concepto

| Pieza | Dónde |
|---|---|
| **`copia_edificio()`**, aplicada en vecitap-pruebas (con su rollback). Cambió respecto de 1.1 g: **no** arma toda la copia, solo lo que va por unidad (historial y detalle por mes), llamando a `historial_unidad()` y `deuda_por_mes()` sin copiar su lógica. Lo demás se baja con las mismas consultas que las páginas, así hay una sola definición de cada consulta. En el Edificio Gustavo: ~2,4 s en el servidor, ~250 KB | `supabase/migrations/20261118120000_copia_edificio.sql` |
| Consultar y armar, separados y compartidos, en **Inicio, Ficha, Pagos, Gastos del mes y Cortes** (y Propietarios, de la prueba). Las páginas en línea quedaron con la misma salida; la de Inicio pasó su dibujo a `PantallaInicio` | `lib/admin/pantallas/*`, `components/admin/PantallaInicio.tsx` |
| Copia completa (formato 2): lateral, las seis pantallas, gastos del mes abierto y recibos del último mes cerrado | `lib/local/almacen.ts`, `lib/local/copia.ts` |
| **Huella** cada minuto: una consulta de unos cientos de bytes (`auditoria` + cargos + notas); la copia entera solo se baja si cambió algo, y una vez por hora como red | `lib/local/copia.ts`, `ModoSinConexion.tsx` |
| Pantalla sin conexión **con el lateral** de siempre (`MarcoAdmin` con `local`) y las seis pantallas; las demás dicen «necesita conexión» | `app/(admin)/admin/sin-internet/Cascara.tsx` |
| Los componentes que piden datos solos (detalle por mes, gastos del mes, recibos, correo) leen la copia cuando están sin conexión; en línea no cambian | `lib/local/contexto.tsx`, `DeudaPorMes`, `CierreMes`, `Cortes` |
| **Borradores** (sección 3): Registrar un pago (también el agrupado), Exoneración, gasto nuevo, cargo a una unidad, y datos, contactos y nota de la ficha | `lib/local/borrador.ts`, `AvisoBorrador.tsx` |
| «Salir» que borra la copia en los tres lugares (Administración, Sin acceso, Garita) | `FormularioSalir.tsx` |
| Logo visible sin conexión; manifiesto que no ofrece instalar con el interruptor apagado | `components/ui/Logo.tsx`, `app/manifest.ts` |
| **Service worker de emergencia** (`SIN_CONEXION_APAGAR=1` + desplegar) | `app/sw-apagar.ts` |

### Probado contra `next start` (base de pruebas, `admin.prueba`, «Cambio 2 · prueba»)

| Prueba | Resultado |
|---|---|
| Copia formato 2: 13 KB para 2 unidades, con historial (6), detalle por mes (6), pagos (2) y recibos del último mes (2) | ✅ |
| `copia_edificio()` como `admin.prueba`: las mismas filas que una por una; un edificio ajeno sale vacío | ✅ |
| Sin servidor: **Inicio** (por cobrar $ 300,00, quién debe más), **Propietarios**, **Ficha** de la 101 (estado de cuenta, detalle por mes julio–septiembre, historial), **Pagos**, **Gastos del mes** (con «La previa del reparto necesita conexión»), **Cortes** (los 2 recibos de septiembre), **Estadísticas** («necesita conexión») | ✅ |
| Sin servidor, el lateral navega entre secciones desde el equipo | ✅ |
| Borrador: monto y referencia escritos → recargar → formulario vacío con «Recuperamos lo que estaba escribiendo» → «Seguir» los devuelve | ✅ |
| Las seis páginas **en línea** devuelven 200 con su contenido y sin errores; unidad y edificio ajenos siguen cayendo en «no encontrado» | ✅ |
| Service worker de emergencia: compila y reemplaza al normal | ✅ (no se probó desinstalándose en un navegador) |
| `npm run build` (encendido y apagado), `lint`, `tsc` | ✅ |

Con el panel del navegador del asistente oculto, las páginas que llegan por partes no se
activan (ya anotado en `estado-migracion.md`, cambio 2), así que **los borradores y la huella
en las páginas en línea se probaron dentro de la pantalla sin conexión**, que usa los mismos
componentes. Conviene que Nicolás los pruebe en línea en el Preview.

### Lo que queda para B (o para decidir)

- **Escribir sin conexión**: hoy, si se intenta registrar algo sin conexión, la base no contesta
  y se muestra el error; el borrador queda guardado. La bandeja es la parte B.
- El aviso de «Sin conexión» aparece dos veces en la pantalla sin conexión (el del lateral y el de
  arriba). Se puede dejar solo uno.
- Antes de producción: aplicar `20261118120000_copia_edificio.sql` (Nicolás, con respaldo).

## 10. Partes E, B y C (18-nov) — resultado

Nicolás pidió el 18-nov terminar todas las partes y probar al final. Rama `app-sin-conexion`.
E, B y C están hechas. D (Garita) se propuso en 10.5 y Nicolás la aprobó el mismo día: sección 11.

### 10.1 Qué se construyó

| Parte | Pieza | Dónde |
|---|---|---|
| E | **Primero la copia.** Las fronteras de carga (`loading.tsx`) de Inicio, Propietarios, la ficha, Pagos, Gastos del mes y Cortes dibujan la copia del edificio mientras llega la página fresca, inerte (`inert`) y con «Actualizando… (mostrando los datos de las 10:42)». Cuando llega lo del servidor, Next la reemplaza sola. Sin copia, el «Cargando…» de siempre. En esa vista no se leen ni se guardan borradores | `components/sin-conexion/VistaPrevia.tsx`, `ContenidoCopia.tsx` |
| E | **Lo propio entra a la copia enseguida:** cada cosa que llega a la base vuelve a bajar la copia de ese edificio (antes solo cada minuto, por la huella) | `lib/local/bandeja.ts` (`EVENTO_COPIA_SUCIA`), `ModoSinConexion.tsx` |
| B | **Migración** `20261118140000_bandeja_sin_conexion.sql` (+ rollback): `id_equipo` y `hecho_en` en pagos, gastos, cargos y ajustes, con el trigger que se salta un reintento (2.6); `equipos_sin_conexion`, `latido_equipo`, `equipos_en_riesgo`, `liberar_equipo` y el trigger de `periodos` que no deja cerrar con equipos en riesgo (2.7). Una sola función de trigger para las cuatro tablas (`saltar_id_equipo_repetido`), no cuatro. **Aplicada en vecitap-pruebas**, sin aplicar en producción | `supabase/migrations/` |
| B | **La bandeja** («cosas por enviar») en IndexedDB, y `hacer()`: con conexión manda al instante como siempre; si la red falla o tarda más de 15 s, la cosa queda sola en la bandeja. Envío en orden, una pestaña a la vez (Web Locks), al volver la conexión, al abrir y cada minuto. Red → sigue por enviar; sesión vencida → «entre de nuevo»; rechazo → «Revisar» con el motivo | `lib/local/bandeja.ts`, `envios.ts`, `bandeja-tipos.ts` |
| B | **Pagos:** registrar (uno y agrupado), conciliar y anular (también con el archivo del banco), exonerar. **«Repartir al volver»** sin conexión. Sin conexión, un pago en bolívares sin tasa a mano toma la del BCV de su fecha al llegar (la pone la base, como cuando lo carga el residente) | `components/admin/Pagos.tsx` |
| B | **Aviso de posible duplicado**, también en línea: misma unidad, mismo monto y moneda, fecha a ±3 días, no anulado. En línea pregunta antes de registrar; desde la bandeja, va a «Revisar» con «Es el mismo: descartar el mío» o «Son distintos: enviar igual» | `envios.ts` (`buscarPosiblesDuplicados`), `Pagos.tsx`, `PorEnviar.tsx` |
| B | **«Por enviar»**: en Pagos, en la ficha de la unidad, en Gastos del mes, y la lista completa desde el lateral («3 cosas por enviar · Ver»). Un pago con un cambio pendiente muestra «por enviar: conciliar» y no ofrece los botones de nuevo | `PorEnviar.tsx`, `ModoSinConexion.tsx` |
| B | **Salir bloqueado** con cosas por enviar | `FormularioSalir.tsx` |
| B | **Equipos en riesgo:** cada equipo avisa cada minuto cuántas cosas tiene por enviar de cada edificio con copia; al cerrar la pestaña con conexión avisa «cerrado» (`fetch` con `keepalive`). En Gastos del mes, la lista «Equipos sin conexión» con el botón para liberarlos; con cosas por enviar en este equipo, «Cerrar el mes» queda deshabilitado | `ModoSinConexion.tsx`, `EquiposEnRiesgo.tsx`, `CierreMes.tsx` |
| C | **Gastos del mes:** agregar, editar, borrar y ordenar (sin conexión, la posición final de cada gasto de la categoría). **Cargos a una unidad:** agregar, corregir y quitar. Las ediciones y los borrados viajan con los valores de antes: si otra persona cambió lo mismo, «Revisar» muestra las dos versiones («Usar lo mío» / «Quedarme con lo de la otra persona»). Un gasto o cargo cuyo mes se cerró va a «Revisar» con «Pasarlo al mes abierto» | `CierreMes.tsx`, `CargosUnidad.tsx`, `envios.ts` |
| C | **Ficha:** sin conexión se guardan los datos de contacto de las personas que ya están en la ficha y la nota, con la misma comparación de antes. El código, la alícuota, los saldos, quién paga y cambiar de propietario o inquilino necesitan conexión (lo dice al guardar) | `DatosUnidad.tsx` |

Con el interruptor apagado (producción) todo se porta como antes: no hay bandeja, los inserts
no llevan `id_equipo` (la columna puede no existir en esa base), no se buscan duplicados ni se
comparan versiones, y un error de red se muestra como siempre.

### 10.2 Probado contra `next start` (base de pruebas, `admin.prueba`, «Cambio 2 · prueba»)

| Prueba | Resultado |
|---|---|
| Migración: columnas, unique y triggers (4, 4, 4 y 1), funciones definer/invoker y permisos, 0 funciones con «\r» | ✅ |
| Migración, en una transacción deshecha: el mismo pago con referencia y el mismo `id_equipo` dos veces → 1 fila, sin error; el mismo cargo dos veces → 1; dos pagos sin `id_equipo` → 2 | ✅ |
| Migración: con 2 pendientes, el cierre se rechaza («el equipo de admin.prueba@… tiene 2 cosa(s) sin enviar»); con un equipo mudo hace 5 min, también («sin conexión desde el 18/11 06:37»); liberado o cerrado, la regla pasa; la liberación queda en `auditoria` | ✅ (la regla de cuenta suspendida se apagó dentro de esa transacción para poder llegar a esta) |
| En línea: registrar un pago → llega al instante, con `id_equipo` y `hecho_en`; la copia lo trae enseguida | ✅ |
| En línea: el mismo pago otra vez → «¿Es un pago distinto?» con el que ya estaba | ✅ |
| Sin servidor, en la pantalla sin conexión: un pago de 102, conciliar el de 101, el de 101 repetido y una transferencia «a repartir al volver»; un gasto y un cargo a 101 (por el lateral, que pasa por el service worker) → seis cosas en «Por enviar», «Cerrar el mes» deshabilitado, Salir bloqueado | ✅ |
| Al volver el servidor: se envían solas en orden. El pago, la conciliación, el gasto y el cargo llegan con la hora real del equipo en `hecho_en`; la transferencia se reparte con la deuda del momento (toda a 101, por antigüedad); el repetido queda en «Revisar» como posible duplicado → «Es el mismo: descartar el mío» | ✅ |
| Nota de la ficha sin conexión; «otra persona» la cambia en la base → «Revisar» muestra las dos versiones → «Usar lo mío» la envía | ✅ |
| Gastos del mes en línea: «Equipos sin conexión» muestra un equipo mudo hace 10 min → liberarlo → desaparece, y queda en la auditoría | ✅ |
| Parte E: clic en Propietarios → la copia aparece con «Actualizando…» y la página fresca la reemplaza (0,8 s y 1,1 s con el servidor local) | ✅ |
| `npm run build` (encendido y apagado), `lint`, `tsc` | ✅ |

Quedaron en «Cambio 2 · prueba» los datos de estas pruebas (pagos de 101 y 102 por $ 7,77,
$ 5,55 y $ 20, el gasto «Vigilancia prueba sin conexion», el cargo «Consumo de agua prueba» y la
nota de 101): el borrado no se aprobó. Se pueden anular o borrar desde la app.

### 10.3 Lo que no se probó

- **Con el panel del navegador del asistente oculto**, las páginas en línea que llegan por
  partes a veces se quedan en «Cargando…» (ya anotado en la parte A). Por eso la parte E se
  midió con clics dentro de una página ya cargada, no con F5.
- La vista previa tarda lo que tarda Next en traer la frontera de carga si no la precargó: con
  la página visible y el menú a la vista, Next la precarga y debería ser inmediata. **Conviene
  que Nicolás lo mire con internet lento** (DevTools → «Slow 4G»): es donde la parte E se nota.
- Una sesión vencida de verdad (el aviso «entre de nuevo») y dos pestañas mandando a la vez.
- Cerrar un mes de verdad en pruebas con la bandeja vacía (la regla nueva se probó en la base).
- Contactos de la ficha sin conexión (mismo camino que la nota, sin prueba propia).

### 10.4 Decisiones tomadas al construir (para revisar)

- **«Es el mismo»** descarta el pago propio y deja el otro como estaba (reportado o conciliado).
  El plan decía «confirmar el del residente»; no se confirma solo porque confirmar es decir que
  el dinero llegó, y eso lo tiene que mirar el administrador.
- **«Corregir y reenviar»** no edita la cosa dentro de «Revisar»: se descarta y se vuelve a
  cargar en el formulario. «Reintentar» la manda de nuevo tal cual.
- **Confirmar o anular algo que todavía está por enviar** no se puede: primero tiene que llegar.
  Así no hace falta encadenar una cosa con otra («dependencias» de 2.3).
- **«Revisar» cuenta como pendiente** para el cierre: el mes no se cierra hasta que se resuelva.
- **El orden de los gastos en línea** sigue con `mover_gasto`; la posición final se usa solo sin
  conexión.

### 10.5 Parte D (Garita) — propuesta

Propuesta del 18-nov: guardar en el equipo de la garita las invitaciones del día con el código
**resumido**, validar contra esa lista sin conexión y mandar entradas y salidas al volver.
**Aprobada por Nicolás el mismo día** («al final son visitas… sí podríamos guardar de forma
resumida los códigos del día»), junto con las cuatro decisiones de 10.4. Resultado en la sección 11.

## 11. Parte D, Garita (18-nov) — resultado

### 11.1 Qué se construyó

| Pieza | Dónde |
|---|---|
| **Migración** `20261118150000_garita_sin_conexion.sql` (+ rollback): `garita_lista_del_dia` (las invitaciones de hoy y de las próximas 24 h, con el código resumido en sha256, nunca el código), `visitas.id_equipo` y `hecho_en`, `garita_entrada_diferida` (la invitación se juzga a la hora en que la persona entró; si al llegar ya no vale, la entrada se registra igual y queda una novedad en la bitácora; un reintento devuelve la misma visita) y `garita_salida_diferida` (por id, o por el `id_equipo` de una entrada que también se hizo sin conexión). Las tres autorizan con `permitir_garita`. **No se tocó** `permitir_garita`, `puede_garita`, `edificios_del_vigilante`, `garita_entrada` ni `garita_salida`: sus md5 son los mismos. **Aplicada en vecitap-pruebas**, sin aplicar en producción | `supabase/migrations/` |
| El service worker se registra también con alcance `/garita/`; sin red, las páginas de la garita llevan a `/garita/sin-internet` (pública en `proxy.ts`, como la de Administración) | `app/sw.ts`, `app/serwist/[path]/route.ts`, `proxy.ts` |
| La copia de la garita (almacén `garita` de la base local): lista del día resumida, directorio y quién está adentro. Con conexión se baja entera cada minuto (son pocas filas) | `lib/garita/sin-conexion.ts`, `components/garita/ModoGarita.tsx` |
| **Entrada sin conexión:** el código que muestra la visita se resume en el equipo y se busca en la lista; mismas reglas que `garita_validar` (anulada, todavía no empieza, venció, ya se usó), contando también las entradas de este equipo que no se enviaron. «Registrar entrada» y «Visita sin anunciar» van a la bandeja con su hora. Con conexión, si la red falla al validar o al registrar, se usa la lista guardada y la bandeja | `components/garita/VistaEntrada.tsx` |
| **Adentro sin conexión:** la lista de la copia más las entradas por enviar, menos las salidas por enviar; «Registrar salida» va a la bandeja | `components/garita/VistaAdentro.tsx` |
| La pantalla sin internet de la garita: Entrada y Adentro; Consultar y Bitácora dicen que necesitan conexión | `app/(garita)/garita/sin-internet/` |
| Al llegar, al residente se le avisa solo si la entrada tiene menos de 30 minutos (un aviso de hace horas confunde) | `lib/local/envios.ts` |

### 11.2 Qué tan sensible es lo que queda en el equipo

Quien tenga el equipo de la garita ve los **nombres, cédulas y placas** de las visitas del día y
de quién está adentro, igual que hoy en pantalla. **No ve los códigos:** solo su resumen. Los
códigos son 16 caracteres hexadecimales al azar (64 bits), así que no se pueden sacar probando a
partir del resumen. Se borra al salir, como el resto de la copia.

### 11.3 Probado contra `next start` (base de pruebas, `vigilante.prueba`, Torre Ida)

| Prueba | Resultado |
|---|---|
| Migración, en una transacción deshecha: la lista trae el resumen y no el código; un vigilante de otro edificio, «Sin permiso para la garita de este edificio»; la misma entrada dos veces → 1 visita y el mismo id, con la invitación usada 1 vez; una invitación ya usada → entra igual y deja una novedad; una hora de mañana → rechazada; salida por `id_equipo` → «salio» | ✅ |
| md5 de `permitir_garita`, `puede_garita`, `edificios_del_vigilante`, `garita_entrada` y `garita_salida`: iguales antes y después; 0 funciones con «\r» | ✅ |
| Con conexión: service worker con alcance `/garita/`; la copia guardada sola, **sin el código** en el equipo (solo el resumen) | ✅ |
| Sin servidor, recargar → pantalla sin internet de la garita. El código de una invitación de prueba → «Puede pasar»; registrar → bandeja; el mismo código otra vez → «Ya se usó»; un código que no existe → «no está en la lista del día» | ✅ |
| Sin servidor: una visita sin anunciar con vehículo, y su salida en Adentro (por el menú, que pasa por el service worker) → 3 cosas por enviar | ✅ |
| Al volver: las tres llegan con la hora real (`entrada_en` y `salida_en` = la del equipo), la bitácora dice «registrada sin conexión» y la invitación quedó con 1 uso | ✅ |

Quedó en Torre Ida una invitación de prueba (código `C3C3…`, nota «Prueba del asistente») y las
dos visitas de esta prueba; «Visita prueba sin conexión» sigue adentro.

### 11.4 Lo que no se probó o queda abierto

- Si `garita_entrada` llega a la base pero se pierde la respuesta (con conexión y la red se corta
  justo en ese momento), la entrada pasa a la bandeja y puede quedar dos veces. Sin conexión no
  pasa: la diferida no duplica.
- Una invitación creada después de la última copia no está en la lista: sin conexión se la
  rechaza («no está en la lista del día»). La pantalla lo dice.
- Sin conexión no se asienta en la bitácora el intento con un código que no existe (en línea sí).

## Preguntas abiertas

Ninguna. Falta que Nicolás pruebe A, E, B, C y D en el Preview.
