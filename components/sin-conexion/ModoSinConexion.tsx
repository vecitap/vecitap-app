"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, CloudUpload, HardDriveDownload, X } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { ALCANCE_SW, SIN_CONEXION_ACTIVO, URL_SW } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { equipoId, leerCopia, listarBandeja, listarCopias, pedirAlmacenPersistente } from "@/lib/local/almacen";
import { bajarCopia, ponerAlDia } from "@/lib/local/copia";
import { formatoHora } from "@/lib/local/formato";
import { useConexion } from "@/lib/local/conexion";
import { EVENTO_COPIA_SUCIA, EVENTO_SESION, enviarPendientes, useBandeja } from "@/lib/local/bandeja";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { PorEnviar } from "./PorEnviar";

/**
 * Modo sin conexión dentro de Administración (cambio 3, plan 1.1 b, f, h, i
 * y 2.3, 2.7).
 *
 * - Registra el service worker (alcance /admin/).
 * - El edificio que se abre queda «disponible sin conexión» solo. Cada
 *   minuto se pregunta si algo cambió (la huella) y solo entonces se baja la
 *   copia de nuevo; además al entrar, al volver la conexión, una vez por
 *   hora, y enseguida después de que algo propio llega a la base.
 * - Manda la bandeja («cosas por enviar») al volver la conexión, al abrir y
 *   cada minuto, y muestra cuántas quedan («Ver» abre la lista).
 * - Avisa a la base cada minuto qué edificios puede tocar este equipo y
 *   cuántas cosas tiene por enviar de cada uno (latido_equipo, 2.7); al
 *   cerrar la pestaña con conexión, avisa «cerrado».
 *
 * `local`: se está dibujando en la pantalla sin conexión, que ya tiene su
 * propia franja; acá queda solo el contador.
 *
 * Con el interruptor apagado no hace nada ni dibuja nada.
 */
const MIRAR_CADA_MS = 60 * 1000;

type Estado =
  | { tipo: "nada" }
  | { tipo: "bajando"; desde: string | null }
  | { tipo: "lista"; hora: string }
  | { tipo: "error"; hora: string | null };

/** «Chrome en Windows»: para que en «Equipos sin conexión» se sepa cuál es. */
function describirEquipo(): string {
  const ua = navigator.userAgent;
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} en ${so}` : nav;
}

export function ModoSinConexion({ orgId, edificioId, local = false }: { orgId: string; edificioId: string; local?: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const [verLista, setVerLista] = useState(false);
  const [sinSesion, setSinSesion] = useState(false);
  // En línea, la página cargó por red: se parte de «en línea» hasta que una
  // comprobación real diga lo contrario. En la pantalla sin conexión, al revés.
  const conexion = useConexion(local ? "sin-conexion" : "en-linea");
  const enLinea = conexion === "en-linea" || (!local && conexion === "comprobando");
  const bandeja = useBandeja();
  const pendientes = bandeja.length;
  const dialogo = useRef<HTMLDialogElement>(null);
  const token = useRef<string | null>(null);

  // Registrar el service worker, una vez.
  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(URL_SW, { scope: ALCANCE_SW, type: "module", updateViaCache: "none" })
      .catch((e) => console.warn("No se pudo registrar el modo sin conexión", e));
    void pedirAlmacenPersistente();
  }, []);

  // Copia del edificio abierto.
  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !edificioId || !enLinea || local) return;
    let vivo = true;
    let ocupado = false;

    const sincronizar = async (forzar = false) => {
      if (ocupado) return;
      ocupado = true;
      try {
        const usuarioId = await usuarioLocal();
        if (!usuarioId || !vivo) return;
        const previa = await leerCopia(usuarioId, edificioId).catch(() => null);
        if (vivo) setEstado((e) => (e.tipo !== "nada" ? e : previa ? { tipo: "lista", hora: previa.sincronizadoEn } : { tipo: "bajando", desde: null }));
        try {
          const copia = forzar ? await bajarCopia({ usuarioId, orgId, edificioId }) : (await ponerAlDia({ usuarioId, orgId, edificioId })).copia;
          if (vivo) setEstado({ tipo: "lista", hora: copia.sincronizadoEn });
        } catch (e) {
          console.warn("No se pudo actualizar la copia sin conexión", e);
          if (vivo) setEstado({ tipo: "error", hora: previa?.sincronizadoEn ?? null });
        }
      } finally {
        ocupado = false;
      }
    };

    // Lo propio entra a la copia enseguida (plan 1.1 f, punto 1).
    const sucia = (e: Event) => {
      const id = (e as CustomEvent<{ edificioId: string }>).detail?.edificioId;
      if (id === edificioId) void sincronizar(true);
    };

    void sincronizar();
    const reloj = window.setInterval(() => void sincronizar(), MIRAR_CADA_MS);
    window.addEventListener(EVENTO_COPIA_SUCIA, sucia);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      window.removeEventListener(EVENTO_COPIA_SUCIA, sucia);
    };
  }, [orgId, edificioId, enLinea, local]);

  // La bandeja: se manda al volver la conexión, al abrir y cada minuto.
  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !enLinea) return;
    let vivo = true;
    const mandar = async () => {
      const r = await enviarPendientes().catch(() => null);
      if (!vivo || !r) return;
      setSinSesion(r.sesion);
      // Lo que llegó cambia lo que muestra la página en línea.
      if (r.enviadas > 0 && !local) router.refresh();
    };
    void mandar();
    const reloj = window.setInterval(() => void mandar(), MIRAR_CADA_MS);
    const sesion = () => setSinSesion(true);
    window.addEventListener(EVENTO_SESION, sesion);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      window.removeEventListener(EVENTO_SESION, sesion);
    };
  }, [enLinea, local, router]);

  // Latido (plan 2.7): qué edificios puede tocar este equipo y cuántas
  // cosas tiene por enviar de cada uno.
  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !enLinea) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    const descripcion = describirEquipo();

    const latir = async (estadoEquipo: "en_linea" | "cerrado") => {
      const usuarioId = await usuarioLocal();
      if (!usuarioId) return null;
      const [equipo, copias, cosas] = await Promise.all([equipoId(usuarioId), listarCopias(usuarioId), listarBandeja(usuarioId)]);
      const edificios = new Set<string>([edificioId, ...copias.map((c) => c.edificioId), ...cosas.map((c) => c.edificioId)].filter(Boolean));
      const cuenta = (id: string) => cosas.filter((c) => c.edificioId === id).length;
      return { equipo, edificios: [...edificios], cuenta, estadoEquipo };
    };

    const latido = async () => {
      try {
        const d = await latir("en_linea");
        if (!d || !vivo) return;
        const { data } = await supabase.auth.getSession();
        token.current = data.session?.access_token ?? null;
        await Promise.all(
          d.edificios.map((id) =>
            supabase.rpc("latido_equipo", { p_equipo: d.equipo, p_edificio: id, p_pendientes: d.cuenta(id), p_estado: "en_linea", p_descripcion: descripcion })
          )
        );
      } catch {
        // Sin latido este minuto: el siguiente lo reemplaza.
      }
    };

    // Al cerrar la pestaña (o el navegador) con conexión: «cerrado». Con
    // `keepalive`, sale aunque la página se esté cerrando. Los datos se
    // preparan antes, porque al cerrar no hay tiempo de leer IndexedDB.
    let alCerrar: { equipo: string; edificios: string[]; cuenta: (id: string) => number } | null = null;
    const prepararCierre = () =>
      latir("cerrado")
        .then((d) => {
          alCerrar = d;
        })
        .catch(() => undefined);
    const cerrar = () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!alCerrar || !token.current || !url || !clave) return;
      for (const id of alCerrar.edificios) {
        void fetch(`${url}/rest/v1/rpc/latido_equipo`, {
          method: "POST",
          keepalive: true,
          headers: { apikey: clave, Authorization: `Bearer ${token.current}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_equipo: alCerrar.equipo, p_edificio: id, p_pendientes: alCerrar.cuenta(id), p_estado: "cerrado" }),
        }).catch(() => undefined);
      }
    };

    void latido().then(prepararCierre);
    const reloj = window.setInterval(() => void latido().then(prepararCierre), MIRAR_CADA_MS);
    window.addEventListener("pagehide", cerrar);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      window.removeEventListener("pagehide", cerrar);
    };
    // `pendientes`: cuando cambia la bandeja, la base se entera enseguida.
  }, [enLinea, edificioId, pendientes]);

  useEffect(() => {
    if (verLista) dialogo.current?.showModal();
  }, [verLista]);

  if (!SIN_CONEXION_ACTIVO) return null;

  const hora = estado.tipo === "lista" ? estado.hora : estado.tipo === "bajando" ? estado.desde : estado.tipo === "error" ? estado.hora : null;
  const mostrarCopia = !local && estado.tipo !== "nada";

  return (
    <>
      {mostrarCopia && (
        <div
          role="status"
          style={{
            margin: "8px 6px 0",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.45,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: enLinea ? "transparent" : "var(--acento)",
            // El lateral es oscuro en los dos temas: en línea hereda su texto.
            color: enLinea ? "inherit" : "var(--acento-sobre)",
            opacity: enLinea ? 0.8 : 1,
          }}
        >
          {enLinea ? <HardDriveDownload size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <CloudOff size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>
            {!enLinea
              ? `Sin conexión. Lo que vea es la copia${hora ? ` de las ${formatoHora(hora)}` : ""}.`
              : estado.tipo === "error"
                ? hora
                  ? `No se pudo actualizar la copia. Queda la de las ${formatoHora(hora)}.`
                  : "No se pudo guardar la copia sin conexión."
                : estado.tipo === "bajando"
                  ? "Guardando copia sin conexión…"
                  : `Disponible sin conexión · ${formatoHora(hora!)}`}
          </span>
        </div>
      )}

      {pendientes > 0 && (
        <button
          type="button"
          onClick={() => setVerLista(true)}
          style={{
            margin: "8px 6px 0",
            padding: "8px 10px",
            width: "calc(100% - 12px)",
            borderRadius: 8,
            border: "1px solid var(--acento)",
            background: "transparent",
            color: "inherit",
            fontSize: 12,
            lineHeight: 1.45,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <CloudUpload size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {pendientes === 1 ? "1 cosa por enviar" : `${pendientes} cosas por enviar`}
            {bandeja.some((c) => c.estado === "revisar") ? " · hay que revisar" : ""}
            {sinSesion ? " · entre de nuevo para enviarlas" : ""} · Ver
          </span>
        </button>
      )}

      {verLista && (
        <Dialog ref={dialogo} onClose={() => setVerLista(false)} style={{ maxWidth: 640, width: "calc(100% - 32px)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Button type="button" mini variante="secundario" onClick={() => dialogo.current?.close()} aria-label="Cerrar">
              <X size={14} /> Cerrar
            </Button>
          </div>
          {sinSesion && (
            <p style={{ fontSize: 13, color: "var(--rojo)", marginTop: 0 }}>
              Su sesión venció y no se pudo renovar. Entre de nuevo con la misma cuenta: lo pendiente sigue guardado y se envía solo.
            </p>
          )}
          <PorEnviar titulo="Cosas por enviar de este equipo" />
          {pendientes === 0 && <p style={{ fontSize: 13.5 }}>No queda nada por enviar.</p>}
        </Dialog>
      )}
    </>
  );
}
