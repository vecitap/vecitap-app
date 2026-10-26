import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SIN_AJUSTES_COBRO, type AjustesCobro, type Redondeo } from "@/lib/cobro-opciones";

export type { AjustesCobro, Redondeo };

/**
 * Cómo cobra una organización (`ajustes_cobro`, ronda 7): solo en dólares
 * (bloque 4) y el redondeo de las cuotas al cerrar el mes (bloque 6). Sin
 * fila, como siempre: con bolívares y sin redondeo.
 *
 * Memoizado por petición: el layout del portal, «Mi recibo», «Reportar un
 * pago» y el recibo impreso la piden en la misma navegación.
 */
export const ajustesCobroDe = cache(async (orgId: string): Promise<AjustesCobro> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from("ajustes_cobro").select("solo_usd,redondeo").eq("org_id", orgId).maybeSingle();
  return data ? { soloUsd: data.solo_usd, redondeo: (data.redondeo as Redondeo) ?? "ninguno" } : SIN_AJUSTES_COBRO;
});
