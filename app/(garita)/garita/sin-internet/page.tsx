import { Suspense } from "react";
import type { Metadata } from "next";
import { CascaraGarita } from "./CascaraGarita";

/**
 * La pantalla sin internet de la garita (cambio 3, parte D, plan 10.5).
 *
 * Igual que /admin/sin-internet: **estática y sin datos**. El service
 * worker la guarda al instalarse y la sirve cuando una página de /garita no
 * llega por red (o tarda más de 8 segundos). Lo que muestra lo lee del
 * equipo (la copia de la garita). Es pública en proxy.ts por eso mismo.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Garita · Sin conexión",
};

export default function PaginaGaritaSinInternet() {
  return (
    <Suspense fallback={null}>
      <CascaraGarita />
    </Suspense>
  );
}
