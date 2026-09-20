import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * Cliente para Server Components y Route Handlers. Lee/escribe la sesión
 * desde las cookies de la petición actual.
 */
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se llamó desde un Server Component (no puede escribir
            // cookies, solo Route Handlers y Server Actions pueden). No
            // pasa nada: proxy.ts ya se encarga de refrescar la sesión en
            // cada request.
          }
        },
      },
    }
  );
}
