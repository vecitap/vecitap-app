import { contarPorEstadoUnidad } from "@/lib/estados-unidad";
import type { SaldoActual, Unidad } from "./tipos";

/**
 * Portado de los derivados de App() en app.html:988-993 — con una
 * corrección deliberada (ver docs/casos-de-uso-mejorados.md): el original
 * contaba "con deuda" comparando `total > 0.01` a mano, un umbral distinto
 * del que ya usa la columna `estado` de `saldos_actuales` (y del
 * `UMBRAL_SALDO` de lib/estados-unidad.ts). Acá se usa `estado` — ya
 * calculado por la base — en vez de recalcularlo con un literal.
 */
export function calcularMetricasInicio(unidades: Unidad[], saldos: SaldoActual[]) {
  const sumaAlicuotas = unidades
    .filter((u) => u.activa)
    .reduce((s, u) => s + (Number(u.alicuota) || 0), 0);
  const porCobrar = saldos.reduce((s, v) => s + Math.max(0, Number(v.total) || 0), 0);
  const aFavor = saldos.reduce((s, v) => s + Math.min(0, Number(v.total) || 0), 0);
  const cuenta = contarPorEstadoUnidad(saldos.map((s) => ({ estado: s.estado ?? "" })));
  return { sumaAlicuotas, porCobrar, aFavor, conDeuda: cuenta.debe, cuenta };
}
