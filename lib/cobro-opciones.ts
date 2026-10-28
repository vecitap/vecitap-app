/**
 * Las opciones de `ajustes_cobro` (ronda 7), sin nada de servidor: las usan
 * tanto `lib/cobro.ts` (que las lee de la base) como la tarjeta de Ajustes,
 * que corre en el navegador.
 */
/** Ronda 9 (A2, regla de Gustavo): dos opciones. «Redondear» = más de $ 20, al múltiplo de $ 5; $ 20 o menos, al dólar. */
export type Redondeo = "ninguno" | "redondear";
export type AjustesCobro = { soloUsd: boolean; redondeo: Redondeo };

export const REDONDEOS: Record<Redondeo, string> = {
  ninguno: "Sin redondeo",
  redondear: "Redondear",
};

export const SIN_AJUSTES_COBRO: AjustesCobro = { soloUsd: false, redondeo: "ninguno" };
