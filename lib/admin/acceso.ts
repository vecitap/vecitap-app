import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * `tiene_rol(orgId, roles)` memoizado por petición con `cache()` de React.
 *
 * Hoy `[orgId]/layout.tsx` es el único punto del árbol de Admin que llama a
 * esta función (no hay una segunda llamada que deduplicar todavía), así que
 * envolverla acá no ahorra ningún viaje de red en este momento — es
 * consistencia con el resto de este cambio (junto a `usuarioActual` y
 * `edificiosDeOrganizacion`) y deja lista la memoización para el día que
 * una sección de Admin necesite revalidar el rol por su cuenta.
 *
 * `cache()` memoiza por argumentos comparando por **referencia** cuando no
 * son primitivos — por eso `roles` tiene que ser la misma constante de
 * módulo en cada llamada (p. ej. `ROLES_ADMIN` de `lib/admin/constantes.ts`),
 * no un array armado de nuevo en cada invocación (`[...ROLES_ADMIN]`
 * inline no cachearía nunca, porque cada spread es un array distinto). El
 * spread para la llamada al RPC pasa adentro de esta función, después de
 * que `cache()` ya resolvió la clave.
 */
export const tieneRolOrganizacion = cache(async (orgId: string, roles: readonly string[]) => {
  const supabase = await crearClienteServidor();
  return supabase.rpc("tiene_rol", { p_org: orgId, p_roles: [...roles] });
});
