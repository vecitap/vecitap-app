"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SIN_CONEXION_ACTIVO, URL_SW } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { useConexion } from "@/lib/local/conexion";
import { enviarPendientes, useBandeja } from "@/lib/local/bandeja";
import { formatoHora } from "@/lib/local/formato";
import { pedirAlmacenPersistente } from "@/lib/local/almacen";
import { bajarCopiaGarita } from "@/lib/garita/sin-conexion";

/**
 * Modo sin conexión de la garita (cambio 3, parte D, plan 10.5).
 *
 * - Registra el service worker también con alcance `/garita/` (el mismo
 *   archivo que Administración): sin red, las páginas de la garita llevan a
 *   /garita/sin-internet.
 * - Con conexión, cada minuto baja la copia de esta garita: la lista del día
 *   (códigos resumidos), el directorio y quién está adentro. Es chica (unas
 *   decenas de filas), así que se baja entera, sin huella.
 * - Manda las entradas y salidas que quedaron por enviar al volver la
 *   conexión, al abrir y cada minuto.
 * - Una línea bajo el menú: la hora de la copia y cuántas cosas faltan por
 *   enviar.
 *
 * `local`: se está dibujando en la pantalla sin internet.
 * Con el interruptor apagado no hace nada ni dibuja nada.
 */
const CADA_MS = 60 * 1000;

export function ModoGarita({ edificioId, local = false }: { edificioId: string; local?: boolean }) {
  const router = useRouter();
  const conexion = useConexion(local ? "sin-conexion" : "en-linea");
  const enLinea = conexion === "en-linea" || (!local && conexion === "comprobando");
  const pendientes = useBandeja(edificioId).length;
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(URL_SW, { scope: "/garita/", type: "module", updateViaCache: "none" })
      .catch((e) => console.warn("No se pudo registrar el modo sin conexión de la garita", e));
    void pedirAlmacenPersistente();
  }, []);

  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !enLinea) return;
    let vivo = true;
    const ciclo = async () => {
      const r = await enviarPendientes().catch(() => null);
      if (r && r.enviadas > 0 && !local) router.refresh();
      if (local) return;
      const u = await usuarioLocal();
      if (!u) return;
      const c = await bajarCopiaGarita(u, edificioId).catch(() => null);
      if (vivo && c) setHora(c.sincronizadoEn);
    };
    void ciclo();
    const reloj = window.setInterval(() => void ciclo(), CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [edificioId, enLinea, local, router]);

  if (!SIN_CONEXION_ACTIVO || (!hora && !pendientes && enLinea)) return null;

  return (
    <p className="garita-pie" role="status" style={{ textAlign: "center", margin: "6px 0 0" }}>
      {!enLinea ? "Sin conexión. " : hora ? `Lista del día guardada · ${formatoHora(hora)}. ` : ""}
      {pendientes > 0 ? `${pendientes === 1 ? "1 entrada o salida" : `${pendientes} entradas o salidas`} por enviar.` : ""}
    </p>
  );
}
