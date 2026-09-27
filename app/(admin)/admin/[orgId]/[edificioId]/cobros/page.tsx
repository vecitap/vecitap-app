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

  const { data: conceptos, error } = await supabase
    .from("conceptos_cobro")
    .select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id")
    .or(`edificio_id.eq.${edificioId},edificio_id.is.null`)
    .order("orden");
  if (error) throw error;

  const conceptosFilas: ConceptoCobro[] = conceptos ?? [];
  return <Cobros orgId={orgId} edificioId={edificioId} conceptos={conceptosFilas} />;
}
