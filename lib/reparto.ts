import { usd } from "@/lib/formato";
import type { crearClienteNavegador } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";

/**
 * Cambio 2 de ING3: pagos parciales con varias unidades.
 *
 * Las cuentas las hace la base (`repartir_pago`, `deuda_por_mes`, ver
 * supabase/migrations/20261117130000_deuda_por_mes.sql), con la misma regla
 * que el cierre: 1° la mora, 2° las cuotas extraordinarias, 3° las cuotas
 * ordinarias y los cargos, del mes más antiguo al más reciente, 4° las
 * multas. Acá solo se pasa de bolívares a dólares y de vuelta, y se arma el
 * texto de qué cubre cada parte.
 */

/** Un cargo que cubre una parte de la transferencia (un elemento de `detalle`). */
export type ItemReparto = {
  anio: number | null;
  mes: number | null;
  etiqueta: string | null;
  tipo: string;
  /** Lo que faltaba de ese cargo. Sin `falta` en el sobrante (`tipo` 'a_favor'). */
  falta?: number;
  cubre: number;
};

export type ParteReparto = {
  unidad_id: string;
  codigo: string;
  /** En la moneda de la transferencia (Bs o USD), con 2 decimales. */
  monto: number;
  /** En dólares, lo que propuso la base. */
  montoUsd: number;
  detalle: ItemReparto[];
};

/** Una fila de `deuda_por_mes()`. */
export type FilaDeudaMes = {
  destino: string;
  anio: number | null;
  mes: number | null;
  etiqueta: string | null;
  tipo: string;
  monto: number;
  abonado: number;
  falta: number;
};

/** Un mes del detalle (las filas de `deuda_por_mes()` agrupadas, o `recibos.deuda_meses`). */
export type MesDeuda = {
  anio: number | null;
  mes: number | null;
  etiqueta: string;
  cargo: number;
  abonado: number;
  falta: number;
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const TIPO: Record<string, string> = {
  mora: "mora",
  extraordinaria: "cuota extraordinaria",
  cargo: "cargo",
  multa: "multa",
  honorario: "honorarios",
  servicio: "servicio",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

const mesCorto = (i: ItemReparto) => (i.mes === null ? "" : (MESES_CORTOS[i.mes - 1] ?? String(i.mes)));

/** «sep», «mora de sep», «deuda anterior». */
function nombreItem(i: ItemReparto): string {
  if (i.mes === null || i.anio === null) return i.tipo === "anterior" ? "deuda anterior" : `${TIPO[i.tipo] ?? i.tipo} anterior`;
  return i.tipo === "cuota" ? mesCorto(i) : `${TIPO[i.tipo] ?? i.tipo} de ${mesCorto(i)}`;
}

const enLista = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}`);

/**
 * Qué cubre una parte, en una línea: «Cubre mora de may · cuota extraordinaria
 * de nov, dic y ene · jul y ago · sep $ 30,00 de $ 50,00 · a favor $ 15,00». Lo
 * que se cubre entero va agrupado por tipo, en el orden en que se paga; lo que
 * queda a medias, con cuánto y de cuánto.
 */
export function textoCubre(detalle: ItemReparto[]): string {
  const grupos = new Map<string, ItemReparto[]>();
  const partes: string[] = [];
  let favor = 0;
  for (const i of detalle) {
    if (i.tipo === "a_favor") favor += i.cubre;
    else if (i.falta !== undefined && i.cubre + 0.005 < i.falta) partes.push(`${nombreItem(i)} ${usd(i.cubre)} de ${usd(i.falta)}`);
    else {
      // La «deuda anterior» (sin mes) va sola; lo demás, por tipo.
      const clave = i.mes === null ? `${i.tipo}-anterior` : i.tipo;
      grupos.set(clave, [...(grupos.get(clave) ?? []), i]);
    }
  }
  const enteros = [...grupos.values()].map((g) => {
    const i = g[0];
    if (i.mes === null) return nombreItem(i);
    const meses = enLista(g.map(mesCorto));
    return i.tipo === "cuota" ? meses : `${TIPO[i.tipo] ?? i.tipo} de ${meses}`;
  });
  const trozos: string[] = [];
  if (enteros.length) trozos.push("Cubre " + enteros.join(" · "));
  trozos.push(...partes);
  if (favor > 0.005) trozos.push(`a favor ${usd(favor)}`);
  return trozos.length ? trozos.join(" · ") : "No cubre nada";
}

/**
 * Pide a la base el reparto de una transferencia entre unidades.
 *
 * En bolívares: el total se pasa a dólares como lo va a hacer la base al
 * guardar un grupo (`pagos_grupo_al_insertar`: la suma de los monto_usd es
 * round(total / tasa, 2)), y cada parte se devuelve a bolívares al céntimo.
 * La diferencia de redondeo la absorbe la parte más grande, para que las
 * partes sumen exactamente el total escrito.
 */
export async function repartirTransferencia(
  supabase: ReturnType<typeof crearClienteNavegador>,
  args: { unidades: string[]; total: number; moneda: string; tasa: number | null; destino: string }
): Promise<{ partes: ParteReparto[] } | { error: unknown }> {
  const { unidades, total, moneda, tasa, destino } = args;
  const enBs = moneda === "VES";
  if (enBs && !(tasa && tasa > 0)) return { error: new Error("Falta la tasa del día del pago para repartir en bolívares.") };
  const totalUsd = enBs ? r2(total / (tasa as number)) : r2(total);
  const { data, error } = await supabase.rpc("repartir_pago", {
    p_unidades: unidades,
    p_monto: totalUsd,
    p_destino: destino,
  });
  if (error) return { error };
  const filas = (data ?? []).map((x) => ({
    unidad_id: x.unidad_id,
    codigo: x.codigo,
    montoUsd: Number(x.monto),
    detalle: leerDetalle(x.detalle),
  }));
  if (!enBs) return { partes: filas.map((x) => ({ ...x, monto: r2(x.montoUsd) })) };

  const partes = filas.map((x) => ({ ...x, monto: r2(x.montoUsd * (tasa as number)) }));
  const dif = r2(total - partes.reduce((s, x) => s + x.monto, 0));
  if (Math.abs(dif) >= 0.005 && partes.length) {
    const mayor = partes.reduce((m, x) => (x.monto > m.monto ? x : m), partes[0]);
    mayor.monto = r2(mayor.monto + dif);
  }
  return { partes };
}

function leerDetalle(j: Json): ItemReparto[] {
  if (!Array.isArray(j)) return [];
  return j.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      anio: o.anio == null ? null : Number(o.anio),
      mes: o.mes == null ? null : Number(o.mes),
      etiqueta: o.etiqueta == null ? null : String(o.etiqueta),
      tipo: String(o.tipo ?? ""),
      falta: o.falta == null ? undefined : Number(o.falta),
      cubre: Number(o.cubre ?? 0),
    };
  });
}

/**
 * Las filas de `deuda_por_mes()` agrupadas por mes (todas las cuentas juntas),
 * del más antiguo al más reciente, con «Deuda anterior» primero.
 */
export function mesesDeDeuda(filas: FilaDeudaMes[]): MesDeuda[] {
  const m = new Map<string, MesDeuda>();
  for (const f of filas) {
    const clave = f.anio === null ? "anterior" : `${f.anio}-${String(f.mes).padStart(2, "0")}`;
    const fila = m.get(clave) ?? { anio: f.anio, mes: f.mes, etiqueta: f.etiqueta ?? "Deuda anterior", cargo: 0, abonado: 0, falta: 0 };
    fila.cargo = r2(fila.cargo + Number(f.monto));
    fila.abonado = r2(fila.abonado + Number(f.abonado));
    fila.falta = r2(fila.falta + Number(f.falta));
    m.set(clave, fila);
  }
  return [...m.entries()].sort(([a], [b]) => (a === "anterior" ? -1 : b === "anterior" ? 1 : a.localeCompare(b))).map(([, v]) => v);
}

/** `recibos.deuda_meses` leído con cuidado: null en los recibos anteriores al cambio 2. */
export function leerDeudaMeses(j: Json | null | undefined): MesDeuda[] | null {
  if (!Array.isArray(j)) return null;
  return j.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      anio: o.anio == null ? null : Number(o.anio),
      mes: o.mes == null ? null : Number(o.mes),
      etiqueta: o.etiqueta == null ? "Deuda anterior" : String(o.etiqueta),
      cargo: Number(o.cargo ?? 0),
      abonado: Number(o.abonado ?? 0),
      falta: Number(o.falta ?? 0),
    };
  });
}

/** Estado de un mes: lo que se ve en la columna «Estado». */
export function estadoMes(m: Pick<MesDeuda, "abonado" | "falta">): "Pagado" | "En parte" | "Pendiente" {
  if (m.falta <= 0.005) return "Pagado";
  return m.abonado > 0.005 ? "En parte" : "Pendiente";
}

/** «Septiembre 2026: abonado $ 30,00, falta $ 20,00». */
export function lineaMesPendiente(m: MesDeuda): string {
  return m.abonado > 0.005
    ? `${m.etiqueta}: abonado ${usd(m.abonado)}, falta ${usd(m.falta)}`
    : `${m.etiqueta}: falta ${usd(m.falta)}`;
}
