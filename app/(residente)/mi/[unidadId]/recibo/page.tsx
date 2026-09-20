import { notFound } from "next/navigation";
import { Recibo } from "@/components/residente/Recibo";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { CategoriaRecibo, ConceptoRecibo, RegistroRecibo } from "@/lib/residente/tipos";

/**
 * Portado de la parte de recibos en cargar() de Unidad(), residente.html:
 * 429-456. El recibo se lee directo de la tabla, no por una función (ver
 * el comentario original: mi_recibo() daba cero filas por la API aunque
 * la consulta era correcta en la base — leer la tabla es un paso menos y
 * quien decide qué puede ver cada quien es RLS, no esta consulta).
 */
export default async function PaginaRecibo({
  params,
}: {
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();

  const { data: unidades } = await supabase.rpc("mis_unidades");
  const unidad = unidades?.find((u) => u.unidad_id === unidadId);
  // El layout ya llamó notFound() si la unidad no es de este usuario;
  // esto es solo defensa por si algún día esta página se renderiza sola.
  if (!unidad) notFound();

  const { data: filas, error } = await supabase
    .from("recibos")
    .select(
      "numero,total,cuota,directos,anterior,a_favor,mora,honorario,servicio,conceptos,detalle,tasa_bcv,vence_el,alicuota,periodos!inner(anio,mes,etiqueta,estado)"
    )
    .eq("unidad_id", unidadId)
    .eq("periodos.estado", "cerrado")
    .limit(36);

  if (error) {
    return <Recibo unidad={unidad} recibo={null} falla={error.message} />;
  }

  // El orden lo pone el calendario del período, nunca la hora en que se
  // escribió la fila: varios meses cerrados en una misma transacción
  // comparten esa marca y el orden saldría al azar.
  const ordenadas = (filas ?? [])
    .slice()
    .sort((a, b) => b.periodos.anio - a.periodos.anio || b.periodos.mes - a.periodos.mes);
  const ultimo = ordenadas[0];

  const recibo: RegistroRecibo | null = ultimo
    ? {
        ...ultimo,
        conceptos: Array.isArray(ultimo.conceptos) ? (ultimo.conceptos as unknown as ConceptoRecibo[]) : [],
        detalle: Array.isArray(ultimo.detalle) ? (ultimo.detalle as unknown as CategoriaRecibo[]) : [],
        anio: ultimo.periodos.anio,
        mes: ultimo.periodos.mes,
        etiqueta: ultimo.periodos.etiqueta,
        edificio: unidad.edificio,
      }
    : null;

  return <Recibo unidad={unidad} recibo={recibo} falla={null} />;
}
