"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/**
 * Portado de Confirmar() en app.html:589-607. El padre monta este
 * componente solo cuando hay algo que confirmar (mismo patrón que el
 * original) — al montarse, abre el <dialog> nativo con showModal(); Escape
 * dispara el "close" nativo, que acá se traduce en onNo().
 *
 * `otra` (08-oct): una tercera salida, para cuando la pregunta no es solo
 * sí/no — p. ej. la ficha de la unidad: "cambiar el inquilino" o "es el
 * mismo, solo corregir el correo".
 */
export function Confirmar({
  titulo,
  texto,
  boton = "Confirmar",
  tono = "primario",
  onSi,
  onNo,
  otra,
}: {
  titulo: string;
  texto: string;
  boton?: string;
  tono?: "primario" | "peligro";
  onSi: () => void;
  onNo: () => void;
  otra?: { boton: string; onClick: () => void };
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <Dialog ref={ref} onClose={onNo}>
      <h3 style={{ marginTop: 0, fontSize: 17, fontFamily: "var(--font-titulos)" }}>{titulo}</h3>
      <p style={{ fontSize: 13.5, color: "var(--tinta-2)", lineHeight: 1.6 }}>{texto}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
        <Button type="button" variante="secundario" onClick={onNo}>
          No
        </Button>
        {otra && (
          <Button type="button" variante="secundario" onClick={otra.onClick}>
            {otra.boton}
          </Button>
        )}
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
