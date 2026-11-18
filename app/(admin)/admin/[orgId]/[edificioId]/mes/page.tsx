import { CierreMes } from "@/components/admin/CierreMes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { armarPropsMes, consultarMes } from "@/lib/admin/pantallas/mes";

/**
 * Portado de CierreMes() en app.html:2435-3074 (Server Component: solo carga
 * datos). La consulta y el armado viven en lib/admin/pantallas/mes.ts, que
 * comparte con la copia sin conexión (cambio 3).
 */
export default async function PaginaCierreMes({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();
  const props = armarPropsMes(await consultarMes(supabase, edificioId));

  return <CierreMes orgId={orgId} edificioId={edificioId} {...props} />;
}
