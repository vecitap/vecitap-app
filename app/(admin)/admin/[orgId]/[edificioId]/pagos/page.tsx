import { Pagos } from "@/components/admin/Pagos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { armarPropsPagos, consultarPagos } from "@/lib/admin/pantallas/pagos";

/**
 * Portado de Pagos() en admin.html:3289-3897 (Server Component: solo carga
 * datos). La consulta y el armado viven en lib/admin/pantallas/pagos.ts,
 * que comparte con la copia sin conexión (cambio 3).
 */
export default async function PaginaPagos({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();
  const props = armarPropsPagos(await consultarPagos(supabase, edificioId));

  return <Pagos orgId={orgId} edificioId={edificioId} {...props} />;
}
