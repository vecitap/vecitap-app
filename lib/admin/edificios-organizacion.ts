import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * `edificios` de una organización, memoizado por petición con `cache()` de
 * React. Tres puntos distintos de Admin pedían esto por separado, con
 * columnas distintas pero siempre filtrando por el mismo `org_id`:
 * `[orgId]/layout.tsx` (la lista para el selector del lateral),
 * `[edificioId]/layout.tsx` (comprobar que el edificio pertenece a esta
 * organización) e `inicio/page.tsx` (la tolerancia de alícuota del edificio
 * actual). El `select` de acá es la unión de las tres: `tolerancia_alicuota`
 * se agregó a lo que ya traía `[orgId]/layout.tsx` para que las otras dos
 * puedan resolverse de esta misma lista en vez de volver a golpear la red.
 *
 * `cache()` memoiza por argumento (`orgId`, un string — compara por valor),
 * y `[orgId]/layout.tsx` es el primero en llamarla dentro del árbol: cuando
 * `[edificioId]/layout.tsx` e `inicio/page.tsx` la llaman más abajo, leen
 * el resultado ya resuelto, sin un viaje de red nuevo.
 *
 * Devuelve `{ data, error }`, igual que el cliente de Supabase — así el
 * resto del código no cambia cómo maneja errores.
 */
export const edificiosDeOrganizacion = cache(async (orgId: string) => {
  const supabase = await crearClienteServidor();
  return supabase
    .from("edificios")
    .select("id,nombre,direccion,tolerancia_alicuota")
    .eq("org_id", orgId)
    .order("nombre");
});
