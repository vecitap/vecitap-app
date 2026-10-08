import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
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

export default nextConfig;
