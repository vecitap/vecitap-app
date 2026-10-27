"use client";

import type { ReactNode } from "react";
import { useSubirAlAviso } from "@/hooks/useSubirAlAviso";

/**
 * "ok": los mensajes de éxito, en marino sobre gris claro con un ✓ (ronda 5,
 * caso 77). Antes eran "verde" (menta); el único verde de la app es «a favor».
 */
export type TonoAviso = "ok" | "ambar" | "rojo" | "azul" | "favor";

const FONDO: Record<TonoAviso, string> = {
  ok: "var(--lienzo-alt)",
  ambar: "var(--ambar-bg)",
  rojo: "var(--rojo-bg)",
  azul: "var(--azul-bg)",
  favor: "var(--a-favor-bg)",
};

const TEXTO: Record<TonoAviso, string> = {
  ok: "var(--tinta)",
  ambar: "var(--ambar)",
  rojo: "var(--rojo)",
  azul: "var(--azul)",
  favor: "var(--a-favor)",
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
  // Ronda 8: un error o un «listo» que aparece fuera de la pantalla después
  // de tocar algo sube la página hasta él (ver hooks/useSubirAlAviso.ts).
  const ref = useSubirAlAviso(tono === "rojo" || tono === "ok");
  return (
    <div
      ref={ref}
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radio-chico)",
        background: FONDO[tono],
        border: `1px solid ${TEXTO[tono]}33`,
      }}
    >
      {titulo && (
        <div style={{ fontWeight: 700, fontSize: 13.5, color: TEXTO[tono], marginBottom: 3 }}>
          {tono === "ok" && <span aria-hidden="true">✓ </span>}
          {titulo}
        </div>
      )}
      <div style={{ fontSize: 13, color: tono === "ok" && !titulo ? "var(--tinta)" : "var(--tinta-2)", lineHeight: 1.6 }}>
        {tono === "ok" && !titulo && <span aria-hidden="true">✓ </span>}
        {children}
      </div>
    </div>
  );
}
