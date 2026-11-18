import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

/**
 * Quién tiene la sesión en este navegador, **sin red** (cambio 3, 1.1 c).
 *
 * Sin conexión no se puede usar `getUser()` (pregunta al servidor de Auth) ni
 * siempre `getSession()` (con el token vencido intenta renovarlo por red y
 * devuelve null). Acá se lee la cookie que escribe `@supabase/ssr`
 * (`sb-<ref>-auth-token`, en trozos `.0`, `.1`… y con el prefijo `base64-`)
 * y se saca el id del usuario.
 *
 * **No es una comprobación de seguridad del servidor:** no verifica la firma.
 * Es la puerta de la copia local, que ya está en el disco de este equipo: sin
 * cookie de sesión (se salió) o con otro usuario, la cáscara no la muestra.
 * Todo lo que va a la base sigue pasando por la sesión real y la RLS.
 */

function claveCookie(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    // Misma regla que auth-js para el nombre por omisión.
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

function leerCookies(): Map<string, string> {
  const mapa = new Map<string, string>();
  if (typeof document === "undefined") return mapa;
  for (const parte of document.cookie.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const nombre = parte.slice(0, i).trim();
    try {
      mapa.set(nombre, decodeURIComponent(parte.slice(i + 1).trim()));
    } catch {
      mapa.set(nombre, parte.slice(i + 1).trim());
    }
  }
  return mapa;
}

/** El id del usuario con sesión en este navegador, o null si no hay. */
export async function usuarioLocal(): Promise<string | null> {
  const clave = claveCookie();
  if (!clave) return null;
  const cookies = leerCookies();
  const crudo = await combineChunks(clave, (nombre) => cookies.get(nombre) ?? null);
  if (!crudo) return null;
  try {
    const texto = crudo.startsWith("base64-") ? stringFromBase64URL(crudo.slice("base64-".length)) : crudo;
    const sesion = JSON.parse(texto) as { user?: { id?: unknown } };
    const id = sesion?.user?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}
