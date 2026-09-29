import { notFound, redirect } from "next/navigation";
import { InvitarVisitas } from "@/components/residente/InvitarVisitas";
import { MisVehiculos } from "@/components/residente/MisVehiculos";
import { QuienHaEntrado } from "@/components/residente/QuienHaEntrado";
import { misUnidadesSesion } from "@/lib/residente/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cache";

/**
 * Portado de la pestaña "Mis visitas" (`Visitas()`) en index.html:725-1113 —
 * ver docs/inventario-main.md, sección 2.1. El SQL de
 * `crear_invitacion_visita`/`anular_invitacion_visita` ya se confirmó (ver
 * `docs/estado-migracion.md`, bloque 8), así que las cuatro secciones de
 * main quedan completas: `InvitarVisitas` cubre "Invitar a alguien" e
 * "Invitaciones activas" (V1/V2), `MisVehiculos` cubre "Mis vehículos"
 * (V3/V4) y `QuienHaEntrado` es de solo lectura (`mis_visitas`).
 *
 * El gate por módulo es del lado del servidor, a propósito: a diferencia
 * de main (donde "Mis visitas" es una pestaña de estado dentro de la misma
 * página, y nunca hay una URL propia que visitar), acá SÍ hay una URL
 * real. Sin este `notFound()`, alguien podría entrar directo a
 * `/mi/<unidad>/visitas` de un edificio sin el módulo `garita` contratado.
 */
export default async function PaginaVisitas({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();

  // getUser() y mis_unidades() memoizados por petición: [unidadId]/layout.tsx
  // ya los llamó (ver lib/supabase/cache.ts y lib/residente/datos.ts).
  const user = await usuarioActual();
  if (!user) redirect(`/entrar?volver=/mi/${unidadId}/visitas`);

  const { data: unidades } = await misUnidadesSesion();
  const unidad = unidades?.find((u) => u.unidad_id === unidadId);
  if (!unidad) notFound();

  const { data: modulos } = await supabase.rpc("mis_modulos", { p_edificio: unidad.edificio_id });
  const garita = (modulos ?? []).find((m) => m.clave === "garita");
  if (!garita?.activo) notFound();

  const [{ data: invitaciones, error: e1 }, { data: visitas, error: e2 }, { data: vehiculos, error: e3 }] = await Promise.all([
    supabase
      .from("invitaciones_visita")
      .select("id,codigo,nombre,documento,placa,desde,hasta,usos,usos_max,estado")
      .eq("unidad_id", unidadId)
      .order("creada_en", { ascending: false })
      .limit(20),
    supabase.rpc("mis_visitas", { p_unidad: unidadId, p_limite: 20 }),
    supabase.from("vehiculos").select("id,placa,marca,modelo,color,puesto").eq("unidad_id", unidadId).order("placa"),
  ]);

  if (e1 || e2 || e3) throw e1 || e2 || e3;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <InvitarVisitas edificio={unidad.edificio} unidadCodigo={unidad.codigo} unidadId={unidadId} invitaciones={invitaciones ?? []} />

      <MisVehiculos orgId={unidad.org_id} edificioId={unidad.edificio_id} unidadId={unidadId} vehiculos={vehiculos ?? []} />

      <QuienHaEntrado visitas={visitas ?? []} />
    </div>
  );
}
