import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DirectorioProvider } from "@/components/garita/DirectorioContexto";
import { MarcoGarita } from "@/components/garita/MarcoGarita";
import { NavGarita } from "@/components/garita/NavGarita";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esUuid } from "@/lib/validacion";

/**
 * Gate + armazón de una garita concreta.
 *
 * Defensa en profundidad: proxy.ts ya bloquea /garita/[edificioId]/* con
 * `edificios_del_vigilante()`, y acá se vuelve a comprobar del lado del
 * servidor con `garita_edificios()`, que además es lo que hace falta para
 * pintar el nombre del edificio y el selector. Mismo patrón que
 * /operador y /admin.
 *
 * Un edificio que no esté en la lista da 404, no una redirección: igual
 * que /mi/[unidadId], no hay razón para decirle a nadie si ese id existe.
 */
export default async function LayoutGaritaEdificio({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ edificioId: string }>;
}) {
  const { edificioId } = await params;
  // Entra crudo del URL: formato inválido, 404 antes de cualquier consulta.
  if (!esUuid(edificioId)) notFound();

  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?volver=/garita/${edificioId}`);

  const { data, error } = await supabase.rpc("garita_edificios");
  // Falla cerrado: si no se pudo resolver la lista, no se entra.
  if (error) notFound();

  const garitas = data ?? [];
  const actual = garitas.find((g) => g.edificio_id === edificioId);
  if (!actual) notFound();

  // Una sola carga por edificio, igual que cargarEdificio() en garita.html —
  // Entrada y Consultar la reusan por contexto, no vuelven a pedirla.
  const { data: directorio, error: errorDirectorio } = await supabase.rpc("garita_directorio", {
    p_edificio: edificioId,
  });
  if (errorDirectorio) notFound();

  return (
    <>
      <MarcoGarita
        correo={user.email ?? ""}
        edificioNombre={actual.nombre}
        organizacion={actual.org}
        garitas={garitas}
        edificioIdActual={edificioId}
      />
      <NavGarita edificioId={edificioId} />
      <main className="garita-main">
        <DirectorioProvider directorio={directorio ?? []}>{children}</DirectorioProvider>
      </main>
    </>
  );
}
