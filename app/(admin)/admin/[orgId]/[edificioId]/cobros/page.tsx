import { Cobros } from "@/components/admin/Cobros";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { ConceptoCobro } from "@/lib/admin/tipos";
import type { CargoDelMes } from "@/components/admin/CargosUnidad";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/** Portado de Cobros() en app.html:2271-2427 (Server Component: solo carga datos). */
export default async function PaginaCobros({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: conceptos, error }, { data: avance }, { data: abierto, error: eM }, { data: unidades, error: eU }] = await Promise.all([
    supabase
      .from("conceptos_cobro")
      .select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id,cuotas")
      .or(`edificio_id.eq.${edificioId},edificio_id.is.null`)
      .order("orden"),
    // Ronda 7 (bloque 5): cuántas cuotas van de cada extraordinaria.
    supabase.rpc("avance_extraordinarias", { p_edificio: edificioId }),
    // Ronda 10 (C): el mes abierto, para el cargo a una sola unidad.
    supabase
      .from("periodos")
      .select("id,etiqueta")
      .eq("edificio_id", edificioId)
      .eq("estado", "abierto")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("unidades").select("id,codigo").eq("edificio_id", edificioId).eq("activa", true),
  ]);
  if (error || eM || eU) throw error || eM || eU;

  // Los cargos de ese mes: los de Cobros (multa, consumo) y los gastos
  // «Solo a una unidad» (lo que pagó el edificio).
  let cargos: CargoDelMes[] = [];
  if (abierto) {
    const [{ data: deCobros, error: e1 }, { data: directos, error: e2 }] = await Promise.all([
      supabase.from("cargos_unidad").select("id,unidad_id,concepto,referencia,monto,creado_en").eq("periodo_id", abierto.id).order("creado_en"),
      supabase.from("gastos").select("id,unidad_id,concepto,referencia,monto").eq("periodo_id", abierto.id).eq("tipo", "directo").order("orden"),
    ]);
    if (e1 || e2) throw e1 || e2;
    cargos = [
      ...(deCobros ?? []).map((c) => ({ ...c, origen: "cargo" as const, monto: Number(c.monto) })),
      ...(directos ?? [])
        .filter((g) => g.unidad_id)
        .map((g) => ({ id: g.id, unidad_id: g.unidad_id!, concepto: g.concepto ?? "", referencia: g.referencia, monto: Number(g.monto), origen: "gasto" as const })),
    ];
  }

  const conceptosFilas: ConceptoCobro[] = conceptos ?? [];
  const avancePorId = Object.fromEntries((avance ?? []).map((a) => [a.concepto_id, a.emitidas]));
  return (
    <Cobros
      orgId={orgId}
      edificioId={edificioId}
      conceptos={conceptosFilas}
      avance={avancePorId}
      mes={abierto ? { id: abierto.id, etiqueta: abierto.etiqueta ?? "" } : null}
      unidades={ordenarPorCodigo(unidades ?? [], (u) => u.codigo)}
      cargos={cargos}
    />
  );
}
