import { crearClienteNavegador } from "@/lib/supabase/client";
import { consultarPropietarios } from "@/lib/admin/pantallas/propietarios";
import { consultarInicio } from "@/lib/admin/pantallas/inicio";
import { consultarFichasEdificio } from "@/lib/admin/pantallas/ficha";
import { consultarPagos } from "@/lib/admin/pantallas/pagos";
import { consultarGastosAbierto, consultarMes } from "@/lib/admin/pantallas/mes";
import { consultarCortes, consultarRecibosUltimoMes, consultarSoloUsd } from "@/lib/admin/pantallas/cortes";
import { tasaDelDia } from "@/lib/tasa";
import { guardarCopia, leerCopia, type CopiaEdificio } from "./almacen";
import { VERSION_COPIA } from "./config";

/**
 * La copia de un edificio (cambio 3, 1.1 e–g).
 *
 * Se baja desde el navegador, con la sesión del usuario y la RLS de siempre,
 * y con **las mismas consultas que las páginas** (lib/admin/pantallas): el
 * usuario baja exactamente lo que ya puede ver. Lo que va por unidad
 * (historial y detalle por mes) llega en una sola llamada, copia_edificio().
 *
 * Cuándo se baja (1.1 f): al abrir el edificio, al volver la conexión, cada
 * vez que la «huella» dice que algo cambió (se mira cada minuto) y, como red
 * de seguridad, una vez por hora aunque la huella no cambie.
 */

type Supabase = ReturnType<typeof crearClienteNavegador>;

/**
 * La huella: una consulta mínima que cambia cuando cambia algo del edificio.
 * - `auditoria` registra pagos, gastos, ajustes, periodos (el cierre),
 *   unidades, conceptos, membresías e invitaciones de la organización. Tiene
 *   índice (org_id, creado_en) y la RLS la deja leer a la administración.
 * - `cargos_unidad` y `notas_unidad` no se auditan: se mira la fecha más
 *   reciente de cada una.
 * Personas y vínculos tampoco se auditan: los cubre la renovación de cada hora.
 */
export async function calcularHuella(supabase: Supabase, ids: { orgId: string; edificioId: string }): Promise<string> {
  const [aud, cargo, nota] = await Promise.all([
    supabase.from("auditoria").select("id").eq("org_id", ids.orgId).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("cargos_unidad")
      .select("creado_en,unidades!inner(edificio_id)")
      .eq("unidades.edificio_id", ids.edificioId)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notas_unidad")
      .select("actualizada_en,unidades!inner(edificio_id)")
      .eq("unidades.edificio_id", ids.edificioId)
      .order("actualizada_en", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const error = aud.error || cargo.error || nota.error;
  if (error) throw error;
  return [aud.data?.id ?? "-", cargo.data?.creado_en ?? "-", nota.data?.actualizada_en ?? "-"].join("|");
}

export async function bajarCopia(params: { usuarioId: string; orgId: string; edificioId: string }): Promise<CopiaEdificio> {
  const supabase = crearClienteNavegador();
  const { orgId, edificioId } = params;
  const ids = { orgId, edificioId };

  // La huella va primero: si algo cambia mientras se baja, la próxima
  // comprobación lo ve distinto y vuelve a bajar.
  const huella = await calcularHuella(supabase, ids);
  const [org, edificios, tasa, inicio, propietarios, fichas, pagos, mes, cortes, soloUsd] = await Promise.all([
    supabase.from("organizaciones").select("id,nombre,logo_url").eq("id", orgId).single(),
    supabase.from("edificios").select("id,nombre,direccion,tolerancia_alicuota").eq("org_id", orgId).order("nombre"),
    tasaDelDia(supabase),
    consultarInicio(supabase, edificioId),
    consultarPropietarios(supabase, edificioId),
    consultarFichasEdificio(supabase, ids),
    consultarPagos(supabase, edificioId),
    consultarMes(supabase, edificioId),
    consultarCortes(supabase, ids),
    consultarSoloUsd(supabase, orgId),
  ]);
  if (org.error) throw org.error;
  if (edificios.error) throw edificios.error;
  if (!cortes) throw new Error("No se pudo leer el edificio.");

  const [gastosAbierto, recibosUltimoMes] = await Promise.all([
    consultarGastosAbierto(supabase, mes.periodos),
    consultarRecibosUltimoMes(supabase, cortes.periodos),
  ]);

  const edificio = (edificios.data ?? []).find((e) => e.id === edificioId);
  const copia: CopiaEdificio = {
    edificioId,
    orgId,
    edificioNombre: edificio?.nombre ?? cortes.edificio.nombre,
    version: VERSION_COPIA,
    sincronizadoEn: new Date().toISOString(),
    huella,
    marco: { organizacion: org.data, edificios: edificios.data ?? [], tasa },
    inicio,
    propietarios,
    fichas,
    pagos,
    mes,
    gastosAbierto,
    cortes: { ...cortes, soloUsd },
    recibosUltimoMes,
  };
  await guardarCopia(params.usuarioId, copia);
  return copia;
}

const RENOVAR_SIEMPRE_MS = 60 * 60 * 1000;

/**
 * Pone al día la copia de un edificio: la baja si no hay, si es de otra
 * versión, si cambió la huella o si tiene más de una hora. Si no, no baja
 * nada (una consulta de unos cientos de bytes). Devuelve la copia vigente.
 */
export async function ponerAlDia(params: { usuarioId: string; orgId: string; edificioId: string }): Promise<{ copia: CopiaEdificio; bajada: boolean }> {
  const previa = await leerCopia(params.usuarioId, params.edificioId).catch(() => null);
  const vieja =
    !previa ||
    previa.version !== VERSION_COPIA ||
    previa.orgId !== params.orgId ||
    Date.now() - new Date(previa.sincronizadoEn).getTime() > RENOVAR_SIEMPRE_MS;
  if (!vieja) {
    const huella = await calcularHuella(crearClienteNavegador(), params);
    if (huella === previa!.huella) return { copia: previa!, bajada: false };
  }
  return { copia: await bajarCopia(params), bajada: true };
}
