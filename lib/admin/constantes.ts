/**
 * Roles con acceso a `/admin/[orgId]/*` — antes duplicado en `proxy.ts` y
 * en `[orgId]/layout.tsx` (defensa en profundidad, cada uno revalida por su
 * cuenta), unificado acá para que un cambio de roles no dependa de tocar
 * los dos a la vez. Se usa también en `/admin/page.tsx` (AdminHome) para
 * filtrar qué organizaciones se listan — ver docs/casos-de-uso-mejorados.md.
 */
export const ROLES_ADMIN = ["propietario_cuenta", "administrador", "contador", "junta"] as const;

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

/** admin.html:148-149. */
export const METODOS = ["Pago móvil", "Transferencia", "Zelle", "Punto de venta", "Efectivo", "Otro"] as const;

/**
 * Qué datos de origen pide cada método de pago. admin.html:3282-3287 —
 * un método que no está en esta tabla no pide ninguno.
 */
export const PIDE: Record<string, { banco?: boolean; telefono?: boolean; documento?: boolean; correo?: boolean }> = {
  "Pago móvil": { banco: true, telefono: true, documento: true },
  Transferencia: { banco: true },
  Zelle: { correo: true },
  "Punto de venta": { banco: true },
};

/** Los tres destinos de un pago o ajuste (admin.html:3603-3607, 3651-3655). */
export const DESTINOS_PAGO: [string, string][] = [
  ["condominio", "Condominio"],
  ["honorarios", "Administración"],
  ["servicio", "Servicio"],
];

/**
 * Plantilla del mensaje de WhatsApp de Cortes de cuenta. admin.html:4254-4258.
 * Se guarda editada en localStorage bajo `vecitap_plantilla`, igual que el original.
 */
export const PLANTILLA_WHATSAPP =
  "Hola {nombre}. Le enviamos el estado de cuenta de la unidad {unidad} " +
  "correspondiente a {periodo}.\n\nRecibo N° {recibo}\nCuota del mes: {cuota}\n" +
  "Saldo anterior: {anterior}\nInterés de mora: {mora}\nTOTAL A PAGAR: {total}\n" +
  "Equivalente: {totalBs} (tasa BCV {tasa})\n\n" +
  "Al transferir, por favor responda con el número de referencia.";
