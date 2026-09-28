import { VistaAdentro } from "@/components/garita/VistaAdentro";

export default async function PaginaAdentro({ params }: { params: Promise<{ edificioId: string }> }) {
  const { edificioId } = await params;
  return <VistaAdentro edificioId={edificioId} />;
}
