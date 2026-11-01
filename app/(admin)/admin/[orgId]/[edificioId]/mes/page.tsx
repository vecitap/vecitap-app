import { CierreMes } from "@/components/admin/CierreMes";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { CategoriaAdmin, ConceptoCobro, PeriodoAdmin } from "@/lib/admin/tipos";
import type { CargoDelMes } from "@/components/admin/CargosUnidad";
import { ordenarPorCodigo } from "@/lib/orden-unidades";

/** Portado de CierreMes() en app.html:2435-3074 (Server Component: solo carga datos). */
export default async function PaginaCierreMes({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

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

  const tasa = (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null;
  const conceptosFilas: ConceptoCobro[] = conceptos ?? [];
  const periodosFilas: PeriodoAdmin[] = periodos ?? [];
  const categoriasFilas: CategoriaAdmin[] = categorias ?? [];

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

  return (
    <CierreMes
      orgId={orgId}
      edificioId={edificioId}
      unidades={ordenarPorCodigo(unidades ?? [], (u) => u.codigo)}
      conceptos={conceptosFilas}
      periodos={periodosFilas}
      categorias={categoriasFilas}
      tasaValor={tasa?.tasa ? Number(tasa.tasa) : 0}
      tasaFecha={tasa?.fecha ?? null}
      avance={Object.fromEntries((avance ?? []).map((a) => [a.concepto_id, a.emitidas]))}
      cargos={cargos}
    />
  );
}
