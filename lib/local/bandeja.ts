"use client";

import { useEffect, useState } from "react";
import { SIN_CONEXION_ACTIVO } from "./config";
import { usuarioLocal } from "./sesion-local";
import { borrarCosa, guardarCosa, leerCosa, listarBandeja } from "./almacen";
import { ErrorEnvio, enviarCosa } from "./envios";
import { ultimaConexion } from "./conexion";
import type { Cosa, NuevaCosa } from "./bandeja-tipos";

/**
 * La bandeja de «cosas por enviar» (cambio 3, parte B, plan 2.2–2.3).
 *
 * - `hacer(cosa)`: lo que llaman las pantallas al guardar. Con conexión
 *   manda al instante, como siempre; si la red falla o tarda más de 15 s,
 *   la cosa queda sola en la bandeja y se envía al volver. Si la base la
 *   rechaza, se devuelve el error como hoy y no se guarda nada.
 * - `enviarPendientes()`: manda lo que haya, en orden, una cosa por vez. Una
 *   pestaña a la vez (Web Locks). Lo llaman ModoSinConexion (al volver la
 *   conexión, al abrir la app, cada minuto) y la lista «Por enviar».
 * - Lo que la base rechaza queda en «Revisar», con el motivo. Nada se borra
 *   solo: «Corregir y reenviar» o «Descartar».
 *
 * Los cambios se avisan a las demás pestañas por BroadcastChannel, y a esta
 * por un evento, para que las listas se actualicen solas.
 */

const CANAL = "vecitap-bandeja";
const EVENTO = "vecitap:bandeja";
/** Algo llegó a la base: la copia de ese edificio se vuelve a bajar (plan 1.1 f, punto 1). */
export const EVENTO_COPIA_SUCIA = "vecitap:copia-sucia";
/** La sesión no se pudo renovar: «Entre de nuevo para enviar…». */
export const EVENTO_SESION = "vecitap:bandeja-sesion";

function avisarCambio() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO));
  try {
    const c = new BroadcastChannel(CANAL);
    c.postMessage("cambio");
    c.close();
  } catch {
    // Sin BroadcastChannel: las otras pestañas se enteran en su próximo ciclo.
  }
}

function copiaSucia(edificioId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_COPIA_SUCIA, { detail: { edificioId } }));
}

/** Los campos que lleva cada insert para que un reintento no duplique. */
export function marcasEquipo(id: string, hechoEn?: string): { id_equipo?: string; hecho_en?: string } {
  return SIN_CONEXION_ACTIVO ? { id_equipo: id, hecho_en: hechoEn ?? new Date().toISOString() } : {};
}

export type Resultado = { tipo: "enviado" } | { tipo: "en_bandeja" } | { tipo: "rechazado"; error: unknown };

async function completar(nueva: NuevaCosa): Promise<Cosa> {
  const usuarioId = await usuarioLocal();
  if (!usuarioId) throw new Error("No hay una sesión abierta en este equipo.");
  return {
    ...nueva,
    id: nueva.id ?? crypto.randomUUID(),
    hechoEn: nueva.hechoEn ?? new Date().toISOString(),
    usuarioId,
    estado: "por_enviar",
    intentos: 0,
    revisar: null,
  };
}

/** Deja una cosa en la bandeja, sin intentar mandarla. */
export async function encolar(nueva: NuevaCosa): Promise<Cosa> {
  const cosa = await completar(nueva);
  await guardarCosa(cosa.usuarioId, cosa);
  avisarCambio();
  return cosa;
}

/**
 * Guarda algo: al instante si hay conexión, a la bandeja si no.
 * Con el interruptor apagado se porta exactamente como antes: manda, y si
 * falla (también por red) devuelve el error.
 */
export async function hacer(nueva: NuevaCosa): Promise<Resultado> {
  if (!SIN_CONEXION_ACTIVO) {
    try {
      // Sin buscar duplicados ni comparar versiones: lo de siempre.
      await enviarCosa({ ...nueva, permitirDuplicado: true, pisar: true, id: nueva.id ?? crypto.randomUUID(), usuarioId: "", hechoEn: nueva.hechoEn ?? new Date().toISOString(), estado: "enviando", intentos: 0, revisar: null });
      return { tipo: "enviado" };
    } catch (e) {
      return { tipo: "rechazado", error: e instanceof ErrorEnvio && e.clase === "red" ? new Error("No pudimos conectar. Reintente.") : e };
    }
  }
  const cosa = await completar(nueva);
  const sinRed = ultimaConexion() === "sin-conexion" || (typeof navigator !== "undefined" && navigator.onLine === false);
  if (!sinRed) {
    try {
      await enviarCosa(cosa);
      copiaSucia(cosa.edificioId);
      return { tipo: "enviado" };
    } catch (e) {
      if (!(e instanceof ErrorEnvio) || e.clase === "revisar") {
        // Con conexión, un rechazo se muestra como hoy: no queda nada guardado.
        return { tipo: "rechazado", error: e instanceof ErrorEnvio ? new Error(e.detalle?.mensaje ?? e.message) : e };
      }
      if (e.clase === "sesion") window.dispatchEvent(new Event(EVENTO_SESION));
      // Red o sesión: a la bandeja (con el mismo id: si la primera llegó, el reintento se salta).
    }
  }
  await guardarCosa(cosa.usuarioId, cosa);
  avisarCambio();
  return { tipo: "en_bandeja" };
}

/** Texto para el aviso de la pantalla según el resultado. */
export function textoEnBandeja(): string {
  return "Sin conexión: quedó guardado en este equipo y se envía solo cuando vuelva internet. Lo ve en «Por enviar».";
}

/* ── El envío ── */

let enviando = false;

/**
 * Manda lo que haya por enviar de este usuario, en orden, una cosa por vez.
 * Devuelve cuántas llegaron. Una falla de red corta la tanda (no tiene
 * sentido seguir); un rechazo deja esa cosa en «Revisar» y sigue con las demás.
 */
export async function enviarPendientes(): Promise<{ enviadas: number; sesion: boolean }> {
  if (!SIN_CONEXION_ACTIVO) return { enviadas: 0, sesion: false };
  const usuarioId = await usuarioLocal();
  if (!usuarioId) return { enviadas: 0, sesion: false };

  const tanda = async () => {
    let enviadas = 0;
    let sesion = false;
    const cosas = (await listarBandeja(usuarioId)).filter((c) => c.estado !== "revisar");
    const edificios = new Set<string>();
    for (const c of cosas) {
      const enCurso: Cosa = { ...c, estado: "enviando", intentos: c.intentos + 1 };
      await guardarCosa(usuarioId, enCurso);
      avisarCambio();
      try {
        await enviarCosa(enCurso);
        await borrarCosa(usuarioId, c.id);
        enviadas++;
        edificios.add(c.edificioId);
      } catch (e) {
        if (e instanceof ErrorEnvio && e.clase === "revisar") {
          await guardarCosa(usuarioId, { ...enCurso, estado: "revisar", revisar: e.detalle ?? { clase: "rechazo", mensaje: e.message } });
        } else {
          await guardarCosa(usuarioId, { ...enCurso, estado: "por_enviar" });
          if (e instanceof ErrorEnvio && e.clase === "sesion") sesion = true;
          avisarCambio();
          break;
        }
      }
      avisarCambio();
    }
    edificios.forEach(copiaSucia);
    if (sesion) window.dispatchEvent(new Event(EVENTO_SESION));
    return { enviadas, sesion };
  };

  // Una pestaña a la vez. Sin Web Locks (navegadores viejos), un candado de esta pestaña.
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    const r = await navigator.locks.request(`${CANAL}-${usuarioId}`, { ifAvailable: true }, async (lock) => (lock ? tanda() : null));
    return r ?? { enviadas: 0, sesion: false };
  }
  if (enviando) return { enviadas: 0, sesion: false };
  enviando = true;
  try {
    return await tanda();
  } finally {
    enviando = false;
  }
}

/* ── Acciones de «Revisar» ── */

async function cambiar(id: string, f: (c: Cosa) => Cosa | null) {
  const usuarioId = await usuarioLocal();
  if (!usuarioId) return;
  const c = await leerCosa(usuarioId, id);
  if (!c) return;
  const nueva = f(c);
  if (nueva) await guardarCosa(usuarioId, nueva);
  else await borrarCosa(usuarioId, id);
  avisarCambio();
}

/** «Descartar» (la pantalla pide confirmación antes). */
export const descartar = (id: string) => cambiar(id, () => null);

/** «Reenviar» tal cual, o con lo que se decidió («enviar igual», «usar la mía»). */
export const reenviar = (id: string, extra: Partial<Pick<Cosa, "permitirDuplicado" | "pisar" | "datos">> = {}) =>
  cambiar(id, (c) => ({ ...c, ...extra, estado: "por_enviar", revisar: null })).then(() => enviarPendientes());

/* ── Para las pantallas ── */

/**
 * Las cosas por enviar de este usuario en este equipo (de un edificio, o
 * todas). Se actualiza sola cuando cambian, también desde otra pestaña.
 */
export function useBandeja(edificioId?: string | null): Cosa[] {
  const [cosas, setCosas] = useState<Cosa[]>([]);
  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO) return;
    let vivo = true;
    const leer = async () => {
      const usuarioId = await usuarioLocal();
      if (!usuarioId) return;
      const lista = await listarBandeja(usuarioId, edificioId ?? undefined).catch(() => [] as Cosa[]);
      if (vivo) setCosas(lista);
    };
    void leer();
    window.addEventListener(EVENTO, leer);
    let canal: BroadcastChannel | null = null;
    try {
      canal = new BroadcastChannel(CANAL);
      canal.onmessage = () => void leer();
    } catch {
      canal = null;
    }
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, leer);
      canal?.close();
    };
  }, [edificioId]);
  return cosas;
}

/** Cuántas cosas hay por enviar de este usuario en este equipo (para «Salir»). */
export async function contarPendientes(): Promise<number> {
  if (!SIN_CONEXION_ACTIVO) return 0;
  const usuarioId = await usuarioLocal();
  if (!usuarioId) return 0;
  return (await listarBandeja(usuarioId).catch(() => [])).length;
}
