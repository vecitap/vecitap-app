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
 * Se llamaba middleware.ts hasta Next.js 15; en Next 16 el archivo pasó a
 * llamarse proxy.ts (export `proxy`, no `middleware` — mismo mecanismo).
 *
 * Tres trabajos:
 * 1. Refrescar la sesión de Supabase en cada request (si el access token
 *    venció, lo renueva y reescribe las cookies) para que Server
 *    Components y Route Handlers siempre vean una sesión válida.
 * 2. Mandar a /entrar a quien no tiene sesión y pide una ruta protegida.
 * 3. Autorización para /operador/* (es_operador(), global), /admin/[orgId]/*
 *    (tiene_rol(orgId, roles), por organización — ahora que la Fase 4 ya
 *    definió la estructura de URL con orgId, ver docs/inventario-admin.md
 *    sección 3) y /garita/[edificioId]/* (edificios_del_vigilante(), por
 *    edificio). /mi/* se queda sin gate de rol acá: no es un rol, es tener
 *    al menos una unidad asociada, y eso lo resuelve cada Server Component
 *    con mis_unidades().
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaProtegida = RUTAS_PROTEGIDAS.some((ruta) => request.nextUrl.pathname.startsWith(ruta));

  if (!user && esRutaProtegida) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("volver", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname.startsWith(RUTA_OPERADOR)) {
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
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const enAdmin = user ? request.nextUrl.pathname.match(RUTA_ADMIN_ORG) : null;
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
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // La garita gatea por EDIFICIO, no por organización: se verificó el 29-sep
  // con una sesión de vigilante real que un vigilante no ve la tabla
  // `edificios` por RLS, así que no hay forma de resolver un orgId desde el
  // cliente y la URL no lo lleva (ver docs/estado-migracion.md, "Ruta de la
  // garita"). /garita a secas no cae acá: solo pide sesión, y la página
  // resuelve a dónde va según cuántas garitas tenga asignadas.
  const enGarita = user ? request.nextUrl.pathname.match(RUTA_GARITA_EDIFICIO) : null;
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
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
