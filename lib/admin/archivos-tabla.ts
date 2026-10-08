import { num } from "@/lib/formato";

/**
 * Lectura de archivos tabulares (extracto del banco, planilla de saldos) y
 * detección de columnas. Portado de admin.html:189-201, 300-399 —
 * `parseMonto`, `extraerRef`, `PISTAS`, `detectarColumnas`, `leerTabla`,
 * `leerPDF`, `movimientosDesdeLineas`.
 *
 * Una sola copia para las dos pantallas que leen archivos del usuario
 * (Pagos → "Conciliar con el banco", Propietarios → "Cargar saldos"): en
 * `admin.html` ya eran las mismas funciones compartidas, acá también.
 *
 * Excel y PDF (28-sep): `main` los lee con SheetJS y pdf.js cargados por
 * CDN; acá son dependencias reales del proyecto, y se importan **de forma
 * diferida** (`await import(...)` dentro de la función que los usa). Eso
 * los deja en un chunk aparte que solo se baja cuando alguien elige un
 * archivo en Pagos o en Cargar saldos — el bundle del residente nunca los
 * toca. Ver docs/casos-de-uso-mejorados.md, caso 14.
 */

/** Formato venezolano: 1.234,56 y también 1234.56. Idéntica a admin.html:189-201. */
export function parseMonto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!s || s === "-") return null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma > -1 && punto > -1) {
    s = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (coma > -1) {
    // Una coma sola puede ser decimal (1234,56) o separador de miles
    // (1,234). Si lo que sigue son exactamente tres dígitos hasta el final,
    // es separador de miles.
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/**
 * Como `parseMonto`, pero solo acepta una celda que sea un monto y nada
 * más: dígitos, separadores, signo y, como mucho, un símbolo de moneda
 * ("$", "Bs", "USD"). Para "Cargar saldos" (bloque B, 08-oct): `parseMonto`
 * borra todo lo que no sea dígito, así que un teléfono "0414-555…" o un
 * correo con números se leían como un saldo. Acá eso da `null` y la fila se
 * marca, en vez de cargarse callada.
 */
export function montoEstricto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  const t = String(v)
    .trim()
    .replace(/^(?:US\$|USD|Bs\.?S?\.?|\$)\s*/i, "")
    .replace(/\s*(?:US\$|USD|Bs\.?S?\.?|\$)$/i, "")
    .trim();
  if (!/^-?\s*\d[\d.,]*$|^\(\s*\d[\d.,]*\s*\)$/.test(t)) return null;
  // (1.234,56) es negativo en planillas contables.
  const negativo = t.startsWith("(");
  // num() y no parseMonto(): "1.000" es mil, no uno (ver lib/formato.ts).
  const n = num(t.replace(/[()\s]/g, ""));
  return n === null ? null : negativo ? -n : n;
}

/** La referencia más larga de 6 dígitos o más que aparezca en el texto. admin.html:205-208. */
export function extraerRef(t: unknown): string {
  const m = String(t ?? "").match(/\d{6,}/g);
  return m ? m.sort((a, b) => b.length - a.length)[0] : "";
}

export type CampoBanco = "referencia" | "monto" | "fecha" | "descripcion";

/** admin.html:300-305. */
const PISTAS: Record<CampoBanco, string[]> = {
  referencia: ["referencia", "ref", "nro", "numero", "número", "documento", "operacion", "operación", "comprobante"],
  monto: ["monto", "importe", "credito", "crédito", "abono", "haber", "deposito", "depósito", "valor"],
  fecha: ["fecha", "date", "dia", "día"],
  descripcion: ["descripcion", "descripción", "concepto", "detalle", "observacion", "observación", "transaccion", "transacción"],
};

export type MapaColumnas = Record<CampoBanco, number>;

/**
 * Adivina qué columna es cuál: primero por el nombre del encabezado (gana
 * la pista más larga que aparezca), y si no hay encabezado que sirva, por
 * la forma de los datos — una columna de números de 6+ dígitos es la
 * referencia; la que más montos interpretables tenga es el monto.
 * admin.html:307-348.
 */
export function detectarColumnas(encabezados: unknown[], filas: unknown[][]): MapaColumnas {
  const mapa: MapaColumnas = { referencia: -1, monto: -1, fecha: -1, descripcion: -1 };
  const norm = encabezados.map((h) => String(h ?? "").toLowerCase().trim());

  (Object.keys(PISTAS) as CampoBanco[]).forEach((campo) => {
    let mejor = -1;
    let punt = 0;
    norm.forEach((h, i) => {
      if (!h) return;
      const p = PISTAS[campo].reduce((s, k) => (h.includes(k) ? Math.max(s, k.length) : s), 0);
      if (p > punt) {
        punt = p;
        mejor = i;
      }
    });
    mapa[campo] = mejor;
  });

  const muestra = filas.slice(0, 25);
  const ancho = Math.max(0, ...filas.map((f) => f.length));

  if (mapa.referencia === -1) {
    let mejor = -1;
    let punt = 0;
    for (let i = 0; i < ancho; i++) {
      const p = muestra.filter((f) => /^\d{6,}$/.test(String(f[i] ?? "").trim())).length;
      if (p > punt) {
        punt = p;
        mejor = i;
      }
    }
    if (punt >= Math.max(2, muestra.length * 0.3)) mapa.referencia = mejor;
  }

  if (mapa.monto === -1) {
    let mejor = -1;
    let punt = 0;
    for (let i = 0; i < ancho; i++) {
      if (i === mapa.referencia) continue;
      const p = muestra.filter((f) => parseMonto(f[i]) !== null).length;
      if (p > punt) {
        punt = p;
        mejor = i;
      }
    }
    mapa.monto = mejor;
  }

  return mapa;
}

/**
 * CSV sin librería. `admin.html` usa PapaParse; acá se parte por coma o
 * punto y coma y se respetan las comillas dobles, que es lo que hace falta
 * para un extracto bancario o una planilla de saldos exportada de Excel.
 */
export function leerCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"') {
      enComillas = true;
      continue;
    }
    if (c === "," || c === ";") {
      fila.push(celda.trim());
      celda = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda.trim());
      celda = "";
      filas.push(fila);
      fila = [];
      continue;
    }
    celda += c;
  }
  fila.push(celda.trim());
  filas.push(fila);

  return filas.filter((f) => f.some((x) => x !== ""));
}

/**
 * admin.html:350-362 (`leerTabla`). SheetJS entra por `await import`, así
 * que su chunk solo se baja cuando alguien elige de verdad un `.xlsx`.
 *
 * `raw: false` + `defval: ""` es lo que usa el original: las celdas llegan
 * como el texto que se ve en Excel (fechas y montos ya formateados), que
 * es justo lo que `parseMonto`/`detectarColumnas` esperan.
 */
export async function leerTabla(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) return leerCSV(await file.text());

  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: false });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja con datos.");
  return XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, raw: false, defval: "" });
}

export type MovimientoBanco = {
  fecha: string;
  referencia: string;
  monto: number | null;
  descripcion: string;
};

/**
 * De líneas de texto suelto (lo que sale de un PDF) a movimientos.
 * admin.html:389-398. Se deja portado aunque el lector de PDF todavía no
 * exista: es la parte que no depende del paquete.
 */
export function movimientosDesdeLineas(lineas: string[]): MovimientoBanco[] {
  return lineas
    .map((l) => {
      const montos = l.match(/-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g) || [];
      return {
        fecha: (l.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/) || [""])[0],
        descripcion: l,
        referencia: extraerRef(l),
        monto: montos.length ? parseMonto(montos[montos.length - 1]) : null,
      };
    })
    .filter((m) => m.referencia || m.monto !== null);
}

/**
 * admin.html:375-387 (`leerPDF`): saca el texto del PDF renglón por
 * renglón. Cada fragmento trae su posición; se agrupan por coordenada Y
 * (el renglón) y dentro de cada uno se ordenan por X, que es lo que
 * reconstruye una línea del extracto bancario.
 *
 * `pdfjs-dist` entra por `await import`, igual que SheetJS: su chunk (que
 * es grande) solo se baja cuando alguien elige de verdad un `.pdf`.
 *
 * El worker se resuelve con `new URL(..., import.meta.url)` para que lo
 * empaquete el bundler: `main` lo baja de cdnjs, que acá no corresponde
 * (una dependencia de terceros en tiempo de ejecución para leer un
 * documento que puede ser malicioso).
 */
export async function leerPDF(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lineas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const porFila: Record<number, { x: number; t: string }[]> = {};
    tc.items.forEach((it) => {
      if (!("transform" in it)) return;
      const y = Math.round(it.transform[5]);
      (porFila[y] = porFila[y] || []).push({ x: it.transform[4], t: it.str });
    });
    Object.keys(porFila)
      .sort((a, b) => Number(b) - Number(a))
      .forEach((y) => {
        const t = porFila[Number(y)]
          .sort((a, b) => a.x - b.x)
          .map((i) => i.t)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (t) lineas.push(t);
      });
  }
  return lineas;
}

/** Filas crudas + mapa de columnas → movimientos, como admin.html:3456-3462. */
export function movimientosDesdeFilas(filas: unknown[][], m: MapaColumnas): MovimientoBanco[] {
  return filas
    .map((fila) => ({
      fecha: m.fecha > -1 ? String(fila[m.fecha] ?? "") : "",
      referencia: m.referencia > -1 ? extraerRef(fila[m.referencia]) : "",
      monto: m.monto > -1 ? parseMonto(fila[m.monto]) : null,
      descripcion: m.descripcion > -1 ? String(fila[m.descripcion] ?? "") : "",
    }))
    .filter((x) => x.referencia || x.monto !== null);
}
