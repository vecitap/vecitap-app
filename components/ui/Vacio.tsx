import type { ReactNode } from "react";

/** Portado de Vacio() en app.html:572-588 — estado vacío con título, texto y una acción opcional. */
export function Vacio({
  titulo,
  texto,
  accion,
}: {
  titulo: string;
  texto?: string;
  accion?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--tenue)" }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--tinta)", margin: "0 0 6px" }}>{titulo}</h2>
      {texto && <p style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 16px" }}>{texto}</p>}
      {accion}
    </div>
  );
}
