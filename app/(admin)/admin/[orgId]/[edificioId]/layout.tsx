import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { edificiosDeOrganizacion } from "@/lib/admin/edificios-organizacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esUuid } from "@/lib/validacion";

/**
 * Gate de edificio (decisión de Nicolás al revisar el inventario): un
 * edificio no visible para este usuario (de otra organización, o de una
 * organización donde no tiene membresía con alcance a ese edificio — ver
 * docs/inventario-admin.md sección 3, rol `junta` solo ve su edificio)
 * cae en notFound(), mismo patrón que /mi/[unidadId]/layout.tsx.
 *
 * Solo gate: el "chrome" (columna lateral, selector de edificio, nav de
 * secciones, tasa) vive en el layout de `[orgId]` desde el bloque 5, que
 * es donde está en `main` (una sola columna para toda la organización, no
 * una por edificio). Cada página de sección hace su propio fetch de
 * unidades/saldos/conceptos/periodos, igual que /mi/[unidadId]/*.
 */
export default async function LayoutEdificio({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  // orgId ya lo validó el layout padre. edificioId es nuevo en este nivel:
  // formato inválido, 404 directo, antes de gastar la consulta.
  if (!esUuid(edificioId)) notFound();

  const supabase = await crearClienteServidor();

  // La autorización real, sin tocar: edificios_visibles() es RLS-aware.
  const { data: visibles, error: errorVisibles } = await supabase.rpc("edificios_visibles");
  if (errorVisibles) notFound();
  if (!visibles?.includes(edificioId)) notFound();

  // Chequeo de consistencia (¿el edificio es de ESTA organización, no solo
  // visible para el usuario?): antes era una consulta propia a `edificios`;
  // ahora lee de edificiosDeOrganizacion(orgId), memoizada por petición —
  // [orgId]/layout.tsx, un nivel más arriba, ya la llamó, así que esto lee
  // el resultado ya resuelto en vez de golpear la red de nuevo. Mismo
  // chequeo, mismo resultado (ver lib/admin/edificios-organizacion.ts).
  const { data: edificios, error } = await edificiosDeOrganizacion(orgId);
  if (error) throw error;
  if (!edificios?.some((e) => e.id === edificioId)) notFound();

  return <>{children}</>;
}
