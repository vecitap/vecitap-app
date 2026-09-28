import { nf, usd } from "@/lib/formato";
import { nombreDe, vigente } from "./personas";
import type { PeriodoAdmin, ReciboAdmin, Unidad } from "./tipos";

/**
 * El listado del mes, en papel, y el mismo listado como CSV. Portado de
 * `listadoPDF` y `exportarCSV` en admin.html:5123-5244.
 *
 * Es lo que la administradora lleva a la junta o archiva: quién debe qué
 * este mes, con el total abajo. Mismo lenguaje visual que el recibo, con
 * el "powered by Vecitap" al pie. Los colores son hex literales porque
 * esto se abre en una ventana aparte, que no hereda `app/globals.css`.
 */

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

type DatosListado = {
  recibos: ReciboAdmin[];
  unidades: Unidad[];
  periodo: PeriodoAdmin | null;
  edificio: { nombre: string; rif: string | null } | null;
  organizacion: { nombre: string } | null;
};

export function listadoDeCortesEnPapel({ recibos, unidades, periodo, edificio, organizacion }: DatosListado): string {
  let tCuota = 0;
  let tMora = 0;
  let tAdm = 0;
  let tAnt = 0;
  let tTotal = 0;

  const filas = recibos
    .map((r) => {
      const u = unidades.find((x) => x.id === r.unidad_id);
      const p = vigente(u?.vinculos, "propietario");
      const q = vigente(u?.vinculos, "inquilino");
      const ant = Number(r.anterior) + Number(r.anterior_hon) + Number(r.anterior_serv);
      tCuota += Number(r.cuota) + Number(r.directos);
      tMora += Number(r.mora);
      tAdm += Number(r.honorario) + Number(r.servicio);
      tAnt += ant;
      tTotal += Number(r.total);
      return `<tr>
        <td class="cod">${esc(u?.codigo)}</td>
        <td>${esc(nombreDe(p) || nombreDe(q) || "sin registrar")}</td>
        <td class="d">${usd(Number(r.cuota) + Number(r.directos))}</td>
        <td class="d">${usd(ant)}</td>
        <td class="d">${usd(r.mora)}</td>
        <td class="d">${usd(Number(r.honorario) + Number(r.servicio))}</td>
        <td class="d tot">${usd(r.total)}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Cortes ${esc(periodo?.etiqueta || "")}</title>
<style>
  @page { size: Letter; margin: 12mm 13mm 10mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  body{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        color:#0A1128; font-size:9.5pt }
  .hoja{ width:100%; border-collapse:collapse }
  .hoja > thead{ display:table-header-group }
  .hoja > thead > tr > td, .hoja > tbody > tr > td{ padding:0; border:0 }
  .cab{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
        padding-bottom:9px; border-bottom:2.5px solid #0A1128; margin-bottom:12px }
  h1{ font-size:15pt; margin:0; letter-spacing:-.01em }
  .or{ font-size:8pt; color:#64748B; margin-top:2px }
  .et{ font-size:6.7pt; text-transform:uppercase; letter-spacing:.1em; color:#64748B;
       font-weight:700; display:block; text-align:right }
  .mes{ font-size:12pt; font-weight:700; text-align:right; white-space:nowrap }
  table.lista{ width:100%; border-collapse:collapse }
  table.lista th{ font-size:6.8pt; text-transform:uppercase; letter-spacing:.09em;
    color:#64748B; text-align:left; padding:0 6px 5px; border-bottom:1px solid #0A1128 }
  table.lista th.d{ text-align:right }
  table.lista td{ padding:4.4px 6px; border-bottom:1px solid #E4E9F0; font-size:8.6pt }
  table.lista td.d{ text-align:right; white-space:nowrap;
    font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.lista td.cod{ font-weight:700;
    font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.lista td.tot{ font-weight:700 }
  table.lista tr.suma td{ border-top:1.5px solid #0A1128; border-bottom:0;
    padding-top:7px; font-weight:700; font-size:9.5pt }
  .pie{ margin-top:14px; padding-top:8px; border-top:1px solid #D0D7E2;
        display:flex; justify-content:space-between; align-items:flex-end; gap:18px }
  .pie p{ margin:0; font-size:7.4pt; color:#64748B; line-height:1.5; max-width:74% }
  .marca{ text-align:right; white-space:nowrap }
  .marca span{ font-size:6.5pt; color:#64748B; letter-spacing:.05em; display:block;
               margin-bottom:2px }
  .marca img{ height:15px }
  .marca b{ font-size:9pt; color:#0A1128 }
</style></head><body>
<table class="hoja"><thead><tr><td>
  <div class="cab">
    <div>
      <h1>${esc(edificio?.nombre || "")}</h1>
      <div class="or">${esc(edificio?.rif ? "RIF " + edificio.rif + " · " : "")}${esc(organizacion?.nombre || "")}</div>
    </div>
    <div>
      <span class="et">Cortes de cuenta</span>
      <div class="mes">${esc(periodo?.etiqueta || "")}</div>
      <div class="or">${recibos.length} unidades</div>
    </div>
  </div>
</td></tr></thead><tbody><tr><td>
  <table class="lista">
    <thead><tr><th>Unidad</th><th>Propietario</th><th class="d">Del mes</th>
      <th class="d">Anterior</th><th class="d">Mora</th><th class="d">Administración</th>
      <th class="d">Total</th></tr></thead>
    <tbody>${filas}
      <tr class="suma"><td colspan="2">Total del edificio</td>
        <td class="d">${usd(tCuota)}</td><td class="d">${usd(tAnt)}</td>
        <td class="d">${usd(tMora)}</td><td class="d">${usd(tAdm)}</td>
        <td class="d">${usd(tTotal)}</td></tr>
    </tbody>
  </table>
  <div class="pie">
    <p>Listado de los recibos emitidos en ${esc(periodo?.etiqueta || "")}. Los montos están
       en dólares; el equivalente en bolívares se calcula con la tasa del día en que cada
       propietario pague.</p>
    <div class="marca"><span>powered by</span>
      <img src="/logo-claro.png" alt="Vecitap"
           onerror="this.outerHTML='<b>vecitap</b>'"></div>
  </div>
</td></tr></tbody></table>
</body></html>`;
}

/** admin.html:5246-5257 — el mismo listado como CSV, para el contador. */
export function csvDeCortes(recibos: ReciboAdmin[], unidades: Unidad[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    ["unidad", "propietario", "telefono", "correo", "recibo", "cuota", "directos", "mora", "administracion", "servicio", "anterior", "total"].join(
      ","
    ),
    ...recibos.map((r) => {
      const u = unidades.find((x) => x.id === r.unidad_id);
      const p = vigente(u?.vinculos, "propietario");
      return [
        q(u?.codigo),
        q(nombreDe(p)),
        q(p?.personas?.telefono),
        q(p?.personas?.correo),
        q(r.numero),
        q(nf(2).format(r.cuota)),
        q(nf(2).format(r.directos)),
        q(nf(2).format(r.mora)),
        q(nf(2).format(r.honorario)),
        q(nf(2).format(r.servicio)),
        q(nf(2).format(Number(r.anterior) + Number(r.anterior_hon) + Number(r.anterior_serv))),
        q(nf(2).format(r.total)),
      ].join(",");
    }),
  ].join("\n");
}

/** Descarga un CSV con BOM, igual que admin.html:5237-5243 (para que Excel lea las eñes). */
export function descargarCSV(contenido: string, nombre: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
