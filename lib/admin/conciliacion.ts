import type { MovimientoBanco } from "./archivos-tabla";

/**
 * Cruce del extracto del banco contra los pagos reportados. Portado de
 * `cruce` en admin.html:3467-3489 — mismas reglas, sin cambios:
 *
 * · Empareja por referencia: igual, o una termina en la otra (los bancos
 *   recortan la referencia de distintas formas según el canal).
 * · Un pago reportado se usa una sola vez (`usados`).
 * · Cuadra si la diferencia de monto es <= max(1, 1% del monto); si la
 *   referencia coincide pero el monto no, va a "dudosos" para revisarlo a
 *   mano en vez de conciliarlo solo.
 * · Lo que el banco trae y nadie reportó son "huérfanos": plata que entró
 *   y no se sabe de quién es.
 */

export type PagoReportado = {
  id: string;
  monto: number;
  referencia: string | null;
  banco: string | null;
};

export type Casado<P> = { mov: MovimientoBanco; pago: P; dif: number };

export type Cruce<P> = {
  casan: Casado<P>[];
  dudosos: Casado<P>[];
  huerfanos: MovimientoBanco[];
  sinCruzar: P[];
};

export function cruzarConBanco<P extends PagoReportado>(movimientos: MovimientoBanco[], reportados: P[]): Cruce<P> {
  const casan: Casado<P>[] = [];
  const dudosos: Casado<P>[] = [];
  const huerfanos: MovimientoBanco[] = [];
  const usados = new Set<string>();

  movimientos.forEach((m) => {
    const cand = reportados.find((p) => {
      if (usados.has(p.id)) return false;
      const a = String(p.referencia || "");
      const b = String(m.referencia || "");
      if (!a || !b) return false;
      return a === b || a.endsWith(b) || b.endsWith(a);
    });
    if (!cand) {
      huerfanos.push(m);
      return;
    }
    usados.add(cand.id);
    const dif = Math.abs(Number(cand.monto) - Number(m.monto || 0));
    const tol = Math.max(1, Number(cand.monto) * 0.01);
    (dif <= tol ? casan : dudosos).push({ mov: m, pago: cand, dif });
  });

  return { casan, dudosos, huerfanos, sinCruzar: reportados.filter((p) => !usados.has(p.id)) };
}
