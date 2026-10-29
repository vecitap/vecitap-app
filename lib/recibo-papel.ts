import { nf, usd } from "@/lib/formato";
import { urlParaCompartir } from "@/lib/url-sitio";
import { datosPagoEnPapel, repartoRecibo, type CuentaPago } from "@/lib/datos-pago";
import type { CargoRecibo, CategoriaRecibo, ConceptoRecibo } from "@/lib/residente/tipos";

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
  /** Para repartir el total entre las cuentas de condominio y de honorarios. */
  honorario?: number | null;
  anterior_hon?: number | null;
  tasa_bcv?: number | null;
  conceptos?: ConceptoRecibo[] | unknown;
  /** Ronda 10 (C): los cargos a esta unidad, con su motivo. */
  cargos?: CargoRecibo[] | unknown;
  detalle?: CategoriaRecibo[] | unknown;
};

/**
 * Las líneas de los cargos a una sola unidad (ronda 10, C): una por cargo,
 * con su motivo («Multa por ruido · Acta del 12/10»). Un recibo emitido
 * antes de la ronda 10 no los tiene por separado (`cargos` vacío): sale la
 * suma, «Cargos de su unidad», como hasta hoy. La suma de las líneas es
 * siempre `directos` (cerrar_periodo() sale de las mismas filas).
 */
export function lineasDeCargos(r: Pick<ReciboPapel, "directos" | "cargos">): { etiqueta: string; monto: number }[] {
  const lista: CargoRecibo[] = Array.isArray(r.cargos) ? (r.cargos as CargoRecibo[]) : [];
  if (lista.length)
    return lista.map((c) => ({
      etiqueta: [c.concepto?.trim() || "Cargo a su unidad", c.referencia?.trim()].filter(Boolean).join(" · "),
      monto: Number(c.monto) || 0,
    }));
  return Number(r.directos) > 0 ? [{ etiqueta: "Cargos de su unidad", monto: Number(r.directos) }] : [];
}

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
  /** Las cuentas del edificio (`datos_pago`, ronda 7). Vacío o sin la clave: el papel no las muestra. */
  cuentas?: CuentaPago[];
  /** La organización cobra solo en dólares (ronda 7, bloque 4): el papel no muestra bolívares. */
  soloUsd?: boolean;
  /**
   * Ronda 9 (A1): lo que se debe el día en que se imprime, solo desde el
   * portal. Los datos para pagar llevan estos montos y no los del recibo, y
   * si ya no se debe nada lo dicen. Sin él (Admin), los montos del recibo.
   */
  pagarHoy?: { monto: number; reparto: { condominio: number; honorarios: number } | null; fecha: string } | null;
  recibo: ReciboPapel;
};

/**
 * El saldo a favor que **le queda** a la unidad después de este recibo
 * (ronda 4, caso 51). La base emite `total = máximo(0, cargos − a_favor)`
 * y no guarda el sobrante: con a favor 50 y cargos 14,88 el recibo dice
 * total 0 y los 35,12 no aparecían en ningún lado. Se calcula con las mismas
 * líneas que muestra el recibo (conceptos, cargos de la unidad, saldo
 * anterior y mora), así que el papel cuadra a la vista. 0 si el recibo
 * tiene algo que pagar.
 */
export function favorQueQueda(r: Pick<ReciboPapel, "total" | "directos" | "anterior" | "a_favor" | "mora" | "conceptos">): number {
  if (Number(r.total) > 0.005) return 0;
  const con: ConceptoRecibo[] = Array.isArray(r.conceptos) ? (r.conceptos as ConceptoRecibo[]) : [];
  const cargos =
    con.reduce((s, l) => s + Number(l.monto || 0), 0) + Number(r.directos || 0) + Number(r.anterior || 0) + Number(r.mora || 0);
  const queda = Math.round((Number(r.a_favor || 0) - cargos) * 100) / 100;
  return queda > 0 ? queda : 0;
}

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function reciboEnPapel(d: DatosPapelRecibo): string {
  const m = (v: number | string | null | undefined) => usd(v);
  const r = d.recibo;
  const det: CategoriaRecibo[] = Array.isArray(r.detalle) ? (r.detalle as CategoriaRecibo[]) : [];
  const con: ConceptoRecibo[] = Array.isArray(r.conceptos) ? (r.conceptos as ConceptoRecibo[]) : [];
  const favor = favorQueQueda(r);

  const linea = (t: string, v: number, cls?: string) =>
    `<tr class="${cls || ""}"><td>${esc(t)}</td><td class="d">${m(v)}</td></tr>`;

  const resumen = [
    ...con.map((l) => linea(l.nombre, l.monto)),
    ...lineasDeCargos(r).map((l) => linea(l.etiqueta, l.monto)),
    Number(r.anterior) > 0 ? linea("Saldo del mes anterior", Number(r.anterior)) : "",
    Number(r.a_favor) > 0 ? linea("A su favor", -Number(r.a_favor)) : "",
    Number(r.mora) > 0 ? linea("Intereses de mora", Number(r.mora)) : "",
    favor > 0
      ? linea("Saldo a favor", favor, "tot") +
        `<tr class="nota-fav"><td colspan="2">Este mes no tiene que pagar</td></tr>`
      : linea("Total del recibo", Number(r.total), "tot"),
  ].join("");

  // Ronda 10 (B3): si el día en que se imprime no debe nada, arriba va lo
  // mismo que «Mi recibo» del portal («Hoy · A favor $ 50,00 · no tiene que
  // pagar», «Hoy · Está al día»), con el peso que tiene el total; el total
  // del recibo queda al lado, como dato. Sin `pagarHoy` (un mes viejo en
  // Cortes), el papel es el del día del cierre.
  const hoyNoDebe = favor === 0 && d.pagarHoy != null && d.pagarHoy.monto <= 0.005;

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

  // Ronda 8 (decisión de Gustavo, caso 90): el papel no trae ningún monto en
  // bolívares. Un monto fijo en Bs lleva a pagar días después con otra tasa y
  // pagar de menos creyendo que se pagó bien. Solo la frase y dónde ver el
  // monto exacto del día (el portal lo calcula con la tasa de hoy).
  const bloqueTasa = (() => {
    if (hoyNoDebe)
      return `<div><span class="et">Total del recibo</span><div class="cifra-s">${m(r.total)}</div>
      <div class="nota-t">ya está pagado${d.pagarHoy?.fecha ? " al " + esc(d.pagarHoy.fecha) : ""}</div></div>`;
    if (favor > 0) return `<div><span class="et">Este mes</span><div class="cifra-s">No tiene que pagar</div></div>`;
    if (d.soloUsd) return "";
    return `<div>
      <span class="et">Pago en bolívares</span>
      <div class="nota-t">Se paga en bolívares a la tasa oficial BCV del día del pago. El monto exacto de hoy está en el portal: ${esc(urlParaCompartir("/mi"))}</div>
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
  table.res tr.nota-fav td{ border-bottom:0; padding-top:0; color:#15803D; font-weight:600 }

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

  /* ── Datos para pagar (ronda 7) ── */
  .dp{ margin-bottom:13px; break-inside:avoid; page-break-inside:avoid }
  .dp-cols{ display:flex; gap:14px; flex-wrap:wrap }
  .dp-g{ flex:1 1 220px; border:1px solid #CBD5E1; border-radius:7px; padding:6px 9px }
  .dp-t{ font-size:8.6pt; font-weight:700; margin-bottom:2px }
  .dp-c{ font-size:8.3pt; line-height:1.45; padding:3px 0; border-top:1px solid #DDE3EC }
  .dp-c:first-of-type{ border-top:0 }
  .dp-n{ font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-weight:600 }
  .dp-o{ color:#64748B }

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
    ${
      hoyNoDebe
        ? `<div class="fuerte">
      <span class="et">Hoy</span>
      <div class="cifra">${d.pagarHoy!.monto < -0.005 ? "A favor " + m(-d.pagarHoy!.monto) : "Está al día"}</div>
      <div class="nota-t" style="color:#A3B4D4">no tiene que pagar</div>
    </div>`
        : `<div class="fuerte">
      <span class="et">${favor > 0 ? "Saldo a favor" : "Total del recibo"}</span>
      <div class="cifra">${m(favor > 0 ? favor : r.total)}</div>
    </div>`
    }
    ${bloqueTasa}
    ${
      d.vence && favor === 0 && !hoyNoDebe
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
    d.pagarHoy && favor === 0 && Math.abs(d.pagarHoy.monto - Number(r.total)) >= 0.005
      ? `<p class="ayuda"><b>Al ${esc(d.pagarHoy.fecha)}, con los pagos confirmados después de este recibo: ${
          d.pagarHoy.monto > 0
            ? `debe ${m(d.pagarHoy.monto)}.`
            : d.pagarHoy.monto < 0
              ? `no debe nada; tiene ${m(-d.pagarHoy.monto)} a favor.`
              : "está al día, no tiene que pagar."
        }</b></p>`
      : ""
  }

  ${
    favor === 0 && d.cuentas?.length && (!d.pagarHoy || d.pagarHoy.monto > 0)
      ? datosPagoEnPapel(
          d.cuentas,
          d.pagarHoy?.reparto ?? repartoRecibo(r, d.cuentas),
          // Ronda 8: sin montos en Bs en los datos para pagar.
          null
        )
      : ""
  }

  ${
    desglose
      ? `<h2>En qué se gastó este mes</h2>
  <p class="ayuda">A la izquierda el gasto completo del edificio; a la derecha la parte que
     le toca según su alícuota.</p>
  <div class="cols${anchoCompleto ? " uno" : ""}">${desglose}</div>`
      : ""
  }

  <div class="pie">
    <p>${
      d.soloUsd
        ? "Lo que se debe está en dólares y se paga en dólares."
        : `Lo que se debe está en dólares. Se paga en bolívares a la tasa oficial BCV del
       día del pago: el monto exacto de cada día está en el portal.`
    }${
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

/**
 * Lo que el documento necesita para verse en una pantalla, sin cambiar lo
 * que sale impreso (ronda 4, caso 53). Antes se abría en una ventana en
 * blanco (about:blank) sin forma de volver; con la app instalada en el
 * teléfono, la persona quedaba atrapada ahí.
 *
 *  · Una barra arriba con «Volver» y «Imprimir o guardar PDF», que no sale
 *    en el papel (`@media print`).
 *  · En computadora, la hoja a ancho carta, centrada sobre un fondo gris;
 *    en el teléfono, a todo el ancho.
 *
 * `volver`: la dirección a la que lleva «Volver». `null` = el documento se
 * abrió en una ventana aparte (los listados de Admin), y el botón la cierra.
 * Sirve para cualquier documento de este archivo y de `lib/admin/papel-*`:
 * todos traen `</head>` y `<body>`.
 */
export function paraPantalla(html: string, volver: string | null, imprimirAlAbrir = true): string {
  // Ronda 5 (pedido de Gustavo): sin `viewport`, el teléfono dibujaba la
  // página a ~980 px y la achicaba entera para que entrara, y con ella la
  // barra: «Volver» e «Imprimir» quedaban diminutos. Ahora la página va al
  // ancho del teléfono (la barra a tamaño normal, con 44 px de alto para el
  // dedo) y solo la HOJA, que sigue a ancho carta, se achica para entrar
  // (`zoom`, calculado abajo). En el papel no cambia nada.
  const viewport = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  const estilo = `<style>
  .barra-pantalla{ display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center;
    position:sticky; top:0; z-index:5; padding:8px 12px; background:#0A1128;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif }
  .barra-pantalla a, .barra-pantalla button{ font-weight:600; font-size:15px; line-height:1.2; font-family:inherit;
    display:inline-flex; align-items:center; justify-content:center; min-height:44px; min-width:44px;
    padding:0 16px; border-radius:8px; border:1px solid #A3B4D4; background:transparent;
    color:#F8FAFC; cursor:pointer; text-decoration:none; box-sizing:border-box }
  .barra-pantalla .primario{ background:#F98513; border-color:#F98513; color:#0A1128 }
  @media screen{
    html{ background:#E2E8F0 }
    body{ margin:0 0 24px; background:#E2E8F0; min-height:100vh }
    .hoja-pantalla{ width:8.5in; box-sizing:border-box; margin:0 auto; background:#fff;
      padding:12mm 13mm 10mm; transform-origin:top left }
  }
  @media screen and (min-width:9in){
    .hoja-pantalla{ box-shadow:0 2px 14px rgba(10,17,40,.18); min-height:11in }
  }
  @media print{
    .barra-pantalla{ display:none !important }
    .hoja-pantalla{ zoom:1 !important; width:auto }
  }
</style>`;
  // Más angosta que la hoja: se achica la hoja, no la página.
  const ajustar = `<script>(function(){function a(){var h=document.querySelector(".hoja-pantalla");if(!h)return;var w=document.documentElement.clientWidth,c=8.5*96;h.style.zoom=w<c?String(w/c):""}a();addEventListener("resize",a)})()</script>`;
  const boton = volver
    ? `<a href="${esc(volver)}">← Volver</a>`
    : `<button type="button" onclick="window.close()">← Cerrar</button>`;
  const barra = `<div class="barra-pantalla">${boton}<button type="button" class="primario" onclick="window.print()">Imprimir o guardar PDF</button></div>`;
  // Se espera a que carguen las imágenes (el logo): si no, imprime sin él.
  const auto = imprimirAlAbrir ? `<script>addEventListener("load",function(){setTimeout(function(){window.print()},300)})</script>` : "";
  return html
    .replace("</head>", (/name=["']viewport["']/.test(html) ? "" : viewport) + estilo + "</head>")
    .replace(/<body([^>]*)>/, `<body$1>${barra}<div class="hoja-pantalla">`)
    .replace("</body>", `</div>${ajustar}${auto}</body>`);
}

/**
 * Abre el documento en una ventana aparte y manda a imprimir.
 * admin.html:5098-5106. Lo usan los listados de Admin (cortes, informe de
 * asamblea); los recibos ya no: tienen su propia ruta en la misma pestaña
 * (`/mi/[unidad]/recibo/papel` y `/admin/…/cortes/papel`).
 */
export function imprimirDocumento(html: string, onBloqueado: () => void, esperaMs = 700) {
  const w = window.open("", "_blank");
  if (!w) return onBloqueado();
  w.document.write(paraPantalla(html, null, false));
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
