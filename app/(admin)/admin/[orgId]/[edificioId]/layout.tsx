import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NavAdmin } from "@/components/admin/NavAdmin";
import { NuevoEdificio } from "@/components/admin/NuevoEdificio";
import { SelectorEdificio } from "@/components/admin/SelectorEdificio";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esUuid } from "@/lib/validacion";

/**
 * Gate de edificio (decisión de Nicolás al revisar el inventario): un
 * edificio no visible para este usuario (de otra organización, o de una
 * organización donde no tiene membresía con alcance a ese edificio — ver
 * docs/inventario-admin.md sección 3, rol `junta` solo ve su edificio)
 * cae en notFound(), mismo patrón que /mi/[unidadId]/layout.tsx.
 *
 * Solo carga lo necesario para el "chrome" (selector de edificio + nav de
 * secciones) — cada página de sección hace su propio fetch de
 * unidades/saldos/conceptos/periodos, igual que /mi/[unidadId]/*
 * (mis_unidades() se repite en cada página en vez de pasar props desde el
 * layout, porque Next.js no tiene esa vía).
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

  const { data: visibles, error: errorVisibles } = await supabase.rpc("edificios_visibles");
  if (errorVisibles) notFound();
  if (!visibles?.includes(edificioId)) notFound();

  const { data: edificios, error } = await supabase
    .from("edificios")
    .select("id,nombre")
    .eq("org_id", orgId)
    .order("nombre");
  if (error) throw error;

  const edificioActual = edificios?.find((e) => e.id === edificioId);
  if (!edificioActual) notFound();

  const hayVarios = !!edificios && edificios.length > 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", marginBottom: hayVarios ? 0 : 16 }}>
        {hayVarios && <SelectorEdificio orgId={orgId} edificios={edificios!} edificioIdActual={edificioId} />}
        <div style={{ marginLeft: "auto", marginBottom: hayVarios ? 16 : 0 }}>
          <NuevoEdificio orgId={orgId} />
        </div>
      </div>
      <NavAdmin orgId={orgId} edificioId={edificioId} />
      {children}
    </div>
  );
}
