import type { TonoBadge } from "@/components/ui";

/**
 * Antes el objeto `colores` + el conteo `cuenta` dentro del componente
 * Edificio() en app.html:619-627. Ahí cada estado tenía su propio trío
 * bg/borde/texto hardcodeado; acá alcanza con el tono, porque el token
 * de tema ya define --{tono} y --{tono}-bg (Fase 2) para construir el
 * bg/borde/texto donde se use.
 */
export type EstadoUnidad = "al_dia" | "debe" | "a_favor";

const TONOS: Record<EstadoUnidad, TonoBadge> = {
  al_dia: "verde",
  debe: "rojo",
  a_favor: "azul",
};

function esEstadoConocido(valor: string): valor is EstadoUnidad {
  return valor in TONOS;
}

/** Mismo fallback que el original (`colores[u.estado] || colores.al_dia`). */
export function tonoEstadoUnidad(valor: string): TonoBadge {
  return esEstadoConocido(valor) ? TONOS[valor] : TONOS.al_dia;
}

/** Cuenta unidades por estado, como `cuenta` en Edificio() — ignora estados desconocidos. */
export function contarPorEstadoUnidad(saldos: { estado: string }[]): Record<EstadoUnidad, number> {
  const cuenta: Record<EstadoUnidad, number> = { al_dia: 0, debe: 0, a_favor: 0 };
  for (const s of saldos) {
    if (esEstadoConocido(s.estado)) cuenta[s.estado]++;
  }
  return cuenta;
}
