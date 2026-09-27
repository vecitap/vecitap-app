import type { CSSProperties } from "react";

/**
 * Portado de Flechas() en app.html:489-499 — subir/bajar una fila. Sin
 * íconos de lucide (no es una dependencia del proyecto, ver
 * docs/estado-migracion.md): dos botones de texto con flechas Unicode.
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
    fontSize: 11,
    lineHeight: 1,
    padding: 0,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button type="button" onClick={onSubir} style={boton} aria-label="Subir" title="Subir">
        ▲
      </button>
      <button type="button" onClick={onBajar} style={boton} aria-label="Bajar" title="Bajar">
        ▼
      </button>
    </div>
  );
}
