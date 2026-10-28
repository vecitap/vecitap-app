import { notFound } from "next/navigation";
import { Recibo } from "@/components/residente/Recibo";
import { ultimoReciboDe } from "@/lib/residente/recibo";
import { ajustesCobroDe } from "@/lib/cobro";

/**
 * "Mi recibo". La carga vive en lib/residente/recibo.ts porque la comparte
 * con la versión para imprimir (`recibo/papel/route.ts`, ronda 4).
 */
export default async function PaginaRecibo({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;

  // El layout ya llamó notFound() si la unidad no es de este usuario; esto
  // es solo defensa por si algún día esta página se renderiza sola.
  const r = await ultimoReciboDe(unidadId);
  if (!r.unidad) notFound();

  const { soloUsd } = await ajustesCobroDe(r.unidad.org_id);
  return <Recibo unidad={r.unidad} recibo={r.recibo} falla={r.falla} soloUsd={soloUsd} hoy={r.hoy} />;
}
