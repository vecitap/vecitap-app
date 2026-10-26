import { fechaCorta, nf, usd } from "@/lib/formato";
import { MESES } from "./constantes";

/**
 * Estado financiero del edificio (ronda 7, bloque 8, caso 86). Los números
 * salen de `estado_financiero()` en la base
 * (supabase/migrations/20261026180000_estado_financiero.sql); acá solo se
 * arman el rango de fechas, el papel para imprimir y el Excel.
 */

export type EstadoFinanciero = {
  saldo_inicial: number;
  ingresos: number;
  egresos: number;
  saldo_final: number;
  honorarios: number;
  detalle_ingresos: { fecha: string; unidad: string; metodo: string | null; referencia: string | null; monto: number }[];
  detalle_egresos: { mes: string; anio: number; num_mes: number; categoria: string; concepto: string; referencia: string | null; monto: number }[];
  meses_abiertos: string[];
};

/** "2026-10" → { desde: "2026-10-01", hasta: "2026-10-31" } (hasta: el último día del mes de `hastaMes`). */
export function rangoDeMeses(desdeMes: string, hastaMes: string): { desde: string; hasta: string } | null {
  const ok = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  if (!ok(desdeMes) || !ok(hastaMes) || desdeMes > hastaMes) return null;
  const [a, m] = hastaMes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${desdeMes}-01`, hasta: `${hastaMes}-${String(ultimo).padStart(2, "0")}` };
}

/** "2026-10" → "Octubre 2026". */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

export const tituloRango = (desdeMes: string, hastaMes: string) =>
  desdeMes === hastaMes ? nombreMes(desdeMes) : `${nombreMes(desdeMes)} a ${nombreMes(hastaMes)}`;

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/**
 * El estado financiero en papel, con la misma hoja y la misma barra «← Volver»
 * que el recibo (la ruta lo pasa por `paraPantalla`). Colores literales, como
 * el resto de los papeles.
 */
export function estadoFinancieroEnPapel(d: {
  estado: EstadoFinanciero;
  edificio: { nombre: string; rif: string | null };
  organizacion: { nombre: string };
  titulo: string;
}): string {
  const e = d.estado;
  const fila = (t: string, v: number, cls = "") => `<tr class="${cls}"><td>${esc(t)}</td><td class="d">${usd(v)}</td></tr>`;
  const ingresos = e.detalle_ingresos
    .map(
      (p) =>
        `<tr><td>${esc(fechaCorta(p.fecha))}</td><td class="m">${esc(p.unidad)}</td><td>${esc([p.metodo, p.referencia ? "ref " + p.referencia : ""].filter(Boolean).join(" · "))}</td><td class="d">${usd(p.monto)}</td></tr>`
    )
    .join("");
  const egresos = e.detalle_egresos
    .map(
      (g) =>
        `<tr><td>${esc(g.mes)}</td><td>${esc(g.categoria)}</td><td>${esc(g.concepto)}${g.referencia ? ` <span class="rf">· ${esc(g.referencia)}</span>` : ""}</td><td class="d">${usd(g.monto)}</td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Estado financiero · ${esc(d.edificio.nombre)} · ${esc(d.titulo)}</title>
<style>
  @page { size: Letter; margin: 12mm 13mm 10mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  body{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#0A1128; font-size:9.5pt; line-height:1.35 }
  .cab{ display:flex; justify-content:space-between; gap:16px; padding-bottom:9px; border-bottom:2.5px solid #0A1128 }
  .ed{ font-size:15pt; font-weight:700 } .or{ font-size:8pt; color:#64748B }
  .et{ font-size:6.7pt; text-transform:uppercase; letter-spacing:.1em; color:#64748B; font-weight:700 }
  .ti{ font-size:11pt; font-weight:700; text-align:right }
  table{ width:100%; border-collapse:collapse }
  .res{ margin:12px 0 14px; border:1.5px solid #0A1128; border-radius:9px; overflow:hidden }
  .res td{ padding:7px 12px; border-bottom:1px solid #DDE3EC; font-size:10.5pt }
  .res tr.tot td{ background:#0A1128; color:#F8FAFC; font-weight:700; border-bottom:0 }
  td.d{ text-align:right; white-space:nowrap; font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  td.m{ font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  h2{ font-size:8.5pt; text-transform:uppercase; letter-spacing:.1em; margin:14px 0 4px }
  .det td{ padding:3px 4px; border-bottom:1px solid #DDE3EC; font-size:8.6pt; vertical-align:top }
  .det tr:first-child td{ border-top:1px solid #CBD5E1 }
  .rf{ color:#64748B } .nota{ font-size:8pt; color:#92400E; margin:6px 0 0 }
  .pie{ margin-top:14px; padding-top:8px; border-top:1px solid #CBD5E1; font-size:7.4pt; color:#64748B }
</style></head><body>
  <div class="cab">
    <div><div class="ed">${esc(d.edificio.nombre)}</div><div class="or">${esc(d.edificio.rif ? "RIF " + d.edificio.rif + " · " : "")}${esc(d.organizacion.nombre)}</div></div>
    <div><div class="et">Estado financiero</div><div class="ti">${esc(d.titulo)}</div></div>
  </div>
  <table class="res">
    ${fila("Saldo inicial", e.saldo_inicial)}
    ${fila("Ingresos (pagos confirmados)", e.ingresos)}
    ${fila("Egresos (gastos del mes)", -e.egresos)}
    ${fila("Saldo final", e.saldo_final, "tot")}
  </table>
  ${e.meses_abiertos.length ? `<p class="nota">Sin cerrar todavía: ${esc(e.meses_abiertos.join(", "))}. Sus gastos pueden cambiar.</p>` : ""}
  ${e.honorarios > 0 ? `<p class="nota" style="color:#64748B">Aparte, cobrado para honorarios de administración: ${usd(e.honorarios)} (no es del edificio, no entra en el saldo).</p>` : ""}
  <h2>Ingresos · ${nf(0).format(e.detalle_ingresos.length)} pagos</h2>
  <table class="det">${ingresos || `<tr><td>Ningún pago confirmado en el período.</td></tr>`}</table>
  <h2>Egresos · ${nf(0).format(e.detalle_egresos.length)} gastos</h2>
  <table class="det">${egresos || `<tr><td>Ningún gasto en el período.</td></tr>`}</table>
  <div class="pie">Montos en dólares. El saldo inicial es lo cobrado menos lo gastado antes del período, según lo registrado en Vecitap.</div>
</body></html>`;
}

/** El Excel: una hoja de resumen y una por detalle. Solo en el navegador. */
export async function descargarExcelEstado(d: { estado: EstadoFinanciero; edificio: string; titulo: string; archivo: string }) {
  const XLSX = await import("xlsx");
  const e = d.estado;
  const libro = XLSX.utils.book_new();
  const resumen = XLSX.utils.aoa_to_sheet([
    [`Estado financiero · ${d.edificio}`],
    [d.titulo],
    [],
    ["Concepto", "USD"],
    ["Saldo inicial", e.saldo_inicial],
    ["Ingresos (pagos confirmados)", e.ingresos],
    ["Egresos (gastos del mes)", -e.egresos],
    ["Saldo final", e.saldo_final],
    [],
    ["Cobrado para honorarios (aparte)", e.honorarios],
    ...(e.meses_abiertos.length ? [[`Sin cerrar todavía: ${e.meses_abiertos.join(", ")}`]] : []),
  ]);
  resumen["!cols"] = [{ wch: 36 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, resumen, "Resumen");
  const ingresos = XLSX.utils.json_to_sheet(
    e.detalle_ingresos.map((p) => ({ Fecha: p.fecha, Unidad: p.unidad, Método: p.metodo ?? "", Referencia: p.referencia ?? "", USD: Number(p.monto) }))
  );
  XLSX.utils.book_append_sheet(libro, ingresos, "Ingresos");
  const egresos = XLSX.utils.json_to_sheet(
    e.detalle_egresos.map((g) => ({ Mes: g.mes, Categoría: g.categoria, Concepto: g.concepto, Referencia: g.referencia ?? "", USD: Number(g.monto) }))
  );
  XLSX.utils.book_append_sheet(libro, egresos, "Egresos");
  XLSX.writeFile(libro, d.archivo);
}
