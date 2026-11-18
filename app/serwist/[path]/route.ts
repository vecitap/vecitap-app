import { createSerwistRoute } from "@serwist/turbopack";
import { randomUUID } from "node:crypto";

/**
 * Sirve el service worker de Administración (`/serwist/sw.js`), armado con
 * esbuild en el build a partir de app/sw.ts (cambio 3, plan 1.1 b). Es
 * estático: se genera una vez por despliegue.
 *
 * Qué se guarda en el equipo (precache): los archivos JS, CSS y fuentes del
 * build, y la cáscara. Nada de `public/` (la portada, sus imágenes, la
 * plantilla de Excel; los logos pasan por el optimizador de imágenes del
 * servidor y sin conexión se ven como texto). Y ningún dato.
 */
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  globPatterns: [".next/static/**/*.{js,css,woff2}"],
  additionalPrecacheEntries: [{ url: "/admin/sin-internet", revision }],
  // Archivos grandes que la cáscara no usa (p. ej. el lector de PDF) quedan
  // fuera del precache; si alguno faltara sin conexión, esa función dice que
  // necesita conexión.
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
});
