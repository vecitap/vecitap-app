import type { MetadataRoute } from "next";

/**
 * Manifiesto de la app instalable (cambio 3, docs/plan-sin-conexion.md,
 * 1.1 a). Con esto Chrome y Edge de escritorio ofrecen «Instalar Vecitap».
 * Abre en Administración, que es para quien está pensado el modo sin
 * conexión. Colores: `--tinta` y `--fondo` del tema claro (globals.css).
 *
 * Los íconos de 192 y 512 px salieron del ícono de 180 px (apple-icon.png)
 * para la prueba de concepto: el de 512 se ve algo blando. Pendiente: un
 * original de 512 px desde el logo.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vecitap",
    short_name: "Vecitap",
    description: "Administración de condominios",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0A1128",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
