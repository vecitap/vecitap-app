import type { SaldoActual, Unidad } from "./tipos";

/**
 * Portado de los derivados de App() en admin.html:1344-1349. Los cuatro
 * números salen de sumar en el navegador lo que la base ya calculó por
 * fila, igual que en `main` (docs/casos-de-uso-mejorados.md, caso 18).
 *
 * `conDeuda` usa el literal `> 0.01` de `main`: la Sesión 1 lo había
 * unificado contra la columna `estado` de `saldos_actuales` (caso 11), y
 * el criterio del 28-sep es paridad con `main`.
 */
export function calcularMetricasInicio(unidades: Unidad[], saldos: SaldoActual[]) {
  const sumaAlicuotas = unidades
    .filter((u) => u.activa)
    .reduce((s, u) => s + (Number(u.alicuota) || 0), 0);
  const porCobrar = saldos.reduce((s, v) => s + Math.max(0, Number(v.total) || 0), 0);
  const aFavor = saldos.reduce((s, v) => s + Math.min(0, Number(v.total) || 0), 0);
  const conDeuda = saldos.filter((v) => (Number(v.total) || 0) > 0.01).length;
  return { sumaAlicuotas, porCobrar, aFavor, conDeuda };
}
