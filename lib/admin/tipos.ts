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

/**
 * Unidad con `paga` ("¿quién paga el condominio?"). Aparte de `Unidad` a
 * propósito: solo la piden las pantallas que la usan (la lista de
 * Propietarios y la ficha), así Inicio y Cortes no dependen de la columna
 * nueva. Ver supabase/migrations/20260930120000_unidades_paga.sql.
 */
export type UnidadConPaga = Unidad & Pick<Database["public"]["Tables"]["unidades"]["Row"], "paga">;

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

/** Columnas que selecciona Pagos() en admin.html:3316-3320. */
export type PagoAdmin = Pick<
  Database["public"]["Tables"]["pagos"]["Row"],
  | "id"
  | "unidad_id"
  | "fecha"
  | "monto"
  | "moneda"
  | "tasa_aplicada"
  | "monto_usd"
  | "metodo"
  | "destino"
  | "referencia"
  | "banco"
  | "banco_codigo"
  | "telefono_origen"
  | "documento_origen"
  | "correo_origen"
  | "reportado_por"
  | "estado"
  | "periodo_cierre_id"
  | "nota"
>;

/** `bancos` activos, como los pide admin.html:3327. */
export type BancoFila = Pick<Database["public"]["Tables"]["bancos"]["Row"], "codigo" | "nombre" | "corto">;

/** Ficha del comprobante (sin la imagen), como admin.html:3336-3337. */
export type ComprobanteFila = Pick<
  Database["public"]["Tables"]["comprobantes"]["Row"],
  "id" | "pago_id" | "ruta" | "tipo" | "bytes" | "sha256" | "subido_en" | "imagen_borrada_en"
>;

/** Fila de `recibos` que lee Cortes() en admin.html:4943-4944. */
export type ReciboAdmin = Pick<
  Database["public"]["Tables"]["recibos"]["Row"],
  | "id"
  | "unidad_id"
  | "numero"
  | "cuota"
  | "directos"
  | "anterior"
  | "a_favor"
  | "mora"
  | "honorario"
  | "servicio"
  | "anterior_hon"
  | "anterior_serv"
  | "total"
  | "conceptos"
  | "detalle"
  | "tasa_bcv"
  | "vence_el"
  | "alicuota"
>;

/** Partida fija anidada dentro de su categoría, como admin.html:5685-5686. */
export type PartidaFija = Pick<
  Database["public"]["Tables"]["partidas_fijas"]["Row"],
  "id" | "concepto" | "referencia" | "monto" | "orden"
>;

export type CategoriaConPartidas = CategoriaAdmin & { partidas_fijas: PartidaFija[] };

/** La tasa viva del encabezado de Admin (admin.html:1148-1216). */
export type TasaViva = {
  valor: number;
  fuente: string;
  actualizada: string | null;
  dias: number | null;
};

/** Las cinco consultas de Estadísticas (admin.html:4611-4620), ya resueltas. */
export type DatosEstadisticas = {
  resumen: Database["public"]["Functions"]["estadisticas_periodo"]["Returns"][number] | null;
  categorias: Database["public"]["Functions"]["gastos_por_categoria"]["Returns"];
  top: Database["public"]["Functions"]["top_gastos"]["Returns"];
  serie: Database["public"]["Functions"]["serie_edificio"]["Returns"];
  mora: Database["public"]["Functions"]["morosidad_edificio"]["Returns"];
};

/** Fila de `vigilantes_de(p_org)` — pestaña Vigilantes de Accesos. */
export type VigilanteAcceso = Database["public"]["Functions"]["vigilantes_de"]["Returns"][number];
