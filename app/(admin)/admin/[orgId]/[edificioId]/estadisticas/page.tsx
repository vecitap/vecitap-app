import { notFound } from "next/navigation";
import { Estadisticas } from "@/components/admin/Estadisticas";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { PeriodoAdmin } from "@/lib/admin/tipos";

/**
 * Portado de Estadisticas() en admin.html:4596-4916 (Server Component:
 * carga los períodos y los datos del encabezado; las cinco RPC del mes
 * elegido las hace el Client Component, porque cambian al cambiar de mes
 * sin recargar la página).
 */
export default async function PaginaEstadisticas({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: org, error: eO }, { data: edificio, error: eE }, { data: periodos, error: eP }] = await Promise.all([
    supabase.from("organizaciones").select("nombre").eq("id", orgId).single(),
    supabase.from("edificios").select("nombre,rif").eq("id", edificioId).single(),
    supabase
      .from("periodos")
      .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
      .eq("edificio_id", edificioId)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
  ]);

  if (eO || eE) notFound();
  if (eP) throw eP;

  const periodosFilas: PeriodoAdmin[] = periodos ?? [];

  return <Estadisticas edificioId={edificioId} organizacion={org!} edificio={edificio!} periodos={periodosFilas} />;
}
