import { redirect } from "next/navigation";
import { MarcoGarita } from "@/components/garita/MarcoGarita";
import { FaltaUnPaso } from "@/components/garita/FaltaUnPaso";
import { crearClienteServidor } from "@/lib/supabase/server";
import { SECCION_INICIAL } from "@/lib/garita/secciones";

/**
 * La entrada sin segmentos: a dónde va quien abre /garita a secas.
 * Portado del arranque de garita.html:916-992.
 *
 * Con una garita o con varias, entra a la primera — igual que el original,
 * que elegía `estado.edificios[0]` y dejaba el cambio al <select> del
 * encabezado. Sin ninguna, la pantalla de "Falta un paso".
 *
 * Esta ruta no lleva gate de edificio en proxy.ts (todavía no hay uno):
 * solo pide sesión. La autorización por edificio ocurre un segmento más
 * abajo, y además `garita_edificios()` ya viene filtrada por la sesión.
 */
export default async function PaginaGarita() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?volver=/garita");

  const { data, error } = await supabase.rpc("garita_edificios");
  const garitas = data ?? [];

  if (garitas.length > 0) {
    redirect(`/garita/${garitas[0].edificio_id}/${SECCION_INICIAL}`);
  }

  return (
    <>
      <MarcoGarita correo={user.email ?? ""} />
      <main className="garita-main">
        <FaltaUnPaso correo={user.email ?? ""} errorCarga={error?.message} />
      </main>
    </>
  );
}
