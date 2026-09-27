import { CierreMes } from "@/components/admin/CierreMes";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { CategoriaAdmin, ConceptoCobro, PeriodoAdmin } from "@/lib/admin/tipos";

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
  ] = await Promise.all([
    supabase.from("unidades").select("id,codigo").eq("edificio_id", edificioId).eq("activa", true).order("codigo"),
    supabase.from("conceptos_cobro").select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id").or(`edificio_id.eq.${edificioId},edificio_id.is.null`),
    supabase
      .from("periodos")
      .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
      .eq("edificio_id", edificioId)
      .order("anio", { ascending: false })
      .order("mes", { ascending: false }),
    supabase.from("categorias").select("id,nombre,orden").eq("edificio_id", edificioId).order("orden"),
    supabase.rpc("tasa_atrasada"),
  ]);
  if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;

  const tasa = (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null;
  const conceptosFilas: ConceptoCobro[] = conceptos ?? [];
  const periodosFilas: PeriodoAdmin[] = periodos ?? [];
  const categoriasFilas: CategoriaAdmin[] = categorias ?? [];

  return (
    <CierreMes
      orgId={orgId}
      edificioId={edificioId}
      unidades={unidades ?? []}
      conceptos={conceptosFilas}
      periodos={periodosFilas}
      categorias={categoriasFilas}
      tasaValor={tasa?.tasa ? Number(tasa.tasa) : 0}
    />
  );
}
