import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PantallaMarca } from "@/components/ui";
import { usuarioActual } from "@/lib/supabase/cache";
import { rutaInterna } from "@/lib/url-sitio";
import { FormularioEntrar } from "./FormularioEntrar";

/**
 * Con la sesión ya abierta, /entrar no pide la clave: sigue de largo a
 * `volver` (o a /destino, que resuelve el rol). 05-oct — antes, cualquier
 * cosa que mandara a /entrar a alguien con la sesión viva (un fallo de
 * conexión, un enlace de invitación abierto estando dentro) le pedía la
 * clave otra vez, y eso se vivía como "la app me sacó".
 *
 * Cuándo NO sigue de largo:
 * · `?clave=nueva` — viene del enlace de recuperar la clave. Ahí la sesión
 *   existe pero es la especial de recuperación, y la persona TIENE que
 *   poner la clave nueva (ver FormularioEntrar.tsx).
 * · El enlace viejo de recuperación (`#type=recovery`) no llega acá: el `#`
 *   no viaja al servidor y esa sesión todavía no está en las cookies cuando
 *   se arma esta página, así que se muestra el formulario igual que antes.
 * · Si Auth no contesta (`ErrorSinConexion`), se muestra el formulario: no
 *   se sabe si hay sesión, y esta es justo la pantalla para entrar.
 *
 * `volver` es entrada ajena (viene en la URL): pasa por `rutaInterna()`, el
 * mismo saneado que /auth/confirmar, y nunca vuelve a /entrar (sería un
 * bucle).
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  if (uno(parametros.clave) !== "nueva") {
    let conSesion = false;
    try {
      conSesion = (await usuarioActual()) !== null;
    } catch {
      conSesion = false;
    }
    if (conSesion) {
      const destino = rutaInterna(uno(parametros.volver));
      redirect(destino.startsWith("/entrar") ? "/destino" : destino);
    }
  }

  return (
    <PantallaMarca volverAlSitio>
      <Suspense fallback={null}>
        <FormularioEntrar />
      </Suspense>
    </PantallaMarca>
  );
}
