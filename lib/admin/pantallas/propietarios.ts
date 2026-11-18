import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { SaldoActual, UnidadConPaga } from "@/lib/admin/tipos";
import { calcularMetricasInicio } from "@/lib/admin/metricas";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/**
 * Propietarios, separado en «consultar» y «armar» (cambio 3, plan
 * docs/plan-sin-conexion.md, 1.1 d).
 *
 * - `consultarPropietarios` sirve con el cliente del servidor (la página) y
 *   con el del navegador (la copia local): las dos usan la misma consulta,
 *   con la RLS del usuario.
 * - `armarPropsPropietarios` es la única transformación de filas a props.
 *   La usan la página en línea y la cáscara sin conexión, para que las dos
 *   versiones no puedan divergir.
 */

export type FilasPropietarios = {
  unidades: UnidadConPaga[];
  saldos: SaldoActual[];
};

export async function consultarPropietarios(
  supabase: SupabaseClient<Database>,
  edificioId: string
): Promise<FilasPropietarios> {
  const [{ data: unidades, error: e1 }, { data: saldos, error: e2 }] = await Promise.all([
    supabase
      .from("unidades")
      .select(
        "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,paga,tipo,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo,correo_respaldo))"
      )
      .eq("edificio_id", edificioId)
      .order("codigo"),
    supabase
      .from("saldos_actuales")
      .select("unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado")
      .eq("edificio_id", edificioId)
      .order("codigo"),
  ]);
  if (e1 || e2) throw e1 || e2;
  return { unidades: unidades ?? [], saldos: saldos ?? [] };
}

export function armarPropsPropietarios(filas: FilasPropietarios) {
  // Ronda 9 (B3): orden natural por código en todas las listas.
  const unidades = ordenarPorCodigo(filas.unidades, (u) => u.codigo);
  const saldos = ordenarPorCodigo(filas.saldos, (s) => s.codigo);
  const { sumaAlicuotas } = calcularMetricasInicio(unidades, saldos);
  return { unidades, saldos, sumaAlicuotas };
}
