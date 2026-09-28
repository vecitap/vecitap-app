"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { SECCIONES_GARITA, SECCION_INICIAL } from "@/lib/garita/secciones";

/**
 * El <nav> de garita.html:198-203. En el original cambiar de vista era
 * estado en memoria; acá cada vista es una subruta, así que el botón de
 * atrás funciona y recargar deja al vigilante donde estaba — que en un
 * equipo que se reinicia solo importa más que en una laptop.
 */
export function NavGarita({ edificioId }: { edificioId: string }) {
  const actual = useSelectedLayoutSegment() ?? SECCION_INICIAL;

  return (
    <nav className="garita-nav">
      {SECCIONES_GARITA.map((seccion) => (
        <Link
          key={seccion.slug}
          href={`/garita/${edificioId}/${seccion.slug}`}
          aria-current={seccion.slug === actual ? "page" : undefined}
        >
          {seccion.titulo}
        </Link>
      ))}
    </nav>
  );
}
