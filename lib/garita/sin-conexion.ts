"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { guardarCopiaGarita } from "@/lib/local/almacen";
import type { Cosa } from "@/lib/local/bandeja-tipos";
import type { ValidacionCodigo } from "./tipos";
import { VERSION_COPIA_GARITA, type CopiaGarita } from "./sin-conexion-tipos";

/**
 * Garita sin conexión (cambio 3, parte D, plan 10.5, aprobado el 18-nov).
 *
 * - La copia de la garita: el directorio, quién está adentro y **la lista
 *   del día con los códigos resumidos** (sha256). El código no se guarda:
 *   para validar, se resume el código que muestra la visita y se busca el
 *   resumen. Quien tenga el equipo ve los nombres de las visitas del día,
 *   pero no puede sacar de ahí un código para entrar.
 * - La validación sin conexión repite las reglas de `garita_validar` (anulada,
 *   todavía no empieza, venció, ya se usó), contando también las entradas de
 *   este equipo que todavía no se enviaron.
 * - Las entradas y salidas van a la bandeja (`garita.entrada`,
 *   `garita.salida`) con la hora del equipo, y llegan solas al volver.
 */

export async function bajarCopiaGarita(usuarioId: string, edificioId: string): Promise<CopiaGarita> {
  const supabase = crearClienteNavegador();
  const [sesion, garitas, directorio, lista, dentro] = await Promise.all([
    supabase.auth.getSession(),
    supabase.rpc("garita_edificios"),
    supabase.rpc("garita_directorio", { p_edificio: edificioId }),
    supabase.rpc("garita_lista_del_dia", { p_edificio: edificioId }),
    supabase.rpc("garita_dentro", { p_edificio: edificioId }),
  ]);
  const error = garitas.error || directorio.error || lista.error || dentro.error;
  if (error) throw error;
  const copia: CopiaGarita = {
    edificioId,
    version: VERSION_COPIA_GARITA,
    sincronizadoEn: new Date().toISOString(),
    correo: sesion.data.session?.user.email ?? "",
    garitas: garitas.data ?? [],
    directorio: directorio.data ?? [],
    lista: lista.data ?? [],
    dentro: dentro.data ?? [],
  };
  await guardarCopiaGarita(usuarioId, copia);
  return copia;
}

/** Igual que garita_validar: se queda con los caracteres hexadecimales, en mayúscula. */
export function normalizarCodigo(bruto: string): string {
  return String(bruto || "")
    .trim()
    .replace(/^.*\//, "")
    .replace(/[^0-9A-Fa-f]/g, "")
    .toUpperCase();
}

/** sha256 en hexadecimal, el mismo resumen que calcula garita_lista_del_dia. */
export async function resumirCodigo(codigo: string): Promise<string> {
  const datos = new TextEncoder().encode(codigo);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Las entradas de este equipo que todavía no llegaron, por invitación. */
export function usosLocales(bandeja: Cosa[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of bandeja) {
    if (c.tipo !== "garita.entrada") continue;
    const inv = (c.datos as { invitacionId?: string | null }).invitacionId;
    if (inv) m[inv] = (m[inv] ?? 0) + 1;
  }
  return m;
}

/** El veredicto de un código sin conexión, con la forma de garita_validar. */
export async function validarSinConexion(copia: CopiaGarita, bruto: string, usados: Record<string, number>): Promise<ValidacionCodigo> {
  const codigo = normalizarCodigo(bruto);
  const resumen = await resumirCodigo(codigo);
  const r = copia.lista.find((i) => i.codigo_resumen === resumen);
  const no = (motivo: string): ValidacionCodigo => ({
    valido: false,
    motivo,
    invitacion_id: r?.invitacion_id ?? (null as unknown as string),
    nombre: r?.nombre ?? (null as unknown as string),
    documento: r?.documento ?? (null as unknown as string),
    unidad: r?.unidad ?? (null as unknown as string),
    placa: r?.placa ?? (null as unknown as string),
    hasta: r?.hasta ?? (null as unknown as string),
    usos: r?.usos ?? 0,
    usos_max: r?.usos_max ?? 0,
  });
  if (!r) return no("Ese código no está en la lista del día guardada en este equipo");
  const ahora = Date.now();
  const usos = r.usos + (usados[r.invitacion_id] ?? 0);
  if (r.estado === "anulada") return no("La invitación fue anulada");
  if (ahora < new Date(r.desde).getTime()) return no("Todavía no empieza");
  if (ahora > new Date(r.hasta).getTime()) return no("La invitación venció");
  if (usos >= r.usos_max) return no("Ya se usó");
  return { ...no("Adelante"), valido: true, usos };
}

/* ── Contexto: la garita dibujada desde la copia (pantalla sin internet) ── */

const ContextoGarita = createContext<CopiaGarita | null>(null);

export function ProveedorCopiaGarita({ copia, children }: { copia: CopiaGarita; children: ReactNode }) {
  return createElement(ContextoGarita.Provider, { value: copia }, children);
}

/** La copia si la garita se está dibujando sin conexión; `null` en línea. */
export function useCopiaGarita(): CopiaGarita | null {
  return useContext(ContextoGarita);
}
