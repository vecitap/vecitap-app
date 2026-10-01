import { pagaDe } from "@/lib/paga";
import type { Database } from "@/types/supabase";

type UnidadPortal = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

export type LineaResumen = {
  unidadId: string;
  edificio: string;
  codigo: string;
  /** Tal como lo devuelve `mis_unidades()`. `null` = la base no lo muestra ("ver recibo"). */
  saldo: number | null;
};

export type ResumenPropietario = {
  /** Unidades de las que es propietario y paga él. */
  pagaUsted: LineaResumen[];
  /** Suma de las deudas de `pagaUsted` (ver `resumenPropietario`). */
  totalDeuda: number;
  /** Unidades de las que es propietario y paga su inquilino: solo el estado, nunca el monto. */
  pagaInquilino: LineaResumen[];
};

/**
 * Mismo criterio que la tarjeta de saldo del portal (`TarjetaSaldo.tsx`, en
 * paridad con index.html:668-671): debe si el saldo es mayor que cero, sin
 * margen. El resumen y la tarjeta tienen que decir lo mismo de la misma
 * unidad.
 */
export function debeSegunPortal(saldo: number): boolean {
  return saldo > 0;
}

function linea(u: UnidadPortal): LineaResumen {
  // El tipo generado dice `number`, pero saldo_visible() puede devolver
  // NULL (ver el comentario de TarjetaSaldo.tsx).
  const saldo = u.saldo === null || u.saldo === undefined ? null : Number(u.saldo);
  return { unidadId: u.unidad_id, edificio: u.edificio, codigo: u.codigo, saldo };
}

/**
 * Resumen arriba del selector para quien es propietario de más de una
 * unidad (caso 31 de docs/casos-de-uso-mejorados.md). Devuelve `null` si no
 * corresponde mostrarlo, y la pantalla queda igual que antes.
 *
 * Decisiones, todas a favor de no mostrar de menos:
 *  - Solo cuentan las unidades donde la relación es `propietario`. Las que
 *    alquila se ven "como hoy" (pedido de Nicolás, 30-sep): no entran a
 *    ningún grupo ni cuentan para el umbral de "más de una unidad".
 *  - El total **no se calcula**: se suman los saldos que ya calculó la base.
 *    Y se suman solo las deudas (saldo > 0): un saldo a favor queda en su
 *    unidad y no se descuenta del total, porque no paga la deuda de otra
 *    unidad — restarlo invitaría a pagar de menos. Cada unidad a favor se
 *    sigue mostrando, con su monto, en su línea.
 *  - `saldo` null no entra a la suma; la línea dice "ver recibo".
 */
export function resumenPropietario(unidades: UnidadPortal[]): ResumenPropietario | null {
  const propias = unidades.filter((u) => u.relacion !== "inquilino");
  if (propias.length < 2) return null;

  const pagaUsted = propias.filter((u) => pagaDe(u.paga) === "propietario").map(linea);
  const pagaInquilino = propias.filter((u) => pagaDe(u.paga) === "inquilino").map(linea);
  const totalDeuda = pagaUsted.reduce((s, l) => (l.saldo !== null && debeSegunPortal(l.saldo) ? s + l.saldo : s), 0);

  return { pagaUsted, totalDeuda, pagaInquilino };
}
