import type { ReactNode } from "react";
import "./garita.css";

/**
 * La garita usa el mismo tema que el resto de la app (clave `vecitap-tema`,
 * arranque en claro) — decisión del 28-sep confirmada con el socio
 * comercial: lo que la garita necesita de verdad es legibilidad, y eso son
 * los tamaños, no el color. Por eso este layout no lleva proveedor de tema
 * propio: hereda el del layout raíz.
 *
 * Lo único propio del módulo es `garita.css`: base de 17 px, campos de
 * 56 px, botones de 60-64 px. Es para tocar de pie, con guantes.
 */
export default function LayoutGarita({ children }: { children: ReactNode }) {
  return <div className="garita">{children}</div>;
}
