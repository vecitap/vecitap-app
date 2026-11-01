import { redirect } from "next/navigation";

/**
 * Ronda 12 (C): «Cobros» salió del menú. Las reglas fijas están en Ajustes
 * («Reglas de cobro del edificio»); las cuotas extraordinarias y el cargo a
 * una sola unidad, en Gastos del mes. La ruta queda para los enlaces
 * guardados y lleva a Gastos del mes.
 */
export default async function PaginaCobros({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  redirect(`/admin/${orgId}/${edificioId}/mes`);
}
