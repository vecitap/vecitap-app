import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";
import { repartirTransferencia } from "@/lib/reparto";
import { SIN_CONEXION_ACTIVO } from "./config";
import type { CandidatoDuplicado, Cosa, Revisar, TablaFila } from "./bandeja-tipos";

/**
 * Cómo se manda cada cosa a la base (cambio 3, parte B, plan 2.3–2.6).
 *
 * Cada tipo de cosa repite **la misma llamada** que la pantalla hace en
 * línea (mismo insert/update, misma sesión, misma RLS). Lo que agrega:
 *
 * - `id_equipo` en los inserts: si un reintento llega dos veces, la base se
 *   salta la segunda sin error (migración 20261118140000).
 * - Antes de mandar un pago, busca posibles duplicados (misma unidad, mismo
 *   monto, fecha a ±3 días), salvo que ya se haya dicho «enviar igual».
 * - En ediciones y borrados, compara con los valores que había al editar:
 *   si otra persona lo cambió, no pisa: va a «Revisar» con las dos versiones.
 * - En gastos y cargos, comprueba que el mes siga abierto.
 *
 * Errores: `ErrorEnvio` con `red` (se reintenta más tarde), `sesion` (hay
 * que entrar de nuevo) o `revisar` (la base dijo que no, o hay que decidir).
 */

type Supabase = ReturnType<typeof crearClienteNavegador>;
type ErrorBase = { message?: string; code?: string; details?: string } | null;
type Respuesta<T> = { data: T; error: ErrorBase; status: number };

export class ErrorEnvio extends Error {
  constructor(
    public clase: "red" | "sesion" | "revisar",
    public detalle?: Revisar
  ) {
    super(clase === "revisar" ? (detalle?.mensaje ?? "Revisar") : clase);
  }
}

const RED = /failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out|abort/i;

/** ¿El error es de conexión, de sesión, o una respuesta de la base? */
export function claseDeError(error: ErrorBase | unknown, status?: number): "red" | "sesion" | "base" {
  const e = (error ?? {}) as { message?: unknown; code?: unknown; name?: unknown; status?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const msj = typeof e.message === "string" ? e.message : "";
  const st = typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;
  if (st === 401 || code === "PGRST301" || code === "PGRST303") return "sesion";
  if (e.name === "AbortError" || RED.test(msj) || st === 0 || (st !== undefined && st >= 500 && !code.startsWith("P0"))) return "red";
  return "base";
}

/** Corta por red o por sesión; si no, devuelve la respuesta para que el tipo decida. */
function revisarRespuesta<T>(r: Respuesta<T>): Respuesta<T> {
  if (r.error) {
    const c = claseDeError(r.error, r.status);
    if (c !== "base") throw new ErrorEnvio(c);
  }
  return r;
}

function aRevisar(detalle: Revisar): never {
  throw new ErrorEnvio("revisar", detalle);
}

function rechazo(error: unknown): never {
  aRevisar({ clase: "rechazo", mensaje: mensajeDeError(error) });
}

/* ── Duplicados (2.4) ── */

function correrDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Pagos no anulados de la misma unidad, mismo monto y moneda, con fecha a
 * ±3 días. `excluir`: los id_equipo de lo propio (un reintento no se
 * encuentra a sí mismo). Se usa al enviar desde la bandeja y, en línea,
 * antes de registrar en Pagos.
 */
export async function buscarPosiblesDuplicados(
  supabase: Supabase,
  filas: { unidad_id: string; monto: number; moneda: string; fecha: string }[],
  excluir: string[] = [],
  signal?: AbortSignal
): Promise<CandidatoDuplicado[]> {
  const encontrados: CandidatoDuplicado[] = [];
  for (const f of filas) {
    let q = supabase
      .from("pagos")
      .select("id,unidad_id,fecha,monto,moneda,referencia,estado,metodo,reportado_por,id_equipo")
      .eq("unidad_id", f.unidad_id)
      .eq("monto", f.monto)
      .eq("moneda", f.moneda)
      .gte("fecha", correrDias(f.fecha, -3))
      .lte("fecha", correrDias(f.fecha, 3))
      .neq("estado", "anulado")
      .limit(5);
    if (signal) q = q.abortSignal(signal);
    const r = revisarRespuesta(await q);
    if (r.error) rechazo(r.error);
    for (const p of r.data ?? []) {
      if (p.id_equipo && excluir.includes(p.id_equipo)) continue;
      encontrados.push({
        id: p.id,
        unidad_id: p.unidad_id,
        fecha: p.fecha,
        monto: Number(p.monto),
        moneda: p.moneda,
        referencia: p.referencia,
        estado: p.estado,
        metodo: p.metodo,
        reportado_por: p.reportado_por,
      });
    }
  }
  return encontrados;
}

/* ── Cada tipo ── */

type FilaPago = { id_equipo: string; unidad_id: string; monto: number; moneda: string; fecha: string } & Record<string, unknown>;

async function yaLlegaron(supabase: Supabase, tabla: "pagos" | TablaFila | "ajustes", ids: string[], signal: AbortSignal): Promise<number> {
  // Con el interruptor apagado los inserts no llevan id_equipo (la columna
  // puede no existir todavía en esa base).
  if (!SIN_CONEXION_ACTIVO || !ids.every(Boolean)) return 0;
  const r = revisarRespuesta(await supabase.from(tabla).select("id_equipo").in("id_equipo", ids).abortSignal(signal));
  if (r.error) rechazo(r.error);
  return (r.data ?? []).length;
}

async function insertarPagos(supabase: Supabase, cosa: Cosa, filas: FilaPago[], signal: AbortSignal) {
  if (!cosa.permitirDuplicado) {
    const candidatos = await buscarPosiblesDuplicados(supabase, filas, filas.map((f) => f.id_equipo), signal);
    if (candidatos.length)
      aRevisar({
        clase: "duplicado",
        mensaje: "Puede estar repetido: ya hay un pago de la misma unidad, por el mismo monto y con fecha cercana.",
        candidatos,
      });
  }
  const r = revisarRespuesta(await supabase.from("pagos").insert(filas as never).abortSignal(signal));
  if (!r.error) return;
  if (r.error.code === "23505") return; // ya estaba (dos pestañas a la vez)
  if (/ya está reportado/i.test(r.error.message ?? "")) aRevisar({ clase: "repetido", mensaje: mensajeDeError(r.error) });
  rechazo(r.error);
}

async function pagoRegistrar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const filas = cosa.datos.filas as FilaPago[];
  if ((await yaLlegaron(supabase, "pagos", filas.map((f) => f.id_equipo), signal)) > 0) return;
  await insertarPagos(supabase, cosa, filas, signal);
}

async function pagoRepartir(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as {
    base: Record<string, unknown>;
    total: number;
    unidades: string[];
    moneda: string;
    tasa: number | null;
    destino: string;
    ids: Record<string, string>;
    grupo: string;
    fecha: string;
  };
  if ((await yaLlegaron(supabase, "pagos", Object.values(d.ids), signal)) > 0) return;
  // La deuda de AHORA, no la de la copia: por eso se reparte al volver.
  const r = await repartirTransferencia(supabase, { unidades: d.unidades, total: d.total, moneda: d.moneda, tasa: d.tasa, destino: d.destino });
  if ("error" in r) {
    const c = claseDeError(r.error);
    if (c !== "base") throw new ErrorEnvio(c);
    rechazo(r.error);
  }
  const partes = r.partes.filter((x) => x.monto > 0.005);
  if (!partes.length) aRevisar({ clase: "rechazo", mensaje: "El reparto no le asignó nada a ninguna unidad." });
  const filas: FilaPago[] = partes.map((x) => ({
    ...d.base,
    unidad_id: x.unidad_id,
    monto: x.monto,
    moneda: d.moneda,
    fecha: d.fecha,
    id_equipo: d.ids[x.unidad_id],
    grupo_id: partes.length > 1 ? d.grupo : null,
  }));
  await insertarPagos(supabase, cosa, filas, signal);
}

async function pagoEstado(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as {
    pagoId?: string;
    grupoId?: string | null;
    estado: "conciliado" | "anulado";
    /** El estado que tenía al tocarlo: solo cambia si todavía lo tiene. */
    desde?: string;
    banco?: string | null;
  };
  const campos: Record<string, unknown> = d.estado === "conciliado" ? { estado: d.estado, conciliado_en: cosa.hechoEn } : { estado: d.estado };
  if (d.banco !== undefined) campos.banco = d.banco;
  const [col, val] = d.grupoId ? ["grupo_id", d.grupoId] : ["id", d.pagoId as string];
  const r = revisarRespuesta(
    await supabase.from("pagos").update(campos as never).eq(col, val).eq("estado", d.desde ?? "reportado").select("id").abortSignal(signal)
  );
  if (r.error) rechazo(r.error);
  if ((r.data ?? []).length > 0) return;
  // 0 filas: o ya se hizo (un reintento), u otra persona lo cambió antes.
  const ahora = revisarRespuesta(await supabase.from("pagos").select("estado").eq(col, val).abortSignal(signal));
  if (ahora.error) rechazo(ahora.error);
  const estados = (ahora.data ?? []).map((x) => x.estado);
  if (estados.length && estados.every((e) => e === d.estado)) return;
  aRevisar({
    clase: "rechazo",
    mensaje: estados.length ? `Ese pago cambió mientras esto esperaba: ahora está «${estados[0]}».` : "Ese pago ya no existe.",
  });
}

async function ajusteRegistrar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const fila = cosa.datos.fila as Record<string, unknown> & { id_equipo: string };
  if ((await yaLlegaron(supabase, "ajustes", [fila.id_equipo], signal)) > 0) return;
  const r = revisarRespuesta(await supabase.from("ajustes").insert(fila as never).abortSignal(signal));
  if (r.error && r.error.code !== "23505") rechazo(r.error);
}

/** ¿El mes sigue abierto? Si no, «Revisar → Pasarlo al mes abierto». */
async function exigirMesAbierto(supabase: Supabase, periodoId: string, signal: AbortSignal) {
  const r = revisarRespuesta(await supabase.from("periodos").select("estado,etiqueta").eq("id", periodoId).abortSignal(signal).maybeSingle());
  if (r.error) rechazo(r.error);
  if (!r.data) aRevisar({ clase: "rechazo", mensaje: "Ese mes ya no existe." });
  if (r.data.estado !== "abierto")
    aRevisar({ clase: "mes_cerrado", mensaje: `${r.data.etiqueta} ya se cerró mientras esto esperaba para enviarse.` });
}

async function filaActual(supabase: Supabase, tabla: TablaFila, id: string, signal: AbortSignal) {
  const r = revisarRespuesta(await supabase.from(tabla).select("*").eq("id", id).abortSignal(signal).maybeSingle());
  if (r.error) rechazo(r.error);
  return (r.data ?? null) as Record<string, unknown> | null;
}

const igual = (a: unknown, b: unknown) => (a == null && b == null) || (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b);

/** Si otra persona cambió alguno de los campos que había al editar, no se pisa. */
function exigirSinCambios(cosa: Cosa, actual: Record<string, unknown>) {
  if (cosa.pisar || !cosa.antes) return;
  const cambiados = Object.keys(cosa.antes).filter((k) => !igual(cosa.antes![k], actual[k]));
  if (cambiados.length)
    aRevisar({ clase: "conflicto", mensaje: "Otra persona cambió esto después de que usted lo editó.", actual });
}

async function filaCrear(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { tabla: TablaFila; fila: Record<string, unknown> & { id_equipo: string; periodo_id: string } };
  if ((await yaLlegaron(supabase, d.tabla, [d.fila.id_equipo], signal)) > 0) return;
  await exigirMesAbierto(supabase, d.fila.periodo_id, signal);
  const r = revisarRespuesta(await supabase.from(d.tabla).insert(d.fila as never).abortSignal(signal));
  if (r.error && r.error.code !== "23505") rechazo(r.error);
}

async function filaEditar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { tabla: TablaFila; id: string; campos: Record<string, unknown> };
  const actual = await filaActual(supabase, d.tabla, d.id, signal);
  if (!actual) aRevisar({ clase: "rechazo", mensaje: "Eso ya no existe: lo borró otra persona." });
  // Ya quedó como se quería (un reintento): nada que hacer.
  if (Object.keys(d.campos).every((k) => igual(d.campos[k], actual[k]))) return;
  await exigirMesAbierto(supabase, actual.periodo_id as string, signal);
  exigirSinCambios(cosa, actual);
  const r = revisarRespuesta(await supabase.from(d.tabla).update(d.campos as never).eq("id", d.id).select("id").abortSignal(signal));
  if (r.error) rechazo(r.error);
  if (!(r.data ?? []).length) aRevisar({ clase: "rechazo", mensaje: "No se pudo guardar el cambio. Puede ser un permiso." });
}

async function filaBorrar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { tabla: TablaFila; id: string };
  const actual = await filaActual(supabase, d.tabla, d.id, signal);
  if (!actual) return; // ya no está: es lo que se quería
  await exigirMesAbierto(supabase, actual.periodo_id as string, signal);
  exigirSinCambios(cosa, actual);
  const r = revisarRespuesta(await supabase.from(d.tabla).delete().eq("id", d.id).abortSignal(signal));
  if (r.error) rechazo(r.error);
}

async function gastoOrden(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { periodoId: string; posiciones: { id: string; orden: number }[] };
  await exigirMesAbierto(supabase, d.periodoId, signal);
  // La posición final de cada uno: repetirlo no cambia el resultado.
  for (const p of d.posiciones) {
    const r = revisarRespuesta(await supabase.from("gastos").update({ orden: p.orden }).eq("id", p.id).abortSignal(signal));
    if (r.error) rechazo(r.error);
  }
}

async function notaGuardar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { unidadId: string; texto: string };
  const ahora = revisarRespuesta(
    await supabase.from("notas_unidad").select("nota,actualizada_en").eq("unidad_id", d.unidadId).abortSignal(signal).maybeSingle()
  );
  if (ahora.error) rechazo(ahora.error);
  const actual = ahora.data?.nota ?? "";
  if (actual.trim() === d.texto) return; // ya quedó así
  if (!cosa.pisar && cosa.antes && (cosa.antes.nota ?? "") !== actual)
    aRevisar({ clase: "conflicto", mensaje: "Otra persona cambió la nota después de que usted la editó.", actual: { nota: actual } });
  const r = revisarRespuesta(
    d.texto
      ? await supabase.from("notas_unidad").upsert({ unidad_id: d.unidadId, org_id: cosa.orgId, nota: d.texto }).abortSignal(signal)
      : await supabase.from("notas_unidad").delete().eq("unidad_id", d.unidadId).abortSignal(signal)
  );
  if (r.error) rechazo(r.error);
}

async function personaEditar(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { personaId: string; vinculoId: string; campos: Record<string, unknown>; enviarCorte: boolean };
  const p = revisarRespuesta(await supabase.from("personas").select("*").eq("id", d.personaId).abortSignal(signal).maybeSingle());
  if (p.error) rechazo(p.error);
  if (!p.data) aRevisar({ clase: "rechazo", mensaje: "Esa persona ya no está en la ficha." });
  const actual = p.data as Record<string, unknown>;
  const yaEsta = Object.keys(d.campos).every((k) => igual(d.campos[k], actual[k]));
  if (!yaEsta) {
    exigirSinCambios(cosa, actual);
    const r = revisarRespuesta(await supabase.from("personas").update(d.campos as never).eq("id", d.personaId).select("id").abortSignal(signal));
    if (r.error) rechazo(r.error);
    if (!(r.data ?? []).length) aRevisar({ clase: "rechazo", mensaje: "No se pudieron guardar los datos. Puede ser un permiso." });
  }
  const v = revisarRespuesta(await supabase.from("vinculos").update({ enviar_corte: d.enviarCorte }).eq("id", d.vinculoId).select("id").abortSignal(signal));
  if (v.error) rechazo(v.error);
}

/* ── Garita (parte D) ── */

/** Al residente se le avisa solo si la entrada es reciente: un aviso de hace dos días confunde. */
const AVISAR_HASTA_MS = 30 * 60 * 1000;

async function garitaEntrada(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as {
    unidadId: string | null;
    nombre: string;
    documento?: string | null;
    placa?: string | null;
    invitacionId?: string | null;
    nota?: string | null;
  };
  const r = revisarRespuesta(
    await supabase
      .rpc("garita_entrada_diferida", {
        p_id_equipo: cosa.id,
        p_hecho_en: cosa.hechoEn,
        p_edificio: cosa.edificioId,
        // Acepta NULL (visita sin anunciar que no eligió unidad), igual que garita_entrada.
        p_unidad: d.unidadId as string,
        p_nombre: d.nombre,
        p_documento: d.documento ?? undefined,
        p_placa: d.placa ?? undefined,
        p_invitacion: d.invitacionId ?? undefined,
        p_nota: d.nota ?? undefined,
      })
      .abortSignal(signal)
  );
  if (r.error) rechazo(r.error);
  if (r.data && Date.now() - new Date(cosa.hechoEn).getTime() < AVISAR_HASTA_MS) {
    void supabase.rpc("garita_avisar", { p_visita: r.data });
  }
}

async function garitaSalida(supabase: Supabase, cosa: Cosa, signal: AbortSignal) {
  const d = cosa.datos as { visitaId?: string | null; entradaIdEquipo?: string | null };
  const r = revisarRespuesta(
    await supabase
      .rpc("garita_salida_diferida", {
        p_hecho_en: cosa.hechoEn,
        p_visita: d.visitaId ?? undefined,
        p_id_equipo: d.visitaId ? undefined : (d.entradaIdEquipo ?? undefined),
      })
      .abortSignal(signal)
  );
  if (r.error) rechazo(r.error);
}

const ENVIOS: Record<Cosa["tipo"], (s: Supabase, c: Cosa, signal: AbortSignal) => Promise<void>> = {
  "garita.entrada": garitaEntrada,
  "garita.salida": garitaSalida,
  "pago.registrar": pagoRegistrar,
  "pago.repartir": pagoRepartir,
  "pago.estado": pagoEstado,
  "ajuste.registrar": ajusteRegistrar,
  "fila.crear": filaCrear,
  "fila.editar": filaEditar,
  "fila.borrar": filaBorrar,
  "gasto.orden": gastoOrden,
  "nota.guardar": notaGuardar,
  "persona.editar": personaEditar,
};

/** Espera máxima para guardar (plan sección 6): después, la cosa pasa a la bandeja. */
export const ESPERA_GUARDAR_MS = 15000;

/** Manda una cosa. Resuelve si llegó (o ya estaba); si no, lanza ErrorEnvio. */
export async function enviarCosa(cosa: Cosa, esperaMs = ESPERA_GUARDAR_MS): Promise<void> {
  const supabase = crearClienteNavegador();
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), esperaMs);
  try {
    await ENVIOS[cosa.tipo](supabase, cosa, control.signal);
  } catch (e) {
    if (e instanceof ErrorEnvio) throw e;
    if (control.signal.aborted) throw new ErrorEnvio("red");
    const c = claseDeError(e);
    if (c !== "base") throw new ErrorEnvio(c);
    rechazo(e);
  } finally {
    clearTimeout(reloj);
  }
}
