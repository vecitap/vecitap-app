import type { ReactNode } from "react";

export type TonoAviso = "verde" | "ambar" | "rojo" | "azul";

const FONDO: Record<TonoAviso, string> = {
  verde: "var(--verde-bg)",
  ambar: "var(--ambar-bg)",
  rojo: "var(--rojo-bg)",
  azul: "var(--azul-bg)",
};

const TEXTO: Record<TonoAviso, string> = {
  verde: "var(--verde)",
  ambar: "var(--ambar)",
  rojo: "var(--rojo)",
  azul: "var(--azul)",
};

/** Portado de Aviso() en app.html:556-571 — banner de alerta con título y texto. */
export function Aviso({
  tono = "ambar",
  titulo,
  children,
}: {
  tono?: TonoAviso;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radio-chico)",
        background: FONDO[tono],
        border: `1px solid ${TEXTO[tono]}33`,
      }}
    >
      {titulo && (
        <div style={{ fontWeight: 700, fontSize: 13.5, color: TEXTO[tono], marginBottom: 3 }}>{titulo}</div>
      )}
      <div style={{ fontSize: 13, color: "var(--tinta-2)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
