import { nf, num0, usd } from "@/lib/formato";
import { MESES } from "./constantes";
import type { DatosEstadisticas } from "./tipos";

/**
 * "Informe para la asamblea": el documento imprimible de Estadísticas.
 * Portado de `imprimir()` dentro de Estadisticas() en admin.html:4715-4790.
 *
 * Igual que el resto de los papeles, los colores son hex literales porque
 * se abre en una ventana aparte que no hereda `app/globals.css`.
 *
 * Sobre los gráficos (decisión del original, no cambiar sin motivo): las
 * barras de gasto son UNA medida comparada entre categorías, así que van
 * todas del mismo color — pintar cada categoría de un color distinto
 * sugiere que el color significa algo, y no significa nada. En la serie
 * del año sí hay dos medidas distintas (lo facturado y lo cobrado) y ahí
 * sí hacen falta dos colores, con su leyenda.
 */

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function informeDeAsambleaEnPapel({
  datos,
  periodo,
  edificio,
  organizacion,
}: {
  datos: DatosEstadisticas;
  periodo: { etiqueta: string } | null;
  edificio: { nombre: string; rif: string | null } | null;
  organizacion: { nombre: string } | null;
}): string {
  const r = datos.resumen;
  if (!r) return "";

  const m = Math.max(...datos.categorias.map((c) => num0(c.monto)), 1);

  const cats = datos.categorias
    .map(
      (c) => `<tr>
      <td>${esc(c.categoria)}</td>
      <td class="barra"><i style="width:${(num0(c.monto) / m) * 100}%"></i></td>
      <td class="d">${usd(c.monto)}</td>
      <td class="d pq">${nf(1).format(c.pct)} %</td>
      <td class="d pq">${
        c.variacion_pct === null || c.variacion_pct === undefined
          ? "—"
          : (num0(c.variacion_pct) > 0 ? "+" : "") + nf(0).format(c.variacion_pct) + " %"
      }</td></tr>`
    )
    .join("");

  const tops = datos.top
    .map(
      (g) => `<tr>
      <td>${esc(g.concepto)}</td><td class="pq">${esc(g.categoria)}</td>
      <td class="d">${usd(g.monto)}</td>
      <td class="d pq">${nf(1).format(g.pct)} %</td></tr>`
    )
    .join("");

  const mora = datos.mora
    .map(
      (t) => `<tr>
      <td>${esc(t.tramo)}</td>
      <td class="d">${t.unidades}</td>
      <td class="d">${usd(t.monto)}</td>
      <td class="d pq">${nf(1).format(t.pct_monto)} %</td></tr>`
    )
    .join("");

  const maxS = Math.max(...datos.serie.map((f) => Math.max(num0(f.facturado), num0(f.cobrado))), 1);
  const serie = datos.serie
    .map(
      (f) => `<div class="col">
      <div class="par">
        <i class="a" style="height:${(num0(f.facturado) / maxS) * 100}%"></i>
        <i class="b" style="height:${(num0(f.cobrado) / maxS) * 100}%"></i>
      </div><span>${esc((MESES[(f.mes || 1) - 1] || "").slice(0, 3))}</span></div>`
    )
    .join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe ${esc(periodo?.etiqueta || "")}</title>
<style>
  @page { size: Letter; margin: 12mm 13mm 10mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  body{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        color:#0A1128; font-size:9.5pt }
  .hoja{ width:100%; border-collapse:collapse }
  .hoja > thead{ display:table-header-group }
  .hoja > thead > tr > td, .hoja > tbody > tr > td{ padding:0; border:0 }
  .cab{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
        padding-bottom:9px; border-bottom:2.5px solid #0A1128; margin-bottom:13px }
  h1{ font-size:15pt; margin:0; letter-spacing:-.01em }
  h2{ font-size:8pt; text-transform:uppercase; letter-spacing:.1em; color:#64748B;
      margin:0 0 7px; font-weight:700 }
  .or{ font-size:8pt; color:#64748B; margin-top:2px }
  .et{ font-size:6.7pt; text-transform:uppercase; letter-spacing:.1em; color:#64748B;
       font-weight:700; display:block; text-align:right }
  .mes{ font-size:12pt; font-weight:700; text-align:right; white-space:nowrap }
  .kpis{ display:flex; gap:7px; margin-bottom:15px }
  .kpi{ flex:1; border:1px solid #E4E9F0; border-radius:7px; padding:7px 9px }
  .kpi span{ display:block; font-size:6.6pt; text-transform:uppercase; letter-spacing:.08em;
             color:#64748B; font-weight:700; margin-bottom:3px }
  .kpi b{ font-size:11.5pt; font-family:ui-monospace,Menlo,Consolas,monospace }
  .kpi em{ font-style:normal; font-size:7pt; color:#64748B; display:block; margin-top:1px }
  .bloque{ margin-bottom:15px; break-inside:avoid }
  table.t{ width:100%; border-collapse:collapse }
  table.t th{ font-size:6.8pt; text-transform:uppercase; letter-spacing:.09em; color:#64748B;
    text-align:left; padding:0 5px 4px; border-bottom:1px solid #0A1128 }
  table.t th.d{ text-align:right }
  table.t td{ padding:4px 5px; border-bottom:1px solid #E4E9F0; font-size:8.6pt }
  table.t td.d{ text-align:right; white-space:nowrap;
    font-family:ui-monospace,Menlo,Consolas,monospace }
  table.t td.pq{ font-size:7.6pt; color:#64748B }
  td.barra{ width:34%; padding-right:10px }
  td.barra i{ display:block; height:7px; background:#F98513; border-radius:999px; min-width:2px }
  .serie{ display:flex; align-items:flex-end; justify-content:flex-start; gap:6px;
          height:74px; margin-top:4px }
  .serie .col{ flex:0 0 46px; text-align:center }
  .serie .par{ display:flex; align-items:flex-end; justify-content:center; gap:2px; height:58px }
  .serie i{ display:block; width:13px; border-radius:2px 2px 0 0; min-height:1px }
  .serie i.a{ background:#0A1128 } .serie i.b{ background:#F98513 }
  .serie span{ font-size:6.4pt; color:#64748B; display:block; margin-top:3px }
  .ley{ font-size:7pt; color:#64748B; margin-bottom:2px }
  .ley i{ display:inline-block; width:7px; height:7px; border-radius:2px; margin-right:3px }
  .dos{ display:flex; gap:16px; align-items:flex-start }
  .dos > div{ flex:1 }
  .pie{ margin-top:14px; padding-top:8px; border-top:1px solid #D0D7E2;
        display:flex; justify-content:space-between; align-items:flex-end; gap:18px }
  .pie p{ margin:0; font-size:7.4pt; color:#64748B; line-height:1.5; max-width:74% }
  .marca{ text-align:right; white-space:nowrap }
  .marca span{ font-size:6.5pt; color:#64748B; letter-spacing:.05em; display:block; margin-bottom:2px }
  .marca img{ height:15px }
  .marca b{ font-size:9pt; color:#0A1128 }
</style></head><body>
<table class="hoja"><thead><tr><td>
  <div class="cab">
    <div><h1>${esc(edificio?.nombre || "")}</h1>
      <div class="or">${esc(edificio?.rif ? "RIF " + edificio.rif + " · " : "")}${esc(organizacion?.nombre || "")}</div></div>
    <div><span class="et">Informe para la asamblea</span>
      <div class="mes">${esc(periodo?.etiqueta || "")}</div>
      <div class="or">${r.unidades} unidades</div></div>
  </div>
</td></tr></thead><tbody><tr><td>

  <div class="kpis">
    <div class="kpi"><span>Gasto del mes</span><b>${usd(r.total_gastos)}</b>
      <em>${r.presupuesto ? "presupuesto " + usd(r.presupuesto) : "sin presupuesto"}</em></div>
    <div class="kpi"><span>Facturado</span><b>${usd(r.facturado_mes)}</b>
      <em>promedio ${usd(r.cuota_promedio)} por unidad</em></div>
    <div class="kpi"><span>Cobrado</span><b>${nf(1).format(r.pct_cobrado)} %</b>
      <em>${usd(r.cobrado)}</em></div>
    <div class="kpi"><span>Deuda al cierre</span><b>${usd(r.deuda_total)}</b>
      <em>${r.unidades_con_deuda} de ${r.unidades} unidades</em></div>
  </div>

  <div class="bloque">
    <h2>En qué se gastó</h2>
    <table class="t"><thead><tr><th>Categoría</th><th></th><th class="d">Monto</th>
      <th class="d">Del gasto</th><th class="d">vs. mes anterior</th></tr></thead>
      <tbody>${cats}</tbody></table>
  </div>

  <div class="bloque dos">
    <div><h2>Los gastos más grandes</h2>
      <table class="t"><thead><tr><th>Concepto</th><th>Categoría</th>
        <th class="d">Monto</th><th class="d">%</th></tr></thead>
        <tbody>${tops}</tbody></table></div>
    <div><h2>Cómo está la morosidad</h2>
      <table class="t"><thead><tr><th>Situación</th><th class="d">Unidades</th>
        <th class="d">Monto</th><th class="d">%</th></tr></thead>
        <tbody>${mora}</tbody></table></div>
  </div>

  ${
    datos.serie.length > 1
      ? `<div class="bloque">
    <h2>Los últimos meses</h2>
    <div class="ley"><i style="background:#0A1128"></i>Facturado
      &nbsp;&nbsp;<i style="background:#F98513"></i>Cobrado</div>
    <div class="serie">${serie}</div>
  </div>`
      : ""
  }

  <div class="pie">
    <p>Informe de ${esc(periodo?.etiqueta || "")} generado a partir de los recibos emitidos.
       Los montos están en dólares. La morosidad se expresa en cuotas equivalentes y va sin
       nombres: el detalle por unidad se consulta en el estado de cuenta.</p>
    <div class="marca"><span>powered by</span>
      <img src="/logo-claro.png" alt="Vecitap"
           onerror="this.outerHTML='<b>vecitap</b>'"></div>
  </div>
</td></tr></tbody></table>
</body></html>`;
}
