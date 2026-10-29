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

/**
 * Un cargo a una sola unidad, con su motivo (`recibos.cargos`, ronda 10,
 * C): una multa o un consumo de Cobros, o un gasto «Solo a una unidad».
 * Los recibos emitidos antes de la ronda 10 lo tienen vacío.
 */
export type CargoRecibo = {
  concepto: string | null;
  referencia: string | null;
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
  /** Para repartir el total entre las cuentas de condominio y de honorarios (ronda 7). */
  anterior_hon: number;
  servicio: number;
  conceptos: ConceptoRecibo[];
  cargos: CargoRecibo[];
  detalle: CategoriaRecibo[];
  tasa_bcv: number;
  vence_el: string | null;
  alicuota: number;
  anio: number;
  mes: number;
  etiqueta: string;
  edificio: string;
  tasaHoy: TasaHoy | null;
};

/**
 * La tasa del BCV de HOY, no la del día en que se emitió el recibo
 * (index.html:609-621). La deuda está en dólares: lo que el propietario
 * va a pagar en bolívares se calcula con la tasa del día en que pague, y
 * esa es la que hay que enseñarle. Mostrar la congelada le dice que debe
 * menos de lo que debe, transfiere de menos y queda debiendo un resto que
 * nadie entiende de dónde salió.
 */
export type TasaHoy = { valor: number; fecha: string | null; dias: number | null };
