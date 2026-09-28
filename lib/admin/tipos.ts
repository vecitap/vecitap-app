import type { Database } from "@/types/supabase";

export type Persona = Pick<
  Database["public"]["Tables"]["personas"]["Row"],
  "id" | "prefijo" | "nombre" | "documento" | "telefono" | "correo"
>;

/** Vínculo de una unidad con una persona (propietario/inquilino), con la persona anidada — mismo shape que el `select` de app.html:930-933. */
export type Vinculo = Pick<
  Database["public"]["Tables"]["vinculos"]["Row"],
  "id" | "tipo" | "desde" | "hasta" | "enviar_corte" | "persona_id"
> & {
  personas: Persona | null;
};

export type Unidad = Pick<
  Database["public"]["Tables"]["unidades"]["Row"],
  "id" | "codigo" | "alicuota" | "saldo_inicial" | "saldo_inicial_hon" | "activa"
> & {
  vinculos: Vinculo[];
};

/** Mismo subconjunto de columnas que selecciona cada pantalla (unidad_id..estado) — ver app.html:935-936. */
export type SaldoActual = Pick<
  Database["public"]["Views"]["saldos_actuales"]["Row"],
  "unidad_id" | "codigo" | "alicuota" | "condominio" | "administracion" | "servicio" | "total" | "estado"
>;

export type ConceptoCobro = Pick<
  Database["public"]["Tables"]["conceptos_cobro"]["Row"],
  "id" | "nombre" | "bolsillo" | "modo" | "monto" | "iva" | "orden" | "activo" | "edificio_id"
>;

export type PeriodoAdmin = Pick<
  Database["public"]["Tables"]["periodos"]["Row"],
  | "id"
  | "anio"
  | "mes"
  | "etiqueta"
  | "estado"
  | "tasa_bcv"
  | "presupuesto"
  | "total_gastos"
  | "cerrado_en"
  | "enviado_en"
>;

export type CategoriaAdmin = Pick<Database["public"]["Tables"]["categorias"]["Row"], "id" | "nombre" | "orden">;

export type GastoAdmin = Pick<
  Database["public"]["Tables"]["gastos"]["Row"],
  "id" | "concepto" | "referencia" | "monto" | "tipo" | "unidad_id" | "bolsillo" | "categoria_id" | "orden"
>;

export type EdificioAdmin = Database["public"]["Tables"]["edificios"]["Row"];

export type OrganizacionAdmin = Pick<
  Database["public"]["Tables"]["organizaciones"]["Row"],
  "id" | "nombre" | "rif" | "plan" | "acento" | "logo_url"
>;

export type SimulacionCierre = Database["public"]["Functions"]["simular_cierre"]["Returns"][number];

/** Fila de `invitaciones_de(p_org)` — portado en Accesos, ver app.html:3712-4143. */
export type InvitacionAdmin = Database["public"]["Functions"]["invitaciones_de"]["Returns"][number];

/** Fila de `residentes_de(p_edificio)` — portado en Accesos. */
export type ResidenteAcceso = Database["public"]["Functions"]["residentes_de"]["Returns"][number];
