import { nf, usd } from "@/lib/formato";
import type { CategoriaRecibo, ConceptoRecibo } from "@/lib/residente/tipos";

/**
 * Recibo en papel · UNA sola plantilla para Admin y para el portal del
 * residente. En `main` el mismo código está dos veces, byte a byte:
 * `admin.html:4282-4518` (`htmlRecibo`) y `index.html:1115-1326`
 * (`papelRecibo`) — comprobado con `diff`, solo cambia el nombre de la
 * función. Acá vive una vez y la usan los dos módulos, que es justo el
 * motivo por el que existe esta migración.
 *
 * Decisiones de diseño del original, para que nadie las deshaga sin querer:
 *
 * · Todo va dentro de una <table> con <thead>. Es la única forma que
 *   respetan todos los navegadores para REPETIR EL ENCABEZADO cuando el
 *   recibo se pasa a una segunda hoja.
 * · El desglose va a dos columnas cuando hay muchas partidas. Un edificio
 *   con 25 partidas cabía en dos hojas con una sola columna y cabe en una
 *   con dos; por debajo de 14 renglones la página se ve rota, así que ahí
 *   va a una sola columna a todo el ancho.
 * · Los cortes de categoría llevan break-inside: avoid, así una categoría
 *   no se parte por la mitad entre columnas ni entre hojas.
 * · print-color-adjust: exact para que los fondos de marca salgan
 *   impresos; sin eso el navegador los blanquea "para ahorrar tinta".
 *
 * Los colores son hex literales y no variables CSS a propósito: esto se
 * abre en una ventana aparte que no hereda `app/globals.css`. Son los
 * valores de la paleta de `main` (misma fuente de verdad, copiada a mano —
 * si cambia `globals.css`, hay que cambiarlos acá también).
 */

/** Lo mínimo del recibo que la plantilla necesita. */
export type ReciboPapel = {
  numero?: string | null;
  etiqueta?: string | null;
  alicuota?: number | null;
  total: number;
  directos?: number | null;
  anterior?: number | null;
  a_favor?: number | null;
  mora?: number | null;
  tasa_bcv?: number | null;
  conceptos?: ConceptoRecibo[] | unknown;
  detalle?: CategoriaRecibo[] | unknown;
};

export type DatosPapelRecibo = {
  edificio?: string | null;
  organizacion?: string | null;
  rif?: string | null;
  unidad?: string | null;
  propietario?: string | null;
  vence?: string | null;
  logoOrg?: string | null;
  /**
   * La tasa del BCV de HOY. El documento se genera en el momento en que
   * alguien lo pide y es el que la persona se lleva al banco: si trae la
   * tasa vieja del período, transfiere de menos y queda debiendo un resto
   * que no entiende. Se estampa la fecha para que el papel envejezca a la
   * vista y no engañe a quien lo encuentre dentro de dos semanas. Sin
   * ella, cae a `recibo.tasa_bcv` y lo dice ("· del recibo").
   */
  tasaHoy?: { valor: number; fecha?: string | null } | null;
  recibo: ReciboPapel;
};

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function reciboEnPapel(d: DatosPapelRecibo): string {
  const m = (v: number | string | null | undefined) => usd(v);
  const r = d.recibo;
  const det: CategoriaRecibo[] = Array.isArray(r.detalle) ? (r.detalle as CategoriaRecibo[]) : [];
  const con: ConceptoRecibo[] = Array.isArray(r.conceptos) ? (r.conceptos as ConceptoRecibo[]) : [];

  const linea = (t: string, v: number, cls?: string) =>
    `<tr class="${cls || ""}"><td>${esc(t)}</td><td class="d">${m(v)}</td></tr>`;

  const resumen = [
    ...con.map((l) => linea(l.nombre, l.monto)),
    Number(r.directos) > 0 ? linea("Cargos de su unidad", Number(r.directos)) : "",
    Number(r.anterior) > 0 ? linea("Saldo del mes anterior", Number(r.anterior)) : "",
    Number(r.a_favor) > 0 ? linea("A su favor", -Number(r.a_favor)) : "",
    Number(r.mora) > 0 ? linea("Intereses de mora", Number(r.mora)) : "",
    linea("Total", Number(r.total), "tot"),
  ].join("");

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
      <div><span class="et">Alícuota</span><div class="uv">${nf(4).format(Number(r.alicuota) || 0)} %</div></div>
      ${
        d.propietario
          ? `<div class="pr"><span class="et">Propietario</span>
        <div class="uv">${esc(d.propietario)}</div></div>`
          : ""
      }
    </div>`;

  const bloqueTasa = (() => {
    const viva = Number(d.tasaHoy?.valor) > 0;
    const t = viva ? Number(d.tasaHoy!.valor) : Number(r.tasa_bcv);
    if (!(t > 0)) return "";
    const cuando = viva && d.tasaHoy?.fecha ? " del " + String(d.tasaHoy.fecha).split("-").reverse().join("/") : "";
    return `<div>
      <span class="et">Referencial en bolívares</span>
      <div class="cifra-s">Bs ${nf(2).format(Number(r.total) * t)}</div>
      <div class="nota-t">tasa ${nf(2).format(t)}${cuando}${viva ? "" : " · del recibo"}</div>
    </div>`;
  })();

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(r.numero || "Recibo")}</title>
<style>
  @page { size: Letter; margin: 12mm 13mm 10mm; }
  *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  html,body{ margin:0; padding:0 }
  body{ font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        color:#0A1128; font-size:9.5pt; line-height:1.35 }

  .hoja{ width:100%; border-collapse:collapse }
  .hoja > thead{ display:table-header-group }
  .hoja > thead > tr > td,
  .hoja > tbody > tr > td{ padding:0; border:0 }

  /* ── Encabezado, se repite en cada hoja ── */
  .cab{ display:flex; justify-content:space-between; align-items:flex-start;
        gap:16px; padding-bottom:9px; border-bottom:2.5px solid #0A1128 }
  .cab-i{ display:flex; align-items:center; gap:10px }
  .logo-org{ max-height:34px; max-width:120px }
  .ed{ font-size:15pt; font-weight:700; letter-spacing:-.01em; line-height:1.1 }
  .or{ font-size:8pt; color:#64748B; margin-top:1px }
  .cab-d{ text-align:right; white-space:nowrap }
  .et{ font-size:6.7pt; text-transform:uppercase; letter-spacing:.1em;
       color:#64748B; font-weight:700; display:block }
  .nu{ font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
       font-size:11pt; font-weight:700; letter-spacing:-.02em }

  .uni{ display:flex; gap:26px; padding:8px 0 10px; border-bottom:1px solid #DDE3EC }
  .ud{ font-size:15pt; font-weight:700; line-height:1.1;
       font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .uv{ font-size:10pt; font-weight:600; line-height:1.25; margin-top:2px }
  .pr{ max-width:52% }

  /* ── Cifra principal ── */
  .plata{ display:flex; align-items:stretch; gap:0; margin:11px 0 12px;
          border:1.5px solid #0A1128; border-radius:9px; overflow:hidden }
  .plata > div{ padding:9px 13px; flex:1 }
  .plata > div + div{ border-left:1px solid #CBD5E1 }
  .plata .fuerte{ background:#0A1128; color:#F8FAFC; flex:0 0 34% }
  .plata .fuerte .et{ color:#A3B4D4 }
  .cifra{ font-size:19pt; font-weight:700; letter-spacing:-.02em; line-height:1.15;
          font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .cifra-s{ font-size:12pt; white-space:nowrap; font-weight:700; line-height:1.2;
            font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  .nota-t{ font-size:7.4pt; color:#64748B; margin-top:2px }
  .vence{ color:#92400E }

  /* ── Resumen ── */
  table.res{ width:100%; border-collapse:collapse; margin-bottom:13px }
  table.res td{ padding:5px 0; border-bottom:1px solid #DDE3EC; font-size:9.5pt }
  table.res td.d{ text-align:right; white-space:nowrap;
                  font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.res tr.tot td{ font-weight:700; font-size:11pt; border-bottom:0;
                       border-top:1.5px solid #0A1128; padding-top:7px }

  /* ── Desglose a dos columnas ── */
  h2{ font-size:8.5pt; text-transform:uppercase; letter-spacing:.1em;
      margin:0 0 2px; font-weight:700 }
  .ayuda{ font-size:7.8pt; color:#64748B; margin:0 0 8px }
  .cols{ column-count:2; column-gap:20px; column-rule:1px solid #DDE3EC }
  .cols.uno{ column-count:1 }
  .cols.uno table.dt td{ padding:3.4px 0; font-size:9pt }
  .cols.uno table.dt td.gr{ font-size:8.3pt }
  .cols.uno .cn{ font-size:7.4pt; padding-bottom:3px; margin-bottom:3px }
  .cols.uno .cat{ margin-bottom:12px }
  .cols.uno table.dt td.c{ padding-right:14px }
  .cat{ break-inside:avoid; page-break-inside:avoid; margin-bottom:9px }
  .cn{ font-size:7pt; text-transform:uppercase; letter-spacing:.09em;
       color:#F98513; font-weight:700; padding-bottom:2px;
       border-bottom:1px solid #CBD5E1; margin-bottom:2px }
  table.dt{ width:100%; border-collapse:collapse }
  table.dt td{ padding:2.2px 0; font-size:8.3pt; vertical-align:top }
  table.dt td.c{ padding-right:6px }
  table.dt td.d{ text-align:right; white-space:nowrap;
                 font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace }
  table.dt td.gr{ color:#64748B; font-size:7.8pt; padding-right:7px }
  table.dt td.pa{ font-weight:600 }
  .rf{ color:#64748B; font-size:7.4pt }

  /* ── Pie ── */
  .pie{ margin-top:14px; padding-top:8px; border-top:1px solid #CBD5E1;
        display:flex; justify-content:space-between; align-items:flex-end; gap:18px }
  .pie p{ margin:0; font-size:7.4pt; color:#64748B; line-height:1.5; max-width:74% }
  .marca{ text-align:right; white-space:nowrap }
  .marca span{ font-size:6.5pt; color:#64748B; letter-spacing:.05em;
               display:block; margin-bottom:2px }
  .marca img{ height:15px }
  .marca b{ font-size:9pt; color:#0A1128 }
</style></head><body>

<table class="hoja"><thead><tr><td>${cab}</td></tr></thead>
<tbody><tr><td>

  <div class="plata">
    <div class="fuerte">
      <span class="et">Total a pagar</span>
      <div class="cifra">${m(r.total)}</div>
    </div>
    ${bloqueTasa}
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
    <p>Lo que se debe está en dólares. La cifra en bolívares vale para el día
       que dice arriba: si paga otro día, la conversión se hace con la tasa del Banco
       Central de ese día y el monto en bolívares será distinto.${
         d.organizacion ? " Emitido por " + esc(d.organizacion) + "." : ""
       }</p>
    <div class="marca">
      <span>powered by</span>
      <img src="/logo-claro.png" alt="Vecitap"
           onerror="this.outerHTML='<b>vecitap</b>'">
    </div>
  </div>

</td></tr></tbody></table>
</body></html>`;
}

/** Abre el documento en una ventana aparte y manda a imprimir. admin.html:5098-5106. */
export function imprimirDocumento(html: string, onBloqueado: () => void, esperaMs = 700) {
  const w = window.open("", "_blank");
  if (!w) return onBloqueado();
  w.document.write(html);
  w.document.close();
  // Se espera a que las fuentes y el diseño estén listos: si no, imprime en blanco.
  w.onload = () => {
    w.focus();
    w.print();
  };
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* la ventana ya se cerró */
    }
  }, esperaMs);
}
