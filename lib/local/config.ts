/**
 * Interruptor del modo sin conexión (cambio 3, docs/plan-sin-conexion.md).
 *
 * `NEXT_PUBLIC_SIN_CONEXION` lo fija `next.config.ts` en el build: encendido
 * en los Preview de Vercel y en local con `SIN_CONEXION=1`; **apagado en
 * producción** hasta que se apruebe. Apagado, no se registra el service
 * worker ni se baja ninguna copia: la app se porta como antes.
 */
export const SIN_CONEXION_ACTIVO = process.env.NEXT_PUBLIC_SIN_CONEXION === "1";

/** Ruta de la cáscara: la pantalla sin datos que se abre sin internet. */
export const RUTA_CASCARA = "/admin/sin-internet";

/** Dónde se sirve el service worker (route handler de Serwist) y qué controla. */
export const URL_SW = "/serwist/sw.js";
export const ALCANCE_SW = "/admin/";

/**
 * Versión del formato de la copia. Si un despliegue cambia lo que se guarda,
 * se sube este número: una copia de otra versión no se usa, se vuelve a bajar.
 */
export const VERSION_COPIA = 2;
