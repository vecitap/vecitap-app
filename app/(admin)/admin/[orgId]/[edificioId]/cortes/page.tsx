import { notFound } from "next/navigation";
import { Cortes } from "@/components/admin/Cortes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tasaDelDia } from "@/lib/tasa";
import type { PeriodoAdmin, Unidad } from "@/lib/admin/tipos";

/**
 * Portado de Cortes() en admin.html:4918-5617 (Server Component: carga
 * unidades, períodos, organización, edificio y la tasa viva del BCV — la
 * misma que el encabezado de Admin y la que va al recibo en papel). Los
 * recibos del período elegido los carga el Client Component, porque
 * cambian al cambiar de mes sin recargar la página.
 */
export default async function PaginaCortes({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: org, error: eO }, { data: edificio, error: eE }, { data: unidades, error: eU }, { data: periodos, error: eP }] =
    await Promise.all([
      supabase.from("organizaciones").select("nombre,logo_url").eq("id", orgId).single(),
      supabase.from("edificios").select("nombre,rif").eq("id", edificioId).single(),
      supabase
        .from("unidades")
        .select(
          "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))"
        )
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase
        .from("periodos")
        .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
        .eq("edificio_id", edificioId)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false }),
    ]);

  if (eO || eE) notFound();
  if (eU) throw eU;
  if (eP) throw eP;

  const unidadesFilas: Unidad[] = unidades ?? [];
  const periodosFilas: PeriodoAdmin[] = periodos ?? [];
  const tasa = await tasaDelDia(supabase);

  return (
    <Cortes
      orgId={orgId}
      edificioId={edificioId}
      organizacion={org!}
      edificio={edificio!}
      unidades={unidadesFilas}
      periodos={periodosFilas}
      tasa={tasa}
    />
  );
}
