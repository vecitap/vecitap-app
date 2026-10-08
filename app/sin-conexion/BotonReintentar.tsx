"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Recarga la URL actual: como el proxy reescribió a esta página sin cambiar
 * la dirección, recargar es volver a pedir la página que se quería ver.
 */
export function BotonReintentar() {
  const [reintentando, setReintentando] = useState(false);
  return (
    <Button
      type="button"
      cargando={reintentando}
      style={{ width: "100%" }}
      onClick={() => {
        setReintentando(true);
        window.location.reload();
      }}
    >
      Reintentar
    </Button>
  );
}
