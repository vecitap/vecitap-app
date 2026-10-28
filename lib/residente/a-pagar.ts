import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { MEDIO_CENTAVO } from "@/lib/residente/resumen";

/**
 * Lo que la unidad debe HOY, para todo lo que en el portal dice «a pagar»
 * (ronda 9, A1, caso 97): «Si paga hoy» de Mi recibo, Reportar un pago, el
 * monto exacto en bolívares y los datos para pagar.
 *
 * El recibo queda como se emitió (su total es el del día del cierre), pero
 * lo que se paga hoy tiene que contar los pagos confirmados después. Antes
 * «Si paga hoy» convertía el total del recibo: 02A del Edificio Gustavo, con
 * $ 50 a favor, decía «Si paga hoy Bs 109.127,86» y un propietario real
 * pagaba dos veces.
 *
 *  - Con el saldo visible (`saldo_visible()`, vía `mis_unidades()`): es el
 *    saldo de hoy. Negativo = a favor.
 *  - Sin él (inquilino con «Solo el recibo del mes»): no se le puede mostrar
 *    la deuda acumulada, así que es lo que queda del último recibo, que ya ve:
 *    su total menos los pagos confirmados que todavía no entraron en ningún
 *    cierre. Nunca negativo: un «a favor» sería el saldo que no le toca ver.
 *
 * `enRevision`: pagos reportados que la administración todavía no confirma.
 * No se descuentan (pueden rechazarse), pero se avisan, para que no vuelva a
 * pagar lo que ya pagó.
 */
export type APagarHoy = {
  /** En dólares, a dos decimales. ≤ 0 = no debe nada (negativo: a favor, solo si `saldoVisible`). */
  monto: number;
  saldoVisible: boolean;
  /** Pagos confirmados después del último cierre. */
  confirmadosDespues: number;
  enRevision: number;
};

const dos = (x: number) => Math.round(x * 100) / 100;

export async function aPagarHoy(
  supabase: SupabaseClient<Database>,
  unidad: { unidad_id: string; saldo: number | null },
  totalRecibo: number | null
): Promise<APagarHoy | null> {
  // Las dos sumas, de la base (pagos_desde_cierre, migración
  // 20261028180000): RLS no le deja leer al inquilino con «solo el recibo»
  // los pagos que no reportó él, y sin esto se le pedía el recibo entero
  // aunque el propietario ya hubiera pagado.
  const { data } = await supabase.rpc("pagos_desde_cierre", { p_unidad: unidad.unidad_id });
  const fila = Array.isArray(data) ? data[0] : null;
  const confirmadosDespues = dos(Number(fila?.confirmados ?? 0));
  const enRevision = dos(Number(fila?.en_revision ?? 0));

  if (unidad.saldo !== null && unidad.saldo !== undefined) {
    const monto = dos(Number(unidad.saldo));
    return { monto: Math.abs(monto) < MEDIO_CENTAVO ? 0 : monto, saldoVisible: true, confirmadosDespues, enRevision };
  }
  if (totalRecibo === null) return null;
  const queda = dos(Math.max(Number(totalRecibo) - confirmadosDespues, 0));
  return { monto: queda < MEDIO_CENTAVO ? 0 : queda, saldoVisible: false, confirmadosDespues, enRevision };
}
