import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ConceptoCobro, PeriodoAdmin, SaldoActual, Unidad } from "@/lib/admin/tipos";
import { calcularMetricasInicio } from "@/lib/admin/metricas";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/**
 * Inicio, separado en «consultar» y «armar» (cambio 3, plan 1.1 d): la página
 * en línea y la copia sin conexión usan las mismas consultas y la misma
 * transformación. La tolerancia de alícuota viene aparte (de la lista de
 * edificios de la organización, que ya trae el layout).
 */
export type FilasInicio = {
  unidades: Unidad[];
  saldos: SaldoActual[];
  conceptos: Pick<ConceptoCobro, "id" | "nombre" | "bolsillo" | "modo" | "monto" | "iva" | "orden" | "activo" | "edificio_id">[];
  periodos: PeriodoAdmin[];
};

export async function consultarInicio(supabase: SupabaseClient<Database>, edificioId: string): Promise<FilasInicio> {
  const [{ data: unidades, error: e1 }, { data: saldos, error: e2 }, { data: conceptos, error: e3 }, { data: periodos, error: e4 }] =
    await Promise.all([
      supabase
        .from("unidades")
        .select("id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))")
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase
        .from("saldos_actuales")
        .select("unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado")
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase.from("conceptos_cobro").select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id").or(`edificio_id.eq.${edificioId},edificio_id.is.null`),
      supabase
        .from("periodos")
        .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
        .eq("edificio_id", edificioId)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false }),
    ]);
  if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;
  return { unidades: unidades ?? [], saldos: saldos ?? [], conceptos: conceptos ?? [], periodos: periodos ?? [] };
}

export function armarPropsInicio(filas: FilasInicio) {
  // Ronda 9 (B3): orden natural por código en todas las listas.
  const unidades = ordenarPorCodigo(filas.unidades, (u) => u.codigo);
  const saldos = ordenarPorCodigo(filas.saldos, (s) => s.codigo);
  const metricas = calcularMetricasInicio(unidades, saldos);
  const cerrados = filas.periodos.filter((p) => p.estado === "cerrado");
  const periodoAbierto = filas.periodos.find((p) => p.estado === "abierto") ?? null;
  const hayConceptos = filas.conceptos.some((c) => c.activo);
  const usaPresupuesto = filas.conceptos.some((c) => c.activo && c.modo.startsWith("presupuesto"));
  // Mismo literal que main (admin.html:1620). Ver docs/casos-de-uso-mejorados.md, caso 11.
  const morosos = [...saldos]
    .filter((s) => (Number(s.total) || 0) > 0.01)
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 6);
  return {
    hayUnidades: unidades.length > 0,
    saldos,
    ...metricas,
    ultimo: cerrados[0] ?? null,
    cantidadCerrados: cerrados.length,
    periodoAbierto,
    hayConceptos,
    usaPresupuesto,
    morosos,
  };
}

export type PropsInicio = ReturnType<typeof armarPropsInicio>;
