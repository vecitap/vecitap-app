/**
 * Cómo escribirle a Vecitap (ronda 10, A3; decisión de Gustavo: WhatsApp
 * primero, correo como respaldo). **El único lugar del código con el número
 * y el correo**: para cambiarlos, se cambian acá.
 *
 * Ojo: al 29-oct el correo todavía no existe (lo crea Gustavo); ver
 * docs/estado-migracion.md, «Ronda 10», pendientes antes del Paso 8.
 */
export const CONTACTO_VECITAP = {
  /** Solo dígitos, con el código de país, como lo pide wa.me. */
  whatsapp: "584122348595",
  /** Como se muestra en pantalla. */
  whatsappVisible: "+58 412-234-8595",
  /** El mensaje que ya viene escrito al abrir WhatsApp. */
  mensaje: "Hola, quiero usar Vecitap para mi administradora",
  correo: "info@vecitap.com",
} as const;

export const enlaceWhatsappVecitap = () =>
  `https://wa.me/${CONTACTO_VECITAP.whatsapp}?text=${encodeURIComponent(CONTACTO_VECITAP.mensaje)}`;

export const enlaceCorreoVecitap = () =>
  `mailto:${CONTACTO_VECITAP.correo}?subject=${encodeURIComponent("Quiero usar Vecitap")}`;
