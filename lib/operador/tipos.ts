import type { Database } from "@/types/supabase";

/** Fila devuelta por `cartera_operador()` — una administradora (organización)
 * con su suscripción y sus números agregados. Portado de operador.html. */
export type ClienteCartera = Database["public"]["Functions"]["cartera_operador"]["Returns"][number];

/** Fila devuelta por `edificios_operador(p_org)`. */
export type EdificioOperador = Database["public"]["Functions"]["edificios_operador"]["Returns"][number];

/** Fila devuelta por `tasa_atrasada()`. */
export type TasaAtrasada = Database["public"]["Functions"]["tasa_atrasada"]["Returns"][number];

export type CobroSuscripcion = Pick<
  Database["public"]["Tables"]["cobros_suscripcion"]["Row"],
  "id" | "desde" | "hasta" | "unidades" | "monto" | "estado" | "fecha_pago"
>;

export type ConceptoServicio = Pick<
  Database["public"]["Tables"]["conceptos_cobro"]["Row"],
  "id" | "nombre" | "modo" | "monto" | "activo"
>;

export type TareaLog = Pick<Database["public"]["Tables"]["tareas_log"]["Row"], "corrida_en" | "detalle">;
