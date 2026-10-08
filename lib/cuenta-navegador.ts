import { crearClienteNavegador } from "@/lib/supabase/client";

/** Lo escucha `AvisoCambioDeCuenta` para revisar la sesión en el acto. */
export const EVENTO_REVISAR_CUENTA = "vecitap:revisar-cuenta";

/**
 * ¿La sesión de este navegador ya no es la de `usuarioId` (la cuenta con la
 * que se armó la página)? Si cambió —otra cuenta abierta en otra pestaña, o
 * la sesión cerrada—, avisa a `AvisoCambioDeCuenta` para que muestre su
 * aviso de abajo y devuelve `true`: quien llama NO manda la acción.
 *
 * Por qué (prueba 5 del tramo 1, 07-oct): el aviso de abajo ya aparecía,
 * pero si la administradora tocaba "Generar la invitación" igual, la acción
 * salía con la sesión del inquilino y arriba se sumaba "Sin permiso para
 * invitar". Era correcto (la base la rechazaba) pero confuso: dos avisos
 * para un mismo problema. Ahora no se envía y queda solo el de abajo.
 *
 * `getSession()` lee las cookies del navegador, sin viaje al servidor. No
 * decide ningún permiso: la base sigue siendo la que rechaza.
 */
export async function otraCuentaEnNavegador(usuarioId: string): Promise<boolean> {
  const { data } = await crearClienteNavegador().auth.getSession();
  if ((data.session?.user.id ?? null) === usuarioId) return false;
  window.dispatchEvent(new Event(EVENTO_REVISAR_CUENTA));
  return true;
}
