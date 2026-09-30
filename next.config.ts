import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
