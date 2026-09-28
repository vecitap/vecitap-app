import { VistaBitacora } from "@/components/garita/VistaBitacora";

export default async function PaginaBitacora({ params }: { params: Promise<{ edificioId: string }> }) {
  const { edificioId } = await params;
  return <VistaBitacora edificioId={edificioId} />;
}
