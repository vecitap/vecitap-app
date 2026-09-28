import { Accesos } from "@/components/admin/Accesos";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Portado de Accesos() en app.html:3712-4143, sin la pestaña de
 * vigilantes (ver docs/estado-migracion.md). Server Component: solo carga
 * la lista de unidades para el selector de "Invitar" — invitaciones y
 * gente con acceso son estado propio de `<Accesos>` (ver el comentario en
 * ese archivo).
 */
export default async function PaginaAccesos({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const { data: unidades, error } = await supabase
    .from("unidades")
    .select("id,codigo")
    .eq("edificio_id", edificioId)
    .eq("activa", true)
    .order("codigo");
  if (error) throw error;

  return <Accesos orgId={orgId} edificioId={edificioId} unidades={unidades ?? []} />;
}
