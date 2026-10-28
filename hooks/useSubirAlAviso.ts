"use client";

import { useEffect, useRef } from "react";

/**
 * La página sube sola hasta un aviso que acaba de aparecer (ronda 8, pedido
 * de Gustavo en la prueba 16): un error o un «listo» que sale arriba del
 * formulario, fuera de la pantalla, no se veía y parecía que el botón no
 * había hecho nada.
 *
 * Solo cuando el aviso aparece poco después de que la persona tocó algo o
 * escribió (8 segundos): un aviso que ya estaba en la página al abrirla no
 * mueve nada. Y solo si no se ve entero.
 *
 * Ronda 9 (B4, caso 99): también cuando un aviso que ya estaba CAMBIA de
 * texto. «Reenviar recibo» dejaba arriba «Recibo de 01B reenviado…» y el
 * segundo toque lo cambiaba por «Ese recibo ya se reenvió hace un momento»:
 * el aviso era el mismo elemento, el efecto no volvía a correr y la página no
 * subía. Ahora se compara el texto en cada dibujado; si es otro, cuenta como
 * un aviso nuevo. (Mismo texto otra vez no mueve nada: no hay nada nuevo que
 * leer.)
 */
let ultimaAccion = 0;
if (typeof window !== "undefined") {
  const marcar = () => {
    ultimaAccion = Date.now();
  };
  window.addEventListener("pointerdown", marcar, { capture: true, passive: true });
  window.addEventListener("keydown", marcar, { capture: true, passive: true });
}

const VENTANA_MS = 8000;

export function useSubirAlAviso<T extends HTMLElement = HTMLDivElement>(activo = true) {
  const ref = useRef<T>(null);
  const visto = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const texto = el.textContent ?? "";
    const nuevo = texto !== visto.current;
    visto.current = texto;
    if (!activo || !nuevo || Date.now() - ultimaAccion > VENTANA_MS) return;
    const r = el.getBoundingClientRect();
    const seVe = r.top >= 0 && r.bottom <= (window.innerHeight || document.documentElement.clientHeight);
    if (seVe) return;
    // Dentro de un diálogo o una tabla con su propio scroll también funciona:
    // scrollIntoView mueve cada contenedor que haga falta.
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  return ref;
}
