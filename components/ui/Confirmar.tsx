"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * Portado de Confirmar() en app.html:589-607. El padre monta este
 * componente solo cuando hay algo que confirmar (mismo patrón que el
 * original) — al montarse, abre el <dialog> nativo con showModal(); Escape
 * dispara el "close" nativo, que acá se traduce en onNo().
 */
export function Confirmar({
  titulo,
  texto,
  boton = "Confirmar",
  tono = "primario",
  onSi,
  onNo,
}: {
  titulo: string;
  texto: string;
  boton?: string;
  tono?: "primario" | "peligro";
  onSi: () => void;
  onNo: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <Dialog ref={ref} onClose={onNo}>
      <h3 style={{ marginTop: 0, fontSize: 17, fontFamily: "var(--font-titulos)" }}>{titulo}</h3>
      <p style={{ fontSize: 13.5, color: "var(--tinta-2)", lineHeight: 1.6 }}>{texto}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
        <Button type="button" variante="secundario" onClick={onNo}>
          No
        </Button>
        <Button
          type="button"
          onClick={onSi}
          style={tono === "peligro" ? { background: "var(--rojo)", borderColor: "var(--rojo)" } : undefined}
        >
          {boton}
        </Button>
      </div>
    </Dialog>
  );
}
