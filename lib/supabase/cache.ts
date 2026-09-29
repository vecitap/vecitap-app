import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * `getUser()` memoizado por petición con `cache()` de React: cuando más de
 * un Server Component de la misma petición necesita saber quién es el
 * usuario (un layout y una página bajo él, por ejemplo), esto evita
 * repetir el viaje a `/auth/v1/user` — la segunda llamada, y las que
 * sigan, leen el resultado ya resuelto de la primera.
 *
 * `cache()` memoiza por argumentos; esta función no toma ninguno, así que
 * memoiza directo la única invocación por petición. Sirve tanto para el
 * caso de hoy (Residente: `[unidadId]/layout.tsx` + `reportar/page.tsx` +
 * `visitas/page.tsx` llamaban a `getUser()` cada uno por su cuenta) como
 * para cualquier otro módulo que en el futuro necesite el usuario en más
 * de un punto del mismo árbol.
 *
 * **Lo que esto NO hace:** no dedupe con `proxy.ts`. `cache()` memoiza
 * dentro del árbol de render de Server Components de una petición;
 * `proxy.ts` corre antes, en un runtime aparte (Edge Middleware), fuera de
 * ese árbol — no hay ningún mecanismo que comparta memoria entre los dos.
 * Esa repetición (proxy.ts + el primer layout de cada módulo) sigue
 * existiendo a propósito: no se tocó en esta sesión porque toca
 * autenticación (ver docs/estado-migracion.md, "Lentitud de la interfaz").
 */
export const usuarioActual = cache(async () => {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
