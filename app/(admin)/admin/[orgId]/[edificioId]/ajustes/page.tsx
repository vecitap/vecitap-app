import { notFound } from "next/navigation";
import { Ajustes } from "@/components/admin/Ajustes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tieneRolOrganizacion } from "@/lib/admin/acceso";

// Constante de módulo: tieneRolOrganizacion() memoiza por referencia.
const ROLES_EDITAR_ORG = ["propietario_cuenta"] as const;
import type { CategoriaConPartidas } from "@/lib/admin/tipos";

/**
 * Portado de Ajustes() en admin.html:5670-6031 (Server Component: solo
 * carga datos).
 *
 * El orden de las partidas se acomoda acá: la consulta anidada no
 * garantiza el orden de lo que trae dentro (misma nota que el original,
 * admin.html:5688-5690).
 */
export default async function PaginaAjustes({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: org, error: eO }, { data: edificio, error: eE }, { data: cats, error: eC }, { data: puedeEditarOrg }] = await Promise.all([
    supabase.from("organizaciones").select("nombre,rif,logo_url").eq("id", orgId).single(),
    supabase.from("edificios").select("*").eq("id", edificioId).single(),
    supabase
      .from("categorias")
      .select("id,nombre,orden,partidas_fijas(id,concepto,referencia,monto,orden)")
      .eq("edificio_id", edificioId)
      .order("orden"),
    // Lo mismo que pide la política org_editar (bloque C): solo para decidir
    // si la tarjeta "Datos de la administradora" se puede editar.
    tieneRolOrganizacion(orgId, ROLES_EDITAR_ORG),
  ]);

  if (eO || eE) notFound();
  if (eC) throw eC;

  const categorias: CategoriaConPartidas[] = (cats ?? []).map((c) => ({
    ...c,
    partidas_fijas: [...(c.partidas_fijas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
  }));

  return (
    <Ajustes
      orgId={orgId}
      organizacion={org!}
      edificio={edificio!}
      categorias={categorias}
      puedeEditarOrg={puedeEditarOrg === true}
    />
  );
}
