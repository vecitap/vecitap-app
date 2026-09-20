import { notFound, redirect } from "next/navigation";
import { FormularioReportarPago } from "@/components/residente/FormularioReportarPago";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function PaginaReportar({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?volver=/mi/${unidadId}/reportar`);

  const { data: unidades } = await supabase.rpc("mis_unidades");
  const unidad = unidades?.find((u) => u.unidad_id === unidadId);
  if (!unidad) notFound();

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
