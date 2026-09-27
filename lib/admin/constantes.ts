/** Portado de MESES/BOLSILLOS/MODOS_COBRO en app.html:131-154. */
export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const BOLSILLOS: Record<string, { t: string; destinoPago: string }> = {
  condominio: { t: "Condominio", destinoPago: "condominio" },
  administracion: { t: "Administración", destinoPago: "honorarios" },
  servicio: { t: "Servicio", destinoPago: "servicio" },
};

export const MODOS_COBRO: Record<string, string> = {
  presupuesto_alicuota: "Presupuesto del mes × alícuota",
  presupuesto_partes_iguales: "Presupuesto del mes ÷ nº de unidades",
  gasto_alicuota: "Gasto del mes × alícuota",
  gasto_partes_iguales: "Gasto del mes ÷ nº de unidades",
  monto_por_unidad: "Un monto igual a cada unidad",
  monto_por_alicuota: "Un monto total repartido por alícuota",
  monto_fijo_repartido: "Un monto total ÷ nº de unidades",
  porcentaje_condominio: "% de lo que paga de condominio",
};
