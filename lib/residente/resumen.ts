import { pagaDe } from "@/lib/paga";
import type { Database } from "@/types/supabase";
import type { CuotasUnidad } from "./cuotas";

type UnidadPortal = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

export type LineaResumen = {
  unidadId: string;
  edificio: string;
  codigo: string;
  /** Tal como lo devuelve `mis_unidades()`. `null` = la base no lo muestra ("ver recibo"). */
  saldo: number | null;
  /** De `mis_cuotas()`; solo se usa en las que paga el inquilino. `undefined` = sin dato. */
  cuotas?: CuotasUnidad;
};

export type ResumenPortal = {
  /** Las que paga él: propietario con paga = propietario, o inquilino con paga = inquilino. */
  pagaUsted: LineaResumen[];
  /** Suma de las deudas de `pagaUsted` (ver `resumenUnidades`). */
  totalDeuda: number;
  /** Propietario con paga = inquilino: solo el estado, nunca el monto. */
  pagaInquilino: LineaResumen[];
};

/**
 * Mismo criterio que la tarjeta de saldo del portal (`TarjetaSaldo.tsx`, en
 * paridad con index.html:668-671): debe si el saldo es mayor que cero, a
 * favor si es menor, sin margen. El resumen y la tarjeta tienen que decir lo
 * mismo de la misma unidad.
 */
export function debeSegunPortal(saldo: number): boolean {
  return saldo > 0;
}

export function aFavorSegunPortal(saldo: number): boolean {
  return saldo < 0;
}

function linea(u: UnidadPortal, cuotas: Map<string, CuotasUnidad>): LineaResumen {
  // El tipo generado dice `number`, pero saldo_visible() puede devolver
  // NULL (ver el comentario de TarjetaSaldo.tsx).
  const saldo = u.saldo === null || u.saldo === undefined ? null : Number(u.saldo);
  return { unidadId: u.unidad_id, edificio: u.edificio, codigo: u.codigo, saldo, cuotas: cuotas.get(u.unidad_id) };
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
 */
export function resumenUnidades(unidades: UnidadPortal[], cuotas: Map<string, CuotasUnidad> = new Map()): ResumenPortal | null {
  if (unidades.length < 2) return null;

  const esPropia = (u: UnidadPortal) => u.relacion !== "inquilino";
  const pagaUsted = unidades
    .filter((u) => (esPropia(u) ? pagaDe(u.paga) === "propietario" : pagaDe(u.paga) === "inquilino"))
    .map((u) => linea(u, cuotas));
  const pagaInquilino = unidades.filter((u) => esPropia(u) && pagaDe(u.paga) === "inquilino").map((u) => linea(u, cuotas));
  if (pagaUsted.length === 0 && pagaInquilino.length === 0) return null;

  const totalDeuda = pagaUsted.reduce((s, l) => (l.saldo !== null && debeSegunPortal(l.saldo) ? s + l.saldo : s), 0);

  return { pagaUsted, totalDeuda, pagaInquilino };
}
