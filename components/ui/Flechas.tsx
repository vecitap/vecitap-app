import type { CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Portado de Flechas() en admin.html:501-510 — subir/bajar una fila, con
 * los mismos íconos de lucide-react que main (`ChevronUp`/`ChevronDown`,
 * 14px — caso 13 de docs/estado-migracion.md, aplicado en el bloque 7).
 */
export function Flechas({ onSubir, onBajar }: { onSubir: () => void; onBajar: () => void }) {
  const boton: CSSProperties = {
    border: "1px solid var(--linea)",
    background: "var(--lienzo)",
    color: "var(--tenue)",
    borderRadius: "var(--radio-chico)",
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button type="button" onClick={onSubir} style={boton} aria-label="Subir" title="Subir">
        <ChevronUp size={14} />
      </button>
      <button type="button" onClick={onBajar} style={boton} aria-label="Bajar" title="Bajar">
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
