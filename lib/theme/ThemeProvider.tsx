"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

export type Tema = "claro" | "oscuro";

const CLAVE_LOCALSTORAGE = "vecitap-tema";
const ATRIBUTO_TEMA = "data-theme";

/**
 * Corre en <head>, antes de hidratar, para fijar data-theme en el primer
 * pintado. Sin esto la página parpadea con el tema por omisión (claro) y
 * luego salta al tema guardado. Misma clave/valores de localStorage que
 * usaban los HTML originales, para no perder la preferencia ya guardada
 * en el navegador de quienes ya usan la app.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  CLAVE_LOCALSTORAGE
)})==="oscuro"?"oscuro":"claro";document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

/**
 * Patrón oficial de Next.js para scripts anti-flash sin warning de
 * hidratación (https://nextjs.org/docs/app/guides/preventing-flash-before-hydration#extracting-a-reusable-component):
 * el <script> crudo se renderiza distinto en servidor y cliente a propósito
 * — "text/javascript" en el servidor (para que el navegador lo ejecute
 * durante el parseo del HTML) y "text/plain" al hidratar en el cliente
 * (para que no se re-ejecute). suppressHydrationWarning en el propio
 * <script> le dice a React que acepte ese cambio en vez de tratarlo como
 * un error de hidratación.
 */
export function ScriptTemaInicial() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

type ThemeContextValue = {
  tema: Tema;
  ponerTema: (tema: Tema) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * data-theme en <html> es la fuente de verdad (la toca tanto el script
 * anti-flash como ponerTema): con useSyncExternalStore, React usa
 * leerTemaServidor() en la primera pasada de hidratación —igual al
 * data-theme="claro" fijo que ya trae <html> desde el servidor— así que
 * esa primera pasada siempre coincide con el HTML del servidor y no hay
 * warning de hidratación. Recién después de hidratar vuelve a leer el DOM
 * real (leerTemaDelDOM, ya corregido por el script si el usuario tenía
 * "oscuro" guardado) como una actualización normal de cliente, no como
 * parte de la hidratación.
 */
function suscribirseATema(notificar: () => void) {
  const observer = new MutationObserver(notificar);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [ATRIBUTO_TEMA],
  });
  return () => observer.disconnect();
}

function leerTemaDelDOM(): Tema {
  return document.documentElement.getAttribute(ATRIBUTO_TEMA) === "oscuro" ? "oscuro" : "claro";
}

function leerTemaServidor(): Tema {
  return "claro";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const tema = useSyncExternalStore(suscribirseATema, leerTemaDelDOM, leerTemaServidor);

  const ponerTema = (siguiente: Tema) => {
    // No hace falta setState: el MutationObserver de arriba detecta este
    // cambio de atributo y useSyncExternalStore vuelve a leer solo.
    document.documentElement.setAttribute(ATRIBUTO_TEMA, siguiente);
    try {
      localStorage.setItem(CLAVE_LOCALSTORAGE, siguiente);
    } catch {
      // localStorage puede fallar en modo privado; el tema sigue
      // funcionando para esta sesión, solo no se recuerda.
    }
  };

  return <ThemeContext.Provider value={{ tema, ponerTema }}>{children}</ThemeContext.Provider>;
}

export function useTema() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTema debe usarse dentro de <ThemeProvider>");
  return ctx;
}
