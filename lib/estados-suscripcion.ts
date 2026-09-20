import type { TonoBadge } from "@/components/ui";

/**
 * Antes ESTADOS_T + estado() en operador.html:110-121. El schema de
 * Postgres no tiene un enum para esto — cobros_suscripcion.estado es un
 * `string` plano (confirmado contra types/supabase.ts) — así que esta
 * unión literal es la única barrera de tipos que existe para estos
 * valores; si la base agrega un estado nuevo hay que sumarlo acá a mano.
 */
export type EstadoSuscripcion =
  | "prueba"
  | "activa"
  | "vencida"
  | "suspendida"
  | "cancelada"
  | "sin suscripción";

const CONFIG: Record<EstadoSuscripcion, { etiqueta: string; tono: TonoBadge }> = {
  prueba: { etiqueta: "En prueba", tono: "tenue" },
  activa: { etiqueta: "Activa", tono: "verde" },
  vencida: { etiqueta: "Pago vencido", tono: "ambar" },
  suspendida: { etiqueta: "Suspendida", tono: "rojo" },
  cancelada: { etiqueta: "Cancelada", tono: "tenue" },
  "sin suscripción": { etiqueta: "Sin suscripción", tono: "tenue" },
};

function esEstadoConocido(valor: string): valor is EstadoSuscripcion {
  return valor in CONFIG;
}

/**
 * `valor` es `string` (no `EstadoSuscripcion`) a propósito: viene de la
 * base sin garantía de que calce con la unión de arriba. Mismo fallback
 * que el operador.html original (`ESTADOS_T[e] || ESTADOS_T.cancelada`).
 */
export function estadoSuscripcion(valor: string): { etiqueta: string; tono: TonoBadge } {
  return esEstadoConocido(valor) ? CONFIG[valor] : CONFIG.cancelada;
}
