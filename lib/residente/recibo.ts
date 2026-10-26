import { misUnidadesSesion } from "@/lib/residente/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tasaDelDia } from "@/lib/tasa";
import type { CategoriaRecibo, ConceptoRecibo, RegistroRecibo } from "@/lib/residente/tipos";
import type { Database } from "@/types/supabase";

type Unidad = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

export type UltimoRecibo =
  | { unidad: null }
  | { unidad: Unidad; recibo: RegistroRecibo | null; falla: string | null };

/**
 * El último recibo cerrado de una unidad del portal, con la tasa de hoy.
 * Lo usan la página "Mi recibo" y su versión para imprimir
 * (`/mi/[unidad]/recibo/papel`, ronda 4): las dos tienen que mostrar el
 * mismo recibo.
 *
 * Portado de la parte de recibos en cargar() de Unidad(), residente.html:
 * 429-456. El recibo se lee directo de la tabla, no por una función (ver
 * el comentario original: mi_recibo() daba cero filas por la API aunque
 * la consulta era correcta en la base — leer la tabla es un paso menos y
 * quien decide qué puede ver cada quien es RLS, no esta consulta).
 *
 * `unidad: null` = la unidad no es de esta sesión (`mis_unidades()`).
 */
export async function ultimoReciboDe(unidadId: string): Promise<UltimoRecibo> {
  // mis_unidades() memoizado por petición (ver lib/residente/datos.ts).
  const { data: unidades } = await misUnidadesSesion();
  const unidad = unidades?.find((u) => u.unidad_id === unidadId);
  if (!unidad) return { unidad: null };

  const supabase = await crearClienteServidor();
  // El recibo y la tasa del día (index.html:609-621, la de HOY, no la del
  // día en que se emitió el recibo) no dependen entre sí: van en paralelo.
  const [{ data: filas, error }, viva] = await Promise.all([
    supabase
      .from("recibos")
      .select(
        "numero,total,cuota,directos,anterior,a_favor,mora,honorario,anterior_hon,servicio,conceptos,detalle,tasa_bcv,vence_el,alicuota,periodos!inner(anio,mes,etiqueta,estado)"
      )
      .eq("unidad_id", unidadId)
      .eq("periodos.estado", "cerrado")
      .limit(36),
    tasaDelDia(supabase),
  ]);

  if (error) return { unidad, recibo: null, falla: error.message };

  // Si la base no tiene ninguna tasa viva, el recibo cae a la congelada del
  // período y lo dice.
  const tasaHoy = viva ? { valor: viva.valor, fecha: viva.actualizada, dias: viva.dias } : null;

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
        tasaHoy,
      }
    : null;

  return { unidad, recibo, falla: null };
}
