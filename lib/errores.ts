/**
 * El texto que ve la persona cuando algo falla. Una sola regla para toda la
 * app: nunca "[object Object]", nunca un mensaje técnico en inglés.
 *
 * **Por qué hace falta (05-oct):** el patrón que se usaba en todos lados,
 * `e instanceof Error ? e.message : String(e)`, falla justo con el error más
 * común. `supabase.rpc()` / `.from()` devuelven `{ error }` como **objeto
 * plano** parseado del JSON de PostgREST (`error = JSON.parse(body)` en
 * postgrest-js 2.116), no como instancia de `PostgrestError`: no pasa el
 * `instanceof Error` y `String()` lo convierte en "[object Object]". Así se
 * vio en Accesos con el "Sin permiso para invitar" de `crear_invitacion`.
 *
 * Qué devuelve, en orden:
 * 1. Un `raise exception` de nuestras funciones (código `P0001`, o
 *    cualquier `P0…`): su mensaje tal cual. Esos textos los escribimos
 *    nosotros, en español y pensados para la pantalla.
 * 2. Errores de Postgres conocidos (permisos, duplicado, dato inválido,
 *    tiempo agotado): una frase fija en español.
 * 3. Sin conexión (fetch caído, 5xx, tiempo agotado de la red): "No pudimos
 *    conectar. Reintente."
 * 4. Un `Error` propio de la app (`throw new Error("…")` con texto nuestro):
 *    su mensaje.
 * 5. Cualquier otra cosa: un texto genérico. El detalle técnico va a la
 *    consola del navegador, no a la pantalla.
 */

export const MENSAJE_SIN_CONEXION = "No pudimos conectar. Reintente.";
const MENSAJE_GENERICO = "No se pudo completar. Reintente; si se repite, avísele a Vecitap.";

const POR_CODIGO: Record<string, string> = {
  "42501": "No tiene permiso para hacer esto.",
  "23505": "Ya existe un registro con esos datos.",
  "23503": "Ese dato está en uso o ya no existe.",
  "23514": "Uno de los datos no es válido.",
  "23502": "Falta un dato obligatorio.",
  "22P02": "Uno de los datos no tiene el formato correcto.",
  "57014": "La base tardó demasiado en responder. Reintente.",
  PGRST301: "Su sesión venció. Vuelva a entrar.",
  PGRST303: "Su sesión venció. Vuelva a entrar.",
};

type ConForma = { message?: unknown; code?: unknown; status?: unknown; name?: unknown };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function esFallaDeRed(mensaje: string): boolean {
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out|aborted/i.test(
    mensaje
  );
}

export function mensajeDeError(e: unknown): string {
  if (typeof e === "string") return e.trim() || MENSAJE_GENERICO;
  if (!e || typeof e !== "object") return MENSAJE_GENERICO;

  const { message, code, status, name } = e as ConForma;
  const msj = texto(message);
  const cod = texto(code);
  const nombre = texto(name);

  if (cod.startsWith("P0") && msj) return msj;
  if (cod && POR_CODIGO[cod]) return POR_CODIGO[cod];

  const st = typeof status === "number" ? status : 0;
  if (st >= 500 || nombre === "AuthRetryableFetchError" || esFallaDeRed(msj)) {
    return MENSAJE_SIN_CONEXION;
  }

  // Un Error lanzado por la app con texto propio. Se excluyen los de las
  // librerías (Postgrest*, Auth*, Storage*), que traen texto en inglés.
  if (e instanceof Error && msj && !/^(Postgrest|Auth|Storage)/.test(nombre)) return msj;

  if (typeof console !== "undefined") console.error(e);
  return MENSAJE_GENERICO;
}
