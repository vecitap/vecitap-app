# Plantillas de correo de Supabase Auth

Los **tres** correos que manda Supabase Auth por su cuenta. No confundir con
los correos del producto (recibos, avisos de la garita, invitaciones): esos no
los manda Supabase Auth ni salen de acá — los arma la base y los despacha
`despachar_correos()` vía Resend. Ver `docs/consultas-produccion.sql`,
bloque (f).

| Archivo | Plantilla en el dashboard | Asunto sugerido |
|---|---|---|
| [`confirmacion-registro.html`](confirmacion-registro.html) | **Confirm signup** | `Confirme su cuenta de Vecitap` |
| [`recuperar-clave.html`](recuperar-clave.html) | **Reset password** | `Recupere su clave de Vecitap` |
| [`cambio-de-correo.html`](cambio-de-correo.html) | **Change email address** | `Confirme su correo nuevo en Vecitap` |

## Dónde se pegan

Supabase → el proyecto → **Authentication → Emails → Templates**, y ahí la
pestaña de cada plantilla.

1. Elija la pestaña de la tabla de arriba.
2. Copie el **asunto** sugerido en *Subject heading*.
3. Abra el `.html` correspondiente, **copie el archivo entero** (los
   comentarios `<!-- -->` del principio son inofensivos, puede dejarlos o
   sacarlos) y péguelo en *Message body*.
4. **Save**.
5. Repita con las tres.

Hágalo en **vecitap-produccion**. En vecitap-pruebas es opcional, pero conviene
para poder probar el flujo completo antes.

## Lo que hay que tener puesto para que funcionen

**`{{ .SiteURL }}` sale de Authentication → URL Configuration → Site URL.** Si
ahí no dice `https://vecitap.com`, todos los enlaces de estos tres correos
salen mal. Es una sola casilla y es la que rompe todo.

Y en **Redirect URLs** de esa misma pantalla:

```
https://vecitap.com/**
http://localhost:3000/**
https://*.vercel.app/**
```

Cuánto dura el enlace se configura aparte, en **Authentication → Emails** →
*Email OTP Expiration*. Las plantillas dicen "vence" sin dar un número a
propósito: si mañana se cambia ese ajuste, el texto sigue siendo cierto.

## Por qué `token_hash` y no `{{ .ConfirmationURL }}`

Es el motivo principal por el que estas plantillas existen en vez de usar las
que trae Supabase.

La plantilla por defecto usa `{{ .ConfirmationURL }}`, que pasa por
`/auth/v1/verify` y vuelve al sitio con `?code=…`. Ese `code` es del **flujo
PKCE**, y canjearlo exige un verificador que vive en una **cookie del
navegador que pidió el enlace**. En la práctica:

> Pide el enlace en la computadora, abre el correo en el teléfono, y no
> funciona. El mensaje no explica por qué.

Eso pasa todo el tiempo — mucha gente lee el correo en el teléfono y trabaja
en la computadora.

`{{ .TokenHash }}` no depende de ninguna cookie: el token viaja en la
dirección y `app/auth/confirmar/route.ts` lo valida con `verifyOtp`. **Funciona
en cualquier dispositivo.**

La ruta sigue aceptando **los dos** formatos, así que los correos con `?code=`
que ya estén en la bandeja de alguien no se rompen al cambiar las plantillas.

## Cómo se arma cada enlace

```
{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=<tipo>&de=<intención>&siguiente=<ruta>
```

| Plantilla | `type` | `de` | `siguiente` | A dónde cae |
|---|---|---|---|---|
| Confirm signup | `signup` | `registro` | `%2Fdestino` | `/destino`, que resuelve el panel según el rol |
| Reset password | `recovery` | `clave` | `%2Fentrar%3Fclave%3Dnueva` | `/entrar?clave=nueva`, con el formulario ya abierto en "clave nueva" |
| Change email address | `email_change` | `correo` | `%2Fdestino` | `/destino` |

Tres detalles que se rompen fácil si alguien edita los enlaces a mano:

- **`&` va como `&amp;`** dentro del `href`, porque es HTML. Los archivos ya
  lo tienen así.
- **`siguiente` va percent-encodeado.** Es una URL dentro de otra: `/` es
  `%2F`, `?` es `%3F` y `=` es `%3D`. Sin eso, el `?clave=nueva` se lee como
  un parámetro del enlace de afuera y se pierde.
- **`de` solo cambia el texto del mensaje de error**, nada más. No decide
  destino ni permisos. Los valores que la ruta entiende son `registro`,
  `correo` y `clave`; cualquier otra cosa se trata como `clave`.

`siguiente` lo sanea `rutaInterna()` (`lib/url-sitio.ts`): solo acepta rutas
internas. Aunque alguien reenvíe un enlace con `siguiente` cambiado a otro
dominio, la ruta cae en `/destino`.

## Las plantillas que NO se tocan

Supabase muestra más pestañas. Estas quedan **con el texto por defecto,
apagadas o sin usar**, y conviene saber por qué para que nadie las configure
"por completitud":

- **Magic Link** — *la app no lo usa.* Se entra con correo y clave
  (`signInWithPassword`); no hay ninguna llamada a `signInWithOtp` en todo el
  código. Por eso no hay plantilla para esa pestaña. Si algún día se agrega
  ese flujo, la plantilla se copia de `recuperar-clave.html` cambiando
  `type=magiclink` y `siguiente=%2Fdestino`; la ruta ya acepta ese tipo.
- **Invite user** — *la app no lo usa.* Vecitap tiene su propio sistema de
  invitaciones (tabla `invitaciones`, RPC `crear_invitacion` /
  `aceptar_invitacion`), y el correo lo manda la base por Resend, no Supabase
  Auth. El administrador copia el código desde Admin → Accesos. Configurar
  esta plantilla no rompe nada pero no la ve nadie.
- **Reauthentication** — no se usa: manda un código de 6 dígitos, no un
  enlace, y ningún flujo de la app lo pide.

## Los colores están escritos a mano acá, y es la única excepción

`AGENTS.md` dice que la paleta vive **solo** en `app/globals.css` y que no se
duplican valores hex en ningún otro lado. Estos tres archivos son la
excepción, porque no hay alternativa: el correo no carga hojas de estilo
externas, no entiende `var(--tinta)` y muchos clientes ni siquiera respetan un
`<style>` en el `<head>`. Todo tiene que ir en atributos `style` inline con el
valor literal.

Los que se usan, y de dónde salen (tema **claro** de `app/globals.css`, porque
un correo no tiene tema oscuro fiable):

| Uso en la plantilla | Token | Valor |
|---|---|---|
| Fondo de la página | `--fondo` | `#F8FAFC` |
| Fondo de la tarjeta | `--lienzo` | `#FFFFFF` |
| Banda de arriba, títulos | `--tinta` | `#0A1128` |
| Texto del cuerpo | `--tinta-2` | `#2A3654` |
| Texto secundario, pie | `--tenue` | `#64748B` |
| Bordes y separadores | `--linea` | `#E4E9F0` |
| Fondo del botón | `--acento` | `#F98513` |
| Texto del botón | `--acento-sobre` | `#0A1128` |
| Fondo del aviso | `--acento-suave` | `#FDF0E0` |
| Texto del aviso | `--acento-texto` | `#92400E` |
| Fondo del bloque de datos | `--azul-bg` | `#EEF2F7` |

**Si la paleta cambia en `globals.css`, hay que venir a cambiarla acá también.**
No se entera sola.

Lo mismo con la tipografía: las plantillas usan `Helvetica, Arial, sans-serif`
y no Inter/Poppins. Una fuente web no se puede cargar de forma fiable en un
correo, y forzarla termina en que cada cliente elija cualquier cosa.

## Cómo probarlas antes de confiar en ellas

1. En **vecitap-pruebas**, pegue las tres plantillas.
2. Cree una cuenta con una dirección real suya → tiene que llegar el correo de
   confirmación, y el botón tiene que dejarla dentro.
3. **Ábralo en el teléfono habiendo pedido el enlace en la computadora.** Es
   la prueba que justifica todo este archivo; con `{{ .ConfirmationURL }}`
   fallaba.
4. Pida "Olvidé mi contraseña" → el enlace tiene que abrir `/entrar` ya en
   modo "clave nueva", no en el formulario de entrar.
5. Toque el mismo enlace **dos veces**. La segunda tiene que caer en
   `/entrar?error=enlace&de=…` con el mensaje en castellano, sin detalle
   técnico y sin sesión.
6. Mírelos en Gmail y en Outlook, en teléfono y en computadora. Outlook en
   Windows es el que rompe los botones; por eso el color de fondo va en el
   `<td>` y no solo en el `<a>`.
