"use client";

import { useTema } from "@/lib/theme/ThemeProvider";
import { Isotipo } from "./Isotipo";
import { SelectorGarita } from "./SelectorGarita";
import type { GaritaAsignada } from "@/lib/garita/tipos";

/**
 * El <header> de garita.html:175-196: isotipo, edificio y vigilante,
 * selector (solo con 2+ garitas), tema y salir.
 *
 * Igual que en el original, el mismo encabezado se usa en todas las
 * pantallas y lo que cambia es qué piezas se muestran: sin sesión
 * resuelta dice "Garita · Vecitap" y no ofrece salir
 * (garita.html:364-369).
 *
 * El botón de tema es de cliente (`useTema`, resuelve al proveedor de la
 * garita, no al raíz). El de salir sigue siendo un <form> a
 * /api/auth/salir, que funciona sin JavaScript — en una tableta vieja eso
 * no es un detalle.
 */
export function MarcoGarita({
  correo,
  edificioNombre,
  organizacion,
  garitas = [],
  edificioIdActual,
}: {
  correo?: string;
  edificioNombre?: string;
  organizacion?: string;
  garitas?: GaritaAsignada[];
  edificioIdActual?: string;
}) {
  const { tema, ponerTema } = useTema();

  return (
    <header className="garita-header">
      <Isotipo />
      <div className="garita-quien">
        <b>{edificioNombre ?? "Garita"}</b>
        <span>{correo || organizacion || "Vecitap"}</span>
      </div>
      <div className="garita-der">
        {garitas.length > 1 && edificioIdActual && (
          <SelectorGarita garitas={garitas} edificioIdActual={edificioIdActual} />
        )}
        <button
          type="button"
          className="garita-boton suave chico"
          title="Cambiar entre claro y oscuro"
          onClick={() => ponerTema(tema === "oscuro" ? "claro" : "oscuro")}
        >
          Tema
        </button>
        {correo && (
          <form action="/api/auth/salir" method="post">
            <button type="submit" className="garita-boton suave chico">
              Salir
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
