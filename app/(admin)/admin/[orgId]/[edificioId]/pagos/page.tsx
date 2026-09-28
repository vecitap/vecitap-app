import { Pagos } from "@/components/admin/Pagos";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { BancoFila, ComprobanteFila, PagoAdmin } from "@/lib/admin/tipos";

/**
 * Portado de Pagos() en admin.html:3289-3897 (Server Component: solo carga
 * datos). Los pagos y los comprobantes se filtran por las unidades del
 * edificio, igual que el original (`.in("unidad_id", ids)`): `pagos` es por
 * organización, no por edificio.
 */
export default async function PaginaPagos({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const { data: unidades, error: eU } = await supabase
    .from("unidades")
    .select("id,codigo")
    .eq("edificio_id", edificioId)
    .order("codigo");
  if (eU) throw eU;

  const ids = (unidades ?? []).map((u) => u.id);

  if (ids.length === 0) {
    return <Pagos orgId={orgId} unidades={[]} pagos={[]} bancos={[]} comprobantes={[]} />;
  }

  const [{ data: pagos, error: eP }, { data: bancos, error: eB }, { data: comprobantes, error: eC }] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id,unidad_id,fecha,monto,moneda,tasa_aplicada,monto_usd,metodo,destino,referencia,banco,banco_codigo,telefono_origen,documento_origen,correo_origen,reportado_por,estado,periodo_cierre_id,nota"
      )
      .in("unidad_id", ids)
      .order("fecha", { ascending: false })
      .limit(300),
    supabase.from("bancos").select("codigo,nombre,corto").eq("activo", true).order("orden"),
    supabase
      .from("comprobantes")
      .select("id,pago_id,ruta,tipo,bytes,sha256,subido_en,imagen_borrada_en")
      .in("unidad_id", ids)
      .limit(500),
  ]);
  if (eP) throw eP;
  if (eB) throw eB;
  if (eC) throw eC;

  const pagosFilas: PagoAdmin[] = pagos ?? [];
  const bancosFilas: BancoFila[] = bancos ?? [];
  const comprobantesFilas: ComprobanteFila[] = comprobantes ?? [];

  return (
    <Pagos
      orgId={orgId}
      unidades={unidades ?? []}
      pagos={pagosFilas}
      bancos={bancosFilas}
      comprobantes={comprobantesFilas}
    />
  );
}
