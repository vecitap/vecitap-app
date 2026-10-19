/**
 * Cuántos bolívares hay que transferir para cubrir una deuda en dólares
 * (ronda 4, caso 54).
 *
 * La base convierte cada pago en bolívares con
 * `monto_usd = round(monto / tasa_del_dia(fecha), 4)` (disparador
 * `pago_convierte`). Para que el pago cubra la deuda entera, el monto en
 * bolívares se redondea **hacia arriba** al céntimo: así `monto / tasa`
 * nunca queda por debajo de la deuda, y como la deuda tiene a lo sumo 4
 * decimales, el redondeo a 4 de la base tampoco la deja corta. Lo más que
 * paga de más es menos de un céntimo de bolívar.
 *
 * La conciliación acepta una diferencia de hasta máximo(1, 1 %) entre lo
 * reportado y lo que dice el banco (`lib/admin/conciliacion.ts`), así que el
 * monto exacto cae siempre dentro.
 *
 * `toFixed(6)` antes del techo: 98,6268 × 880,1159 no da exacto en coma
 * flotante, y un 8680237,0000001 subiría un céntimo de más.
 */
export function bolivaresExactos(deudaUsd: number, tasa: number): number {
  return Math.ceil(Number((deudaUsd * tasa * 100).toFixed(6))) / 100;
}

/** El monto para pegar en la app del banco: coma decimal, sin puntos de miles. */
export function bolivaresParaCopiar(bs: number): string {
  return bs.toFixed(2).replace(".", ",");
}
