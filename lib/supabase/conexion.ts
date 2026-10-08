import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";

/**
 * ¿El error de Auth es "no contestó" (red caída, tiempo agotado, 5xx) y no
 * "no hay sesión"? Lo usan `usuarioActual()` (lib/supabase/cache.ts) y
 * `proxy.ts`, que tienen que decidir lo mismo: con un error de conexión no
 * se sabe si hay sesión, así que no se manda a /entrar.
 *
 * `AuthRetryableFetchError` cubre, en auth-js 2.116, los 500-504 y 520-530
 * y el fallo de `fetch` (status 0). El `>= 500` es por si una versión futura
 * deja pasar un 5xx con otra clase.
 */
export function esErrorDeConexionAuth(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  if (isAuthRetryableFetchError(error)) return true;
  return typeof error.status === "number" && (error.status === 0 || error.status >= 500);
}

/**
 * Lo mismo para una llamada a la base (PostgREST): `status` 0 es que el
 * `fetch` falló (no hubo respuesta); 5xx es que la base o el gateway no
 * pudieron contestar. Un 4xx sí es una respuesta: la base dijo que no.
 */
export function esRespuestaSinConexion(status: number): boolean {
  return status === 0 || status >= 500;
}
