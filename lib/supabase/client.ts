import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Cliente para Client Components. Guarda la sesión en cookies (no en
 * localStorage como en los HTML originales) para que el servidor —Proxy,
 * Server Components, Route Handlers— también pueda leerla.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
