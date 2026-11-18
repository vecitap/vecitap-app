import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

/* /design-system (vitrina interna del sistema de diseño, no producto) queda
   FUERA del build de producción (ronda 3, punto 6): sus archivos se llaman
   `page.vitrina.tsx` y `layout.vitrina.tsx`, y Next solo los reconoce si
   la extensión "vitrina.tsx" está en `pageExtensions`.

   Entra solo en los Preview de Vercel, o en local si se pide con
   `MOSTRAR_VITRINA=1 npm run dev`. **No** depende de dev/build: si
   `npm run dev` la incluyera y `npm run build` no, los tipos de rutas que
   deja dev en .next/dev/types no coincidirían con los del build y
   `npm run build` fallaría en el chequeo de tipos (pasó el 08-oct).
   El layout conserva además su propio `notFound()` como segunda capa. */
const VITRINA = process.env.VERCEL_ENV === "preview" || process.env.MOSTRAR_VITRINA === "1";

/* Cambio 3 (trabajar sin internet, docs/plan-sin-conexion.md): interruptor.
   Encendido en los Preview de Vercel y en local con `SIN_CONEXION=1`;
   **apagado en producción** hasta que se apruebe. Apagado, no se registra
   el service worker ni se baja ninguna copia (lib/local/config.ts). */
const SIN_CONEXION = process.env.VERCEL_ENV === "preview" || process.env.SIN_CONEXION === "1";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SIN_CONEXION: SIN_CONEXION ? "1" : "" },
  /* El service worker (app/serwist/[path]/route.ts) no se guarda en caché
     del navegador: así cada despliegue llega en la próxima visita. */
  async headers() {
    return [
      {
        source: "/serwist/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  pageExtensions: VITRINA ? ["tsx", "ts", "jsx", "js", "vitrina.tsx"] : ["tsx", "ts", "jsx", "js"],
  /* La portada pública (vecitap.com) es el sitio de venta, que antes vivía
     en GitHub Pages (repo vecitap-sitio). Se sirve tal cual desde
     `public/inicio.html` para no reescribirlo en React: es HTML estático y
     el equipo comercial lo edita aparte.

     `beforeFiles` hace que la raíz responda con ese archivo antes de mirar
     `app/(marketing)/page.tsx`, que queda sin uso hasta que la portada se
     migre. La URL que ve el visitante sigue siendo `/`. */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/inicio.html" }],
    };
  },
};

// withSerwist solo agrega esbuild a serverExternalPackages (lo usa la ruta
// del service worker en el build); no cambia nada más de la configuración.
export default withSerwist(nextConfig);
