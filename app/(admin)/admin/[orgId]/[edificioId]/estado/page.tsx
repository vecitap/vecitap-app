import { notFound } from "next/navigation";
import { EstadoFinancieroPantalla } from "@/components/admin/EstadoFinanciero";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Estado financiero del edificio (ronda 7, bloque 8). Server Component: carga
 * los meses del edificio para elegir el período; los números los pide la
 * pantalla a `estado_financiero()` cada vez que cambia el rango.
 */
export default async function PaginaEstado({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { orgId, edificioId } = await params;
  // Al volver del PDF, la dirección trae el rango que estaba elegido.
  const { desde, hasta } = await searchParams;
  const supabase = await crearClienteServidor();
  const [{ data: edificio }, { data: periodos }] = await Promise.all([
    supabase.from("edificios").select("nombre").eq("id", edificioId).maybeSingle(),
    supabase.from("periodos").select("anio,mes,etiqueta,estado").eq("edificio_id", edificioId).order("anio").order("mes"),
  ]);
  if (!edificio) notFound();
  return (
    <EstadoFinancieroPantalla
      orgId={orgId} edificioId={edificioId} edificio={edificio.nombre} periodos={periodos ?? []}
      desdeInicial={desde}
      hastaInicial={hasta}
    />
  );
}
