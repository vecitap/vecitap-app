import { Cobros } from "@/components/admin/Cobros";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ConceptoCobro } from "@/lib/admin/tipos";

/** Portado de Cobros() en app.html:2271-2427 (Server Component: solo carga datos). */
export default async function PaginaCobros({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: conceptos, error }, { data: avance }] = await Promise.all([
    supabase
      .from("conceptos_cobro")
      .select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id,cuotas")
      .or(`edificio_id.eq.${edificioId},edificio_id.is.null`)
      .order("orden"),
    // Ronda 7 (bloque 5): cuántas cuotas van de cada extraordinaria.
    supabase.rpc("avance_extraordinarias", { p_edificio: edificioId }),
  ]);
  if (error) throw error;

  const conceptosFilas: ConceptoCobro[] = conceptos ?? [];
  const avancePorId = Object.fromEntries((avance ?? []).map((a) => [a.concepto_id, a.emitidas]));
  return <Cobros orgId={orgId} edificioId={edificioId} conceptos={conceptosFilas} avance={avancePorId} />;
}
