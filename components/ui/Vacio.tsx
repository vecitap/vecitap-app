import type { ReactNode } from "react";

/** Portado de Vacio() en app.html:572-588 — estado vacío con título, texto y una acción opcional.
 * `icono` es el ícono de lucide-react que `main` le pasa (`icono("...")`,
 * caso 13 de `docs/estado-migracion.md`); es opcional porque no todas las
 * llamadas de `main` le pasan uno. */
export function Vacio({
  titulo,
  texto,
  icono,
  accion,
}: {
  titulo: string;
  texto?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--tenue)" }}>
      {icono && <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}>{icono}</div>}
      <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--tinta)", margin: "0 0 6px" }}>{titulo}</h2>
      {texto && <p style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 420, margin: "0 auto 16px" }}>{texto}</p>}
      {accion}
    </div>
  );
}
