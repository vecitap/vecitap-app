"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui";
import { formatoHora } from "@/lib/local/formato";
import type { Recuperable } from "@/lib/local/borrador";

/**
 * «Recuperamos lo que estaba escribiendo» (cambio 3, plan sección 3). Va
 * arriba del formulario que usa `useBorrador`; no dibuja nada si no hay
 * borrador que ofrecer.
 */
export function AvisoBorrador<T>({
  recuperable,
  seguir,
  descartar,
}: {
  recuperable: Recuperable<T>;
  seguir: () => void;
  descartar: () => void;
}) {
  if (!recuperable) return null;
  return (
    <div
      role="status"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--acento-suave)",
        color: "var(--acento-texto)",
        fontSize: 13,
      }}
    >
      <History size={16} />
      <span style={{ flex: 1, minWidth: 180 }}>Recuperamos lo que estaba escribiendo ({formatoHora(recuperable.guardadoEn)}).</span>
      <Button type="button" mini onClick={seguir}>
        Seguir
      </Button>
      <Button type="button" mini variante="secundario" onClick={descartar}>
        Descartar
      </Button>
    </div>
  );
}
