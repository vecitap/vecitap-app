import { pagaDe } from "@/lib/paga";
import type { Database } from "@/types/supabase";
import type { CuotasUnidad } from "./cuotas";

type UnidadPortal = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

export type LineaResumen = {
  unidadId: string;
  edificioId: string;
  edificio: string;
  orgId: string;
  organizacion: string;
  codigo: string;
  /** Tal como lo devuelve `mis_unidades()`. `null` = la base no lo muestra ("ver recibo"). */
  saldo: number | null;
  /** De `mis_cuotas()`; solo se usa en las que paga el inquilino. `undefined` = sin dato. */
  cuotas?: CuotasUnidad;
};

/** Las unidades de un edificio, con su propio total. */
export type GrupoEdificio = {
  edificioId: string;
  edificio: string;
  organizacion: string;
  pagaUsted: LineaResumen[];
  /** Suma de las deudas de `pagaUsted` de ESTE edificio. */
  totalDeuda: number;
  pagaInquilino: LineaResumen[];
};

export type ResumenPortal = {
  /** Las que paga él: propietario con paga = propietario, o inquilino con paga = inquilino. */
  pagaUsted: LineaResumen[];
  /** Suma de las deudas de `pagaUsted` (ver `resumenUnidades`). */
  totalDeuda: number;
  /** Propietario con paga = inquilino: solo el estado, nunca el monto. */
  pagaInquilino: LineaResumen[];
  /**
   * Ronda 4 (caso 55): si las unidades son de **más de una administradora**,
   * el resumen va por edificio, cada uno con su total, y no hay total general
   * —son cuentas distintas, que se pagan a cuentas bancarias distintas—.
   * `null` con una sola administradora: la pantalla queda como antes.
   */
  porEdificio: GrupoEdificio[] | null;
};

/**
 * Mismo criterio que la tarjeta de saldo del portal (`TarjetaSaldo.tsx`, en
 * paridad con index.html:668-671): debe si el saldo es mayor que cero, a
 * favor si es menor. El resumen y la tarjeta tienen que decir lo mismo de la
 * misma unidad.
 *
 * Ronda 9 (B2, caso 96): se compara en centavos. La base guarda 4 decimales y
 * un resto como 0,0021 decía «Debe $ 0,00» en rojo (02C del Edificio
 * Gustavo). Menos de medio centavo es «Al día».
 */
export const MEDIO_CENTAVO = 0.005;

export function debeSegunPortal(saldo: number): boolean {
  return saldo >= MEDIO_CENTAVO;
}

export function aFavorSegunPortal(saldo: number): boolean {
  return saldo <= -MEDIO_CENTAVO;
}

function linea(u: UnidadPortal, cuotas: Map<string, CuotasUnidad>): LineaResumen {
  // El tipo generado dice `number`, pero saldo_visible() puede devolver
  // NULL (ver el comentario de TarjetaSaldo.tsx).
  const saldo = u.saldo === null || u.saldo === undefined ? null : Number(u.saldo);
  return {
    unidadId: u.unidad_id,
    edificioId: u.edificio_id,
    edificio: u.edificio,
    orgId: u.org_id,
    organizacion: u.organizacion,
    codigo: u.codigo,
    saldo,
    cuotas: cuotas.get(u.unidad_id),
  };
}

function sumaDeudas(lineas: LineaResumen[]): number {
  return lineas.reduce((s, l) => (l.saldo !== null && debeSegunPortal(l.saldo) ? s + l.saldo : s), 0);
}

/** Agrupa por edificio, en el orden en que llegan (mis_unidades() ordena por administradora y edificio). */
function porEdificio(pagaUsted: LineaResumen[], pagaInquilino: LineaResumen[]): GrupoEdificio[] {
  const grupos = new Map<string, GrupoEdificio>();
  const grupo = (l: LineaResumen) => {
    let g = grupos.get(l.edificioId);
    if (!g) {
      g = { edificioId: l.edificioId, edificio: l.edificio, organizacion: l.organizacion, pagaUsted: [], totalDeuda: 0, pagaInquilino: [] };
      grupos.set(l.edificioId, g);
    }
    return g;
  };
  pagaUsted.forEach((l) => grupo(l).pagaUsted.push(l));
  pagaInquilino.forEach((l) => grupo(l).pagaInquilino.push(l));
  return [...grupos.values()].map((g) => ({ ...g, totalDeuda: sumaDeudas(g.pagaUsted) }));
}

/**
 * Resumen arriba del selector para quien tiene más de una unidad (caso 31 de
 * docs/casos-de-uso-mejorados.md, con las respuestas de Gustavo del 01-oct).
 * Devuelve `null` si no corresponde mostrarlo, y la pantalla queda igual.
 *
 *  - Aparece con 2 o más unidades EN TOTAL (propias y alquiladas).
 *  - "Lo que usted paga": las que es propietario y paga el propietario, más
 *    las que alquila y paga el inquilino (regla 3: el inquilino que alquila
 *    varias ve el mismo resumen).
 *  - "Lo paga su inquilino": las que es propietario y paga el inquilino.
 *    Sin montos: "Al día" o "Debe N cuotas" (`mis_cuotas()`, ronda 2).
 *  - Las que alquila y paga el propietario no entran a ningún grupo: no le
 *    toca pagarlas. Se siguen viendo en el selector, como siempre.
 *  - El total **no se calcula**: se suman los saldos que ya calculó la base,
 *    y solo las deudas. Cada unidad es una cuenta aparte, así que un saldo a
 *    favor no se descuenta de las otras; esa unidad dice "A favor $ X" en su
 *    propia línea (ronda 2: antes salía dos veces, ver caso 31).
 *  - `saldo` null no entra a la suma; la línea dice "ver recibo".
 *  - Con unidades de varias administradoras, además `porEdificio` (ronda 4,
 *    caso 55): un total por edificio y ninguno general.
 */
export function resumenUnidades(unidades: UnidadPortal[], cuotas: Map<string, CuotasUnidad> = new Map()): ResumenPortal | null {
  if (unidades.length < 2) return null;

  const esPropia = (u: UnidadPortal) => u.relacion !== "inquilino";
  const pagaUsted = unidades
    .filter((u) => (esPropia(u) ? pagaDe(u.paga) === "propietario" : pagaDe(u.paga) === "inquilino"))
    .map((u) => linea(u, cuotas));
  const pagaInquilino = unidades.filter((u) => esPropia(u) && pagaDe(u.paga) === "inquilino").map((u) => linea(u, cuotas));
  if (pagaUsted.length === 0 && pagaInquilino.length === 0) return null;

  const totalDeuda = sumaDeudas(pagaUsted);
  const administradoras = new Set([...pagaUsted, ...pagaInquilino].map((l) => l.orgId));

  return {
    pagaUsted,
    totalDeuda,
    pagaInquilino,
    porEdificio: administradoras.size > 1 ? porEdificio(pagaUsted, pagaInquilino) : null,
  };
}
