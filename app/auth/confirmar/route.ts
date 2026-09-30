import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { rutaInterna } from "@/lib/url-sitio";

/**
 * Aterrizaje de los enlaces que Supabase Auth manda por correo: confirmar la
 * cuenta recién creada, recuperar la clave y confirmar un cambio de correo.
 *
 * **Por qué existe esta ruta y no se resuelve en el cliente.**
 * `@supabase/ssr` usa el flujo **PKCE** (lo fija `createBrowserClient`, no es
 * configurable acá), así que el enlace del correo no vuelve con un `#` lleno
 * de tokens sino con `?code=…`, que hay que **canjear** por una sesión. Ese
 * canje se puede hacer en el navegador —el cliente lo intenta solo con
 * `detectSessionInUrl`— pero ahí el resultado llega por un evento
 * (`PASSWORD_RECOVERY`) que puede dispararse **antes** de que el componente
 * alcance a suscribirse, porque el cliente del navegador es un singleton que
 * ya puede estar creado. Haciéndolo acá no hay carrera posible: cuando la
 * persona ve la pantalla, la sesión ya está en las cookies y la URL dice sin
 * ambigüedad en qué modo abrir el formulario.
 *
 * **Los dos formatos de enlace que acepta**, a propósito:
 * - `?code=…` — lo que generan las plantillas por defecto de Supabase
 *   (`{{ .ConfirmationURL }}`). Exige que el correo se abra en el **mismo
 *   navegador** que pidió el enlace: el verificador PKCE vive en una cookie
 *   de este sitio.
 * - `?token_hash=…&type=…` — el formato de `{{ .TokenHash }}`, que **no**
 *   depende de esa cookie y por eso funciona si la persona pide el enlace en
 *   la computadora y abre el correo en el teléfono. Es el que usan las
 *   plantillas de `docs/plantillas-correo/`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ESTO ES CÓDIGO DE SEGURIDAD. Las cuatro reglas que no se pueden romper:
 *
 * 1. **`siguiente` es entrada ajena.** Viaja dentro del enlace del correo y
 *    vuelve por la URL. Lo sanea `rutaInterna()` (ver `lib/url-sitio.ts`), y
 *    acá se vuelve a comprobar que el destino final siga siendo este origen.
 *    Sin eso, el enlace de confirmación de Vecitap sería un **redirector
 *    abierto**: un correo de phishing podría usar un enlace legítimo de
 *    vecitap.com para mandar a la gente a otro sitio.
 * 2. **Toda salida lleva las cookies.** Las de éxito y las de error. Es la
 *    misma regla que `redirigirConCookies()` en `proxy.ts`, y el motivo es
 *    el mismo: una redirección nace vacía. Por eso acá las cookies se juntan
 *    en una lista y se aplican **a la respuesta que se devuelva**, sea cual
 *    sea — no a una armada de antemano.
 * 3. **Nunca se muestra `error.message`.** Los mensajes de Auth distinguen
 *    entre "token inválido" y "token vencido", y esa diferencia le sirve más
 *    a quien prueba enlaces a mano que a la persona que se equivocó.
 * 4. **`type` se valida contra una lista.** Llega del URL y termina en una
 *    llamada de autenticación.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Los únicos `type` que esta ruta acepta. Llega del URL: no se confía. */
const TIPOS_VALIDOS = [
  "signup",
  "recovery",
  "email_change",
  "email",
  "invite",
  "magiclink",
] as const satisfies readonly EmailOtpType[];

function tipoValido(valor: string | null): EmailOtpType | null {
  if (!valor) return null;
  return (TIPOS_VALIDOS as readonly string[]).includes(valor)
    ? (valor as EmailOtpType)
    : null;
}

export async function GET(request: NextRequest) {
  const parametros = request.nextUrl.searchParams;
  const code = parametros.get("code");
  const tokenHash = parametros.get("token_hash");
  const tipo = tipoValido(parametros.get("type"));

  // Para qué era el enlace, solo para poder dar un mensaje útil si falla
  // ("pida otro" no se dice igual para un registro, una clave o un cambio de
  // correo). No decide nada: no toca permisos ni destino, solo el texto.
  const deCrudo = parametros.get("de");
  const de = deCrudo === "registro" || deCrudo === "correo" ? deCrudo : "clave";

  /* Las cookies que escriba Supabase se juntan acá y se aplican al final, a
     la respuesta que realmente se devuelva. Antes se escribían sobre una
     redirección armada de antemano, y la rama de error devolvía OTRA
     respuesta: las cookies de esa rama —incluidas las de BORRADO, que es
     como @supabase/ssr limpia un verificador PKCE ya usado o una sesión
     rota— se perdían. Regla 2 de arriba. */
  const cookiesNuevas: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesNuevas.push(...cookiesToSet);
        },
      },
    }
  );

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
    ok = !error;
  }
  // Sin `code` ni `token_hash` válidos —enlace recortado por el cliente de
  // correo, o Supabase devolviendo `?error=access_denied&error_code=otp_expired`
  // cuando el enlace venció— `ok` queda en false y se va por la rama de
  // error, que es lo correcto. No se lee ese `error_description`: es texto
  // de un tercero y no se le muestra a nadie (regla 3).

  const destino = request.nextUrl.clone();
  destino.hash = "";

  if (ok) {
    const ruta = new URL(rutaInterna(parametros.get("siguiente")), request.nextUrl.origin);
    // Segunda comprobación, después de `rutaInterna`: defensa en profundidad.
    // Copiar `pathname`/`search` sobre una URL de este origen ya garantiza
    // que el host no cambia —asignar `.pathname` nunca reescribe el host,
    // comprobado— pero eso es una propiedad implícita del parser, y la
    // seguridad no debería apoyarse en algo que no se ve en el código.
    if (ruta.origin === request.nextUrl.origin) {
      destino.pathname = ruta.pathname;
      destino.search = ruta.search;
    } else {
      destino.pathname = "/destino";
      destino.search = "";
    }
  } else {
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("error", "enlace");
    destino.searchParams.set("de", de);
  }

  const respuesta = NextResponse.redirect(destino);
  for (const { name, value, options } of cookiesNuevas) {
    respuesta.cookies.set(name, value, options);
  }
  // Un aterrizaje de autenticación no se cachea en ningún lado: la respuesta
  // depende de un token de un solo uso y trae cookies de sesión.
  respuesta.headers.set("Cache-Control", "no-store, max-age=0");
  return respuesta;
}
