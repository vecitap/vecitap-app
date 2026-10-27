import { montoEstricto } from "@/lib/admin/archivos-tabla";
import { leerTratamiento, nombreDe, normaliza, normalizarTel, separarTratamiento, TRATAMIENTO_INICIAL, vigente } from "@/lib/admin/personas";
import { LARGO_NOTA, TIPOS_UNIDAD, type TipoUnidad, type Unidad } from "@/lib/admin/tipos";
import { nf, num, usd } from "@/lib/formato";
import { leerPagaPegado, type Paga } from "@/lib/paga";
import { CAMPOS, correosDe, type Campo } from "./columnas";

/**
 * «Cargar datos» (ronda 5): de las filas del archivo y las columnas elegidas
 * a una previa completa. **No escribe nada**: arma lo que se va a mandar a
 * `importar_unidades()` cuando la administradora confirme, y explica cada
 * cosa que no se carga o que es dudosa.
 *
 * Reglas aprobadas por Nicolás el 18-oct (docs/casos-de-uso-mejorados.md,
 * casos 56 y 57):
 *  - Ninguna fila queda fuera sin aviso, y ningún dato se pierde sin aviso.
 *  - Unidad que ya existe: por omisión se omite; la previa muestra qué
 *    cambiaría, campo por campo, y se puede marcar «Actualizar».
 *  - El importador no cambia de propietario ni de inquilino (eso va por la
 *    ficha). Tampoco pisa datos de una persona que ya existe: solo completa
 *    lo vacío.
 *  - Personas (confirmado por Gustavo el 25-oct): mismo nombre y un dato en
 *    común (correo, correo de respaldo, teléfono o cédula) se juntan solas.
 *    Un dato en común con OTRO nombre es una pregunta sin respuesta por
 *    omisión, y la carga espera; vale entre filas del archivo y contra una
 *    ficha que ya existe. Si solo coincide el nombre, es dudoso y por
 *    omisión son personas distintas.
 *  - Una fila sin alícuota no se carga por omisión; se puede cargar como
 *    estacionamiento con alícuota 0 (decisión provisional, para Gustavo).
 */

export type Nivel = "rojo" | "ambar" | "info";
/** `queda`: lo que se queda cuando algo del archivo no se aplica («Se queda: Sr. Mefaz…»). */
export type Nota = {
  nivel: Nivel;
  texto: string;
  queda?: string;
  /**
   * Cómo se agrupa en la lista de avisos (ronda 7): «12 filas sin correo del
   * propietario». Sin él, se agrupa por el texto sin lo que va entre «».
   */
  grupo?: string;
  /** El campo que se corrige en la previa para resolver el aviso (ronda 7). */
  campo?: Campo;
  /** La fila espera «¿es la misma persona?»: se ofrecen sus datos de contacto para corregir (ronda 7). */
  persona?: true;
};

/** Una persona que ya existe en la administradora. */
export type PersonaOrg = {
  id: string;
  prefijo: string | null;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  correo: string | null;
  correo_respaldo: string | null;
  /** Códigos de las unidades donde figura hoy (propietario o inquilino). */
  unidades: string[];
};

export type Contexto = {
  unidades: (Unidad & { paga?: string })[];
  personas: PersonaOrg[];
  hayCierres: boolean;
  /** Nota de cada unidad que ya existe (`notas_unidad`), por id de unidad. */
  notas?: Record<string, string>;
  /**
   * Ronda 8: celdas corregidas en la previa, como `${fila}:${campo}`. Lo
   * corregido es lo que queda: si la fila va a una ficha que ya existe, el
   * dato corregido la cambia (no solo la completa).
   */
  corregidas?: Set<string>;
};


export type Decisiones = {
  /** Unidad existente (código normalizado) → actualizar en vez de omitir. */
  actualizar: Record<string, boolean>;
  /** Fila sin alícuota (número de fila) → cargar como estacionamiento con alícuota 0. */
  estacionamiento: Record<number, boolean>;
  /** Tipo elegido a mano para una fila. */
  tipo: Record<number, TipoUnidad>;
  /** Dudosos de personas: clave → opción elegida. */
  personas: Record<string, string>;
};

export const SIN_DECISIONES: Decisiones = { actualizar: {}, estacionamiento: {}, tipo: {}, personas: {} };

type ValorCampo = {
  valor: string;
  nota?: Nota;
  /**
   * Ronda 8: lo que dice el archivo, cuando la celda muestra otra cosa porque
   * eso es lo que va a quedar guardado (la ficha elegida, o la persona con la
   * que se juntó con «Sí»).
   */
  archivo?: string;
  /** Ronda 8: la celda se corrigió en la previa, y si eso se guarda al cargar. */
  corregido?: { guarda: boolean; texto: string };
};

/** Los datos de una ficha que la previa puede corregir (ronda 8). */
export type CampoFicha = "nombre" | "telefono" | "correo" | "correo_respaldo" | "documento";

export type FilaPrevia = {
  /** Número de fila en el archivo, como lo ve Excel (la primera es 1). */
  fila: number;
  codigo: string;
  clave: string;
  estado: "nueva" | "actualizar" | "omitir" | "no";
  /** Por qué no se carga, o por qué se omite. */
  motivo?: string;
  sinAlicuota?: boolean;
  existente?: { cambios: string[] };
  /** El campo que causa que la fila no se cargue, si se puede corregir en la previa (ronda 7). */
  motivoCampo?: Campo;
  tipo: TipoUnidad;
  campos: Partial<Record<Exclude<Campo, "ignorar" | "codigo">, ValorCampo>>;
  notas: Nota[];
};

/**
 * La pregunta en una línea corta (ronda 5, pedido de Gustavo):
 * «¿Es la misma persona? Archivo: X · Ficha: Y [Sí] [No]». Una línea por
 * cada candidata; «Sí» elige esa, «No» elige `valorNo`.
 */
export type LineaDudoso = {
  /** «Archivo» si la otra es una fila del archivo; «Ficha» si ya existe. */
  contra: "Archivo" | "Ficha";
  etiqueta: string;
  /** Lo que se elige con «Sí». */
  valor: string;
  /** Debajo, en chico: a dónde irían los recibos con «Sí», si cambia. */
  aviso?: string;
};

export type Dudoso = {
  clave: string;
  texto: string;
  /** Quién es, en el archivo («Beganu, s.a.» (03D)). */
  archivo: string;
  lineas: LineaDudoso[];
  /** Lo que se elige con «No» (en todas las líneas). */
  valorNo: string;
  opciones: { valor: string; etiqueta: string }[];
  /** "" = todavía sin responder (solo las `obligatoria`). */
  valor: string;
  /** Sin respuesta por omisión: la carga no se habilita hasta que se elija. */
  obligatoria?: boolean;
  /** Filas que se marcan en ámbar mientras no se elija. */
  filas?: number[];
  /** Obligatoria, sin responder, y alguna de sus filas se carga: frena la carga. */
  pendiente?: boolean;
};

export type PersonaCarga = {
  ref: string;
  persona_id?: string;
  /**
   * El tratamiento que trae el archivo. `null` = «Sin tratamiento»; sin la
   * clave, el archivo no trae ninguno y la base aplica la regla de empresas o
   * «Sr.» (M4, 20261025120000_importar_unidades_plantilla.sql).
   */
  prefijo?: string | null;
  nombre: string;
  documento?: string;
  telefono?: string;
  correo?: string;
  correo_respaldo?: string;
  /** Ronda 8: lo corregido en la previa que reemplaza el dato de la ficha existente. */
  cambiar?: Partial<Record<CampoFicha, string>>;
};

export type FilaCarga = {
  accion: "crear" | "actualizar";
  unidad_id?: string;
  codigo: string;
  tipo: TipoUnidad;
  alicuota: number | null;
  saldo_inicial: number | null;
  saldo_inicial_hon: number | null;
  /** Nota de la unidad (null = no tocar). */
  nota?: string | null;
  paga: Paga | null;
  propietario?: string;
  inquilino?: string;
  /** «Recibe corte» del archivo (null = no trae: un vínculo nuevo queda en «sí»). */
  propietario_corte?: boolean | null;
  inquilino_corte?: boolean | null;
};

export type Resultado = {
  filas: FilaPrevia[];
  dudosos: Dudoso[];
  resumen: {
    leidas: number;
    nuevas: number;
    actualizar: number;
    omitir: number;
    noSeCargan: number;
    conObservaciones: number;
    personasNuevas: number;
    personasExistentes: number;
    sumaAlicuotas: number;
    saldoIgnorado: boolean;
    /** Preguntas sin respuesta por omisión que faltan: la carga espera. */
    porElegir: number;
    /** Columnas que la plantilla pide y el archivo no trae (aviso, no bloquea). */
    faltanColumnas: string[];
  };
  carga: { personas: PersonaCarga[]; filas: FilaCarga[] };
};

/* ───────────────────────── celdas ───────────────────────── */

/** "1,48768", "1.48768", "2,41 %". Una alícuota nunca llega a mil: un punto solo es decimal. */
export function leerAlicuota(celda: string): number | null {
  const t = celda.replace(/%/g, "").trim();
  if (!t) return null;
  if (/^\d+\.\d+$/.test(t)) return Number(t);
  return num(t);
}

/**
 * El saldo como lo escribe Excel en contabilidad: "- 2.096,66 $", "387,69 $",
 * y "-   $" o "- 0,00 $" para cero. Vacío = null (no trae saldo).
 */
export function leerSaldo(celda: string): { valor: number | null; malo: boolean } {
  const t = celda.trim();
  if (!t) return { valor: null, malo: false };
  const sinMoneda = t.replace(/(?:US\$|USD|Bs\.?S?\.?|\$)/gi, "").trim();
  if (/^-?\s*$/.test(sinMoneda)) return { valor: 0, malo: false };
  const v = montoEstricto(t.replace(/^-\s+/, "-"));
  if (v === null) return { valor: null, malo: true };
  return { valor: Object.is(v, -0) || Math.abs(v) < 0.00005 ? 0 : v, malo: false };
}

/** El tipo que sugiere el código o el nombre de la unidad ("PB. L-B" es un local). */
export function tipoDeducido(codigo: string): TipoUnidad {
  const c = codigo.toLowerCase();
  if (/estacionamiento|\bpuesto\b|^est\b/.test(c)) return "estacionamiento";
  if (/dep[oó]sito/.test(c)) return "deposito";
  if (/oficina|^of\b|^of[.\s-]/.test(c)) return "oficina";
  if (/\blocal\b|(^|[\s.])l-/.test(c)) return "local";
  if (/\bcasa\b/.test(c)) return "casa";
  return "apartamento";
}

function tipoDeCelda(celda: string): TipoUnidad | null {
  const t = normaliza(celda);
  if (!t) return null;
  const hit = (Object.entries(TIPOS_UNIDAD) as [TipoUnidad, string][]).find(
    ([k, etiqueta]) => normaliza(k) === t || normaliza(etiqueta) === t || t.startsWith(normaliza(k).slice(0, 4))
  );
  if (hit) return hit[0];
  if (/^APTO|^APART/.test(t)) return "apartamento";
  if (/^EST/.test(t)) return "estacionamiento";
  return null;
}

/** «Sí»/«No» de «recibe corte». null si está vacía; "malo" si no se entiende. */
function leerSiNo(celda: string): boolean | null | "malo" {
  const t = normaliza(celda);
  if (!t) return null;
  if (["SI", "S", "X", "YES", "TRUE", "1", "VERDADERO"].includes(t)) return true;
  if (["NO", "N", "FALSE", "0", "FALSO"].includes(t)) return false;
  return "malo";
}

/**
 * La cédula o el RIF para comparar: sin guiones, puntos ni espacios, y sin
 * importar mayúsculas («V-12.345.678» = «v12345678»). Se guarda como viene.
 */
export const cedulaClave = (t: string | null | undefined) => normaliza(t);

const nombreClave = (n: string) => normaliza(separarTratamiento(n).nombre);
/**
 * "Inversiones Uno" e "Inversiones Uno, C.A." son el mismo nombre escrito
 * distinto. Ronda 8: solo cuando lo que sobra es la forma de la empresa
 * (C.A., S.A., S.R.L.…). Antes bastaba con que uno empezara como el otro, y
 * «Bumagi Tovavade» quedaba igual a «Bumagi Tovavade/Camebogig Zazufuni»
 * (otra ficha, de dos personas): la previa usaba esa ficha sin preguntar.
 */
const SUFIJO_EMPRESA = /^(CA|SA|SRL|SN|SC|SAS|CORP|INC|LTDA?)$/;
const mismoNombre = (a: string, b: string) => {
  const x = nombreClave(a);
  const y = nombreClave(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [corto, largo] = x.length < y.length ? [x, y] : [y, x];
  return largo.startsWith(corto) && SUFIJO_EMPRESA.test(largo.slice(corto.length));
};

/* ───────────────────────── personas ───────────────────────── */

type Rol = "propietario" | "inquilino";

type Candidato = {
  id: string; // "12:propietario"
  fila: number;
  codigo: string;
  rol: Rol;
  nombre: string;
  /** undefined = el archivo no trae tratamiento; null = «Sin tratamiento». */
  prefijo?: string | null;
  documento: string;
  docNorm: string;
  telefono: string;
  telNorm: string | null;
  correo: string;
  respaldo: string;
  corte: boolean | null;
  /** Ronda 8: los datos de esta persona que se corrigieron en la previa. */
  corr: Set<CampoFicha>;
};

class Conjuntos {
  private padre = new Map<string, string>();
  raiz(x: string): string {
    if (!this.padre.has(x)) this.padre.set(x, x);
    const p = this.padre.get(x)!;
    if (p === x) return x;
    const r = this.raiz(p);
    this.padre.set(x, r);
    return r;
  }
  unir(a: string, b: string) {
    const ra = this.raiz(a);
    const rb = this.raiz(b);
    if (ra !== rb) this.padre.set(rb, ra);
  }
}

type Grupo = {
  clave: string; // id del primer candidato
  candidatos: Candidato[];
  nombre: string;
  prefijo?: string | null;
  documento: string;
  telefono: string;
  telNorm: string | null;
  correo: string;
  respaldo: string;
  personaId: string | null;
  /** Lo que se completa en la ficha (sin `queda`) o no se cambia (con lo que se queda). */
  completa: { texto: string; queda?: string }[];
  /** Ronda 8: lo corregido en la previa que cambia en la ficha existente. */
  cambia: Partial<Record<CampoFicha, string>>;
};

/* ───────────────────────── análisis ───────────────────────── */

export function analizar(
  crudas: string[][],
  encabezados: number,
  columnas: Campo[],
  ctx: Contexto,
  dec: Decisiones = SIN_DECISIONES
): Resultado {
  const col = (campo: Campo) => columnas.indexOf(campo);
  const celda = (f: string[], campo: Campo) => {
    const i = col(campo);
    return i < 0 ? "" : String(f[i] ?? "").trim();
  };

  // Si dos unidades del edificio se escriben casi igual ("1A" activa y "1-A"
  // dada de baja), manda la activa: es la que se actualizaría.
  const porCodigo = new Map<string, Contexto["unidades"][number]>();
  for (const u of ctx.unidades) {
    const k = normaliza(u.codigo);
    const ya = porCodigo.get(k);
    if (!ya || (!ya.activa && u.activa)) porCodigo.set(k, u);
  }
  const filas: FilaPrevia[] = [];
  const candidatos: Candidato[] = [];
  const datosFila = new Map<
    number,
    {
      alicuota: number | null;
      saldo: number | null;
      saldoHon: number | null;
      nota: string;
      paga: Paga | null;
      tipoColumna: TipoUnidad | null;
    }
  >();

  const esTotales = (f: string[], codigo: string) => /^(sub)?total|^suma\b|^totales/i.test(codigo) || (!codigo && /total/i.test(f.join(" ")));
  // Código repetido en el archivo (revisión de M3, 24-oct): no se carga
  // NINGUNA de esas filas. Cuál de las dos es la buena lo decide la
  // administradora en su archivo, no el orden de las filas.
  const filasDeCodigo = new Map<string, number[]>();
  crudas.forEach((f, idx) => {
    if (idx <= encabezados) return;
    const codigo = celda(f, "codigo");
    const clave = normaliza(codigo);
    if (!clave || esTotales(f, codigo)) return;
    filasDeCodigo.set(clave, [...(filasDeCodigo.get(clave) ?? []), idx + 1]);
  });

  crudas.forEach((f, idx) => {
    if (idx <= encabezados) return;
    if (!f.some((c) => String(c ?? "").trim() !== "")) return;
    const fila = idx + 1;
    const codigo = celda(f, "codigo");
    const clave = normaliza(codigo);
    const notas: Nota[] = [];
    const campos: FilaPrevia["campos"] = {};
    const base: FilaPrevia = { fila, codigo, clave, estado: "nueva", tipo: "apartamento", campos, notas };
    filas.push(base);

    if (esTotales(f, codigo)) {
      base.estado = "no";
      base.motivo = "es la fila de totales";
      return;
    }
    if (!clave) {
      base.estado = "no";
      base.motivo = "no tiene código de unidad";
      base.motivoCampo = "codigo";
      return;
    }
    const repetidas = filasDeCodigo.get(clave)!;
    if (repetidas.length > 1) {
      base.estado = "no";
      base.motivo = `el código se repite en el archivo (filas ${repetidas.join(", ")}): no se carga ninguna de esas filas. Corrija el archivo y vuelva a subirlo`;
      return;
    }

    // Alícuota
    const aCelda = celda(f, "alicuota");
    let alicuota = leerAlicuota(aCelda);
    if (aCelda && alicuota === null) {
      base.estado = "no";
      base.motivo = `la alícuota «${aCelda}» no se entiende`;
      base.motivoCampo = "alicuota";
    } else if (alicuota !== null && (alicuota < 0 || alicuota > 100)) {
      base.estado = "no";
      base.motivo = `la alícuota ${aCelda} no puede ser negativa ni mayor que 100`;
      base.motivoCampo = "alicuota";
    }
    campos.alicuota = { valor: alicuota === null ? "" : nf(5).format(alicuota) };

    // Tipo
    const tCelda = celda(f, "tipo");
    const tipoColumna = tipoDeCelda(tCelda);
    if (tCelda && !tipoColumna) notas.push({ nivel: "ambar", texto: `tipo «${tCelda}» no reconocido: queda como ${TIPOS_UNIDAD[tipoDeducido(codigo)]}` });
    base.tipo = dec.tipo[fila] ?? tipoColumna ?? tipoDeducido(codigo);
    campos.tipo = {
      valor: TIPOS_UNIDAD[base.tipo],
      nota:
        !dec.tipo[fila] && !tipoColumna && base.tipo !== "apartamento"
          ? { nivel: "info", texto: `deducido del código «${codigo}»` }
          : undefined,
    };

    if (aCelda === "" && base.estado !== "no") {
      if (dec.estacionamiento[fila]) {
        alicuota = 0;
        base.tipo = dec.tipo[fila] ?? "estacionamiento";
        campos.tipo = { valor: TIPOS_UNIDAD[base.tipo] };
        campos.alicuota = { valor: nf(5).format(0), nota: { nivel: "ambar", texto: "no traía alícuota: se carga con 0 (elegido)" } };
      } else {
        base.estado = "no";
        base.sinAlicuota = true;
        base.motivo = "no tiene alícuota";
        base.motivoCampo = "alicuota";
      }
    }

    // Saldo
    const sCelda = celda(f, "saldo");
    const saldo = leerSaldo(sCelda);
    if (saldo.malo && base.estado !== "no") {
      base.estado = "no";
      base.motivo = `el saldo «${sCelda}» no se entiende`;
      base.motivoCampo = "saldo";
    }
    campos.saldo = {
      valor: saldo.valor === null ? "" : usd(saldo.valor),
      nota:
        saldo.valor !== null && ctx.hayCierres
          ? { nivel: "info", texto: "no se aplica: el edificio ya tiene meses cerrados" }
          : undefined,
    };

    // Saldo de administración (honorarios): la misma regla que el de condominio.
    const hCelda = celda(f, "saldo_hon");
    const saldoHon = leerSaldo(hCelda);
    if (saldoHon.malo && base.estado !== "no") {
      base.estado = "no";
      base.motivo = `el saldo de administración «${hCelda}» no se entiende`;
      base.motivoCampo = "saldo_hon";
    }
    if (col("saldo_hon") >= 0) {
      campos.saldo_hon = {
        valor: saldoHon.valor === null ? "" : usd(saldoHon.valor),
        nota:
          saldoHon.valor !== null && ctx.hayCierres
            ? { nivel: "info", texto: "no se aplica: el edificio ya tiene meses cerrados" }
            : undefined,
      };
    }

    // Nota de la unidad (decisión de Gustavo del 25-oct): se guarda, solo la
    // ve la administración. Más larga que el límite: se recorta, con aviso.
    let nota = celda(f, "nota").replace(/\s+/g, " ").trim();
    if (col("nota") >= 0) {
      const larga = nota.length > LARGO_NOTA;
      if (larga) nota = nota.slice(0, LARGO_NOTA);
      campos.nota = {
        valor: nota,
        nota: larga ? { nivel: "ambar", texto: `tiene más de ${nf(0).format(LARGO_NOTA)} caracteres: se guardan los primeros ${nf(0).format(LARGO_NOTA)}` } : undefined,
      };
    }

    // Quién paga
    const pCelda = celda(f, "paga");
    const paga = col("paga") < 0 ? null : leerPagaPegado(pCelda);
    if (col("paga") >= 0 && paga === null && base.estado !== "no") {
      base.estado = "no";
      base.motivo = `«${pCelda}» en quién paga: tiene que decir propietario o inquilino`;
      base.motivoCampo = "paga";
    }
    if (col("paga") >= 0) campos.paga = { valor: paga === "inquilino" ? "Inquilino" : "Propietario" };

    datosFila.set(fila, { alicuota, saldo: saldo.valor, saldoHon: saldoHon.valor, nota, paga: col("paga") >= 0 && pCelda ? paga : null, tipoColumna });

    // Personas de la fila
    for (const rol of ["propietario", "inquilino"] as const) {
      const pre = rol === "propietario" ? "" : "inq_";
      const nombreCrudo = celda(f, rol);
      const telCrudo = celda(f, `${pre}telefono` as Campo);
      const correoCrudo = celda(f, `${pre}correo` as Campo);
      const respaldoCrudo = celda(f, rol === "propietario" ? "correo_respaldo" : "inq_correo_respaldo");
      const etiqueta = rol === "propietario" ? "del propietario" : "del inquilino";
      const kTrat = `${pre}tratamiento` as "tratamiento" | "inq_tratamiento";
      const kDoc = `${pre}documento` as "documento" | "inq_documento";
      const kCorte = `${pre}corte` as "corte" | "inq_corte";
      const kResp = rol === "propietario" ? "correo_respaldo" : "inq_correo_respaldo";
      const tratCrudo = celda(f, kTrat);
      const docCrudo = celda(f, kDoc);
      const corteCrudo = celda(f, kCorte);

      const c1 = correosDe(correoCrudo);
      const c2 = correosDe(respaldoCrudo);
      const todos = [...c1.validos, ...c2.validos].filter((x, i, a) => a.indexOf(x) === i);
      const correo = todos[0] ?? "";
      const respaldo = todos[1] ?? "";
      const malos = [...c1.malos, ...c2.malos];
      if (correoCrudo && !c1.validos.length && !c1.malos.length) malos.push(correoCrudo);

      const telNorm = normalizarTel(telCrudo);
      const kTel = `${pre}telefono` as "telefono" | "inq_telefono";
      const kCor = `${pre}correo` as "correo" | "inq_correo";
      if (telCrudo) {
        campos[kTel] = {
          valor: telCrudo,
          nota: /[a-zñ]/i.test(telCrudo)
            ? { nivel: "ambar", texto: "trae texto además del número: se guarda tal cual, revíselo", grupo: "con texto en el teléfono" }
            : !telNorm
              ? { nivel: "ambar", texto: "no parece un teléfono de Venezuela: se guarda tal cual", grupo: "con un teléfono que no parece de Venezuela" }
              : undefined,
        };
      }
      campos[kCor] = {
        valor: correo,
        nota: malos.length ? { nivel: "ambar", texto: `«${malos.join(" ")}» no es un correo válido: no se guarda`, grupo: "con un correo que no es válido" } : undefined,
      };
      if (col(kResp) >= 0 || col(kCor) >= 0) {
        campos[kResp] = {
          valor: respaldo,
          nota: todos.length > 2 ? { nivel: "ambar", texto: `hay más de dos correos: «${todos.slice(2).join(" ")}» no se guarda`, grupo: "con más de dos correos" } : undefined,
        };
      }

      // Tratamiento: el de su columna manda, incluido «Sin tratamiento»
      // (decisión del 25-oct). Si la columna está vacía, el que traiga el
      // nombre («Sr. Pérez»); si tampoco, la base aplica la regla de empresas
      // o «Sr.».
      const sep = separarTratamiento(nombreCrudo);
      const nombre = sep.nombre;
      const deColumna = leerTratamiento(tratCrudo);
      let prefijo: string | null | undefined = sep.prefijo;
      if (deColumna === "malo") {
        // Decisión de Nicolás del 25-oct: nunca «Sr.» por omisión en este caso.
        prefijo = null;
        campos[kTrat] = { valor: tratCrudo, nota: { nivel: "ambar", texto: "no está en la lista: se carga sin tratamiento", grupo: "con un tratamiento que no está en la lista" } };
      } else if (deColumna !== undefined) {
        prefijo = deColumna;
        campos[kTrat] = { valor: deColumna ?? "Sin tratamiento" };
      } else if (col(kTrat) >= 0) {
        campos[kTrat] = { valor: "" };
      }

      if (docCrudo || col(kDoc) >= 0) campos[kDoc] = { valor: docCrudo };

      const corte = leerSiNo(corteCrudo);
      if (corte === "malo") {
        campos[kCorte] = { valor: corteCrudo, nota: { nivel: "ambar", texto: "tiene que decir Sí o No: no se usa", grupo: "con «recibe corte» que no dice Sí ni No" } };
      } else if (col(kCorte) >= 0) {
        campos[kCorte] = { valor: corte === null ? "" : corte ? "Sí" : "No" };
      }

      campos[rol] = { valor: nombreCrudo };
      if (!nombre) {
        if (telCrudo || correo || docCrudo) {
          notas.push({ nivel: "ambar", texto: `hay teléfono, correo o cédula ${etiqueta} pero no su nombre: no se guarda`, grupo: `con datos ${etiqueta} pero sin su nombre`, campo: rol });
          if (campos[kTel]) campos[kTel]!.nota = { nivel: "ambar", texto: "sin nombre: no se guarda" };
          if (docCrudo) campos[kDoc] = { valor: docCrudo, nota: { nivel: "ambar", texto: "sin nombre: no se guarda" } };
          campos[kCor] = { valor: correo, nota: correo ? { nivel: "ambar", texto: "sin nombre: no se guarda" } : campos[kCor]!.nota };
        }
        continue;
      }
      const fueCorregida = (k: Campo) => !!ctx.corregidas?.has(`${fila}:${k}`);
      const corr = new Set<CampoFicha>();
      if (fueCorregida(rol)) corr.add("nombre");
      if (fueCorregida(kTel)) corr.add("telefono");
      if (fueCorregida(kCor)) corr.add("correo");
      if (fueCorregida(kResp)) corr.add("correo_respaldo");
      if (fueCorregida(kDoc)) corr.add("documento");
      candidatos.push({
        corr,
        id: `${fila}:${rol}`,
        fila,
        codigo,
        rol,
        nombre,
        prefijo,
        documento: docCrudo,
        docNorm: cedulaClave(docCrudo),
        telefono: telCrudo,
        telNorm,
        correo,
        respaldo,
        corte: corte === "malo" ? null : corte,
      });
    }
  });

  /* ── Personas: agrupar dentro del archivo ── */
  const dudosos: Dudoso[] = [];
  const conj = new Conjuntos();
  const separados = new Set<string>();
  // Primero, sin separar nada, para encontrar los "mismo contacto, otro nombre".
  const porLlave = new Map<string, Candidato[]>();
  const llaves = (c: Candidato) =>
    [c.correo && `c:${c.correo}`, c.respaldo && `c:${c.respaldo}`, c.telNorm && `t:${c.telNorm}`, c.docNorm && `d:${c.docNorm}`].filter(
      Boolean
    ) as string[];
  const dato = (k: string) => (k.startsWith("t:") ? "teléfono" : k.startsWith("d:") ? "cédula" : "correo");
  // Otra persona, aunque compartan un dato: otro nombre, o el mismo nombre
  // con otra cédula (padre e hijo que se llaman igual).
  const otraCedula = (a: Candidato, b: Candidato) => !!a.docNorm && !!b.docNorm && a.docNorm !== b.docNorm;
  const distinta = (a: Candidato, b: Candidato) => !mismoNombre(a.nombre, b.nombre) || otraCedula(a, b);
  // Una sola pregunta por fila, pero con TODAS sus coincidencias: contestar
  // «Sí» la junta con cada una (11C del piloto coincide por correo con 04D y
  // por teléfono con 11A/11B).
  for (const c of candidatos) {
    conj.raiz(c.id);
    // Contra TODAS las filas anteriores con ese dato, no solo la primera: si
    // no, 12D (mismo nombre y correo que 12C) solo se comparaba con 10A, de
    // otro nombre, y quedaba separada de 12C mientras no se contestara.
    const iguales: { k: string; otro: Candidato }[] = [];
    for (const k of llaves(c)) {
      const antes = porLlave.get(k) ?? [];
      for (const otro of antes) if (otro.id !== c.id) iguales.push({ k, otro });
      porLlave.set(k, [...antes, c]);
    }
    const otroNombre = iguales.filter((m) => distinta(m.otro, c));
    if (otroNombre.length) {
      const clave = `sep:${c.id}`;
      // Una frase por persona (el nombre y la cédula), con todos sus datos en
      // común y todas sus filas: «el mismo correo y teléfono que «X» (filas
      // 12 y 13: 03A, 03B)».
      const porPersona = new Map<string, { otro: Candidato; datos: Set<string>; filas: Candidato[] }>();
      for (const m of otroNombre) {
        const k = `${nombreClave(m.otro.nombre)}|${m.otro.docNorm}`;
        const p = porPersona.get(k) ?? { otro: m.otro, datos: new Set<string>(), filas: [] };
        p.datos.add(dato(m.k));
        if (!p.filas.includes(m.otro)) p.filas.push(m.otro);
        porPersona.set(k, p);
      }
      const con = [...porPersona.values()].map(({ otro, datos, filas: fs }) => {
        const d = [...datos];
        const que = d.length === 1 && d[0] === "cédula" ? "la misma cédula" : `el mismo ${d.join(" y ")}`;
        const donde =
          fs.length === 1 ? `fila ${fs[0].fila}, ${fs[0].codigo}` : `filas ${fs.map((x) => x.fila).join(", ")}: ${fs.map((x) => x.codigo).join(", ")}`;
        return (
          `${que} que «${otro.nombre}» (${donde})` +
          (mismoNombre(otro.nombre, c.nombre) ? `, pero otra cédula (${c.documento} y ${otro.documento})` : "")
        );
      });
      // Un «Sí» equivocado manda los recibos y avisos de esta unidad al
      // correo de la otra persona (destinatarios_de usa el de la ficha) y
      // Accesos lo propone al invitar. Por eso (Gustavo, 25-oct) ninguna de
      // estas tiene respuesta por omisión: la carga espera que se elija.
      const otroCorreo = otroNombre.find((m) => m.otro.correo && m.otro.correo !== c.correo)?.otro;
      const valor = dec.personas[clave] ?? "";
      dudosos.push({
        clave,
        texto:
          `Fila ${c.fila} (${c.codigo}): «${c.nombre}» tiene ${con.join(" y ")}. ¿Es la misma persona?` +
          (c.correo && otroCorreo
            ? ` Los correos son distintos: esta fila trae ${c.correo} y «${otroCorreo.nombre}» (fila ${otroCorreo.fila}) trae ${otroCorreo.correo}. Si contesta «Sí», los recibos y avisos de ${c.codigo} van a ir a ${otroCorreo.correo}.`
            : ""),
        archivo: `«${c.nombre}» (${c.codigo})`,
        // Una sola línea: «Sí» la junta con todas sus coincidencias a la vez.
        lineas: [
          {
            contra: "Archivo",
            etiqueta: [...porPersona.values()]
              .map(({ otro, filas: fs }) => `«${otro.nombre}» (${fs.map((x) => x.codigo).join(", ")})`)
              .join(" y "),
            valor: "junta",
            aviso: c.correo && otroCorreo ? `Con «Sí», los recibos de ${c.codigo} van a ${otroCorreo.correo}, no a ${c.correo}.` : undefined,
          },
        ],
        valorNo: "separa",
        opciones: [
          { valor: "junta", etiqueta: "Sí, es la misma persona" },
          { valor: "separa", etiqueta: "No, son personas distintas" },
        ],
        valor,
        obligatoria: true,
        filas: [c.fila],
      });
      // Sin respuesta todavía: en la previa, como distintas.
      if (valor !== "junta") separados.add(c.id);
    }
    // «Distintas» la separa solo de las que son otra persona: con las del
    // mismo nombre y el mismo dato sigue siendo una (05C y 05D del piloto).
    for (const m of iguales) if (!separados.has(c.id) || !distinta(m.otro, c)) conj.unir(m.otro.id, c.id);
  }

  const armarGrupos = () => {
    const m = new Map<string, Candidato[]>();
    for (const c of candidatos) {
      const r = conj.raiz(c.id);
      if (!m.has(r)) m.set(r, []);
      m.get(r)!.push(c);
    }
    return [...m.values()];
  };

  // Solo el nombre en común: dudoso, por omisión personas distintas.
  {
    const gs = armarGrupos();
    const porNombre = new Map<string, Candidato[][]>();
    for (const g of gs) {
      const k = nombreClave(g[0].nombre);
      if (!k) continue;
      if (!porNombre.has(k)) porNombre.set(k, []);
      porNombre.get(k)!.push(g);
    }
    // Dos grupos que SÍ comparten un dato ya tienen su pregunta «¿Es la misma
    // persona?» (mismo nombre, otra cédula): esta no va.
    const llavesDe = (g: Candidato[]) => new Set(g.flatMap(llaves));
    for (const lista of porNombre.values()) {
      for (let i = 1; i < lista.length; i++) {
        const a = lista[0][0];
        const b = lista[i][0];
        const ka = llavesDe(lista[0]);
        if ([...llavesDe(lista[i])].some((k) => ka.has(k))) continue;
        const clave = `unir:${a.id}|${b.id}`;
        const valor = dec.personas[clave] ?? "distintas";
        dudosos.push({
          clave,
          texto: `«${b.nombre}» (fila ${b.fila}, ${b.codigo}) se llama igual que «${a.nombre}» (fila ${a.fila}, ${a.codigo}), pero no comparten correo, teléfono ni cédula.`,
          archivo: `«${b.nombre}» (${lista[i].map((x) => x.codigo).join(", ")})`,
          lineas: [{ contra: "Archivo", etiqueta: `«${a.nombre}» (${lista[0].map((x) => x.codigo).join(", ")}), sin datos en común`, valor: "misma" }],
          valorNo: "distintas",
          opciones: [
            { valor: "distintas", etiqueta: "Son personas distintas" },
            { valor: "misma", etiqueta: "Es la misma persona" },
          ],
          valor,
        });
        if (valor === "misma") conj.unir(a.id, b.id);
      }
    }
  }

  /* ── Personas: contra la administradora ── */
  const llavesOrg = ctx.personas.map((p) => ({
    p,
    correos: [p.correo, p.correo_respaldo].filter(Boolean).map((x) => x!.trim().toLowerCase()),
    tel: normalizarTel(p.telefono),
    doc: cedulaClave(p.documento),
    nombre: nombreClave(p.nombre),
  }));
  // Entre varias fichas que coinciden por correo o teléfono, primero la que se
  // llama como en el archivo; después, la que tiene más unidades.
  const mejor = (lista: PersonaOrg[], nombre: string) =>
    [...lista].sort(
      (a, b) => Number(mismoNombre(b.nombre, nombre)) - Number(mismoNombre(a.nombre, nombre)) || b.unidades.length - a.unidades.length
    )[0];
  const nombreFicha = (p: PersonaOrg) => (TRATAMIENTO_INICIAL.test(p.nombre) ? p.nombre : [p.prefijo, p.nombre].filter(Boolean).join(" "));
  // Ronda 8: sin unidades repetidas (la misma persona en 01A de cuatro edificios era «01B, 01A, 01B, 01A…»).
  const describir = (p: PersonaOrg) => {
    const us = [...new Set(p.unidades)];
    return `${nombreFicha(p)}${us.length ? ` (${us.slice(0, 4).join(", ")}${us.length > 4 ? "…" : ""})` : ""}`;
  };

  const grupos: Grupo[] = armarGrupos().map((cs) => {
    const primero = cs[0];
    // Ronda 8: lo corregido en la previa manda sobre lo que traen las otras
    // filas de la misma persona.
    const conDato = (campo: CampoFicha, val: (c: Candidato) => string | null) =>
      cs.find((c) => c.corr.has(campo) && val(c)) ?? cs.find((c) => val(c));
    const corregidoCorreo = (c: Candidato) => c.corr.has("correo") || c.corr.has("correo_respaldo");
    const correos = [...cs.filter(corregidoCorreo), ...cs.filter((c) => !corregidoCorreo(c))]
      .flatMap((c) => [c.correo, c.respaldo])
      .filter((x, i, a) => x && a.indexOf(x) === i);
    const conTel = conDato("telefono", (c) => c.telefono);
    const g: Grupo = {
      clave: primero.id,
      candidatos: cs,
      nombre: (cs.find((c) => c.corr.has("nombre")) ?? primero).nombre,
      prefijo: cs.find((c) => c.prefijo !== undefined)?.prefijo,
      documento: conDato("documento", (c) => c.documento)?.documento ?? "",
      telefono: conTel?.telefono ?? "",
      telNorm: conTel?.telNorm ?? cs.find((c) => c.telNorm)?.telNorm ?? null,
      correo: correos[0] ?? "",
      respaldo: correos[1] ?? "",
      personaId: null,
      completa: [],
      cambia: {},
    };

    const misCorreos = new Set(correos);
    const misTels = new Set(cs.map((c) => c.telNorm).filter(Boolean) as string[]);
    const porCorreo = llavesOrg.filter((x) => x.correos.some((c) => misCorreos.has(c))).map((x) => x.p);
    const porTel = llavesOrg.filter((x) => x.tel && misTels.has(x.tel)).map((x) => x.p);
    const misDocs = new Set(cs.map((c) => c.docNorm).filter(Boolean));
    const porDoc = llavesOrg.filter((x) => x.doc && misDocs.has(x.doc)).map((x) => x.p);
    const clave = `org:${g.clave}`;
    const dondeAparece = `«${g.nombre}» (fila ${primero.fila}, ${primero.codigo})`;
    const todas = [...porCorreo, ...porTel, ...porDoc].filter((p, i, arr) => arr.indexOf(p) === i);
    // Una ficha que comparte un dato pero es otra persona: otro nombre, o el
    // mismo nombre con otra cédula.
    const gDoc = cedulaClave(g.documento);
    // Ronda 8: contra el nombre de CADA fila del grupo, no solo el de la
    // primera. Un «Sí» puede juntar filas con nombres distintos (05C con
    // 01A del piloto); entonces una ficha con el nombre de cualquiera de ellas
    // es candidata, y si hay de más de un nombre se pregunta (abajo).
    const esOtra = (p: PersonaOrg) =>
      !cs.some((c) => mismoNombre(p.nombre, c.nombre)) || (!!gDoc && !!cedulaClave(p.documento) && cedulaClave(p.documento) !== gDoc);
    const enComun = (p: PersonaOrg) =>
      [porCorreo.includes(p) && "el correo", porTel.includes(p) && "el teléfono", porDoc.includes(p) && "la cédula"].filter(Boolean).join(", ");
    const codigosGrupo = cs.map((c) => c.codigo).filter((x, i, a) => a.indexOf(x) === i).join(", ");
    const archivoGrupo = `«${g.nombre}» (${codigosGrupo})`;
    // Una línea por ficha; las fichas iguales (mismo nombre y correo, del
    // importador viejo) en una sola, la que tiene más unidades.
    const lineasFichas = (lista: PersonaOrg[]): LineaDudoso[] => {
      const vistas = new Set<string>();
      return lista
        .filter((f) => {
          const k = `${nombreClave(f.nombre)}|${(f.correo ?? "").trim().toLowerCase()}|${cedulaClave(f.documento)}`;
          if (vistas.has(k)) return false;
          vistas.add(k);
          return true;
        })
        .map((f) => ({
          contra: "Ficha" as const,
          etiqueta: describir(f),
          valor: f.id,
          aviso:
            f.correo?.trim() && f.correo.trim().toLowerCase() !== g.correo
              ? `Con «Sí», los recibos de ${codigosGrupo} van a ${f.correo.trim()}${g.correo ? `, no a ${g.correo}` : ""}.`
              : undefined,
        }));
    };
    // Si alguna ficha con el MISMO nombre comparte el dato, se elige entre
    // esas (es la misma persona, ya registrada) y las de otro nombre solo se
    // nombran como información: elegir la del mismo nombre no junta a nadie
    // con otra persona, y su correo es el de esa persona. Pasa mucho en
    // administradoras cargadas con el importador viejo (una ficha por unidad).
    const mismas = todas.filter((p) => !esOtra(p));
    const otrasConDato = todas.filter(esOtra);
    const pc = porCorreo.filter((p) => mismas.includes(p));
    const pt = porTel.filter((p) => mismas.includes(p));
    const soloPorTel = !pc.length && !porDoc.some((p) => mismas.includes(p)) && pt.length ? mejor(pt, g.nombre) : null;

    // Ronda 8: fichas de nombres distintos entre las «del mismo nombre» (pasa
    // cuando un «Sí» juntó filas de dos nombres): nunca se elige sola.
    const nombresMismas = new Set(mismas.map((p) => nombreClave(p.nombre)));
    let elegida: PersonaOrg | null = null;
    if (nombresMismas.size > 1) {
      const orden = [...mismas].sort((a, b) => b.unidades.length - a.unidades.length);
      const valor = dec.personas[clave] ?? "";
      dudosos.push({
        clave,
        texto: `${archivoGrupo}: estas filas se juntaron como una sola persona y en la administradora hay fichas con nombres distintos que comparten sus datos. ¿Cuál es? Los recibos y avisos van al correo de la ficha que elija.`,
        archivo: archivoGrupo,
        lineas: lineasFichas(orden),
        valorNo: "nueva",
        opciones: [
          ...orden.map((p) => ({ valor: p.id, etiqueta: `Es ${describir(p)}: usar su ficha (${p.correo || "sin correo"})` })),
          { valor: "nueva", etiqueta: "Ninguna: ficha nueva" },
        ],
        valor,
        obligatoria: true,
        filas: cs.map((c) => c.fila),
      });
      elegida = valor && valor !== "nueva" ? (ctx.personas.find((p) => p.id === valor) ?? null) : null;
    } else if (otrasConDato.length && !mismas.length) {
      // Decisión de Gustavo del 25-oct: un dato en común con otro nombre no
      // tiene respuesta por omisión, y la carga espera.
      const orden = [...todas].sort((a, b) => Number(esOtra(a)) - Number(esOtra(b)) || b.unidades.length - a.unidades.length);
      const valor = dec.personas[clave] ?? "";
      const codigos = cs.map((c) => c.codigo).filter((x, i, a) => a.indexOf(x) === i).join(", ");
      dudosos.push({
        clave,
        texto:
          `${dondeAparece} comparte datos con fichas que ya están en la administradora: ` +
          orden
            .map(
              (p) =>
                `${enComun(p)} de ${describir(p)}` +
                (mismoNombre(p.nombre, g.nombre) && esOtra(p) ? ` (mismo nombre, otra cédula: ${p.documento})` : "")
            )
            .join("; ") +
          `. ¿Es alguna de ellas? Si elige una ficha, los recibos y avisos de ${codigos} van a ir al correo de esa ficha (no se cambia).`,
        archivo: archivoGrupo,
        lineas: lineasFichas(orden),
        valorNo: "nueva",
        opciones: [
          ...orden.map((p) => ({ valor: p.id, etiqueta: `Es ${describir(p)}: usar su ficha (${p.correo || "sin correo"})` })),
          { valor: "nueva", etiqueta: "Es otra persona: ficha nueva" },
        ],
        valor,
        obligatoria: true,
        filas: cs.map((c) => c.fila),
      });
      // Sin respuesta todavía: en la previa, como ficha nueva.
      elegida = valor && valor !== "nueva" ? (ctx.personas.find((p) => p.id === valor) ?? null) : null;
    } else if (pc.length && pt.length && !pc.some((p) => pt.includes(p))) {
      const a = mejor(pc, g.nombre);
      const b = mejor(pt, g.nombre);
      const valor = dec.personas[clave] ?? a.id;
      dudosos.push({
        clave,
        texto: `${dondeAparece}: su correo es el de ${describir(a)} y su teléfono el de ${describir(b)}, que en la administradora son fichas distintas. ¿Cuál es?`,
        archivo: archivoGrupo,
        lineas: lineasFichas([a, b]),
        valorNo: "nueva",
        opciones: [
          { valor: a.id, etiqueta: `La ficha de ${describir(a)} (por el correo)` },
          { valor: b.id, etiqueta: `La ficha de ${describir(b)} (por el teléfono)` },
          { valor: "nueva", etiqueta: "Ninguna: es otra persona" },
        ],
        valor,
      });
      elegida = valor === "nueva" ? null : (ctx.personas.find((p) => p.id === valor) ?? null);
    } else if (soloPorTel && g.correo && soloPorTel.correo?.trim() && soloPorTel.correo.trim().toLowerCase() !== g.correo) {
      // Lo mismo contra la administradora (revisión del 25-oct): la ficha
      // coincide solo por el teléfono y tiene otro correo. Si es la misma
      // ficha, los recibos van al correo de la ficha (no se cambia).
      const b = soloPorTel;
      const valor = dec.personas[clave] ?? "";
      dudosos.push({
        clave,
        texto: `${dondeAparece} tiene el teléfono de ${describir(b)}, pero otro correo: el archivo trae ${g.correo} y la ficha ${b.correo}. Si es la misma ficha, los recibos y avisos de ${cs.map((c) => c.codigo).filter((x, i, a) => a.indexOf(x) === i).join(", ")} van a ir a ${b.correo}.`,
        archivo: archivoGrupo,
        lineas: lineasFichas([b, ...pt.filter((p) => p !== b)]),
        valorNo: "nueva",
        opciones: [
          // Todas las que tienen ese teléfono, la del mismo nombre primero.
          ...[b, ...pt.filter((p) => p !== b)].map((p) => ({ valor: p.id, etiqueta: `Es ${describir(p)}: usar su ficha (${p.correo || "sin correo"})` })),
          { valor: "nueva", etiqueta: "Es otra persona: ficha nueva" },
        ],
        valor,
        obligatoria: true,
        filas: cs.map((c) => c.fila),
      });
      // Sin respuesta todavía: en la previa, como ficha nueva.
      elegida = valor && valor !== "nueva" ? (ctx.personas.find((p) => p.id === valor) ?? null) : null;
    } else if (mismas.length) {
      elegida = mejor(mismas, g.nombre);
      if (mismas.length > 1) {
        cs.forEach((c) =>
          filaDe(c.fila)?.notas.push({
            nivel: "info",
            texto: `hay ${mismas.length} fichas con el nombre y el correo, teléfono o cédula de ${c.nombre}: se usa la de ${describir(elegida!)}`,
          })
        );
      }
      // Ronda 8: en cada fila, solo las fichas que se llaman distinto que
      // esa fila (o con otra cédula); nunca «otra persona» sobre una ficha
      // con el mismo nombre de la fila.
      cs.forEach((c) => {
        const otras = otrasConDato.filter(
          (o) => !mismoNombre(o.nombre, c.nombre) || (!!c.docNorm && !!cedulaClave(o.documento) && cedulaClave(o.documento) !== c.docNorm)
        );
        if (!otras.length) return;
        filaDe(c.fila)?.notas.push({
          nivel: "info",
          texto: `también comparte ${[...new Set(otras.map(enComun))].join(", ")} con ${otras.map(describir).join(", ")}: ${otras.length > 1 ? "son otras personas, esas fichas no se usan" : "es otra persona, esa ficha no se usa"}`,
        });
      });
    } else {
      const homonimos = llavesOrg.filter((x) => x.nombre && x.nombre === nombreClave(g.nombre)).map((x) => x.p);
      if (homonimos.length) {
        const valor = dec.personas[clave] ?? "nueva";
        dudosos.push({
          clave,
          texto: `${dondeAparece} se llama igual que una persona que ya está en la administradora, pero no comparten correo, teléfono ni cédula.`,
          archivo: archivoGrupo,
          lineas: lineasFichas(homonimos).map((l) => ({ ...l, etiqueta: `${l.etiqueta}, sin datos en común` })),
          valorNo: "nueva",
          opciones: [
            { valor: "nueva", etiqueta: "Es otra persona: ficha nueva" },
            ...homonimos.map((p) => ({ valor: p.id, etiqueta: `Es ${describir(p)}: usar su ficha` })),
          ],
          valor,
        });
        elegida = valor === "nueva" ? null : (ctx.personas.find((p) => p.id === valor) ?? null);
      }
    }

    if (elegida) {
      g.personaId = elegida.id;
      const quien = nombreFicha(elegida);
      // Ronda 8: lo corregido en la previa es lo que queda. Si la fila va a
      // esta ficha, el dato corregido la cambia; lo que no se corrigió solo
      // completa lo vacío, como antes.
      const corregido = (campo: CampoFicha) => cs.some((c) => c.corr.has(campo));
      const igual = (campo: CampoFicha, a: string, b: string) =>
        campo === "documento" ? cedulaClave(a) === cedulaClave(b) : campo === "nombre" ? nombreClave(a) === nombreClave(b) : a.trim().toLowerCase() === b.trim().toLowerCase();
      const dif = (campo: CampoFicha, etiqueta: string, art: string, ficha: string | null, archivo: string) => {
        const hoy = ficha?.trim() ?? "";
        if (corregido(campo)) {
          if (!archivo) {
            if (hoy) g.completa.push({ texto: `${etiqueta}: se borró en la previa, pero la carga no borra datos de una ficha`, queda: hoy });
          } else if (!hoy) {
            g.completa.push({ texto: `${etiqueta}: se completa con ${archivo} (corregido en la previa)` });
          } else if (!igual(campo, hoy, archivo)) {
            g.cambia[campo] = archivo;
            g.completa.push({ texto: `Cambia ${art} ${etiqueta} de la ficha de ${quien}: ${hoy} → ${archivo}` });
          }
          return;
        }
        if (!archivo || campo === "nombre") return;
        if (!hoy) g.completa.push({ texto: `${etiqueta}: se completa con ${archivo}` });
        else if (!igual(campo, hoy, archivo))
          g.completa.push({ texto: `${etiqueta}: el archivo dice ${archivo}, no se cambia`, queda: hoy });
      };
      dif("nombre", "nombre", "el", elegida.nombre, g.nombre);
      dif("telefono", "teléfono", "el", elegida.telefono, g.telefono);
      dif("correo", "correo", "el", elegida.correo, g.correo);
      dif("correo_respaldo", "correo de respaldo", "el", elegida.correo_respaldo, g.respaldo);
      dif("documento", "cédula", "la", elegida.documento, g.documento);
    }
    return g;
  });

  function filaDe(n: number) {
    return filas.find((f) => f.fila === n);
  }
  const grupoDe = new Map<string, Grupo>();
  for (const g of grupos) for (const c of g.candidatos) grupoDe.set(c.id, g);

  /* ── Unidades que ya existen, y lo que se carga ── */
  const cargaFilas: FilaCarga[] = [];

  for (const f of filas) {
    if (f.estado === "no") continue;
    const d = datosFila.get(f.fila)!;
    const gProp = grupoDe.get(`${f.fila}:propietario`);
    const gInq = grupoDe.get(`${f.fila}:inquilino`);
    const existente = porCodigo.get(f.clave);

    if (d.paga === "inquilino" && !gInq && !(existente && vigente(existente.vinculos, "inquilino"))) {
      f.estado = "no";
      f.motivo = "paga el inquilino, pero la fila no trae su nombre";
      f.motivoCampo = "inquilino";
      continue;
    }

    const notasPersona = (g: Grupo | undefined, rol: Rol) => {
      if (!g) return;
      if (g.personaId) {
        const quien = ctx.personas.find((p) => p.id === g.personaId)!;
        const enFila = g.candidatos.find((c) => c.fila === f.fila && c.rol === rol);
        if (enFila && !mismoNombre(enFila.nombre, quien.nombre) && !g.cambia.nombre) {
          f.notas.push({
            nivel: "ambar",
            texto: `el archivo dice «${enFila.nombre}», y se eligió la ficha de ${describir(quien)}: se usa esa ficha, con su nombre`,
          });
        } else {
          f.notas.push({ nivel: "info", texto: `${rol === "propietario" ? "el propietario" : "el inquilino"} ya está en la administradora: se usa la ficha de ${describir(quien)}` });
        }
        g.completa.forEach((t) =>
          f.notas.push({
            nivel: t.queda ? "ambar" : "info",
            texto: t.texto,
            queda: t.queda,
            // Validación de la ronda 7: sin esto, el título del grupo llevaba el dato de la primera fila.
            grupo: t.queda ? "con un dato distinto al de la ficha que ya existe (no se cambia)" : undefined,
          })
        );
      } else if (g.candidatos.length > 1 && g.candidatos[0].fila === f.fila) {
        f.notas.push({
          nivel: "info",
          texto: `${g.nombre} figura en ${g.candidatos.length} filas (${g.candidatos.map((c) => c.codigo).join(", ")}): se registra una sola vez`,
        });
      }
    };

    // «Recibe corte» de la persona de esta fila (null = la fila no lo dice).
    const corteDe = (g: Grupo | undefined, rol: Rol) => g?.candidatos.find((c) => c.fila === f.fila && c.rol === rol)?.corte ?? null;

    /**
     * Avisos en ámbar de una fila que se carga (decisiones del 25-oct). Ninguno
     * bloquea: solo bloquea lo que ya bloqueaba.
     *  - Lo que la plantilla pide y la fila no trae: saldo de condominio,
     *    nombre y correo del propietario (código y alícuota ya frenan la fila).
     *  - Nadie de la unidad recibe el corte.
     *  - Paga el inquilino y no hay correo del inquilino.
     */
    const avisos = (carga: FilaCarga) => {
      const vProp = existente ? vigente(existente.vinculos, "propietario") : null;
      const vInq = existente ? vigente(existente.vinculos, "inquilino") : null;
      // El correo con que queda esa persona: el de quien ya está (el
      // importador no cambia de persona), o el de la ficha, completado con el
      // del archivo si estaba vacío.
      const correoDe = (g: Grupo | undefined, v: ReturnType<typeof vigente>) => {
        if (v && (!g || v.persona_id !== g.personaId)) return v.personas?.correo || "";
        if (!g) return "";
        const ficha = g.personaId ? ctx.personas.find((p) => p.id === g.personaId) : null;
        return ficha?.correo || g.correo;
      };
      if (col("saldo") >= 0 && d.saldo === null && !ctx.hayCierres && carga.accion === "crear")
        f.notas.push({ nivel: "ambar", texto: "no trae saldo de condominio: se carga en 0", grupo: "sin saldo de condominio (se cargan en 0)", campo: "saldo" });
      if (col("propietario") >= 0 && !gProp && !vProp) f.notas.push({ nivel: "ambar", texto: "falta el nombre del propietario", grupo: "sin nombre del propietario", campo: "propietario" });
      else if (col("correo") >= 0 && (gProp || vProp) && !correoDe(gProp, vProp))
        f.notas.push({ nivel: "ambar", texto: "falta el correo del propietario: no le va a llegar el recibo por correo", grupo: "sin correo del propietario: no les llega el recibo por correo", campo: "correo" });

      // Quién recibe el corte, como queda la unidad después de la carga.
      // null = la unidad no tiene a nadie en ese rol.
      const recibe = (rol: Rol, v: ReturnType<typeof vigente>): boolean | null => {
        const delArchivo = rol === "propietario" ? carga.propietario_corte : carga.inquilino_corte;
        if (carga[rol]) return delArchivo ?? (v ? v.enviar_corte !== false : true);
        return v ? v.enviar_corte !== false : null;
      };
      const r = [recibe("propietario", vProp), recibe("inquilino", vInq)].filter((x) => x !== null);
      if (r.length && r.every((x) => x === false))
        f.notas.push({ nivel: "ambar", texto: "nadie de esta unidad recibe el corte: el recibo no le va a llegar a nadie por correo", grupo: "donde nadie recibe el corte" });

      const pagaFinal = carga.paga ?? (existente?.paga as Paga | undefined) ?? "propietario";
      if (pagaFinal === "inquilino" && (gInq || vInq) && !correoDe(gInq, vInq))
        f.notas.push({ nivel: "ambar", texto: "paga el inquilino, pero no hay correo del inquilino: no le va a llegar el recibo por correo", grupo: "donde paga el inquilino y no hay su correo", campo: "inq_correo" });
    };

    if (!existente) {
      notasPersona(gProp, "propietario");
      notasPersona(gInq, "inquilino");
      const carga: FilaCarga = {
        accion: "crear",
        codigo: f.codigo,
        tipo: f.tipo,
        alicuota: d.alicuota,
        saldo_inicial: ctx.hayCierres ? null : (d.saldo ?? 0),
        saldo_inicial_hon: ctx.hayCierres ? null : (d.saldoHon ?? 0),
        nota: d.nota || null,
        paga: d.paga,
        propietario: gProp?.clave,
        inquilino: gInq?.clave,
        propietario_corte: gProp ? corteDe(gProp, "propietario") : null,
        inquilino_corte: gInq ? corteDe(gInq, "inquilino") : null,
      };
      avisos(carga);
      cargaFilas.push(carga);
      continue;
    }

    // Ya existe en el edificio. Dada de baja: no se crea otra con su código
    // (la base lo rechazaría) ni se actualiza.
    if (!existente.activa) {
      f.estado = "no";
      f.motivo = `el código es de la unidad ${existente.codigo}, que está dada de baja: reactívela desde su ficha si vuelve a usarse`;
      continue;
    }
    const cambios: string[] = [];
    const carga: FilaCarga = {
      accion: "actualizar",
      unidad_id: existente.id,
      codigo: existente.codigo,
      tipo: f.tipo,
      alicuota: null,
      saldo_inicial: null,
      saldo_inicial_hon: null,
      paga: null,
    };
    if (d.alicuota !== null && Math.abs(d.alicuota - Number(existente.alicuota)) > 1e-9) {
      cambios.push(`alícuota ${nf(5).format(Number(existente.alicuota))} → ${nf(5).format(d.alicuota)}`);
      carga.alicuota = d.alicuota;
    }
    const tipoActual = (existente.tipo ?? "apartamento") as TipoUnidad;
    if (f.tipo !== tipoActual && (d.tipoColumna || dec.tipo[f.fila] || f.tipo !== "apartamento")) {
      cambios.push(`tipo ${TIPOS_UNIDAD[tipoActual]} → ${TIPOS_UNIDAD[f.tipo]}`);
    } else {
      carga.tipo = tipoActual;
    }
    if (d.saldo !== null && !ctx.hayCierres && Math.abs(d.saldo - Number(existente.saldo_inicial)) > 0.00005) {
      cambios.push(`saldo inicial ${usd(existente.saldo_inicial)} → ${usd(d.saldo)}`);
      carga.saldo_inicial = d.saldo;
    }
    const notaHoy = (ctx.notas?.[existente.id] ?? "").trim();
    if (d.nota && d.nota !== notaHoy) {
      const corta = (t: string) => (t.length > 60 ? `${t.slice(0, 60)}…` : t);
      cambios.push(notaHoy ? `nota «${corta(notaHoy)}» → «${corta(d.nota)}»` : `nota: se completa con «${corta(d.nota)}»`);
      carga.nota = d.nota;
    }
    if (d.saldoHon !== null && !ctx.hayCierres && Math.abs(d.saldoHon - Number(existente.saldo_inicial_hon)) > 0.00005) {
      cambios.push(`saldo de administración ${usd(existente.saldo_inicial_hon)} → ${usd(d.saldoHon)}`);
      carga.saldo_inicial_hon = d.saldoHon;
    }
    for (const [rol, g] of [
      ["propietario", gProp],
      ["inquilino", gInq],
    ] as const) {
      if (!g) continue;
      const v = vigente(existente.vinculos, rol);
      const corte = corteDe(g, rol);
      const kCorte = rol === "propietario" ? "propietario_corte" : "inquilino_corte";
      if (!v) {
        cambios.push(`se registra ${rol === "propietario" ? "el propietario" : "el inquilino"}: ${g.nombre}`);
        carga[rol] = g.clave;
        carga[kCorte] = corte;
      } else if (g.personaId && v.persona_id === g.personaId) {
        g.completa.filter((t) => !t.queda).forEach((t) => cambios.push(`${rol}: ${t.texto}`));
        if (g.completa.some((t) => !t.queda)) carga[rol] = g.clave;
        // «Recibe corte» de un vínculo que ya existe: solo con «Actualizar», y
        // se muestra como cualquier otro cambio (decisión del 25-oct).
        if (corte !== null && corte !== (v.enviar_corte !== false)) {
          cambios.push(`${rol} recibe el corte: ${v.enviar_corte !== false ? "Sí" : "No"} → ${corte ? "Sí" : "No"}`);
          carga[rol] = g.clave;
          carga[kCorte] = corte;
        }
      } else {
        // Nunca se manda: la fila se carga sin este vínculo (la base igual lo
        // rechazaría, como red de seguridad).
        const nombreFila = g.candidatos.find((c) => c.fila === f.fila && c.rol === rol)?.nombre ?? g.nombre;
        f.notas.push(
          mismoNombre(nombreFila, v.personas?.nombre ?? "")
            ? // Misma persona en otra ficha (fichas duplicadas): no es un cambio.
              { nivel: "info", texto: `ya tiene como ${rol} a «${nombreDe(v)}» (otra ficha con el mismo nombre): se deja como está` }
            : {
                nivel: "ambar",
                texto: `el archivo trae otro ${rol} («${nombreFila}»): no se cambia desde aquí, cámbielo desde la ficha`,
                queda: nombreDe(v),
              }
        );
      }
    }
    const pagaActual = (existente.paga ?? "propietario") as Paga;
    if (d.paga && d.paga !== pagaActual) {
      const tieneInq = !!vigente(existente.vinculos, "inquilino") || !!carga.inquilino;
      if (d.paga === "inquilino" && !tieneInq) {
        f.notas.push({ nivel: "ambar", texto: "dice que paga el inquilino, pero la unidad no tiene inquilino: no se cambia", queda: "paga el propietario" });
      } else {
        const etiqueta = (p: Paga) => (p === "inquilino" ? "Inquilino" : "Propietario");
        cambios.push(`quién paga ${etiqueta(pagaActual)} → ${etiqueta(d.paga)}`);
        carga.paga = d.paga;
      }
    }
    f.existente = { cambios };
    if (!cambios.length) {
      f.estado = "omitir";
      f.motivo = "ya existe y no hay nada que cambiar";
      continue;
    }
    if (dec.actualizar[f.clave]) {
      f.estado = "actualizar";
      avisos(carga);
      cargaFilas.push(carga);
    } else {
      f.estado = "omitir";
      f.motivo = "ya existe: se omite (puede marcar «Actualizar»)";
    }
  }

  // Las preguntas que esperan respuesta marcan su fila en ámbar y frenan la
  // carga, pero solo si esa fila se va a cargar (una unidad que ya existe y
  // se omite no manda a nadie).
  const sinElegir = dudosos.filter(
    (d) => d.obligatoria && !d.valor && (d.filas ?? []).some((n) => ["nueva", "actualizar"].includes(filaDe(n)?.estado ?? ""))
  );
  for (const d of sinElegir) d.pendiente = true;
  for (const d of sinElegir)
    for (const n of d.filas ?? [])
      filaDe(n)?.notas.push({ nivel: "ambar", texto: "falta elegir en «Personas para revisar» si es la misma persona. La carga espera esa respuesta", grupo: "que esperan una respuesta en «Personas para revisar»", persona: true });
  // Ronda 8 (prueba 2.2 de Gustavo): una pregunta sin responder de una fila
  // que se omite (la unidad ya existe) no frena la carga, pero la fila igual
  // aparece en los avisos y se puede corregir: antes no salía en ningún lado.
  for (const d of dudosos.filter((x) => x.obligatoria && !x.valor && !x.pendiente))
    for (const n of d.filas ?? []) {
      const f = filaDe(n);
      if (!f || f.estado === "no" || f.notas.some((x) => x.persona)) continue;
      f.notas.push({
        nivel: "ambar",
        texto: "tiene una pregunta sin responder en «Personas para revisar». No frena la carga: la unidad ya existe y se omite",
        grupo: "con una pregunta en «Personas para revisar» (no frenan: se omiten)",
        persona: true,
      });
    }

  // Personas a mandar: las de las filas que se cargan.
  const usadasFinal = new Set<string>();
  for (const c of cargaFilas) {
    if (c.propietario) usadasFinal.add(c.propietario);
    if (c.inquilino) usadasFinal.add(c.inquilino);
  }
  const personasCarga: PersonaCarga[] = grupos
    .filter((g) => usadasFinal.has(g.clave))
    .map((g) =>
      g.personaId
        ? {
            ref: g.clave,
            persona_id: g.personaId,
            nombre: g.nombre,
            documento: g.documento || undefined,
            telefono: g.telefono || undefined,
            correo: g.correo || undefined,
            correo_respaldo: g.respaldo || undefined,
            ...(Object.keys(g.cambia).length ? { cambiar: g.cambia } : {}),
          }
        : {
            ref: g.clave,
            // Sin la clave si el archivo no trae tratamiento (la base decide);
            // null si dice «Sin tratamiento».
            ...(g.prefijo !== undefined ? { prefijo: g.prefijo } : {}),
            nombre: g.nombre,
            documento: g.documento || undefined,
            telefono: g.telefono || undefined,
            correo: g.correo || undefined,
            correo_respaldo: g.respaldo || undefined,
          }
    );

  /* ── Ronda 8: lo que queda guardado, y si lo corregido se guarda ── */
  const cargaDe = new Map<number, FilaCarga>();
  {
    let i = 0;
    for (const f of filas) if (f.estado === "nueva" || f.estado === "actualizar") cargaDe.set(f.fila, cargaFilas[i++]);
  }
  const quedaDe = (g: Grupo): Record<CampoFicha, string> => {
    const ficha = g.personaId ? ctx.personas.find((p) => p.id === g.personaId) : null;
    const de = (campo: CampoFicha, enFicha: string | null | undefined, delArchivo: string) => g.cambia[campo] ?? (enFicha?.trim() || delArchivo);
    return {
      nombre: g.cambia.nombre ?? (ficha ? nombreFicha(ficha) : g.nombre),
      telefono: de("telefono", ficha?.telefono, g.telefono),
      correo: de("correo", ficha?.correo, g.correo),
      correo_respaldo: de("correo_respaldo", ficha?.correo_respaldo, g.respaldo),
      documento: de("documento", ficha?.documento, g.documento),
    };
  };
  type CampoPrevia = Exclude<Campo, "ignorar" | "codigo">;
  const NO_GUARDA_OMITIR = "corregido en la previa, pero no se guarda: la unidad ya existe y se omite (marque «Actualizar»)";
  for (const f of filas) {
    const carga = cargaDe.get(f.fila);
    const existente = porCodigo.get(f.clave);
    const corregida = (k: Campo) => !!ctx.corregidas?.has(`${f.fila}:${k}`);
    const marcar = (k: CampoPrevia, guarda: boolean, texto: string) => {
      f.campos[k] = { ...(f.campos[k] ?? { valor: "" }), corregido: { guarda, texto } };
    };
    for (const rol of ["propietario", "inquilino"] as const) {
      const pre = rol === "propietario" ? "" : "inq_";
      const claves: Record<CampoFicha, CampoPrevia> = {
        nombre: rol,
        telefono: `${pre}telefono` as CampoPrevia,
        correo: `${pre}correo` as CampoPrevia,
        correo_respaldo: rol === "propietario" ? "correo_respaldo" : "inq_correo_respaldo",
        documento: `${pre}documento` as CampoPrevia,
      };
      const g = grupoDe.get(`${f.fila}:${rol}`);
      const vig = existente ? vigente(existente.vinculos, rol) : null;
      const seGuarda = !!g && !!carga && carga[rol] === g.clave;
      const yaEsLaMisma = !!g && !!g.personaId && !!vig && vig.persona_id === g.personaId;
      // Lo que va a quedar guardado: al elegir «Sí», «No» o una ficha, la
      // tabla lo muestra al momento (prueba 6.3 de Gustavo).
      if (g && carga && (seGuarda || yaEsLaMisma)) {
        const queda = quedaDe(g);
        for (const campo of Object.keys(claves) as CampoFicha[]) {
          const v = f.campos[claves[campo]];
          const hoy = v?.valor ?? "";
          const distinto =
            campo === "nombre" ? nombreClave(hoy) !== nombreClave(queda.nombre) : hoy.trim().toLowerCase() !== queda[campo].trim().toLowerCase();
          if (queda[campo] && distinto) f.campos[claves[campo]] = { ...(v ?? { valor: "" }), valor: queda[campo], archivo: hoy || "(vacío)" };
        }
      }
      for (const campo of Object.keys(claves) as CampoFicha[]) {
        const k = claves[campo];
        if (!corregida(k)) continue;
        if (f.estado === "no") marcar(k, false, "corregido en la previa, pero la fila no se carga");
        else if (f.estado === "omitir") marcar(k, false, NO_GUARDA_OMITIR);
        else if (!g) marcar(k, false, "corregido en la previa, pero no se guarda: falta el nombre");
        else if (vig && !yaEsLaMisma && !seGuarda) marcar(k, false, `corregido en la previa, pero no se guarda: la unidad ya tiene otro ${rol}`);
        else if (!g.personaId) marcar(k, true, "corregido en la previa");
        else if (g.cambia[campo]) marcar(k, true, `corregido en la previa: cambia en la ficha de ${quedaDe(g).nombre}`);
        else if (!(f.campos[k]?.archivo ?? f.campos[k]?.valor ?? "").trim() && !!quedaDe(g)[campo])
          marcar(k, false, "corregido en la previa, pero la carga no borra datos de una ficha");
        else marcar(k, true, "corregido en la previa");
      }
    }
    for (const k of ["alicuota", "saldo", "saldo_hon", "paga", "nota", "corte", "inq_corte", "tratamiento", "inq_tratamiento"] as const) {
      if (!corregida(k)) continue;
      if (f.estado === "no") marcar(k, false, "corregido en la previa, pero la fila no se carga");
      else if (f.estado === "omitir") marcar(k, false, NO_GUARDA_OMITIR);
      else if ((k === "saldo" || k === "saldo_hon") && ctx.hayCierres) marcar(k, false, "corregido en la previa, pero no se guarda: el edificio ya tiene meses cerrados");
      else if ((k === "tratamiento" || k === "inq_tratamiento") && grupoDe.get(`${f.fila}:${k === "tratamiento" ? "propietario" : "inquilino"}`)?.personaId)
        marcar(k, false, "corregido en la previa, pero el tratamiento de una ficha que ya existe se cambia desde la ficha");
      else marcar(k, true, "corregido en la previa");
    }
  }

  // Suma de alícuotas tal como quedaría el edificio.
  const tocadas = new Map<string, number>();
  for (const c of cargaFilas) if (c.accion === "actualizar" && c.alicuota !== null) tocadas.set(c.unidad_id!, c.alicuota);
  const suma =
    ctx.unidades.filter((u) => u.activa).reduce((s, u) => s + (tocadas.get(u.id) ?? Number(u.alicuota || 0)), 0) +
    cargaFilas.filter((c) => c.accion === "crear").reduce((s, c) => s + (c.alicuota ?? 0), 0);

  return {
    filas,
    dudosos,
    resumen: {
      leidas: filas.length,
      nuevas: filas.filter((f) => f.estado === "nueva").length,
      actualizar: filas.filter((f) => f.estado === "actualizar").length,
      omitir: filas.filter((f) => f.estado === "omitir").length,
      noSeCargan: filas.filter((f) => f.estado === "no").length,
      conObservaciones: filas.filter(
        (f) => f.estado !== "no" && (f.notas.some((n) => n.nivel === "ambar") || Object.values(f.campos).some((c) => c?.nota?.nivel === "ambar"))
      ).length,
      personasNuevas: personasCarga.filter((p) => !p.persona_id).length,
      personasExistentes: personasCarga.filter((p) => p.persona_id).length,
      sumaAlicuotas: suma,
      saldoIgnorado: ctx.hayCierres && filas.some((f) => f.campos.saldo?.valor),
      porElegir: sinElegir.length,
      faltanColumnas: (["codigo", "alicuota", "saldo", "propietario", "correo"] as Campo[]).filter((c) => col(c) < 0).map((c) => CAMPOS[c]),
    },
    carga: { personas: personasCarga, filas: cargaFilas },
  };
}
