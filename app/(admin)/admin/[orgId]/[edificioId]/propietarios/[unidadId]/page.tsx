import { notFound } from "next/navigation";
import { Ficha } from "@/components/admin/Ficha";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esUuid } from "@/lib/validacion";
import { consultarFicha } from "@/lib/admin/pantallas/ficha";

/**
 * Portado de Ficha() en app.html:1977-2132 — antes drawer superpuesto, ahora subruta propia (ver docs/inventario-admin.md sección 2).
 * La consulta vive en lib/admin/pantallas/ficha.ts, junto con el armado
 * desde la copia sin conexión (cambio 3).
 */
export default async function PaginaFicha({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string; unidadId: string }>;
}) {
  const { orgId, edificioId, unidadId } = await params;
  // orgId/edificioId ya los validaron los layouts padre. unidadId es nuevo
  // en este nivel: formato inválido, 404 directo, antes de las consultas.
  if (!esUuid(unidadId)) notFound();

  const supabase = await crearClienteServidor();
  const filas = await consultarFicha(supabase, { orgId, edificioId, unidadId });
  if (!filas) notFound();

  return <Ficha orgId={orgId} edificioId={edificioId} {...filas} />;
}
