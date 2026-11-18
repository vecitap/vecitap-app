import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { BancoFila, ComprobanteFila, PagoAdmin } from "@/lib/admin/tipos";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/**
 * Pagos recibidos (cambio 3, plan 1.1 d): misma consulta y mismo armado en
 * línea y en la copia sin conexión.
 *
 * Los pagos y los comprobantes se filtran por las unidades del edificio,
 * igual que el original (`.in("unidad_id", ids)`): `pagos` es por
 * organización, no por edificio. Del comprobante se guardan los datos, nunca
 * la imagen.
 */
export type FilasPagos = {
  unidades: { id: string; codigo: string }[];
  pagos: PagoAdmin[];
  bancos: BancoFila[];
  comprobantes: ComprobanteFila[];
};

export async function consultarPagos(supabase: SupabaseClient<Database>, edificioId: string): Promise<FilasPagos> {
  const { data: unidades, error: eU } = await supabase.from("unidades").select("id,codigo").eq("edificio_id", edificioId).order("codigo");
  if (eU) throw eU;

  const ids = (unidades ?? []).map((u) => u.id);
  if (ids.length === 0) return { unidades: [], pagos: [], bancos: [], comprobantes: [] };

  const [{ data: pagos, error: eP }, { data: bancos, error: eB }, { data: comprobantes, error: eC }] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id,unidad_id,fecha,monto,moneda,tasa_aplicada,monto_usd,metodo,destino,referencia,banco,banco_codigo,telefono_origen,documento_origen,correo_origen,reportado_por,estado,periodo_cierre_id,nota,grupo_id,tasa_manual,tasa_motivo,tasa_motivo_detalle"
      )
      .in("unidad_id", ids)
      .order("fecha", { ascending: false })
      .limit(300),
    supabase.from("bancos").select("codigo,nombre,corto").eq("activo", true).order("orden"),
    supabase.from("comprobantes").select("id,pago_id,ruta,tipo,bytes,sha256,subido_en,imagen_borrada_en").in("unidad_id", ids).limit(500),
  ]);
  if (eP) throw eP;
  if (eB) throw eB;
  if (eC) throw eC;

  return { unidades: unidades ?? [], pagos: pagos ?? [], bancos: bancos ?? [], comprobantes: comprobantes ?? [] };
}

export function armarPropsPagos(filas: FilasPagos) {
  return { ...filas, unidades: ordenarPorCodigo(filas.unidades, (u) => u.codigo) };
}
