import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * A dónde va alguien que entró sin un `volver` puesto (escribió el dominio
 * a mano, o guardó /entrar en favoritos).
 *
 * En los HTML originales esto no existía: cada rol tenía su propio archivo
 * (admin.html, index.html, garita.html) y entrar por el archivo equivocado
 * era problema de quien pasaba el enlace. Acá hay un solo /entrar para los
 * tres roles, así que después de la sesión hay que resolver a dónde va —
 * antes caían todos en `/`, la página en construcción, que es un callejón
 * sin salida para cualquiera de los tres.
 *
 * El orden importa: `es_operador()` es global (staff de Vecitap) y manda
 * sobre lo demás; después, tener alguna organización visible es lo que
 * distingue a un administrador. Quien no es ninguna de las dos cosas va a
 * `/mi`, que ya sabe resolver los dos casos que quedan: con unidades, su
 * recibo; sin unidades, la pantalla de aceptar la invitación.
 *
 * Límite conocido: una cuenta recién creada que en realidad viene a crear
 * una administradora (alta de organización, /admin) tampoco tiene
 * organizaciones todavía, así que cae en `/mi` y ve la pantalla de
 * invitación. Para el piloto es lo correcto — el caso que importa es el
 * residente invitado — pero es la razón por la que el enlace que genera
 * Accesos lleva `volver` explícito en vez de depender de esta resolución.
 */
export default async function Destino() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?volver=/destino");

  const { data: esOperador } = await supabase.rpc("es_operador");
  if (esOperador === true) redirect("/operador");

  const { data: orgs } = await supabase.from("organizaciones").select("id").limit(1);
  if (orgs && orgs.length > 0) redirect("/admin");

  redirect("/mi");
}
