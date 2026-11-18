import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/supabase";
import type { OrganizacionAdmin, SaldoActual, UnidadConPaga } from "@/lib/admin/tipos";
import type { FilasPropietarios } from "./propietarios";

/**
 * Ficha de una unidad (cambio 3, plan 1.1 d).
 *
 * En línea, `consultarFicha` pide lo de UNA unidad (la página). Sin conexión
 * no se puede bajar la ficha de cada unidad por separado (serían ~8
 * llamadas por unidad), así que la copia guarda lo del edificio entero
 * (`consultarFichasEdificio`) y `fichaDesdeCopia` arma la de una unidad.
 *
 * Las dos ramas devuelven el mismo `FilasFicha` y usan las mismas columnas:
 * `unidades` y `saldos_actuales` con el mismo select que Propietarios (que
 * la copia ya trae), el historial de `historial_unidad()` (en la copia, por
 * `copia_edificio()`, que llama a esa misma función) y los pagos reportados
 * con las columnas de abajo. Si se cambia una columna acá, se cambia en las
 * dos ramas.
 */

type FilaHistorial = Database["public"]["Functions"]["historial_unidad"]["Returns"][number];
type PagoPendiente = Pick<Database["public"]["Tables"]["pagos"]["Row"], "id" | "fecha" | "monto_usd" | "metodo" | "referencia" | "destino">;
export type FilaDeudaMes = Database["public"]["Functions"]["deuda_por_mes"]["Returns"][number];

const SELECT_UNIDAD =
  "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,paga,tipo,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo,correo_respaldo))";
const SELECT_SALDO = "unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado";
const SELECT_PENDIENTE = "id,fecha,monto_usd,metodo,referencia,destino";

export type EdificioFicha = { id: string; nombre: string; rif: string | null; direccion: string | null };

export type FilasFicha = {
  unidad: UnidadConPaga;
  saldo: SaldoActual | null;
  edificio: EdificioFicha;
  organizacion: Pick<OrganizacionAdmin, "id" | "nombre">;
  historial: FilaHistorial[];
  pendientes: PagoPendiente[];
  tasa: number | null;
  nota: string;
};

/** Ficha de una unidad, en línea. `null` si la unidad no es de este edificio. */
export async function consultarFicha(
  supabase: SupabaseClient<Database>,
  ids: { orgId: string; edificioId: string; unidadId: string }
): Promise<FilasFicha | null> {
  const { orgId, edificioId, unidadId } = ids;
  const [
    { data: unidad, error: e1 },
    { data: saldo, error: e2 },
    { data: edificio, error: e3 },
    { data: org, error: e4 },
    { data: historial, error: e5 },
    { data: pendientes, error: e6 },
    { data: tasaFila },
    { data: notaFila, error: e7 },
  ] = await Promise.all([
    supabase.from("unidades").select(SELECT_UNIDAD).eq("id", unidadId).eq("edificio_id", edificioId).maybeSingle(),
    supabase.from("saldos_actuales").select(SELECT_SALDO).eq("unidad_id", unidadId).maybeSingle(),
    supabase.from("edificios").select("id,nombre,rif,direccion").eq("id", edificioId).single(),
    supabase.from("organizaciones").select("id,nombre").eq("id", orgId).single(),
    supabase.rpc("historial_unidad", { p_unidad: unidadId }),
    supabase.from("pagos").select(SELECT_PENDIENTE).eq("unidad_id", unidadId).eq("estado", "reportado").order("fecha"),
    supabase.rpc("tasa_atrasada"),
    // La nota de la unidad: solo la administración la ve (RLS de notas_unidad, M4).
    supabase.from("notas_unidad").select("nota").eq("unidad_id", unidadId).maybeSingle(),
  ]);
  const tasa = (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null;

  if (e1 || e3 || e4 || e5 || e6 || e7) throw e1 || e3 || e4 || e5 || e6 || e7;
  if (!unidad) return null;
  // Sin fila en saldos_actuales (por ejemplo, una unidad inactiva sin
  // movimientos): no es un 404, la Ficha muestra el total en cero.
  if (e2) throw e2;

  return {
    unidad,
    saldo,
    edificio: edificio!,
    organizacion: org!,
    historial: historial ?? [],
    pendientes: pendientes ?? [],
    tasa: tasa?.tasa ? Number(tasa.tasa) : null,
    nota: notaFila?.nota ?? "",
  };
}

/** Lo que la copia guarda para armar la ficha de cualquier unidad del edificio. */
export type FichasEdificio = {
  edificio: EdificioFicha;
  organizacion: Pick<OrganizacionAdmin, "id" | "nombre">;
  historial: (FilaHistorial & { unidad_id: string })[];
  deuda: (FilaDeudaMes & { unidad_id: string })[];
  pendientes: (PagoPendiente & { unidad_id: string })[];
  notas: { unidad_id: string; nota: string }[];
  tasa: number | null;
};

/** Lo del edificio entero, para la copia. Unidades y saldos van en `propietarios`. */
export async function consultarFichasEdificio(
  supabase: SupabaseClient<Database>,
  ids: { orgId: string; edificioId: string }
): Promise<FichasEdificio> {
  const { orgId, edificioId } = ids;
  const [{ data: edificio, error: e1 }, { data: org, error: e2 }, { data: copia, error: e3 }, { data: pendientes, error: e4 }, { data: tasaFila }, { data: notas, error: e5 }] =
    await Promise.all([
      supabase.from("edificios").select("id,nombre,rif,direccion").eq("id", edificioId).single(),
      supabase.from("organizaciones").select("id,nombre").eq("id", orgId).single(),
      supabase.rpc("copia_edificio", { p_edificio: edificioId }),
      supabase
        .from("pagos")
        .select(`${SELECT_PENDIENTE},unidad_id,unidades!inner(edificio_id)`)
        .eq("unidades.edificio_id", edificioId)
        .eq("estado", "reportado")
        .order("fecha"),
      supabase.rpc("tasa_atrasada"),
      supabase.from("notas_unidad").select("unidad_id,nota,unidades!inner(edificio_id)").eq("unidades.edificio_id", edificioId),
    ]);
  if (e1 || e2 || e3 || e4 || e5) throw e1 || e2 || e3 || e4 || e5;
  const tasa = (Array.isArray(tasaFila) ? tasaFila[0] : tasaFila) ?? null;
  const c = (copia ?? {}) as { historial?: Json; deuda?: Json };
  return {
    edificio: edificio!,
    organizacion: org!,
    historial: (Array.isArray(c.historial) ? c.historial : []) as unknown as FichasEdificio["historial"],
    deuda: (Array.isArray(c.deuda) ? c.deuda : []) as unknown as FichasEdificio["deuda"],
    pendientes: (pendientes ?? []).map((p) => ({ id: p.id, fecha: p.fecha, monto_usd: p.monto_usd, metodo: p.metodo, referencia: p.referencia, destino: p.destino, unidad_id: p.unidad_id })),
    notas: (notas ?? []).map((n) => ({ unidad_id: n.unidad_id, nota: n.nota })),
    tasa: tasa?.tasa ? Number(tasa.tasa) : null,
  };
}

/** Saca `unidad_id` de una fila de la copia: la pantalla recibe las filas tal como en línea. */
function sinUnidad<T extends { unidad_id: string }>(fila: T): Omit<T, "unidad_id"> {
  const resto: Partial<T> = { ...fila };
  delete resto.unidad_id;
  return resto as Omit<T, "unidad_id">;
}

/** La ficha de una unidad, armada desde la copia. `null` si la unidad no está en la copia. */
export function fichaDesdeCopia(propietarios: FilasPropietarios, fichas: FichasEdificio, unidadId: string): FilasFicha | null {
  const unidad = propietarios.unidades.find((u) => u.id === unidadId);
  if (!unidad) return null;
  return {
    unidad,
    saldo: propietarios.saldos.find((s) => s.unidad_id === unidadId) ?? null,
    edificio: fichas.edificio,
    organizacion: fichas.organizacion,
    historial: fichas.historial.filter((h) => h.unidad_id === unidadId).map(sinUnidad),
    pendientes: fichas.pendientes.filter((p) => p.unidad_id === unidadId).map(sinUnidad),
    tasa: fichas.tasa,
    nota: fichas.notas.find((n) => n.unidad_id === unidadId)?.nota ?? "",
  };
}

/** El detalle por mes de una unidad, desde la copia (lo que DeudaPorMes pide en línea). */
export function deudaDesdeCopia(fichas: FichasEdificio, unidadId: string): FilaDeudaMes[] {
  return fichas.deuda.filter((d) => d.unidad_id === unidadId).map(sinUnidad);
}
