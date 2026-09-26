import type { ClienteCartera } from "./tipos";

export type MetricasCartera = {
  activos: ClienteCartera[];
  ingresoMes: number;
  unidades: number;
  unidadesActivas: number;
  edificios: number;
  porCobrarClientes: number;
  pendiente: number;
  cobrosPend: number;
};

/** Portado de los cálculos de App() en operador.html:314-321. */
export function calcularMetricasCartera(cartera: ClienteCartera[]): MetricasCartera {
  const activos = cartera.filter((c) => c.estado === "activa");
  return {
    activos,
    ingresoMes: activos.reduce((s, c) => s + (Number(c.cuota_mes) || 0), 0),
    unidades: cartera.reduce((s, c) => s + (c.unidades || 0), 0),
    unidadesActivas: activos.reduce((s, c) => s + (c.unidades || 0), 0),
    edificios: cartera.reduce((s, c) => s + (c.edificios || 0), 0),
    porCobrarClientes: cartera.reduce((s, c) => s + (Number(c.por_cobrar) || 0), 0),
    pendiente: cartera.reduce((s, c) => s + (Number(c.monto_pendiente) || 0), 0),
    cobrosPend: cartera.reduce((s, c) => s + (c.cobros_pendientes || 0), 0),
  };
}
