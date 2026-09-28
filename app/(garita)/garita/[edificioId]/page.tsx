import { redirect } from "next/navigation";
import { SECCION_INICIAL } from "@/lib/garita/secciones";

/** La garita abre siempre en Entrada, igual que garita.html:992. */
export default async function PaginaGaritaEdificio({
  params,
}: {
  params: Promise<{ edificioId: string }>;
}) {
  const { edificioId } = await params;
  redirect(`/garita/${edificioId}/${SECCION_INICIAL}`);
}
