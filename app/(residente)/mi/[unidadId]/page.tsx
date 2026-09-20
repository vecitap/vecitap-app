import { redirect } from "next/navigation";

export default async function PaginaUnidad({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  redirect(`/mi/${unidadId}/recibo`);
}
