import { Propietarios } from "@/components/admin/Propietarios";
import { crearClienteServidor } from "@/lib/supabase/server";
import { armarPropsPropietarios, consultarPropietarios } from "@/lib/admin/pantallas/propietarios";

/**
 * Portado de Propietarios() en app.html:1449-1566 (Server Component: solo carga datos).
 * La consulta y el armado viven en lib/admin/pantallas/propietarios.ts, que
 * comparte con la copia sin conexión (cambio 3).
 */
export default async function PaginaPropietarios({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();
  const props = armarPropsPropietarios(await consultarPropietarios(supabase, edificioId));

  return <Propietarios orgId={orgId} edificioId={edificioId} {...props} />;
}
