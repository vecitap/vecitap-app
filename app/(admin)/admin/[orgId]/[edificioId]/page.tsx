import { redirect } from "next/navigation";

export default async function PaginaEdificio({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  redirect(`/admin/${orgId}/${edificioId}/inicio`);
}
