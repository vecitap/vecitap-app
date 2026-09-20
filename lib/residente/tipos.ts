/** Formas de `recibos.conceptos`/`recibos.detalle` (columnas `Json` en el
 * schema — sin tipo propio en la base, ver types/supabase.ts). Usadas por
 * Recibo.tsx y papel-recibo.ts. */
export type LineaRecibo = {
  concepto: string;
  monto: number;
  parte: number;
  referencia?: string | null;
};

export type CategoriaRecibo = {
  categoria: string;
  lineas: LineaRecibo[];
};

export type ConceptoRecibo = {
  nombre: string;
  monto: number;
};

export type RegistroRecibo = {
  numero: string;
  total: number;
  cuota: number;
  directos: number;
  anterior: number;
  a_favor: number;
  mora: number;
  honorario: number;
  servicio: number;
  conceptos: ConceptoRecibo[];
  detalle: CategoriaRecibo[];
  tasa_bcv: number;
  vence_el: string | null;
  alicuota: number;
  anio: number;
  mes: number;
  etiqueta: string;
  edificio: string;
};
