import type { TonoBadge } from "@/components/ui";

/**
 * Antes el objeto `m` dentro de Pastilla() en residente.html:172-180. Sin
 * enum de Postgres (pagos.estado es `string` plano, igual que los demás
 * campos de estado del schema), esta unión literal es la barrera de tipos.
 */
export type EstadoPago = "reportado" | "conciliado" | "anulado";

const CONFIG: Record<EstadoPago, { etiqueta: string; tono: TonoBadge }> = {
  reportado: { etiqueta: "Esperando revisión", tono: "ambar" },
  conciliado: { etiqueta: "Confirmado", tono: "verde" },
  anulado: { etiqueta: "Rechazado", tono: "rojo" },
};

function esEstadoConocido(valor: string): valor is EstadoPago {
  return valor in CONFIG;
}

/** Mismo fallback que el original (`m[estado] || { t: estado, ... }`), salvo
 * que acá el tono desconocido cae en "tenue" en vez de un gris sin token. */
export function estadoPago(valor: string): { etiqueta: string; tono: TonoBadge } {
  return esEstadoConocido(valor) ? CONFIG[valor] : { etiqueta: valor, tono: "tenue" };
}
