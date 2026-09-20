import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

const RUTAS_PROTEGIDAS = ["/admin", "/mi", "/operador"];
const RUTA_OPERADOR = "/operador";

/**
 * Se llamaba middleware.ts hasta Next.js 15; en Next 16 el archivo pasó a
 * llamarse proxy.ts (export `proxy`, no `middleware` — mismo mecanismo).
 *
 * Dos trabajos, nada más:
 * 1. Refrescar la sesión de Supabase en cada request (si el access token
 *    venció, lo renueva y reescribe las cookies) para que Server
 *    Components y Route Handlers siempre vean una sesión válida.
 * 2. Mandar a /entrar a quien no tiene sesión y pide una ruta protegida.
 *
 * Autorización por rol: SOLO para /operador/*, porque es_operador() no
 * lleva argumentos (es global: pertenece o no a la tabla operadores del
 * staff interno de Vecitap). /admin/* y /mi/* se quedan sin gate de rol
 * acá — el rol ahí es por organización (tabla membresias vía tiene_rol/
 * puede_operar, que piden un p_org) y todavía no hay una estructura de
 * URL que le diga al proxy a qué organización se está entrando; eso se
 * resuelve en la Fase 4 cuando se defina esa estructura. Mientras tanto,
 * cada Server Component/Route Handler de /admin y /mi tiene que verificar
 * el rol correspondiente por su cuenta — la propia documentación de
 * Next.js advierte no depender solo del proxy para autorización.
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

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
