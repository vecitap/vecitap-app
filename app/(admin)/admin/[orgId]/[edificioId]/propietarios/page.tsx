import { Propietarios } from "@/components/admin/Propietarios";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { SaldoActual, UnidadConPaga } from "@/lib/admin/tipos";
import { calcularMetricasInicio } from "@/lib/admin/metricas";

/** Portado de Propietarios() en app.html:1449-1566 (Server Component: solo carga datos). */
export default async function PaginaPropietarios({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: unidades, error: e1 }, { data: saldos, error: e2 }] = await Promise.all([
    supabase
      .from("unidades")
      .select(
        "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,paga,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))"
      )
      .eq("edificio_id", edificioId)
      .order("codigo"),
    supabase
      .from("saldos_actuales")
      .select("unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado")
      .eq("edificio_id", edificioId)
      .order("codigo"),
  ]);
  if (e1 || e2) throw e1 || e2;

  const unidadesFilas: UnidadConPaga[] = unidades ?? [];
  const saldosFilas: SaldoActual[] = saldos ?? [];
  const { sumaAlicuotas } = calcularMetricasInicio(unidadesFilas, saldosFilas);

  return (
    <Propietarios
      orgId={orgId}
      edificioId={edificioId}
      unidades={unidadesFilas}
      saldos={saldosFilas}
      sumaAlicuotas={sumaAlicuotas}
    />
  );
}
