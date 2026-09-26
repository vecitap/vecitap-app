import { num0 } from "@/lib/formato";

/** Portado de PLANES/DESCUENTO en operador.html:134-135. */
export const PLANES: Record<string, string> = { mensual: "Mensual", trimestral: "Trimestral", anual: "Anual" };

export const DESCUENTO: Record<string, number> = { mensual: 0, trimestral: 10, anual: 20 };

/**
 * Vista previa de la cuota efectiva, calculada igual que en la Ficha de
 * operador.html:624-627 — es solo una previsualización en pantalla, el
 * cobro real lo calcula `generar_cobro()` en la base.
 */
export function calcularCuotaPrevista(params: {
  modoPrecio: string;
  precio: string | number;
  descuentoPct: string | number;
  unidades: number;
}): number {
  const base =
    params.modoPrecio === "por_unidad" ? num0(params.precio) * (params.unidades || 0) : num0(params.precio);
  return base * (1 - num0(params.descuentoPct) / 100);
}
