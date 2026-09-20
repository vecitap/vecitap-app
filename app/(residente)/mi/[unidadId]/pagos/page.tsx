import { MisPagos } from "@/components/residente/MisPagos";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function PaginaMisPagos({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();

  const { data: pagos } = await supabase
    .from("pagos")
    .select("id,fecha,monto,moneda,monto_usd,tasa_aplicada,metodo,referencia,banco,estado,nota")
    .eq("unidad_id", unidadId)
    .order("fecha", { ascending: false })
    .limit(40);

  return <MisPagos pagos={pagos ?? []} />;
}
