import { notFound } from "next/navigation";
import { Recibo } from "@/components/residente/Recibo";
import { ultimoReciboDe } from "@/lib/residente/recibo";
import { ajustesCobroDe } from "@/lib/cobro";
import { soloEstado } from "@/lib/residente/cuotas";
import { DeudaPorMes } from "@/components/DeudaPorMes";

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
  // Cambio 2 (ING3): el detalle por mes, solo si quien mira ve el saldo (el
  // propietario de una unidad que paga el inquilino ve solo el estado).
  const conDetalle = r.recibo !== null && r.unidad.saldo !== null && !soloEstado(r.unidad);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Recibo unidad={r.unidad} recibo={r.recibo} falla={r.falla} soloUsd={soloUsd} hoy={r.hoy} />
      {conDetalle && <DeudaPorMes unidadId={unidadId} enTarjeta />}
    </div>
  );
}
