import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * `mis_unidades()` memoizado por petición con `cache()` de React.
 *
 * `[unidadId]/layout.tsx` ya lo llama para armar el encabezado, la tarjeta
 * de saldo y validar que la unidad es de esta sesión; `recibo/page.tsx`,
 * `reportar/page.tsx` y `visitas/page.tsx` volvían a llamarlo cada uno por
 * su cuenta (Next.js no tiene forma de pasarle al `page.tsx` lo que ya
 * resolvió su `layout.tsx`, salvo por memoización de request como esta) —
 * cuatro viajes de red a la misma función RPC en una sola petición. Con
 * `cache()`, a partir de la primera llamada las otras tres leen el
 * resultado ya resuelto.
 *
 * No toma argumentos (la sesión ya determina qué unidades devuelve, vía
 * RLS), así que memoiza directo la única invocación por petición.
 */
export const misUnidadesSesion = cache(async () => {
  const supabase = await crearClienteServidor();
  return supabase.rpc("mis_unidades");
});
