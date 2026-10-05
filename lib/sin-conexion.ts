/**
 * "No pudimos conectar con el servidor de sesiones" como error con nombre
 * propio, distinto de "no hay sesión".
 *
 * **Por qué (incidente del 04-oct, 21:52 de Venezuela):** la base de
 * pruebas se trabó dos minutos y `/auth/v1/user` devolvió 504 y 500. Los
 * layouts trataban ese fallo igual que la falta de sesión —`getUser()`
 * devolvía `user: null` con un error y nadie miraba el error— y mandaban a
 * /entrar. Para quien lo vivía era "la app me sacó", aunque la sesión
 * seguía viva.
 *
 * Ahora `usuarioActual()` (lib/supabase/cache.ts) LANZA este error cuando el
 * fallo es de conexión, y `app/error.tsx` lo reconoce por el `digest` y
 * muestra "No pudimos conectar. Reintente" con un botón de reintentar.
 *
 * **Por qué por `digest` y no por el mensaje:** en producción Next.js
 * reemplaza el mensaje de cualquier error de un Server Component por uno
 * genérico antes de mandarlo al navegador (para no filtrar detalles). El
 * `digest`, en cambio, se respeta si el error ya trae uno
 * (next/dist/server/app-render/create-error-handler.js, "If the error already
 * has a digest, respect the original digest") y llega al `error.tsx`.
 *
 * Este archivo no importa nada de servidor: lo usa también `app/error.tsx`,
 * que es un Client Component.
 */
export const DIGEST_SIN_CONEXION = "vecitap-sin-conexion";

export class ErrorSinConexion extends Error {
  readonly digest = DIGEST_SIN_CONEXION;

  constructor(causa?: unknown) {
    super("No pudimos conectar con el servidor de sesiones.", { cause: causa });
    this.name = "ErrorSinConexion";
  }
}
