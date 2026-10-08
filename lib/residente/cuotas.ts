import { cache } from "react";
import { pagaDe } from "@/lib/paga";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type UnidadPortal = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

export type CuotasUnidad = { cuotas: number | null; masDe: boolean };

/**
 * `mis_cuotas()` memoizado por petición, igual que `misUnidadesSesion`.
 * Las cuentas las hace la base (supabase/migrations/20261008130000_mis_cuotas.sql);
 * acá solo se arma un mapa por unidad.
 *
 * Si la función falla —o no existe, porque la migración todavía no se
 * aplicó en esa base— el mapa queda vacío y `estadoSinMonto` cae a "Con
 * deuda" / "Al día": la pantalla no se rompe por un dato que es solo de
 * presentación.
 */
export const misCuotasSesion = cache(async (): Promise<Map<string, CuotasUnidad>> => {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("mis_cuotas");
  const mapa = new Map<string, CuotasUnidad>();
  if (error || !data) return mapa;
  for (const f of data) {
    // Como en mis_unidades(): el tipo generado no marca nullable las
    // columnas de un RETURNS TABLE, pero `cuotas` es NULL cuando la base no
    // muestra el saldo.
    mapa.set(f.unidad_id, { cuotas: f.cuotas === null ? null : Number(f.cuotas), masDe: !!f.mas_de });
  }
  return mapa;
});

/**
 * La unidad la paga su inquilino y quien mira es el propietario: ve el
 * estado, nunca el monto, y no reporta pagos desde la pantalla (la base sí
 * se lo permitiría — ver caso 35 de docs/casos-de-uso-mejorados.md).
 */
export function soloEstado(u: Pick<UnidadPortal, "relacion" | "paga">): boolean {
  return u.relacion !== "inquilino" && pagaDe(u.paga) === "inquilino";
}

const UMBRAL = 0.009;

/**
 * El texto sin montos de una unidad que paga el inquilino. Criterio de los
 * casos borde en la migración de `mis_cuotas()`:
 *  - saldo que la base no muestra → "ver recibo";
 *  - 0 cuotas (al día, saldo a favor o centavos de redondeo) → "Al día";
 *  - N cuotas → "Debe N cuotas" (un mes pagado en parte cuenta entero);
 *  - más deuda que recibos → "Debe más de N cuotas";
 *  - deuda sin ningún mes cerrado (solo saldo inicial) → "Con deuda".
 */
export function estadoSinMonto(saldo: number | null, c: CuotasUnidad | undefined): { texto: string; debe: boolean } {
  if (saldo === null) return { texto: "ver recibo", debe: false };
  if (!c) return saldo > UMBRAL ? { texto: "Con deuda", debe: true } : { texto: "Al día", debe: false };
  if (c.cuotas === null) return { texto: "ver recibo", debe: false };
  if (c.cuotas === 0) return c.masDe ? { texto: "Con deuda", debe: true } : { texto: "Al día", debe: false };
  const n = `${c.cuotas} ${c.cuotas === 1 ? "cuota" : "cuotas"}`;
  return { texto: c.masDe ? `Debe más de ${n}` : `Debe ${n}`, debe: true };
}
