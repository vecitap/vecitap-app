"use client";

import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import type { GaritaAsignada } from "@/lib/garita/tipos";
import { SECCION_INICIAL } from "@/lib/garita/secciones";

/**
 * El <select> del encabezado (garita.html:192, 975-987). Solo aparece con
 * dos o más garitas asignadas — con una sola no hay nada que elegir.
 *
 * El original cambiaba el edificio en memoria y volvía a dibujar la vista
 * actual. Acá el edificio es un segmento de la URL, así que cambiar de
 * garita es navegar, **quedándose en la misma vista** — mismo resultado y
 * además se puede volver con el botón de atrás.
 */
export function SelectorGarita({
  garitas,
  edificioIdActual,
}: {
  garitas: GaritaAsignada[];
  edificioIdActual: string;
}) {
  const router = useRouter();
  const seccion = useSelectedLayoutSegment() ?? SECCION_INICIAL;

  return (
    <select
      className="garita-campo"
      style={{ minHeight: 46, fontSize: 15, width: "auto", padding: "8px 12px" }}
      aria-label="Elegir la garita"
      value={edificioIdActual}
      onChange={(e) => router.push(`/garita/${e.target.value}/${seccion}`)}
    >
      {garitas.map((g) => (
        <option key={g.edificio_id} value={g.edificio_id}>
          {g.nombre}
        </option>
      ))}
    </select>
  );
}
