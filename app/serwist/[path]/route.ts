import { createSerwistRoute } from "@serwist/turbopack";
import { randomUUID } from "node:crypto";

/**
 * Sirve el service worker de Administración (`/serwist/sw.js`), armado con
 * esbuild en el build a partir de app/sw.ts (cambio 3, plan 1.1 b). Es
 * estático: se genera una vez por despliegue.
 *
 * Qué se guarda en el equipo (precache): los archivos JS, CSS y fuentes del
 * build, la cáscara y los dos logos (sin conexión, `Logo` los pide tal cual,
 * sin el optimizador del servidor). Nada más de `public/` (la portada, sus
 * imágenes, la plantilla de Excel). Y ningún dato.
 */
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

// Emergencia (plan 5.1): con SIN_CONEXION_APAGAR=1 se sirve un service worker
// que se desinstala solo en cada navegador. Ver app/sw-apagar.ts.
const APAGAR = process.env.SIN_CONEXION_APAGAR === "1";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: APAGAR ? "app/sw-apagar.ts" : "app/sw.ts",
  globPatterns: [".next/static/**/*.{js,css,woff2}", "public/logo-claro.png", "public/logo-oscuro.png"],
  additionalPrecacheEntries: [
    { url: "/admin/sin-internet", revision },
    // Parte D: la pantalla sin internet de la garita.
    { url: "/garita/sin-internet", revision },
  ],
  // Archivos grandes que la cáscara no usa (p. ej. el lector de PDF) quedan
  // fuera del precache; si alguno faltara sin conexión, esa función dice que
  // necesita conexión.
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
});
