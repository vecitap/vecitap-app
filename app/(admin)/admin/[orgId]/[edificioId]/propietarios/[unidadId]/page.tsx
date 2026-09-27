import { notFound } from "next/navigation";
import { Ficha } from "@/components/admin/Ficha";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Unidad } from "@/lib/admin/tipos";

/** Portado de Ficha() en app.html:1977-2132 — antes drawer superpuesto, ahora subruta propia (ver docs/inventario-admin.md sección 2). */
export default async function PaginaFicha({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string; unidadId: string }>;
}) {
  const { orgId, edificioId, unidadId } = await params;
  const supabase = await crearClienteServidor();

  const [
    { data: unidad, error: e1 },
    { data: saldo, error: e2 },
    { data: edificio, error: e3 },
    { data: org, error: e4 },
    { data: historial, error: e5 },
    { data: pendientes, error: e6 },
    { data: tasaFila },
  ] = await Promise.all([
    supabase
      .from("unidades")
      .select(
        "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))"
      )
      .eq("id", unidadId)
      .eq("edificio_id", edificioId)
      .maybeSingle(),
    supabase
      .from("saldos_actuales")
      .select("unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado")
      .eq("unidad_id", unidadId)
      .maybeSingle(),
    supabase.from("edificios").select("id,nombre,rif,direccion").eq("id", edificioId).single(),
    supabase.from("organizaciones").select("id,nombre").eq("id", orgId).single(),
    supabase.rpc("historial_unidad", { p_unidad: unidadId }),
    supabase
      .from("pagos")
      .select("id,fecha,monto_usd,metodo,referencia,destino")
      .eq("unidad_id", unidadId)
      .eq("estado", "reportado")
      .order("fecha"),
    supabase.rpc("tasa_atrasada"),
  ]);
  const tasa = (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null;

  if (e1 || e3 || e4 || e5 || e6) throw e1 || e3 || e4 || e5 || e6;
  if (!unidad) notFound();
  // Sin fila en saldos_actuales (por ejemplo, una unidad inactiva sin
  // movimientos): no es un 404, la Ficha muestra el total en cero.
  if (e2) throw e2;

  const unidadFila: Unidad = unidad;

  return (
    <Ficha
      orgId={orgId}
      edificioId={edificioId}
      unidad={unidadFila}
      saldo={saldo}
      edificio={edificio}
      organizacion={org}
      historial={historial ?? []}
      pendientes={pendientes ?? []}
      tasa={tasa?.tasa ? Number(tasa.tasa) : null}
    />
  );
}
