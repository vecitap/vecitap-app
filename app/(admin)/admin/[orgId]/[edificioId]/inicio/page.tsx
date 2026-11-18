import { PantallaInicio } from "@/components/admin/PantallaInicio";
import { edificiosDeOrganizacion } from "@/lib/admin/edificios-organizacion";
import { armarPropsInicio, consultarInicio } from "@/lib/admin/pantallas/inicio";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Portado de Inicio() en app.html:1348-1433. Consultas y armado en
 * lib/admin/pantallas/inicio.ts y el dibujo en PantallaInicio: los comparte
 * la pantalla sin conexión (cambio 3).
 */
export default async function PaginaInicio({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  // edificios va por edificiosDeOrganizacion(orgId) (memoizada por petición,
  // ver lib/admin/edificios-organizacion.ts) en vez de una consulta propia:
  // [orgId]/layout.tsx ya la llamó un nivel más arriba, así que esto lee el
  // resultado ya resuelto en vez de un cuarto viaje de red a la misma tabla.
  const [filas, { data: edificios, error }] = await Promise.all([consultarInicio(supabase, edificioId), edificiosDeOrganizacion(orgId)]);
  if (error) throw error;
  const edificio = edificios?.find((e) => e.id === edificioId);

  return <PantallaInicio orgId={orgId} edificioId={edificioId} tolerancia={edificio?.tolerancia_alicuota} props={armarPropsInicio(filas)} />;
}
