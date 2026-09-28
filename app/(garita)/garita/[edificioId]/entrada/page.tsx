import { VistaEntrada } from "@/components/garita/VistaEntrada";

export default async function PaginaEntrada({ params }: { params: Promise<{ edificioId: string }> }) {
  const { edificioId } = await params;
  return <VistaEntrada edificioId={edificioId} />;
}
