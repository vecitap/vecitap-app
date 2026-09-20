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

/**
 * Mismo umbral que usa la vista `saldos_actuales` para calcular su columna
 * `estado` (> UMBRAL → "debe", < -UMBRAL → "a_favor", si no "al_dia") —
 * exportado para que cualquier código que derive el estado a mano desde un
 * saldo numérico (hoy solo `estadoUnidadDesdeSaldo`) use el mismo valor y
 * no se desalinee de la base.
 */
export const UMBRAL_SALDO = 0.009;

/**
 * `mis_unidades()` (RPC del lado residente) no trae el campo `estado` de
 * la vista `saldos_actuales` — esa vista es para consultas del lado admin.
 * Solo trae el saldo numérico, y hay que derivar el estado a mano con el
 * mismo umbral que usa la vista (ver UMBRAL_SALDO), no comparando contra
 * cero. residente.html sí comparaba contra cero (`u.saldo > 0 ? "Debe" :
 * u.saldo < 0 ? "A su favor" : "Al día"`, sin margen) — es deuda heredada
 * de ese HTML, no de app.html:619-627 (ese componente nunca compara nada,
 * consume el `estado` ya calculado por la vista). Esta función corrige esa
 * deuda en vez de portarla.
 */
export function estadoUnidadDesdeSaldo(saldo: number): EstadoUnidad {
  if (saldo > UMBRAL_SALDO) return "debe";
  if (saldo < -UMBRAL_SALDO) return "a_favor";
  return "al_dia";
}
