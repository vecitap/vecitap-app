import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import { esUuid } from "@/lib/validacion";
import { ROLES_ADMIN } from "@/lib/admin/constantes";
import { esErrorDeConexionAuth, esRespuestaSinConexion } from "@/lib/supabase/conexion";

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
 * "No pudimos conectar. Reintente" (ronda 3, punto 5): **reescribe** a
 * /sin-conexion, sin cambiar la URL, así "Reintentar" vuelve a pedir la
 * página que se quería ver. Conserva las cookies igual que
 * `redirigirConCookies` (si hubo un refresco de sesión antes del fallo, no
 * se pierde).
 */
function sinConexionConCookies(request: NextRequest, response: NextResponse) {
  const reescritura = NextResponse.rewrite(new URL("/sin-conexion", request.url));
  for (const cookie of response.cookies.getAll()) {
    reescritura.cookies.set(cookie);
  }
  return reescritura;
}

/* ───────────────────────────────────────────────────────────────────────
   Permisos recién confirmados (ronda 3, punto 5: "más de 15 tiene_rol en
   el mismo segundo").

   Cada `<Link>` visible hace prefetch, y cada prefetch es una petición que
   pasa por acá. Al abrir una sección de Admin, los 9 enlaces del lateral
   disparaban 9 `tiene_rol()` casi juntos (logs de pruebas del 07-oct: más
   de 40 en tres segundos con la tabla de Propietarios en pantalla). El
   proxy no puede distinguir un prefetch de una navegación: Next 16 le
   quita a propósito la cabecera `next-router-prefetch`.

   Por eso se recuerda, **solo en memoria de esta instancia y por 30 s**,
   que una cuenta ya pasó un chequeo. La clave lleva el `sub` verificado del
   token (getClaims, firma comprobada), así que nunca se reusa entre cuentas.

   Qué cambia en seguridad, dicho explícitamente:
     · Solo se recuerdan los SÍ. Un "no" o un error se vuelve a preguntar
       cada vez (fallar cerrado no cambia).
     · Si a alguien le quitan el rol, el proxy lo puede dejar pasar hasta
       30 s más en esta instancia. No le da datos: cada consulta de la
       página pasa por RLS en la base, que lo ve al instante, y el layout de
       la organización vuelve a preguntar `tiene_rol()` en cada carga.
     · Una instancia nueva (o cada 30 s) empieza de cero.
   ─────────────────────────────────────────────────────────────────────── */
const PERMISO_VIGENCIA_MS = 30_000;
const PERMISOS_MAXIMO = 5_000;
const permisosConfirmados = new Map<string, number>();

function permisoReciente(clave: string): boolean {
  const vence = permisosConfirmados.get(clave);
  if (vence === undefined) return false;
  if (vence > Date.now()) return true;
  permisosConfirmados.delete(clave);
  return false;
}

function recordarPermiso(clave: string) {
  // Tope de memoria: si se llena, se vacía entera (vuelve a preguntar).
  if (permisosConfirmados.size >= PERMISOS_MAXIMO) permisosConfirmados.clear();
  permisosConfirmados.set(clave, Date.now() + PERMISO_VIGENCIA_MS);
}

type Chequeo = "si" | "no" | "sin-conexion";

/**
 * Un chequeo de rol, con el recuerdo de 30 s de arriba. Falla cerrado: un
 * error de la base es "no", salvo que sea de conexión, que es
 * "sin-conexion" (pantalla de reintentar, que tampoco deja pasar).
 */
async function chequear(
  clave: string,
  preguntar: () => Promise<{ ok: boolean; status: number; error: unknown }>
): Promise<Chequeo> {
  if (permisoReciente(clave)) return "si";
  try {
    const r = await preguntar();
    if (r.error) return esRespuestaSinConexion(r.status) ? "sin-conexion" : "no";
    if (!r.ok) return "no";
    recordarPermiso(clave);
    return "si";
  } catch {
    return "sin-conexion";
  }
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
 *    Quien tiene sesión pero no el rol va a /sin-acceso (revisión cruzada
 *    de la ronda 2, 08-oct): una página que no redirige a ningún lado y
 *    ofrece "Ir a mi inicio" (/destino) y "Salir". No va a `/` (la portada
 *    de venta, prueba 7 del tramo 1) ni salta solo a /destino: /destino y
 *    estas ramas deciden con criterios distintos (administra_algo() no
 *    filtra `activo`, tiene_rol() sí), y un salto automático podría
 *    terminar en un bucle. Ver app/sin-acceso/page.tsx.
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
  let verificado: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"] = null;
  let errorClaims: Awaited<ReturnType<typeof supabase.auth.getClaims>>["error"] = null;
  let sinConexion = false;
  try {
    ({ data: verificado, error: errorClaims } = await supabase.auth.getClaims());
    // Ronda 3, punto 5: con el token vencido, getClaims() tiene que
    // renovarlo antes de contestar. Si Auth no responde, eso NO es "sin
    // sesión" (no se sabe): no se manda a /entrar.
    sinConexion = esErrorDeConexionAuth(errorClaims);
  } catch {
    // Si algo LANZA (red, runtime), tampoco es "sin sesión".
    sinConexion = true;
  }

  // Falla cerrado, cubriendo las tres formas del tipo de retorno (es una
  // unión de 3: con claims, con error, y **sin ninguno de los dos** cuando
  // simplemente no hay sesión — por eso no alcanza con mirar `error`).
  const sub = verificado?.claims?.sub;
  const haySesion = !sinConexion && !errorClaims && typeof sub === "string" && sub.length > 0;

  const esRutaProtegida = RUTAS_PROTEGIDAS.some((ruta) => request.nextUrl.pathname.startsWith(ruta));

  // Sigue fallando cerrado (no deja pasar a nadie): solo cambia la pantalla,
  // "Reintente" en vez de Entrar.
  if (sinConexion && esRutaProtegida) {
    return sinConexionConCookies(request, response);
  }

  if (!haySesion && esRutaProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("volver", request.nextUrl.pathname);
    return redirigirConCookies(url, response);
  }

  if (haySesion && request.nextUrl.pathname.startsWith(RUTA_OPERADOR)) {
    // Falla cerrado: cualquier error de la base es "no es operador"; uno de
    // conexión, "reintente". Nunca se deja pasar.
    const chequeo = await chequear(`${sub}|operador`, async () => {
      const { data, error, status } = await supabase.rpc("es_operador");
      return { ok: data === true, status, error };
    });
    if (chequeo === "sin-conexion") return sinConexionConCookies(request, response);

    if (chequeo === "no") {
      const url = request.nextUrl.clone();
      url.pathname = "/sin-acceso";
      url.search = "";
      return redirigirConCookies(url, response);
    }
  }

  const enAdmin = haySesion ? request.nextUrl.pathname.match(RUTA_ADMIN_ORG) : null;
  if (enAdmin) {
    const orgId = enAdmin[1];
    // Un orgId con formato inválido (typo, URL armada a mano) ni siquiera
    // llega a tiene_rol(): se corta acá, antes de la consulta.
    // Mismo fail-closed que /operador: un orgId ajeno también cae en "no",
    // porque tiene_rol() devuelve false (no error) cuando el usuario no
    // tiene ninguna membresía visible en esa organización.
    const chequeo: Chequeo = !esUuid(orgId)
      ? "no"
      : await chequear(`${sub}|admin|${orgId}`, async () => {
          const { data, error, status } = await supabase.rpc("tiene_rol", { p_org: orgId, p_roles: [...ROLES_ADMIN] });
          return { ok: data === true, status, error };
        });
    if (chequeo === "sin-conexion") return sinConexionConCookies(request, response);

    if (chequeo === "no") {
      const url = request.nextUrl.clone();
      url.pathname = "/sin-acceso";
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
    const chequeo: Chequeo = !esUuid(edificioId)
      ? "no"
      : await chequear(`${sub}|garita|${edificioId}`, async () => {
          const { data, error, status } = await supabase.rpc("edificios_del_vigilante");
          return { ok: Array.isArray(data) && data.includes(edificioId), status, error };
        });
    if (chequeo === "sin-conexion") return sinConexionConCookies(request, response);

    if (chequeo === "no") {
      const url = request.nextUrl.clone();
      url.pathname = "/sin-acceso";
      url.search = "";
      return redirigirConCookies(url, response);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
