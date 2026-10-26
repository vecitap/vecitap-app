/**
 * Las opciones de `ajustes_cobro` (ronda 7), sin nada de servidor: las usan
 * tanto `lib/cobro.ts` (que las lee de la base) como la tarjeta de Ajustes,
 * que corre en el navegador.
 */
export type Redondeo = "ninguno" | "entero" | "cinco";
export type AjustesCobro = { soloUsd: boolean; redondeo: Redondeo };

export const REDONDEOS: Record<Redondeo, string> = {
  ninguno: "Sin redondeo",
  entero: "Al dólar entero",
  cinco: "A múltiplos de $ 5",
};

export const SIN_AJUSTES_COBRO: AjustesCobro = { soloUsd: false, redondeo: "ninguno" };
