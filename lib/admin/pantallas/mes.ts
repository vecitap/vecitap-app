import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { CategoriaAdmin, ConceptoCobro, GastoAdmin, PeriodoAdmin } from "@/lib/admin/tipos";
import type { CargoDelMes } from "@/components/admin/CargosUnidad";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/**
 * Gastos del mes / Cierre del mes (cambio 3, plan 1.1 d): misma consulta y
 * mismo armado en línea y en la copia sin conexión.
 *
 * Los gastos del mes abierto los pide CierreMes desde el navegador (cambian
 * sin recargar la página); su select es `SELECT_GASTOS_MES`, el mismo que usa
 * la copia (`consultarGastosAbierto`).
 */
export const SELECT_GASTOS_MES = "id,concepto,referencia,monto,tipo,unidad_id,bolsillo,categoria_id,orden";

type TasaFila = Database["public"]["Functions"]["tasa_atrasada"]["Returns"][number];
type AvanceFila = Database["public"]["Functions"]["avance_extraordinarias"]["Returns"][number];

export type FilasMes = {
  unidades: { id: string; codigo: string }[];
  conceptos: ConceptoCobro[];
  periodos: PeriodoAdmin[];
  categorias: CategoriaAdmin[];
  tasa: TasaFila | null;
  avance: AvanceFila[];
  cargos: CargoDelMes[];
};

export async function consultarMes(supabase: SupabaseClient<Database>, edificioId: string): Promise<FilasMes> {
  const [
    { data: unidades, error: e1 },
    { data: conceptos, error: e2 },
    { data: periodos, error: e3 },
    { data: categorias, error: e4 },
    { data: tasaFila },
    { data: avance },
  ] = await Promise.all([
    supabase.from("unidades").select("id,codigo").eq("edificio_id", edificioId).eq("activa", true).order("codigo"),
    supabase.from("conceptos_cobro").select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id,cuotas").or(`edificio_id.eq.${edificioId},edificio_id.is.null`).order("orden"),
    supabase
      .from("periodos")
      .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
      .eq("edificio_id", edificioId)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
    supabase.from("categorias").select("id,nombre,orden").eq("edificio_id", edificioId).order("orden"),
    supabase.rpc("tasa_atrasada"),
    // Ronda 12 (C): las cuotas extraordinarias pasaron de Cobros a esta página;
    // cuántas cuotas van de cada una (ronda 7, bloque 5).
    supabase.rpc("avance_extraordinarias", { p_edificio: edificioId }),
  ]);
  if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;

  const periodosFilas: PeriodoAdmin[] = periodos ?? [];

  // Ronda 12 (C): «Cargo a una sola unidad» también pasó aquí. Los cargos del
  // mes abierto: los de `cargos_unidad` (multa, consumo) y los gastos directos
  // (lo que pagó el edificio).
  const abierto = periodosFilas.find((p) => p.estado === "abierto") ?? null;
  let cargos: CargoDelMes[] = [];
  if (abierto) {
    const [{ data: deCargos, error: e5 }, { data: directos, error: e6 }] = await Promise.all([
      supabase.from("cargos_unidad").select("id,unidad_id,concepto,referencia,monto,tipo,creado_en").eq("periodo_id", abierto.id).order("creado_en"),
      supabase.from("gastos").select("id,unidad_id,concepto,referencia,monto").eq("periodo_id", abierto.id).eq("tipo", "directo").order("orden"),
    ]);
    if (e5 || e6) throw e5 || e6;
    cargos = [
      ...(deCargos ?? []).map((c) => ({ ...c, origen: "cargo" as const, monto: Number(c.monto), multa: c.tipo === "multa" })),
      ...(directos ?? [])
        .filter((g) => g.unidad_id)
        .map((g) => ({ id: g.id, unidad_id: g.unidad_id!, concepto: g.concepto ?? "", referencia: g.referencia, monto: Number(g.monto), origen: "gasto" as const, multa: false })),
    ];
  }

  return {
    unidades: unidades ?? [],
    conceptos: conceptos ?? [],
    periodos: periodosFilas,
    categorias: categorias ?? [],
    tasa: (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null,
    avance: avance ?? [],
    cargos,
  };
}

export function armarPropsMes(filas: FilasMes) {
  return {
    unidades: ordenarPorCodigo(filas.unidades, (u) => u.codigo),
    conceptos: filas.conceptos,
    periodos: filas.periodos,
    categorias: filas.categorias,
    tasaValor: filas.tasa?.tasa ? Number(filas.tasa.tasa) : 0,
    tasaFecha: filas.tasa?.fecha ?? null,
    avance: Object.fromEntries(filas.avance.map((a) => [a.concepto_id, a.emitidas])),
    cargos: filas.cargos,
  };
}

/** Los gastos del mes abierto, para la copia (lo que CierreMes pide en línea). */
export async function consultarGastosAbierto(supabase: SupabaseClient<Database>, periodos: PeriodoAdmin[]): Promise<GastoAdmin[]> {
  const abierto = periodos.find((p) => p.estado === "abierto");
  if (!abierto) return [];
  const { data, error } = await supabase.from("gastos").select(SELECT_GASTOS_MES).eq("periodo_id", abierto.id).order("orden").order("creado_en");
  if (error) throw error;
  return data ?? [];
}
