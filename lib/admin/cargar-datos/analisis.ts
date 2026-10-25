import { montoEstricto } from "@/lib/admin/archivos-tabla";
import { nombreDe, normaliza, normalizarTel, separarTratamiento, TRATAMIENTO_INICIAL, vigente } from "@/lib/admin/personas";
import { TIPOS_UNIDAD, type TipoUnidad, type Unidad } from "@/lib/admin/tipos";
import { nf, num, usd } from "@/lib/formato";
import { leerPagaPegado, type Paga } from "@/lib/paga";
import { correosDe, type Campo } from "./columnas";

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
 *  - Personas: se juntan por correo, correo de respaldo o teléfono. Si solo
 *    coincide el nombre, es dudoso y por omisión son personas distintas.
 *  - Una fila sin alícuota no se carga por omisión; se puede cargar como
 *    estacionamiento con alícuota 0 (decisión provisional, para Gustavo).
 */

export type Nivel = "rojo" | "ambar" | "info";
export type Nota = { nivel: Nivel; texto: string };

/** Una persona que ya existe en la administradora. */
export type PersonaOrg = {
  id: string;
  prefijo: string | null;
  nombre: string;
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

type ValorCampo = { valor: string; nota?: Nota };

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
  tipo: TipoUnidad;
  campos: Partial<Record<Exclude<Campo, "ignorar" | "codigo">, ValorCampo>>;
  notas: Nota[];
};

export type Dudoso = {
  clave: string;
  texto: string;
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
  prefijo?: string;
  nombre: string;
  telefono?: string;
  correo?: string;
  correo_respaldo?: string;
};

export type FilaCarga = {
  accion: "crear" | "actualizar";
  unidad_id?: string;
  codigo: string;
  tipo: TipoUnidad;
  alicuota: number | null;
  saldo_inicial: number | null;
  paga: Paga | null;
  propietario?: string;
  inquilino?: string;
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

const nombreClave = (n: string) => normaliza(separarTratamiento(n).nombre);
/** "Inversiones Uno" e "Inversiones Uno, C.A." son el mismo nombre escrito distinto. */
const mismoNombre = (a: string, b: string) => {
  const x = nombreClave(a);
  const y = nombreClave(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};

/* ───────────────────────── personas ───────────────────────── */

type Rol = "propietario" | "inquilino";

type Candidato = {
  id: string; // "12:propietario"
  fila: number;
  codigo: string;
  rol: Rol;
  nombre: string;
  prefijo?: string;
  telefono: string;
  telNorm: string | null;
  correo: string;
  respaldo: string;
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
  prefijo?: string;
  telefono: string;
  telNorm: string | null;
  correo: string;
  respaldo: string;
  personaId: string | null;
  completa: string[];
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
  const datosFila = new Map<number, { alicuota: number | null; saldo: number | null; paga: Paga | null; tipoColumna: TipoUnidad | null }>();

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
    } else if (alicuota !== null && (alicuota < 0 || alicuota > 100)) {
      base.estado = "no";
      base.motivo = `la alícuota ${aCelda} no puede ser negativa ni mayor que 100`;
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
      }
    }

    // Saldo
    const sCelda = celda(f, "saldo");
    const saldo = leerSaldo(sCelda);
    if (saldo.malo && base.estado !== "no") {
      base.estado = "no";
      base.motivo = `el saldo «${sCelda}» no se entiende`;
    }
    campos.saldo = {
      valor: saldo.valor === null ? "" : usd(saldo.valor),
      nota:
        saldo.valor !== null && ctx.hayCierres
          ? { nivel: "info", texto: "no se aplica: el edificio ya tiene meses cerrados" }
          : undefined,
    };

    // Quién paga
    const pCelda = celda(f, "paga");
    const paga = col("paga") < 0 ? null : leerPagaPegado(pCelda);
    if (col("paga") >= 0 && paga === null && base.estado !== "no") {
      base.estado = "no";
      base.motivo = `«${pCelda}» en quién paga: tiene que decir propietario o inquilino`;
    }
    if (col("paga") >= 0) campos.paga = { valor: paga === "inquilino" ? "Inquilino" : "Propietario" };

    datosFila.set(fila, { alicuota, saldo: saldo.valor, paga: col("paga") >= 0 && pCelda ? paga : null, tipoColumna });

    // Personas de la fila
    for (const rol of ["propietario", "inquilino"] as const) {
      const pre = rol === "propietario" ? "" : "inq_";
      const nombreCrudo = celda(f, rol);
      const telCrudo = celda(f, `${pre}telefono` as Campo);
      const correoCrudo = celda(f, `${pre}correo` as Campo);
      const respaldoCrudo = rol === "propietario" ? celda(f, "correo_respaldo") : "";
      const etiqueta = rol === "propietario" ? "del propietario" : "del inquilino";

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
            ? { nivel: "ambar", texto: "trae texto además del número: se guarda tal cual, revíselo" }
            : !telNorm
              ? { nivel: "ambar", texto: "no parece un teléfono de Venezuela: se guarda tal cual" }
              : undefined,
        };
      }
      campos[kCor] = {
        valor: correo,
        nota: malos.length ? { nivel: "ambar", texto: `«${malos.join(" ")}» no es un correo válido: no se guarda` } : undefined,
      };
      if (rol === "propietario") {
        campos.correo_respaldo = {
          valor: respaldo,
          nota: todos.length > 2 ? { nivel: "ambar", texto: `hay más de dos correos: «${todos.slice(2).join(" ")}» no se guarda` } : undefined,
        };
      }

      const { prefijo, nombre } = separarTratamiento(nombreCrudo);
      campos[rol] = { valor: nombreCrudo };
      if (!nombre) {
        if (telCrudo || correo) {
          notas.push({ nivel: "ambar", texto: `hay teléfono o correo ${etiqueta} pero no su nombre: no se guarda` });
          if (campos[kTel]) campos[kTel]!.nota = { nivel: "ambar", texto: "sin nombre: no se guarda" };
          campos[kCor] = { valor: correo, nota: correo ? { nivel: "ambar", texto: "sin nombre: no se guarda" } : campos[kCor]!.nota };
        }
        continue;
      }
      candidatos.push({
        id: `${fila}:${rol}`,
        fila,
        codigo,
        rol,
        nombre,
        prefijo,
        telefono: telCrudo,
        telNorm,
        correo,
        respaldo,
      });
    }
  });

  /* ── Personas: agrupar dentro del archivo ── */
  const dudosos: Dudoso[] = [];
  const conj = new Conjuntos();
  const separados = new Set<string>();
  // Primero, sin separar nada, para encontrar los "mismo contacto, otro nombre".
  const porLlave = new Map<string, Candidato>();
  const llaves = (c: Candidato) =>
    [c.correo && `c:${c.correo}`, c.respaldo && `c:${c.respaldo}`, c.telNorm && `t:${c.telNorm}`].filter(Boolean) as string[];
  // Una sola pregunta por fila, pero con TODAS sus coincidencias: contestar
  // «Sí» la junta con cada una (11C del piloto coincide por correo con 04D y
  // por teléfono con 11A/11B).
  for (const c of candidatos) {
    conj.raiz(c.id);
    const iguales: { k: string; otro: Candidato }[] = [];
    for (const k of llaves(c)) {
      const otro = porLlave.get(k);
      if (!otro) porLlave.set(k, c);
      else if (otro.id !== c.id) iguales.push({ k, otro });
    }
    const otroNombre = iguales.filter((m) => !mismoNombre(m.otro.nombre, c.nombre));
    if (otroNombre.length) {
      const clave = `sep:${c.id}`;
      const con = otroNombre
        .map((m) => `el mismo ${m.k.startsWith("t:") ? "teléfono" : "correo"} que «${m.otro.nombre}» (fila ${m.otro.fila}, ${m.otro.codigo})`)
        .filter((x, i, a) => a.indexOf(x) === i);
      // Revisión del 25-oct: si coincide SOLO el teléfono y los correos son
      // otros, un «Sí» equivocado manda los recibos y avisos de esta unidad
      // al correo de la otra persona (destinatarios_de usa el de la ficha) y
      // Accesos lo propone al invitar. Ahí no hay respuesta por omisión.
      const otroCorreo = otroNombre.find((m) => m.otro.correo && m.otro.correo !== c.correo)?.otro;
      const choque = !!c.correo && !!otroCorreo && otroNombre.every((m) => m.k.startsWith("t:"));
      const valor = dec.personas[clave] ?? (choque ? "" : "junta");
      dudosos.push({
        clave,
        texto:
          `Fila ${c.fila} (${c.codigo}): «${c.nombre}» tiene ${con.join(" y ")}. ¿Es la misma persona?` +
          (choque
            ? ` Los correos son distintos: esta fila trae ${c.correo} y «${otroCorreo!.nombre}» (fila ${otroCorreo!.fila}) trae ${otroCorreo!.correo}. Si contesta «Sí», los recibos y avisos de ${c.codigo} van a ir a ${otroCorreo!.correo}.`
            : ""),
        opciones: [
          { valor: "junta", etiqueta: "Sí, es la misma persona" },
          { valor: "separa", etiqueta: "No, son personas distintas" },
        ],
        valor,
        obligatoria: choque,
        filas: [c.fila],
      });
      // Sin respuesta todavía: en la previa, como distintas.
      if (valor !== "junta") separados.add(c.id);
    }
    // «Distintas» la separa solo de los de OTRO nombre: con los del mismo
    // nombre y el mismo dato sigue siendo una persona (05C y 05D del piloto).
    for (const m of iguales) if (!separados.has(c.id) || mismoNombre(m.otro.nombre, c.nombre)) conj.unir(m.otro.id, c.id);
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
    for (const lista of porNombre.values()) {
      for (let i = 1; i < lista.length; i++) {
        const a = lista[0][0];
        const b = lista[i][0];
        const clave = `unir:${a.id}|${b.id}`;
        const valor = dec.personas[clave] ?? "distintas";
        dudosos.push({
          clave,
          texto: `«${b.nombre}» (fila ${b.fila}, ${b.codigo}) se llama igual que «${a.nombre}» (fila ${a.fila}, ${a.codigo}), pero no comparten correo ni teléfono.`,
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
    nombre: nombreClave(p.nombre),
  }));
  // Entre varias fichas que coinciden por correo o teléfono, primero la que se
  // llama como en el archivo; después, la que tiene más unidades.
  const mejor = (lista: PersonaOrg[], nombre: string) =>
    [...lista].sort(
      (a, b) => Number(mismoNombre(b.nombre, nombre)) - Number(mismoNombre(a.nombre, nombre)) || b.unidades.length - a.unidades.length
    )[0];
  const describir = (p: PersonaOrg) =>
    `${TRATAMIENTO_INICIAL.test(p.nombre) ? p.nombre : [p.prefijo, p.nombre].filter(Boolean).join(" ")}${p.unidades.length ? ` (${p.unidades.slice(0, 4).join(", ")}${p.unidades.length > 4 ? "…" : ""})` : ""}`;

  const grupos: Grupo[] = armarGrupos().map((cs) => {
    const primero = cs[0];
    const correos = cs.flatMap((c) => [c.correo, c.respaldo]).filter((x, i, a) => x && a.indexOf(x) === i);
    const g: Grupo = {
      clave: primero.id,
      candidatos: cs,
      nombre: primero.nombre,
      prefijo: primero.prefijo,
      telefono: cs.find((c) => c.telefono)?.telefono ?? "",
      telNorm: cs.find((c) => c.telNorm)?.telNorm ?? null,
      correo: correos[0] ?? "",
      respaldo: correos[1] ?? "",
      personaId: null,
      completa: [],
    };

    const misCorreos = new Set(correos);
    const misTels = new Set(cs.map((c) => c.telNorm).filter(Boolean) as string[]);
    const porCorreo = llavesOrg.filter((x) => x.correos.some((c) => misCorreos.has(c))).map((x) => x.p);
    const porTel = llavesOrg.filter((x) => x.tel && misTels.has(x.tel)).map((x) => x.p);
    const clave = `org:${g.clave}`;
    const dondeAparece = `«${g.nombre}» (fila ${primero.fila}, ${primero.codigo})`;
    const soloPorTel = !porCorreo.length && porTel.length ? mejor(porTel, g.nombre) : null;

    let elegida: PersonaOrg | null = null;
    if (porCorreo.length && porTel.length && !porCorreo.some((p) => porTel.includes(p))) {
      const a = mejor(porCorreo, g.nombre);
      const b = mejor(porTel, g.nombre);
      const valor = dec.personas[clave] ?? a.id;
      dudosos.push({
        clave,
        texto: `${dondeAparece}: su correo es el de ${describir(a)} y su teléfono el de ${describir(b)}, que en la administradora son fichas distintas. ¿Cuál es?`,
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
        opciones: [
          // Todas las que tienen ese teléfono, la del mismo nombre primero.
          ...[b, ...porTel.filter((p) => p !== b)].map((p) => ({ valor: p.id, etiqueta: `Es ${describir(p)}: usar su ficha (${p.correo || "sin correo"})` })),
          { valor: "nueva", etiqueta: "Es otra persona: ficha nueva" },
        ],
        valor,
        obligatoria: true,
        filas: cs.map((c) => c.fila),
      });
      // Sin respuesta todavía: en la previa, como ficha nueva.
      elegida = valor && valor !== "nueva" ? (ctx.personas.find((p) => p.id === valor) ?? null) : null;
    } else if (porCorreo.length || porTel.length) {
      const todas = [...porCorreo, ...porTel].filter((p, i, arr) => arr.indexOf(p) === i);
      elegida = mejor(todas, g.nombre);
      if (todas.length > 1) {
        cs.forEach((c) =>
          filaDe(c.fila)?.notas.push({
            nivel: "info",
            texto: `hay ${todas.length} fichas con el correo o teléfono de ${c.nombre}: se usa la de ${describir(elegida!)}`,
          })
        );
      }
    } else {
      const homonimos = llavesOrg.filter((x) => x.nombre && x.nombre === nombreClave(g.nombre)).map((x) => x.p);
      if (homonimos.length) {
        const valor = dec.personas[clave] ?? "nueva";
        dudosos.push({
          clave,
          texto: `${dondeAparece} se llama igual que una persona que ya está en la administradora, pero no comparten correo ni teléfono.`,
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
      const dif = (campo: string, ficha: string | null, archivo: string) => {
        if (!archivo) return;
        if (!ficha?.trim()) g.completa.push(`${campo}: se completa con ${archivo}`);
        else if (ficha.trim().toLowerCase() !== archivo.trim().toLowerCase())
          g.completa.push(`${campo}: la ficha dice ${ficha}, el archivo ${archivo} (no se cambia)`);
      };
      dif("teléfono", elegida.telefono, g.telefono);
      dif("correo", elegida.correo, g.correo);
      dif("correo de respaldo", elegida.correo_respaldo, g.respaldo);
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
      continue;
    }

    const notasPersona = (g: Grupo | undefined, rol: Rol) => {
      if (!g) return;
      if (g.personaId) {
        const quien = ctx.personas.find((p) => p.id === g.personaId)!;
        const enFila = g.candidatos.find((c) => c.fila === f.fila && c.rol === rol);
        if (enFila && !mismoNombre(enFila.nombre, quien.nombre)) {
          f.notas.push({
            nivel: "ambar",
            texto: `el archivo dice «${enFila.nombre}», pero la ficha que coincide por correo o teléfono es la de ${describir(quien)}: se usa esa ficha, revise que sea la misma persona`,
          });
        } else {
          f.notas.push({ nivel: "info", texto: `${rol === "propietario" ? "el propietario" : "el inquilino"} ya está en la administradora: se usa la ficha de ${describir(quien)}` });
        }
        g.completa.forEach((t) => f.notas.push({ nivel: t.includes("no se cambia") ? "ambar" : "info", texto: t }));
      } else if (g.candidatos.length > 1 && g.candidatos[0].fila === f.fila) {
        f.notas.push({
          nivel: "info",
          texto: `${g.nombre} figura en ${g.candidatos.length} filas (${g.candidatos.map((c) => c.codigo).join(", ")}): se registra una sola vez`,
        });
      }
    };

    if (!existente) {
      notasPersona(gProp, "propietario");
      notasPersona(gInq, "inquilino");
      cargaFilas.push({
        accion: "crear",
        codigo: f.codigo,
        tipo: f.tipo,
        alicuota: d.alicuota,
        saldo_inicial: ctx.hayCierres ? null : (d.saldo ?? 0),
        paga: d.paga,
        propietario: gProp?.clave,
        inquilino: gInq?.clave,
      });
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
    for (const [rol, g] of [
      ["propietario", gProp],
      ["inquilino", gInq],
    ] as const) {
      if (!g) continue;
      const v = vigente(existente.vinculos, rol);
      if (!v) {
        cambios.push(`se registra ${rol === "propietario" ? "el propietario" : "el inquilino"}: ${g.nombre}`);
        carga[rol] = g.clave;
      } else if (g.personaId && v.persona_id === g.personaId) {
        g.completa.filter((t) => t.includes("se completa")).forEach((t) => cambios.push(`${rol}: ${t}`));
        if (g.completa.some((t) => t.includes("se completa"))) carga[rol] = g.clave;
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
                texto: `el archivo trae otro ${rol} («${nombreFila}»; la ficha tiene «${nombreDe(v)}»): no se cambia desde aquí, cámbielo desde la ficha`,
              }
        );
      }
    }
    const pagaActual = (existente.paga ?? "propietario") as Paga;
    if (d.paga && d.paga !== pagaActual) {
      const tieneInq = !!vigente(existente.vinculos, "inquilino") || !!carga.inquilino;
      if (d.paga === "inquilino" && !tieneInq) {
        f.notas.push({ nivel: "ambar", texto: "dice que paga el inquilino, pero la unidad no tiene inquilino: no se cambia" });
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
      filaDe(n)?.notas.push({ nivel: "ambar", texto: "falta elegir en «Personas para revisar»: los correos no coinciden. La carga espera esa respuesta" });

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
        ? { ref: g.clave, persona_id: g.personaId, nombre: g.nombre, telefono: g.telefono || undefined, correo: g.correo || undefined, correo_respaldo: g.respaldo || undefined }
        : { ref: g.clave, prefijo: g.prefijo, nombre: g.nombre, telefono: g.telefono || undefined, correo: g.correo || undefined, correo_respaldo: g.respaldo || undefined }
    );

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
    },
    carga: { personas: personasCarga, filas: cargaFilas },
  };
}
