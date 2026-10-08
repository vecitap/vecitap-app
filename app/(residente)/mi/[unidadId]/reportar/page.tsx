import { notFound, redirect } from "next/navigation";
import { FormularioReportarPago } from "@/components/residente/FormularioReportarPago";
import { misUnidadesSesion } from "@/lib/residente/datos";
import { soloEstado } from "@/lib/residente/cuotas";
import { crearClienteServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cache";

export default async function PaginaReportar({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();

  // getUser() y mis_unidades() memoizados por petición: [unidadId]/layout.tsx
  // ya los llamó (ver lib/supabase/cache.ts y lib/residente/datos.ts).
  const user = await usuarioActual();
  if (!user) redirect(`/entrar?volver=/mi/${unidadId}/reportar`);

  const { data: unidades } = await misUnidadesSesion();
  const unidad = unidades?.find((u) => u.unidad_id === unidadId);
  if (!unidad) notFound();
  // Ronda 2 (caso 35): la unidad la paga su inquilino y quien entra es el
  // propietario. La pestaña no se muestra; esto cubre el enlace directo o
  // el selector de unidades, que conserva la pestaña al cambiar de unidad.
  // La base sigue aceptando el pago (un propietario puede pagar por su
  // inquilino): el bloqueo es solo de pantalla, decisión del 08-oct.
  if (soloEstado(unidad)) redirect(`/mi/${unidadId}/recibo`);

  const { data: bancos } = await supabase
    .from("bancos")
    .select("codigo,nombre,corto")
    .eq("activo", true)
    .order("orden");

  return (
    <FormularioReportarPago
      orgId={unidad.org_id}
      unidadId={unidad.unidad_id}
      usuarioId={user.id}
      bancos={bancos ?? []}
    />
  );
}
