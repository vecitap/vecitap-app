import { leerCSV } from "@/lib/admin/archivos-tabla";
import { correoValido, normalizarTel } from "@/lib/admin/personas";

/**
 * «Cargar datos» (ronda 5): qué es cada columna del archivo.
 *
 * La administradora sube su Excel tal cual lo tiene: los encabezados pueden
 * estar mal escritos ("Telefomo"), con otro nombre ("COPROPIETARIOS",
 * "Celular", "Correo 1"), en otro orden, o no estar. El sistema **propone**
 * qué es cada columna —primero por el encabezado, después por lo que hay
 * adentro— y dice por qué; la administradora corrige la propuesta en la
 * pantalla. Nada de esto escribe en la base.
 */

export type Campo =
  | "codigo"
  | "alicuota"
  | "saldo"
  | "saldo_hon"
  | "tipo"
  | "tratamiento"
  | "propietario"
  | "documento"
  | "telefono"
  | "correo"
  | "correo_respaldo"
  | "corte"
  | "inq_tratamiento"
  | "inquilino"
  | "inq_documento"
  | "inq_telefono"
  | "inq_correo"
  | "inq_correo_respaldo"
  | "inq_corte"
  | "paga"
  | "nota"
  | "ignorar";

export const CAMPOS: Record<Campo, string> = {
  codigo: "Código de la unidad",
  alicuota: "Alícuota %",
  saldo: "Saldo inicial",
  saldo_hon: "Saldo de administración",
  tipo: "Tipo de unidad",
  tratamiento: "Tratamiento del propietario",
  propietario: "Propietario",
  documento: "Cédula o RIF del propietario",
  telefono: "Teléfono del propietario",
  correo: "Correo del propietario",
  correo_respaldo: "Correo de respaldo",
  corte: "El propietario recibe el corte",
  inq_tratamiento: "Tratamiento del inquilino",
  inquilino: "Inquilino",
  inq_documento: "Cédula o RIF del inquilino",
  inq_telefono: "Teléfono del inquilino",
  inq_correo: "Correo del inquilino",
  inq_correo_respaldo: "Correo de respaldo del inquilino",
  inq_corte: "El inquilino recibe el corte",
  paga: "Quién paga",
  nota: "Nota de la unidad",
  ignorar: "No usar esta columna",
};

export type Propuesta = { campo: Campo; razon: string };

/** Minúsculas, sin tildes, sin signos: "Teléfono (cel.)" → "telefono cel". */
export function limpiarEncabezado(t: unknown): string {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function distancia(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** ¿La palabra se parece a alguna de la lista? Admite 1 letra mal (2 en palabras largas). */
function parecida(palabra: string, lista: string[]): boolean {
  return lista.some((w) => palabra === w || (w.length >= 5 && distancia(palabra, w) <= (w.length >= 8 ? 2 : 1)));
}

const P_CODIGO = ["codigo", "cod", "unidad", "unidades", "apto", "apartamento", "inmueble", "local", "casa", "numero", "nro", "puesto"];
const P_ALICUOTA = ["alicuota", "alicuotas", "alic", "porcentaje", "participacion", "coeficiente", "%"];
const P_SALDO = ["saldo", "saldos", "deuda", "monto", "debe", "adeuda", "adeudado", "pendiente"];
const P_TIPO = ["tipo", "uso", "clase"];
const P_PERSONA = ["propietario", "propietarios", "copropietario", "copropietarios", "dueno", "duenos", "titular", "nombre", "nombres"];
const P_TELEFONO = ["telefono", "telefonos", "tlf", "telf", "tel", "celular", "cel", "movil", "whatsapp"];
const P_CORREO = ["correo", "correos", "email", "mail", "emails"];
const P_INQUILINO = ["inquilino", "inquilinos", "arrendatario", "ocupante"];
const P_RESPALDO = ["2", "respaldo", "alternativo", "alterno", "otro", "secundario"];
const P_PAGA = ["paga", "pagador", "responsable"];
const P_TRATAMIENTO = ["tratamiento", "tratamientos", "prefijo"];
const P_DOCUMENTO = ["cedula", "cedulas", "rif", "ci", "documento", "identificacion"];
const P_CORTE = ["corte", "cortes"];
const P_HONORARIOS = ["administracion", "administradora", "honorarios", "honorario", "hon", "adm", "admin"];
const P_NOTA = ["nota", "notas", "observacion", "observaciones", "comentario", "comentarios"];

/**
 * Una columna de notas («NOTA» de la plantilla). Desde el 25-oct (decisión de
 * Gustavo) se guarda: es la nota de la unidad, que solo ve la administración
 * (tabla `notas_unidad`, M4).
 */
export function esColumnaNota(encabezado: unknown): boolean {
  const palabras = limpiarEncabezado(encabezado).split(" ");
  return palabras.some((p) => parecida(p, P_NOTA));
}

/** Qué campo nombra un encabezado, o null. */
export function campoPorEncabezado(encabezado: unknown): Campo | null {
  const t = limpiarEncabezado(encabezado);
  if (!t) return null;
  if (esColumnaNota(encabezado)) return "nota";
  const palabras = t.split(" ");
  const hay = (lista: string[]) => palabras.some((p) => parecida(p, lista));
  const esInquilino = hay(P_INQUILINO);
  const respaldo = palabras.some((p) => P_RESPALDO.includes(p));

  if (hay(P_CORREO)) {
    if (esInquilino) return respaldo ? "inq_correo_respaldo" : "inq_correo";
    if (respaldo) return "correo_respaldo";
    return "correo";
  }
  if (hay(P_TELEFONO)) return esInquilino ? "inq_telefono" : "telefono";
  // Los de la plantilla oficial («PROPIETARIO TRATAMIENTO», «INQUILINO CEDULA
  // O RIF», «PROPIETARIO RECIBE CORTE») van antes que el nombre: si no, la
  // palabra «propietario» o «inquilino» los tomaba por el nombre.
  if (hay(P_TRATAMIENTO)) return esInquilino ? "inq_tratamiento" : "tratamiento";
  if (hay(P_DOCUMENTO) || /(^| )c i( |$)/.test(t)) return esInquilino ? "inq_documento" : "documento";
  // «recibe» solo exacta: con una letra de diferencia sería «recibo».
  if (hay(P_CORTE) || palabras.includes("recibe")) return esInquilino ? "inq_corte" : "corte";
  if (esInquilino) return "inquilino";
  if (t.includes("quien paga") || hay(P_PAGA)) return "paga";
  if (hay(P_ALICUOTA)) return "alicuota";
  if (hay(P_SALDO)) return hay(P_HONORARIOS) ? "saldo_hon" : "saldo";
  if (hay(P_TIPO)) return "tipo";
  if (hay(P_PERSONA)) return "propietario";
  if (hay(P_CODIGO)) return "codigo";
  return null;
}

/**
 * Texto pegado desde Excel (con tabulaciones) o CSV abierto como texto. Con
 * tabulaciones se corta SOLO por tabulación: una coma dentro de un nombre o
 * de una alícuota ("1,48768") no parte la celda — era el primer problema del
 * importador viejo (diagnóstico del 04-oct).
 */
export function leerTextoPegado(texto: string): string[][] {
  // Las líneas vacías se conservan: así el número de fila es el de la planilla.
  const t = texto.replace(/\s+$/, "");
  if (t.includes("\t")) return t.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim()));
  return leerCSV(t, true);
}

/**
 * La fila de encabezados: la primera de las 10 de arriba con al menos dos
 * celdas que nombren un campo. -1 si el archivo no tiene encabezados.
 */
export function filaDeEncabezados(crudas: string[][]): number {
  for (let r = 0; r < Math.min(crudas.length, 10); r++) {
    const n = crudas[r].filter((c) => campoPorEncabezado(c) !== null).length;
    if (n >= 2) return r;
  }
  return -1;
}

const conDatos = (filas: string[][], desde: number) =>
  filas.slice(desde + 1).some((f) => f.some((c) => String(c ?? "").trim() !== ""));

/**
 * Qué hoja del Excel se carga (decisión de Nicolás del 25-oct):
 *  - la que se llama «Unidades» (la de la plantilla de Vecitap); si está
 *    vacía, no se carga nada y se avisa;
 *  - si el archivo no la tiene, la primera hoja con encabezados reconocibles
 *    (o, si ninguna los tiene, la primera con datos, como siempre);
 *  - «Ejemplo» no se carga nunca: sus datos son inventados. «Léame
 *    primero» tampoco.
 */
export function elegirHoja(hojas: { nombre: string; filas: string[][] }[]): { nombre: string; filas: string[][] } | { error: string } {
  const nombre = (h: { nombre: string }) => limpiarEncabezado(h.nombre);
  const unidades = hojas.find((h) => nombre(h) === "unidades");
  if (unidades) {
    if (!conDatos(unidades.filas, filaDeEncabezados(unidades.filas))) {
      return {
        error:
          "La hoja «Unidades» está vacía: no se cargó nada. Llénela con una fila por unidad (la hoja «Ejemplo» solo muestra cómo) y vuelva a subir el archivo.",
      };
    }
    return unidades;
  }
  // Las instrucciones de la plantilla («Léame primero») tampoco son datos.
  const validas = hojas.filter((h) => !nombre(h).includes("ejemplo") && !nombre(h).startsWith("leame"));
  const conEncabezados = validas.find((h) => {
    const e = filaDeEncabezados(h.filas);
    return e >= 0 && conDatos(h.filas, e);
  });
  if (conEncabezados) return conEncabezados;
  const primera = validas.find((h) => conDatos(h.filas, -1));
  if (primera) return primera;
  if (hojas.some((h) => conDatos(h.filas, -1)))
    return { error: "Solo la hoja «Ejemplo» tiene datos, y esa no se carga: sus datos son de muestra. Llene la hoja «Unidades» y vuelva a subir el archivo." };
  return { error: "El archivo no tiene datos." };
}

const RE_CORREO =/[^\s@]+@[^\s@]+\.[^\s@]{2,}/;

function proporcion(valores: string[], prueba: (v: string) => boolean): number {
  return valores.length ? valores.filter(prueba).length / valores.length : 0;
}

/** Qué parece ser la columna por su contenido, o null. */
function campoPorContenido(valores: string[]): { campo: Campo; razon: string } | null {
  const v = valores.map((x) => x.trim()).filter(Boolean);
  if (v.length === 0) return null;
  if (proporcion(v, (x) => RE_CORREO.test(x)) >= 0.5) return { campo: "correo", razon: "tiene correos (@)" };
  if (proporcion(v, (x) => !!normalizarTel(x) && /^[+\d][\d\s().-]{6,}/.test(x)) >= 0.5)
    return { campo: "telefono", razon: "tiene teléfonos" };
  if (proporcion(v, (x) => /\$|bs\.?\b/i.test(x) || /^-\s/.test(x)) >= 0.3)
    return { campo: "saldo", razon: "tiene montos con $ o con signo" };
  const nums = v.map((x) => Number(x.replace(/%/g, "").replace(",", ".")));
  if (nums.every((n) => Number.isFinite(n) && n >= 0 && n < 100) && v.some((x) => /[.,]\d{3,}/.test(x))) {
    const suma = nums.reduce((s, n) => s + n, 0);
    if (Math.abs(suma - 100) < 3) return { campo: "alicuota", razon: "los números suman 100 %" };
  }
  if (proporcion(v, (x) => /^(propietario|inquilino)$/i.test(x)) >= 0.5) return { campo: "paga", razon: "dice propietario o inquilino" };
  if (proporcion(v, (x) => x.length <= 16 && /\d/.test(x) && !/@/.test(x)) >= 0.7 && new Set(v).size >= v.length * 0.8)
    return { campo: "codigo", razon: "valores cortos y distintos, con números" };
  if (proporcion(v, (x) => /[a-zñáéíóú]{2,}\s+[a-zñáéíóú]{2,}/i.test(x) && !/@/.test(x)) >= 0.6)
    return { campo: "propietario", razon: "tiene nombres de personas" };
  return null;
}

/** Los campos que pueden repetirse en el orden en que aparecen (el segundo correo es el de respaldo, etc.). */
const SEGUNDO: Partial<Record<Campo, Campo>> = {
  correo: "correo_respaldo",
  correo_respaldo: "inq_correo",
  inq_correo: "inq_correo_respaldo",
  telefono: "inq_telefono",
  propietario: "inquilino",
  tratamiento: "inq_tratamiento",
  documento: "inq_documento",
  corte: "inq_corte",
};


/**
 * La propuesta para cada columna. Cada campo se usa una sola vez: si dos
 * columnas dicen "Correo", la segunda pasa a "Correo de respaldo"; si dos
 * tienen nombres, la segunda es el inquilino. Lo que no se reconoce queda en
 * "No usar esta columna", y la pantalla lo muestra.
 */
export function proponerColumnas(crudas: string[][], encabezados: number): Propuesta[] {
  const ancho = Math.max(0, ...crudas.map((f) => f.length));
  const datos = crudas.slice(encabezados + 1).slice(0, 80);
  const usados = new Set<Campo>();
  const propuestas: Propuesta[] = Array.from({ length: ancho }, () => ({ campo: "ignorar" as Campo, razon: "" }));

  const ocupar = (i: number, campo: Campo, razon: string) => {
    let c: Campo | undefined = campo;
    while (c && usados.has(c)) c = SEGUNDO[c];
    if (!c) return false;
    usados.add(c);
    propuestas[i] = { campo: c, razon: c === campo ? razon : `${razon}; ya había otra columna de «${CAMPOS[campo]}»` };
    return true;
  };

  // 1. Por el encabezado, si lo hay.
  const notas = new Set<number>();
  if (encabezados >= 0) {
    crudas[encabezados].forEach((h, i) => {
      if (esColumnaNota(h)) notas.add(i);
      const c = campoPorEncabezado(h);
      if (c) ocupar(i, c, `por el encabezado «${String(h).trim()}»`);
    });
  }
  // 2. Por el contenido, las que quedaron sin reconocer (una nota no: su
  //    texto libre parecería nombres de personas).
  for (let i = 0; i < ancho; i++) {
    if (propuestas[i].campo !== "ignorar" || notas.has(i)) continue;
    const c = campoPorContenido(datos.map((f) => f[i] ?? ""));
    if (c) ocupar(i, c.campo, `por el contenido: ${c.razon}`);
  }
  // 3. Sin nada reconocible como código, la primera columna (como siempre).
  if (!usados.has("codigo") && ancho > 0 && propuestas[0].campo === "ignorar") {
    ocupar(0, "codigo", "es la primera columna");
  }
  for (const p of propuestas) if (p.campo === "ignorar" && !p.razon) p.razon = "no se reconoció";
  return propuestas;
}

/** Varios correos en una celda ("a@x.com / b@y.com"): los separa. */
export function correosDe(celda: string): { validos: string[]; malos: string[] } {
  const partes = celda
    .split(/[\s;,/|]+/)
    .map((x) => x.trim())
    .filter((x) => x.includes("@"));
  return {
    validos: partes.filter((x) => correoValido(x)).map((x) => x.toLowerCase()),
    malos: partes.filter((x) => !correoValido(x)),
  };
}
