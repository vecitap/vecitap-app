import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { esUuid } from "@/lib/validacion";
import { ROLES_ADMIN } from "@/lib/admin/constantes";

const RUTAS_PROTEGIDAS = ["/admin", "/mi", "/operador", "/garita"];
const RUTA_OPERADOR = "/operador";
const RUTA_ADMIN_ORG = /^\/admin\/([^/]+)/;
const RUTA_GARITA_EDIFICIO = /^\/garita\/([^/]+)/;

/**
 * Redirige **conservando las cookies de sesión** que se hayan escrito en esta
 * petición. Se usa en TODAS las ramas de redirect de este archivo: un
 * `NextResponse.redirect()` nace vacío, no hereda nada de la respuesta que
 * veníamos armando.
 *
 * **El problema que resuelve.** Si en esta misma petición el cliente de
 * Supabase refrescó la sesión, las cookies nuevas (access token + refresh
 * token rotado) están en `response`, puestas por el `setAll` de abajo. Al
 * redirigir sin copiarlas, el navegador se quedaba con el **refresh token
 * viejo**, que del lado del servidor ya quedó consumido en ese refresco:
 * la próxima petición volvía a presentar un token ya usado. Dentro de la
 * ventana de reuso de Supabase eso se tolera (devuelve la misma sesión), pero
 * pasada la ventana un refresh token reusado se interpreta como posible robo
 * de token y puede invalidar toda la familia de sesiones — al usuario se le
 * cierra la sesión sin motivo aparente. Copiándolas, navegador y servidor
 * siempre coinciden en cuál es el refresh token vigente.
 *
 * Alcanza también al caso inverso: cuando la sesión se desarma, `setAll`
 * recibe las cookies de borrado (`value: ""`, `maxAge: 0`) y antes también se
 * perdían al redirigir, dejando en el navegador cookies inválidas que se
 * reintentaban en cada petición.
 *
 * **Copia la cookie entera, no un puñado de campos:** `getAll()` devuelve los
 * objetos tal como se guardaron —`path`, `maxAge`, `expires`, `httpOnly`,
 * `sameSite`, `secure`, `domain`— y `set()` acepta ese mismo objeto, así que
 * no hay forma de olvidarse un atributo al enumerarlos a mano.
 */
function redirigirConCookies(
  url: Parameters<typeof NextResponse.redirect>[0],
  response: NextResponse
) {
  const redireccion = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redireccion.cookies.set(cookie);
  }
  return redireccion;
}

/**
 * Se llamaba middleware.ts hasta Next.js 15; en Next 16 el archivo pasó a
 * llamarse proxy.ts (export `proxy`, no `middleware` — mismo mecanismo).
 *
 * Tres trabajos:
 * 1. Refrescar la sesión de Supabase en cada request (si el access token
 *    venció, lo renueva y reescribe las cookies) para que Server
 *    Components y Route Handlers siempre vean una sesión válida.
 * 2. Mandar a /entrar a quien no tiene sesión y pide una ruta protegida.
 *    Desde el 28-sep la sesión se comprueba con `getClaims()` (verificación
 *    local de la firma) en vez de `getUser()` (viaje al servidor de Auth) —
 *    ver el bloque comentado más abajo, donde está el detalle y por qué el
 *    refresco de sesión sigue intacto.
 * 3. Autorización para /operador/* (es_operador(), global), /admin/[orgId]/*
 *    (tiene_rol(orgId, roles), por organización — ahora que la Fase 4 ya
 *    definió la estructura de URL con orgId, ver docs/inventario-admin.md
 *    sección 3) y /garita/[edificioId]/* (edificios_del_vigilante(), por
 *    edificio). /mi/* se queda sin gate de rol acá: no es un rol, es tener
 *    al menos una unidad asociada, y eso lo resuelve cada Server Component
 *    con mis_unidades().
 *    Quien tiene sesión pero no el rol va a /destino, no a `/` (08-oct,
 *    prueba 7 del tramo 1): `/` es la portada de venta, y alguien con sesión
 *    no tiene nada que hacer ahí. /destino lo manda a lo que sí puede ver.
 *    No hay bucle: /destino decide con es_operador / administra_algo /
 *    edificios_del_vigilante, y la página a la que manda (/operador,
 *    /admin, /garita, /mi a secas) no pasa por ninguna de estas tres ramas
 *    —/admin a secas lista solo las organizaciones donde tiene_rol() da sí.
 *
 * Sin distinción por sección todavía (Session 1 del inventario de Admin):
 * cualquiera de los 4 roles entra a /admin/[orgId]/* completo, igual que
 * hoy app.html no distingue nada en el cliente. Si más adelante se decide
 * que contador/junta ven menos, ese gate más fino va en cada Server
 * Component de la sección, no acá (mismo patrón de defensa en profundidad
 * que ya usa /operador).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* ─────────────────────────────────────────────────────────────────────
     Comprobación de sesión SIN viaje al servidor de Auth.

     `getClaims()` verifica la **firma** del access token contra la clave
     pública del proyecto (JWKS) y valida `exp`. No confundir con
     `getSession()`, que decodifica sin verificar y por eso no sirve para
     autorizar: acá la firma se comprueba de verdad, así que un token
     manipulado se rechaza igual que antes. Requiere clave asimétrica —
     las dos bases tienen ECC (P-256) como clave actual, con la HS256
     legacy como anterior (confirmado en el dashboard, 28-sep). Si algún
     día la clave volviera a ser solo HS256, `getClaims()` cae solo a
     `getUser()` por dentro: se pierde el ahorro, no la seguridad.

     **Qué cambia y qué no** (detalle en docs/estado-migracion.md):
     PostgREST ya valida el JWT localmente hasta su `exp` y no consulta
     revocación, así que el `getUser()` de acá nunca fue lo que protegía
     los datos — protegía la navegación. Una sesión revocada y no vencida
     tampoco gana acceso ahora: los cuatro módulos tienen un `getUser()`
     fresco en su layout o page (`usuarioActual()`, lib/supabase/cache.ts),
     que es la defensa en profundidad que sí ve la revocación al instante.

     **El refresco de sesión y la escritura de cookies quedan garantizados
     por el mismo camino que con `getUser()`**, porque el refresco no lo
     hace ninguno de los dos métodos: lo hace el paso previo de cargar la
     sesión, que ambos comparten. La cadena, verificada en la versión
     instalada de las librerías:
       1. `getClaims()` sin argumento llama a `getSession()`
          (auth-js GoTrueClient.js:5509-5516) — por eso NO se le pasa el
          token a mano acá, sería justo lo que saltearía el refresco.
       2. `getSession()` → `__loadSession()` renueva si el token está
          vencido o dentro del margen (`_callRefreshToken`, líneas
          2537-2565) y guarda la sesión nueva (línea 4265).
       3. Guardarla emite `TOKEN_REFRESHED`, y el cliente de `@supabase/ssr`
          engancha ese evento para volcar las cookies vía `applyServerStorage`
          (ssr createServerClient.js:49-66).
       4. Eso llama al `setAll` de acá arriba, que reconstruye `response` y
          le escribe las cookies nuevas.
       5. `return response` al final devuelve esa respuesta reconstruida, y
          las ramas que redirigen pasan por `redirigirConCookies()`, que las
          copia a la redirección (antes se perdían ahí — ver esa función).
     ───────────────────────────────────────────────────────────────────── */
  const { data: verificado, error: errorClaims } = await supabase.auth.getClaims();

  // Falla cerrado, cubriendo las tres formas del tipo de retorno (es una
  // unión de 3: con claims, con error, y **sin ninguno de los dos** cuando
  // simplemente no hay sesión — por eso no alcanza con mirar `error`).
  const sub = verificado?.claims?.sub;
  const haySesion = !errorClaims && typeof sub === "string" && sub.length > 0;

  const esRutaProtegida = RUTAS_PROTEGIDAS.some((ruta) => request.nextUrl.pathname.startsWith(ruta));

  if (!haySesion && esRutaProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("volver", request.nextUrl.pathname);
    return redirigirConCookies(url, response);
  }

  if (haySesion && request.nextUrl.pathname.startsWith(RUTA_OPERADOR)) {
    // Falla cerrado: cualquier error de red o de la función RPC se trata
    // igual que "no es operador", nunca se deja pasar.
    let esOperador = false;
    try {
      const { data, error } = await supabase.rpc("es_operador");
      esOperador = !error && data === true;
    } catch {
      esOperador = false;
    }

    if (!esOperador) {
      const url = request.nextUrl.clone();
      url.pathname = "/destino";
      url.search = "";
      return redirigirConCookies(url, response);
    }
  }

  const enAdmin = haySesion ? request.nextUrl.pathname.match(RUTA_ADMIN_ORG) : null;
  if (enAdmin) {
    const orgId = enAdmin[1];
    // Un orgId con formato inválido (typo, URL armada a mano) ni siquiera
    // llega a tiene_rol(): se corta acá, antes de la consulta.
    let tieneAcceso = false;
    if (esUuid(orgId)) {
      // Mismo fail-closed que /operador: un orgId ajeno también cae acá,
      // porque tiene_rol() devuelve false (no error) cuando el usuario no
      // tiene ninguna membresía visible en esa organización.
      try {
        const { data, error } = await supabase.rpc("tiene_rol", { p_org: orgId, p_roles: [...ROLES_ADMIN] });
        tieneAcceso = !error && data === true;
      } catch {
        tieneAcceso = false;
      }
    }

    if (!tieneAcceso) {
      const url = request.nextUrl.clone();
      url.pathname = "/destino";
      url.search = "";
      return redirigirConCookies(url, response);
    }
  }

  // La garita gatea por EDIFICIO, no por organización: se verificó el 28-sep
  // con una sesión de vigilante real que un vigilante no ve la tabla
  // `edificios` por RLS, así que no hay forma de resolver un orgId desde el
  // cliente y la URL no lo lleva (ver docs/estado-migracion.md, "Ruta de la
  // garita"). /garita a secas no cae acá: solo pide sesión, y la página
  // resuelve a dónde va según cuántas garitas tenga asignadas.
  const enGarita = haySesion ? request.nextUrl.pathname.match(RUTA_GARITA_EDIFICIO) : null;
  if (enGarita) {
    const edificioId = enGarita[1];
    let tieneAcceso = false;
    if (esUuid(edificioId)) {
      try {
        const { data, error } = await supabase.rpc("edificios_del_vigilante");
        tieneAcceso = !error && Array.isArray(data) && data.includes(edificioId);
      } catch {
        tieneAcceso = false;
      }
    }

    if (!tieneAcceso) {
      const url = request.nextUrl.clone();
      url.pathname = "/destino";
      url.search = "";
      return redirigirConCookies(url, response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
