"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferencias que los HTML originales guardan en `localStorage` con
 * `guardarLocal`/`leerLocal` (hoy: `vecitap_plantilla`, el texto de
 * WhatsApp de Cortes de cuenta).
 *
 * No es un `useState` + `useEffect` a propósito, por dos razones que este
 * proyecto ya pagó una vez (ver el bug de hidratación de la Fase 2 en
 * docs/estado-migracion.md):
 *
 * · En el servidor no hay `localStorage`. Leerlo en el inicializador del
 *   `useState` da un valor distinto en servidor y cliente, y eso es
 *   exactamente un error de hidratación.
 * · Sincronizar estado local desde afuera dentro de un `useEffect` lo
 *   rechaza el lint de este proyecto (`react-hooks/set-state-in-effect`).
 *
 * `useSyncExternalStore` resuelve las dos: en la pasada de hidratación usa
 * `getServerSnapshot` (el valor por omisión, idéntico al HTML del
 * servidor) y recién después lee el almacenamiento real.
 *
 * El valor también se guarda en memoria, para que la pantalla siga
 * funcionando en navegación privada (donde `setItem` puede lanzar): ahí la
 * preferencia vale para esta sesión y no se recuerda, en vez de resetearse
 * a cada tecla.
 */

const enMemoria = new Map<string, string>();
const oyentes = new Map<string, Set<() => void>>();

function leer(clave: string): string | null {
  const memoria = enMemoria.get(clave);
  if (memoria !== undefined) return memoria;
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

export function usePreferenciaLocal(clave: string, porOmision: string) {
  const suscribirse = useCallback(
    (notificar: () => void) => {
      const set = oyentes.get(clave) ?? new Set<() => void>();
      oyentes.set(clave, set);
      set.add(notificar);
      return () => {
        set.delete(notificar);
      };
    },
    [clave]
  );

  const leerCliente = useCallback(() => leer(clave) ?? porOmision, [clave, porOmision]);
  const leerServidor = useCallback(() => porOmision, [porOmision]);

  const valor = useSyncExternalStore(suscribirse, leerCliente, leerServidor);

  const poner = useCallback(
    (nuevo: string) => {
      enMemoria.set(clave, nuevo);
      try {
        localStorage.setItem(clave, nuevo);
      } catch {
        /* navegación privada: vale para esta sesión, no se recuerda */
      }
      oyentes.get(clave)?.forEach((f) => f());
    },
    [clave]
  );

  return [valor, poner] as const;
}
