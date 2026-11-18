import { Suspense } from "react";
import type { Metadata } from "next";
import { Cascara } from "./Cascara";

/**
 * La cáscara sin internet (cambio 3, docs/plan-sin-conexion.md, 1.1 c).
 *
 * Página **estática y sin datos**: el service worker la guarda al instalarse
 * y la sirve cuando una página de /admin no llega por red (o tarda más de 8
 * segundos). Lo que muestra lo lee del propio navegador (la copia local),
 * nunca del servidor. Es pública en proxy.ts por eso mismo: no tiene nada
 * que proteger, y la puerta de la copia es local (lib/local/sesion-local.ts).
 *
 * No confundir con /sin-conexion, que es «el servidor de Auth no contesta»
 * cuando el navegador sí llega a Vercel.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Vecitap · Sin conexión",
};

export default function PaginaSinInternet() {
  // useSearchParams (en Cascara) necesita una frontera de Suspense en una
  // página estática.
  return (
    <Suspense fallback={null}>
      <Cascara />
    </Suspense>
  );
}
