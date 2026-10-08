import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ErrorSinConexion } from "@/lib/sin-conexion";
import { esErrorDeConexionAuth } from "@/lib/supabase/conexion";

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
 * **Tres resultados, no dos (05-oct, revisión cruzada pendiente: toca
 * autenticación):**
 * · `User` — hay sesión y el servidor de Auth la confirmó.
 * · `null` — NO hay sesión: no hay cookies, el token es inválido, o Auth
 *   dice que esa sesión o ese usuario ya no existen (4xx). Quien llama
 *   manda a /entrar, como siempre.
 * · **lanza `ErrorSinConexion`** — Auth no contestó: red caída, tiempo
 *   agotado o 5xx (`AuthRetryableFetchError`, que en auth-js 2.116 cubre
 *   500-504 y 520-530, más el fallo de `fetch` con status 0). No se sabe si
 *   hay sesión o no, así que NO se manda a /entrar: lo atrapa `app/error.tsx`
 *   y muestra "No pudimos conectar. Reintente".
 *
 * Sigue fallando cerrado: con un error de conexión no se devuelve ningún
 * usuario, así que ningún layout deja pasar a nadie; solo cambia la
 * pantalla que se muestra en vez de los datos (reintentar en lugar de
 * Entrar). La sesión tampoco se toca: auth-js no borra la sesión ante un
 * error reintentable.
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
  let resultado: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    resultado = await supabase.auth.getUser();
  } catch (e) {
    // getUser() devuelve los errores de Auth en `error`; si algo LANZA es
    // que falló algo más abajo (red, runtime). Tampoco es "sin sesión".
    throw new ErrorSinConexion(e);
  }
  const { data, error } = resultado;
  if (esErrorDeConexionAuth(error)) throw new ErrorSinConexion(error);
  return data.user;
});
