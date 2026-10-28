import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La verificación de los avisos de Resend (ronda 9, A3): ver
 * app/api/resend/route.ts. Aparte de la ruta porque un route.ts solo puede
 * exportar los métodos HTTP, y la validación de la ronda la prueba sola.
 */

/** Cuánto puede tener de viejo un evento: lo que recomienda Svix contra reenvíos grabados. */
const TOLERANCIA_S = 5 * 60;

/**
 * La firma de Svix: HMAC-SHA256 de `${id}.${timestamp}.${cuerpo}` con la
 * clave en base64 que va después de «whsec_». El encabezado `svix-signature`
 * trae una o varias, separadas por espacios, como «v1,<base64>».
 */
export function firmaValida(secreto: string, id: string, timestamp: string, cuerpo: string, encabezado: string, ahora = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!id || !Number.isFinite(ts) || Math.abs(ahora / 1000 - ts) > TOLERANCIA_S) return false;
  const clave = Buffer.from(secreto.startsWith("whsec_") ? secreto.slice(6) : secreto, "base64");
  const esperada = createHmac("sha256", clave).update(`${id}.${timestamp}.${cuerpo}`).digest();
  return encabezado.split(" ").some((parte) => {
    const [version, firma] = parte.split(",");
    if (version !== "v1" || !firma) return false;
    const dada = Buffer.from(firma, "base64");
    return dada.length === esperada.length && timingSafeEqual(dada, esperada);
  });
}
