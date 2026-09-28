import { VistaConsultar } from "@/components/garita/VistaConsultar";

export default async function PaginaConsultar({ params }: { params: Promise<{ edificioId: string }> }) {
  const { edificioId } = await params;
  return <VistaConsultar edificioId={edificioId} />;
}
