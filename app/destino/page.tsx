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
 * sobre lo demás; después, `administra_algo()` decide por ROL (tener una
 * membresía de tipo administrador/propietario_cuenta/contador/junta en
 * alguna organización), no por qué organizaciones alcanza a ver la sesión.
 * Quien no es ninguna de las dos cosas va a `/mi`, que ya sabe resolver los
 * dos casos que quedan: con unidades, su recibo; sin unidades, la pantalla
 * de aceptar la invitación.
 *
 * **Corrección 27-sep** (hallazgo de la validación automatizada — ver
 * docs/casos-de-uso-mejorados.md): la primera versión usaba
 * `organizaciones.select().limit(1)` para decidir "es administrador". Esa
 * tabla es visible por RLS a cualquiera con una membresía ahí, sea cual sea
 * el rol — un residente ve la organización de su propio edificio (la
 * necesita para su recibo). Con esa consulta, `residente.prueba` caía en
 * `/admin` en vez de `/mi`. `administra_algo()` sí distingue por rol.
 *
 * Límite conocido: una cuenta recién creada que en realidad viene a crear
 * una administradora (alta de organización, /admin) tampoco administra
 * nada todavía, así que cae en `/mi` y ve la pantalla de invitación. Para
 * el piloto es lo correcto — el caso que importa es el residente invitado
 * — pero es la razón por la que el enlace que genera Accesos lleva
 * `volver` explícito en vez de depender de esta resolución, y por la que
 * `Invitacion.tsx` ofrece un enlace directo a `/admin`.
 */
export default async function Destino() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?volver=/destino");

  const { data: esOperador } = await supabase.rpc("es_operador");
  if (esOperador === true) redirect("/operador");

  const { data: administraAlgo } = await supabase.rpc("administra_algo");
  if (administraAlgo === true) redirect("/admin");

  // El vigilante va antes que /mi: `administra_algo()` no lo cuenta (no es
  // uno de los cuatro roles de administración), así que sin esta rama caía
  // en /mi y veía la pantalla de aceptar invitación de un residente. Una
  // cuenta puede ser las dos cosas; en ese caso manda /admin, igual que
  // hoy manda sobre /mi.
  const { data: garitas } = await supabase.rpc("edificios_del_vigilante");
  if (Array.isArray(garitas) && garitas.length > 0) redirect("/garita");

  redirect("/mi");
}
