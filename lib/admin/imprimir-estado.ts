import { nf, pct, usd } from "@/lib/formato";

type FilaImpresion = {
  fecha: string | null;
  concepto: string;
  detalle?: string | null;
  cargo: number;
  abono: number;
  saldo: number;
  monto?: number;
  tipo?: "pendiente";
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

/**
 * Portado de imprimirEstado() en app.html:1924-1975 — abre una ventana con
 * el HTML del estado de cuenta para imprimir/guardar como PDF. Es un
 * efecto de navegador (window.open), por eso vive fuera de un componente.
 */
export function imprimirEstado(params: {
  edificio: { nombre: string; rif: string | null; direccion: string | null };
  organizacion: { nombre: string };
  unidad: { codigo: string; alicuota: number };
  propietario: string;
  inquilino: string;
  filas: FilaImpresion[];
  saldoFinal: number;
  tasa: number | null;
}): boolean {
  const { edificio, organizacion, unidad, propietario, inquilino, filas, saldoFinal, tasa } = params;

  const filasHtml = filas
    .map(
      (f) => `
    <tr><td>${esc(f.fecha || "—")}</td>
    <td><b>${esc(f.concepto)}</b>${f.detalle ? `<br><span class="d">${esc(f.detalle)}</span>` : ""}</td>
    <td class="n">${f.cargo ? nf(2).format(f.cargo) : ""}</td>
    <td class="n ${f.tipo === "pendiente" ? "p" : "a"}">${
        f.abono ? nf(2).format(f.abono) : f.tipo === "pendiente" ? "(" + nf(2).format(f.monto || 0) + ")" : ""
      }</td>
    <td class="n s">${f.tipo === "pendiente" ? "" : nf(2).format(f.saldo)}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Estado de cuenta ${esc(unidad.codigo)}</title><style>
*{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#0A1128;margin:32px;font-size:12px}
h1{font-size:19px;margin:0 0 2px} .sub{color:#2A3654;font-size:12px;margin-bottom:18px}
.caja{border:1px solid #CBD5E1;padding:12px 14px;margin-bottom:18px;background:#F8FAFC;border-radius:8px}
.caja b{display:inline-block;min-width:96px;color:#2A3654;font-weight:400}
table{width:100%;border-collapse:collapse;margin-top:6px}
th{background:#0A1128;color:#fff;text-align:left;padding:7px 9px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
td{padding:7px 9px;border-bottom:1px solid #CBD5E1;vertical-align:top}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap} .a{color:#2E7A6C} .p{color:#92400E} .s{font-weight:bold}
.d{color:#2A3654;font-size:10.5px}
.tot{margin-top:18px;border-top:2px solid #0A1128;padding-top:12px;display:flex;justify-content:space-between;align-items:baseline}
.tot .v{font-size:22px;font-weight:bold}
.pie{margin-top:26px;color:#2A3654;font-size:10px;border-top:1px solid #CBD5E1;padding-top:10px}
@media print{body{margin:14mm}.noimp{display:none}}
</style></head><body>
<h1>${esc(edificio.nombre || "Estado de cuenta")}</h1>
<div class="sub">${esc(edificio.rif ? "RIF " + edificio.rif + " · " : "")}${esc(edificio.direccion || organizacion.nombre || "")}</div>
<div class="caja">
  <div><b>Unidad</b> ${esc(unidad.codigo)}</div>
  <div><b>Propietario</b> ${esc(propietario || "sin registrar")}</div>
  ${inquilino ? `<div><b>Inquilino</b> ${esc(inquilino)}</div>` : ""}
  <div><b>Alícuota</b> ${esc(pct(unidad.alicuota))}</div>
  <div><b>Emitido</b> ${new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "long", year: "numeric" })}</div>
</div>
<table><thead><tr><th>Fecha</th><th>Concepto</th><th class="n">Cargo</th>
<th class="n">Abono</th><th class="n">Saldo</th></tr></thead>
<tbody>${filasHtml || '<tr><td colspan="5">Sin movimientos registrados.</td></tr>'}</tbody></table>
<div class="tot"><span>${saldoFinal > 0.009 ? "Saldo pendiente" : saldoFinal < -0.009 ? "Saldo a favor del propietario" : "Unidad solvente"}</span>
<span class="v">${esc(usd(Math.abs(saldoFinal)))}</span></div>
${tasa ? `<div style="text-align:right;color:#2A3654;margin-top:4px">Equivalente: Bs ${nf(2).format(Math.abs(saldoFinal) * tasa)} · tasa ${nf(2).format(tasa)}</div>` : ""}
<div class="pie">Documento generado a partir de los movimientos registrados. Los montos en bolívares son referenciales.</div>
<div class="noimp" style="margin-top:22px"><button onclick="window.print()"
  style="padding:10px 18px;font-size:13px;cursor:pointer;border-radius:8px;border:1px solid #CBD5E1;background:#fff">
  Imprimir o guardar como PDF</button></div>
</body></html>`;

  const v = window.open("", "_blank");
  if (!v) return false;
  v.document.write(html);
  v.document.close();
  return true;
}
