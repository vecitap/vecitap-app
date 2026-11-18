"use client";

import { useEffect, useState } from "react";

/**
 * ¿Hay conexión con Vecitap? (cambio 3, plan 1.1 i y sección 6).
 *
 * `navigator.onLine` no alcanza: dice «en línea» con el Wi-Fi conectado
 * aunque el internet no llegue (o el servidor no conteste). Acá se pregunta
 * de verdad: un HEAD al manifiesto, sin caché, con 5 segundos de espera.
 * El service worker no lo intercepta (solo toma navegaciones), así que va a
 * la red.
 *
 * Mientras no hay conexión se reintenta con espera escalonada (1, 2, 4, 8 y
 * después cada 10 segundos), como hace Next con su propio chequeo; los
 * eventos `online`/`offline` del navegador adelantan el siguiente intento.
 * Con conexión, se vuelve a comprobar cada 60 segundos.
 */
export type Conexion = "comprobando" | "en-linea" | "sin-conexion";

const ESPERA_MS = 5000;
const PASOS_MS = [1000, 2000, 4000, 8000, 10000];
const CON_CONEXION_MS = 60000;

async function comprobar(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    const r = await fetch(`/manifest.webmanifest?ping=${Date.now()}`, { method: "HEAD", cache: "no-store", signal: control.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(reloj);
  }
}

export function useConexion(inicial: Conexion = "comprobando"): Conexion {
  const [estado, setEstado] = useState<Conexion>(inicial);

  useEffect(() => {
    let vivo = true;
    let reloj: number | undefined;
    let intento = 0;

    const ciclo = async () => {
      window.clearTimeout(reloj);
      const ok = await comprobar();
      if (!vivo) return;
      setEstado(ok ? "en-linea" : "sin-conexion");
      intento = ok ? 0 : intento + 1;
      const espera = ok ? CON_CONEXION_MS : PASOS_MS[Math.min(intento - 1, PASOS_MS.length - 1)];
      reloj = window.setTimeout(ciclo, espera);
    };

    const yaMismo = () => {
      intento = 0;
      void ciclo();
    };
    const sinRed = () => setEstado("sin-conexion");

    void ciclo();
    window.addEventListener("online", yaMismo);
    window.addEventListener("offline", sinRed);
    return () => {
      vivo = false;
      window.clearTimeout(reloj);
      window.removeEventListener("online", yaMismo);
      window.removeEventListener("offline", sinRed);
    };
  }, []);

  return estado;
}
