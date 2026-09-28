"use client";

import { useCallback, useRef, useState } from "react";

export type TonoAvisoTemporal = "ok" | "mal";

/**
 * El `zonaAviso` de garita.html:270-277: un aviso que aparece y se borra
 * solo a los 6s. Mismo patrón que ya usa `ConsolaOperador.tsx` (aviso local
 * + `setTimeout`), con el tiempo más largo del original de Garita — en una
 * puerta conviene que el mensaje quede más tiempo que en un panel de
 * escritorio.
 */
export function useAvisoTemporal(duracionMs = 6000) {
  const [aviso, setAvisoState] = useState<{ texto: string; tono: TonoAvisoTemporal } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarAviso = useCallback(
    (texto: string, tono: TonoAvisoTemporal = "ok") => {
      if (temporizador.current) clearTimeout(temporizador.current);
      setAvisoState({ texto, tono });
      temporizador.current = setTimeout(() => setAvisoState(null), duracionMs);
    },
    [duracionMs]
  );

  return { aviso, mostrarAviso };
}
