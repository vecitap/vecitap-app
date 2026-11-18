"use client";

import { useEffect, useState } from "react";
import { CloudOff, HardDriveDownload } from "lucide-react";
import { ALCANCE_SW, SIN_CONEXION_ACTIVO, URL_SW } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { leerCopia, pedirAlmacenPersistente } from "@/lib/local/almacen";
import { ponerAlDia } from "@/lib/local/copia";
import { formatoHora } from "@/lib/local/formato";
import { useConexion } from "@/lib/local/conexion";

/**
 * Modo sin conexión dentro de Administración (cambio 3, plan 1.1 b, f, h, i).
 *
 * - Registra el service worker (alcance /admin/).
 * - El edificio que se abre queda «disponible sin conexión» solo (decidido
 *   el 18-nov). Cada minuto se pregunta si algo cambió (la huella, unos
 *   cientos de bytes) y solo entonces se baja la copia de nuevo; además al
 *   entrar, al volver la conexión y una vez por hora (lib/local/copia.ts).
 * - Muestra en el lateral la hora de la copia, y un aviso si se corta.
 *
 * Con el interruptor apagado no hace nada ni dibuja nada.
 */
const MIRAR_CADA_MS = 60 * 1000;

type Estado =
  | { tipo: "nada" }
  | { tipo: "bajando"; desde: string | null }
  | { tipo: "lista"; hora: string }
  | { tipo: "error"; hora: string | null };

export function ModoSinConexion({ orgId, edificioId }: { orgId: string; edificioId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  // La página cargó por red: se parte de «en línea» hasta que una
  // comprobación real diga lo contrario.
  const conexion = useConexion("en-linea");
  const enLinea = conexion !== "sin-conexion";

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
    if (!SIN_CONEXION_ACTIVO || !edificioId || !enLinea) return;
    let vivo = true;
    let ocupado = false;

    const sincronizar = async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        const usuarioId = await usuarioLocal();
        if (!usuarioId || !vivo) return;
        const previa = await leerCopia(usuarioId, edificioId).catch(() => null);
        if (vivo) setEstado((e) => (e.tipo !== "nada" ? e : previa ? { tipo: "lista", hora: previa.sincronizadoEn } : { tipo: "bajando", desde: null }));
        try {
          const { copia } = await ponerAlDia({ usuarioId, orgId, edificioId });
          if (vivo) setEstado({ tipo: "lista", hora: copia.sincronizadoEn });
        } catch (e) {
          console.warn("No se pudo actualizar la copia sin conexión", e);
          if (vivo) setEstado({ tipo: "error", hora: previa?.sincronizadoEn ?? null });
        }
      } finally {
        ocupado = false;
      }
    };

    void sincronizar();
    const reloj = window.setInterval(() => void sincronizar(), MIRAR_CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [orgId, edificioId, enLinea]);

  if (!SIN_CONEXION_ACTIVO || estado.tipo === "nada") return null;

  const hora = estado.tipo === "lista" ? estado.hora : estado.tipo === "bajando" ? estado.desde : estado.hora;

  return (
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
  );
}
