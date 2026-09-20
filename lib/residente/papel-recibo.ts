import { nf, usd } from "@/lib/formato";
import type { RegistroRecibo } from "./tipos";

type DatosPapel = {
  edificio: string;
  organizacion?: string | null;
  rif?: string | null;
  unidad: string;
  propietario?: string | null;
  vence: string;
  logoOrg?: string | null;
  recibo: RegistroRecibo;
};

/**
 * Recibo en papel — una sola plantilla para la aplicación y el portal,
 * portado de residente.html:527-723. Decisiones de diseño, para que nadie
 * las deshaga sin querer:
 *
 * · Todo va dentro de una <table> con <thead>. Es la única forma que
 *   respetan todos los navegadores para REPETIR EL ENCABEZADO cuando el
 *   recibo se pasa a una segunda hoja.
 * · El desglose va a dos columnas. Un edificio con 25 partidas cabía en
 *   dos hojas con una sola columna y cabe en una con dos.
 * · Los cortes de categoría llevan break-inside: avoid, así una categoría
 *   no se parte por la mitad entre columnas ni entre hojas.
 * · print-color-adjust: exact para que los fondos de marca salgan
 *   impresos; sin eso el navegador los blanquea "para ahorrar tinta".
 */
export function papelRecibo(d: DatosPapel): string {
  const esc = (t: unknown) =>
    String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  const m = (v: number | string | null | undefined) => usd(v);
  const r = d.recibo;
  const det = Array.isArray(r.detalle) ? r.detalle : [];
  const con = Array.isArray(r.conceptos) ? r.conceptos : [];

  const linea = (t: string, v: number, cls?: string) =>
    `<tr class="${cls || ""}"><td>${esc(t)}</td><td class="d">${m(v)}</td></tr>`;

  const resumen = [
    ...con.map((l) => linea(l.nombre, l.monto)),
    Number(r.directos) > 0 ? linea("Cargos de su unidad", r.directos) : "",
    Number(r.anterior) > 0 ? linea("Saldo del mes anterior", r.anterior) : "",
    Number(r.a_favor) > 0 ? linea("A su favor", -r.a_favor) : "",
    Number(r.mora) > 0 ? linea("Intereses de mora", r.mora) : "",
    linea("Total", r.total, "tot"),
  ].join("");

  // Con pocas partidas, dos columnas dejan la hoja medio vacía. El
  // desglose decide solo: hasta 14 renglones va a todo el ancho, de ahí
  // en adelante a dos columnas.
  const renglones = det.reduce((n, c) => n + 1 + (c.lineas || []).length, 0);
  const anchoCompleto = renglones <= 14;

  const desglose = det
    .map(
      (cat) => `<div class="cat">
      <div class="cn">${esc(cat.categoria)}</div>
      <table class="dt">${(cat.lineas || [])
        .map(
          (l) => `<tr>
        <td class="c">${esc(l.concepto)}${l.referencia ? `<span class="rf"> · ${esc(l.referencia)}</span>` : ""}</td>
        <td class="d gr">${m(l.monto)}</td>
        <td class="d pa">${m(l.parte)}</td></tr>`
        )
        .join("")}</table>
    </div>`
    )
    .join("");

  const cab = `
    <div class="cab">
      <div class="cab-i">
        ${d.logoOrg ? `<img class="logo-org" src="${esc(d.logoOrg)}" alt="">` : ""}
        <div>
          <div class="ed">${esc(d.edificio || "")}</div>
          <div class="or">${esc(d.rif ? "RIF " + d.rif + " · " : "")}${esc(d.organizacion || "")}</div>
        </div>
      </div>
      <div class="cab-d">
        <div class="et">Recibo</div>
        <div class="nu">${esc(r.numero || "")}</div>
        <div class="or">${esc(r.etiqueta || "")}</div>
      </div>
    </div>
    <div class="uni">
      <div><span class="et">Unidad</span><div class="ud">${esc(d.unidad || "")}</div></div>
      <div><span class="et">Alícuota</span><div class="uv">${nf(4).format(r.alicuota || 0)} %</div></div>
      ${d.propietario ? `<div class="pr"><span class="et">Propietario</span>
        <div class="uv">${esc(d.propietario)}</div></div>` : ""}
    </div>`;

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(r.numero || "Recibo")}</title>
<style>
  @page { size: Letter; margin: 12mm 13mm 10mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  html,body{ margin:0; padding:0 }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        color:#111144; font-size:9.5pt; line-height:1.35 }

  .hoja{ width:100%; border-collapse:collapse }
  .hoja > thead{ display:table-header-group }
  .hoja > thead > tr > td,
  .hoja > tbody > tr > td{ padding:0; border:0 }

  .cab{ display:flex; justify-content:space-between; align-items:flex-start;
        gap:16px; padding-bottom:9px; border-bottom:2.5px solid #111144 }
  .cab-i{ display:flex; align-items:center; gap:10px }
  .logo-org{ max-height:34px; max-width:120px }
  .ed{ font-size:15pt; font-weight:700; letter-spacing:-.01em; line-height:1.1 }
  .or{ font-size:8pt; color:#66668A; margin-top:1px }
  .cab-d{ text-align:right; white-space:nowrap }
  .et{ font-size:6.7pt; text-transform:uppercase; letter-spacing:.1em;
       color:#66668A; font-weight:700; display:block }
  .nu{ font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
       font-size:11pt; font-weight:700; letter-spacing:-.02em }

  .uni{ display:flex; gap:26px; padding:8px 0 10px; border-bottom:1px solid #E4DED4 }
  .ud{ font-size:15pt; font-weight:700; line-height:1.1;
       font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .uv{ font-size:10pt; font-weight:600; line-height:1.25; margin-top:2px }
  .pr{ max-width:52% }

  .plata{ display:flex; align-items:stretch; gap:0; margin:11px 0 12px;
          border:1.5px solid #111144; border-radius:9px; overflow:hidden }
  .plata > div{ padding:9px 13px; flex:1 }
  .plata > div + div{ border-left:1px solid #DAD1C8 }
  .plata .fuerte{ background:#111144; color:#F4F1EC; flex:0 0 34% }
  .plata .fuerte .et{ color:#9BACD8 }
  .cifra{ font-size:19pt; font-weight:700; letter-spacing:-.02em; line-height:1.15;
          font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .cifra-s{ font-size:12pt; white-space:nowrap; font-weight:700; line-height:1.2;
            font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .nota-t{ font-size:7.4pt; color:#66668A; margin-top:2px }
  .vence{ color:#8A5A00 }

  table.res{ width:100%; border-collapse:collapse; margin-bottom:13px }
  table.res td{ padding:5px 0; border-bottom:1px solid #E4DED4; font-size:9.5pt }
  table.res td.d{ text-align:right; white-space:nowrap;
                  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.res tr.tot td{ font-weight:700; font-size:11pt; border-bottom:0;
                       border-top:1.5px solid #111144; padding-top:7px }

  h2{ font-size:8.5pt; text-transform:uppercase; letter-spacing:.1em;
      margin:0 0 2px; font-weight:700 }
  .ayuda{ font-size:7.8pt; color:#66668A; margin:0 0 8px }
  .cols{ column-count:2; column-gap:20px; column-rule:1px solid #E4DED4 }
  .cols.uno{ column-count:1 }
  .cols.uno table.dt td{ padding:3.4px 0; font-size:9pt }
  .cols.uno table.dt td.gr{ font-size:8.3pt }
  .cols.uno .cn{ font-size:7.4pt; padding-bottom:3px; margin-bottom:3px }
  .cols.uno .cat{ margin-bottom:12px }
  .cols.uno table.dt td.c{ padding-right:14px }
  .cat{ break-inside:avoid; page-break-inside:avoid; margin-bottom:9px }
  .cn{ font-size:7pt; text-transform:uppercase; letter-spacing:.09em;
       color:#F98513; font-weight:700; padding-bottom:2px;
       border-bottom:1px solid #DAD1C8; margin-bottom:2px }
  table.dt{ width:100%; border-collapse:collapse }
  table.dt td{ padding:2.2px 0; font-size:8.3pt; vertical-align:top }
  table.dt td.c{ padding-right:6px }
  table.dt td.d{ text-align:right; white-space:nowrap;
                 font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.dt td.gr{ color:#8B8BAA; font-size:7.8pt; padding-right:7px }
  table.dt td.pa{ font-weight:600 }
  .rf{ color:#8B8BAA; font-size:7.4pt }

  .pie{ margin-top:14px; padding-top:8px; border-top:1px solid #DAD1C8;
        display:flex; justify-content:space-between; align-items:flex-end; gap:18px }
  .pie p{ margin:0; font-size:7.4pt; color:#66668A; line-height:1.5; max-width:74% }
  .marca{ text-align:right; white-space:nowrap }
  .marca span{ font-size:6.5pt; color:#8B8BAA; letter-spacing:.05em;
               display:block; margin-bottom:2px }
  .marca img{ height:15px }
  .marca b{ font-size:9pt; color:#111144 }
</style></head><body>

<table class="hoja"><thead><tr><td>${cab}</td></tr></thead>
<tbody><tr><td>

  <div class="plata">
    <div class="fuerte">
      <span class="et">Total a pagar</span>
      <div class="cifra">${m(r.total)}</div>
    </div>
    ${
      Number(r.tasa_bcv) > 0
        ? `<div>
      <span class="et">Referencial en bolívares</span>
      <div class="cifra-s">Bs ${nf(2).format(Number(r.total) * Number(r.tasa_bcv))}</div>
      <div class="nota-t">tasa ${nf(2).format(r.tasa_bcv)} · se convierte con la del día en que pague</div>
    </div>`
        : ""
    }
    ${
      d.vence
        ? `<div>
      <span class="et">Vence</span>
      <div class="cifra-s vence">${esc(d.vence)}</div>
      <div class="nota-t">después de esa fecha corre mora</div>
    </div>`
        : ""
    }
  </div>

  <table class="res">${resumen}</table>

  ${
    desglose
      ? `<h2>En qué se gastó este mes</h2>
  <p class="ayuda">A la izquierda el gasto completo del edificio; a la derecha la parte que
     le toca según su alícuota.</p>
  <div class="cols${anchoCompleto ? " uno" : ""}">${desglose}</div>`
      : ""
  }

  <div class="pie">
    <p>El monto en bolívares es referencial: se convierte a la tasa del Banco Central del día
       en que usted pague, no a la de hoy.${d.organizacion ? " Emitido por " + esc(d.organizacion) + "." : ""}</p>
    <div class="marca">
      <span>powered by</span>
      <img src="/logo-claro.png" alt="Vecitap"
           onerror="this.outerHTML='<b>vecitap</b>'">
    </div>
  </div>

</td></tr></tbody></table>
</body></html>`;
}
