import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { PeriodoAdmin, ReciboAdmin, TasaViva, Unidad } from "@/lib/admin/tipos";
import type { CuentaPago } from "@/lib/datos-pago";
import type { SaldoHoy } from "@/lib/admin/papel-recibos";
import { tasaDelDia } from "@/lib/tasa";

/**
 * Cortes de cuenta (cambio 3, plan 1.1 d): misma consulta en línea y en la
 * copia sin conexión.
 *
 * Quedan en la página, fuera de esto, `ajustesCobroDe` y
 * `tieneRolOrganizacion`, que son memoizaciones del servidor. La copia guarda
 * `soloUsd` leyendo `ajustes_cobro` directo y no necesita `puedeOperar`: sin
 * conexión no se envía nada.
 *
 * Los recibos de un mes los pide Cortes desde el navegador al elegir el mes;
 * su select es `SELECT_RECIBOS`, el mismo que guarda la copia para el último
 * mes cerrado.
 */
export const SELECT_RECIBOS =
  "id,unidad_id,numero,cuota,directos,anterior,a_favor,mora,honorario,servicio,anterior_hon,anterior_serv,total,conceptos,cargos,detalle,deuda_meses,tasa_bcv,vence_el,alicuota";

export type FilasCortes = {
  organizacion: { nombre: string; logo_url: string | null };
  edificio: { nombre: string; rif: string | null };
  unidades: Unidad[];
  periodos: PeriodoAdmin[];
  cuentas: CuentaPago[];
  saldosHoy: SaldoHoy[];
  tasa: TasaViva | null;
};

/** `null` si la organización o el edificio no se pueden leer (la página da 404). */
export async function consultarCortes(supabase: SupabaseClient<Database>, ids: { orgId: string; edificioId: string }): Promise<FilasCortes | null> {
  const { orgId, edificioId } = ids;
  const [{ data: org, error: eO }, { data: edificio, error: eE }, { data: unidades, error: eU }, { data: periodos, error: eP }, { data: cuentas }, { data: saldos }, tasa] =
    await Promise.all([
      supabase.from("organizaciones").select("nombre,logo_url").eq("id", orgId).single(),
      supabase.from("edificios").select("nombre,rif").eq("id", edificioId).single(),
      supabase
        .from("unidades")
        .select(
          "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo,correo_respaldo))"
        )
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase
        .from("periodos")
        .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
        .eq("edificio_id", edificioId)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false }),
      // Ronda 7: los datos para pagar, para la vista previa del recibo.
      supabase.from("datos_pago").select("id,destino,tipo,banco,titular,documento,cuenta,nota,orden").eq("edificio_id", edificioId).order("orden"),
      // Ronda 10 (B3): lo que debe hoy cada unidad, para el papel del último mes.
      supabase.from("saldos_actuales").select("unidad_id,administracion,total").eq("edificio_id", edificioId),
      tasaDelDia(supabase),
    ]);

  if (eO || eE || !org || !edificio) return null;
  if (eU) throw eU;
  if (eP) throw eP;

  return {
    organizacion: org,
    edificio,
    unidades: unidades ?? [],
    periodos: periodos ?? [],
    cuentas: cuentas ?? [],
    saldosHoy: saldos ?? [],
    tasa,
  };
}

/** Para la copia: si la organización cobra solo en dólares (en línea lo da `ajustesCobroDe`). */
export async function consultarSoloUsd(supabase: SupabaseClient<Database>, orgId: string): Promise<boolean> {
  const { data } = await supabase.from("ajustes_cobro").select("solo_usd").eq("org_id", orgId).maybeSingle();
  return data?.solo_usd === true;
}

/** Para la copia: los recibos del último mes cerrado (lo que Cortes muestra al entrar). */
export async function consultarRecibosUltimoMes(
  supabase: SupabaseClient<Database>,
  periodos: PeriodoAdmin[]
): Promise<{ periodoId: string; filas: ReciboAdmin[] } | null> {
  const ultimo = periodos.find((p) => p.estado === "cerrado");
  if (!ultimo) return null;
  const { data, error } = await supabase.from("recibos").select(SELECT_RECIBOS).eq("periodo_id", ultimo.id);
  if (error) throw error;
  return { periodoId: ultimo.id, filas: data ?? [] };
}
