import { redirect } from "next/navigation";
import { PrimerEdificio } from "@/components/admin/PrimerEdificio";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Portado de la resolución de edificio en cargarEdificios()
 * (app.html:910-920): sin ninguno, PrimerEdificio (app.html:1292-1343);
 * con al menos uno, se entra al primero de la lista (el original recuerda
 * el último elegido solo en memoria de la sesión — no hay preferencia que
 * migrar, ver docs/inventario-admin.md sección 2).
 */
export default async function PaginaOrg({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await crearClienteServidor();

  const { data: edificios, error } = await supabase
    .from("edificios")
    .select("id")
    .eq("org_id", orgId)
    .order("nombre");

  if (error) throw error;

  if (!edificios || edificios.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PrimerEdificio orgId={orgId} />
      </div>
    );
  }

  redirect(`/admin/${orgId}/${edificios[0].id}/inicio`);
}
