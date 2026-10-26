import { Mensajes, type MensajeHistorial } from "@/components/admin/Mensajes";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Mensajes masivos por correo (ronda 7, bloque 7). Server Component: solo
 * carga el historial; la vista previa y el envío los hace la pantalla.
 */
export default async function PaginaMensajes({ params }: { params: Promise<{ orgId: string; edificioId: string }> }) {
  const { edificioId } = await params;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("historial_mensajes", { p_edificio: edificioId });
  if (error) throw error;
  return <Mensajes edificioId={edificioId} historial={(data ?? []) as MensajeHistorial[]} />;
}
