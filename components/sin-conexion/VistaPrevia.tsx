"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Cargando } from "@/components/ui";
import { contenidoDeCopia, leerRutaAdmin } from "./ContenidoCopia";
import { SIN_CONEXION_ACTIVO, VERSION_COPIA } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { leerCopia, type CopiaEdificio } from "@/lib/local/almacen";
import { ProveedorCopia } from "@/lib/local/contexto";
import { formatoHora } from "@/lib/local/formato";

/**
 * Parte E del cambio 3, «primero la copia» (plan sección 7). Es lo que
 * muestran las fronteras de carga (`loading.tsx`) de las secciones del
 * edificio mientras el servidor arma la página fresca.
 *
 * En vez de un «Cargando…», se dibuja **al instante la copia** de este
 * edificio (la misma foto que usa la pantalla sin internet: el navegador no
 * calcula nada). Cuando llega la página del servidor, Next la reemplaza sola.
 *
 * Mientras tanto, la pantalla lleva la marca «Actualizando…» y está inerte
 * (`inert`): no se puede tocar nada, así que nada que dependa del saldo exacto
 * (repartir un pago, cerrar el mes) se hace sobre la foto. Tampoco lee ni
 * guarda borradores (useBorrador lo sabe por el contexto).
 *
 * Sin copia de ese edificio, de otra versión, o con una sección que no está
 * en la copia, es el «Cargando…» de siempre. Con el interruptor apagado,
 * también.
 */
export function VistaPrevia() {
  const pathname = usePathname();
  const ruta = leerRutaAdmin(pathname);
  const [copia, setCopia] = useState<CopiaEdificio | null>(null);
  const edificioId = ruta?.edificioId ?? null;
  const orgId = ruta?.orgId ?? null;

  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !edificioId) return;
    let vivo = true;
    (async () => {
      const usuarioId = await usuarioLocal();
      if (!usuarioId || !vivo) return;
      const c = await leerCopia(usuarioId, edificioId).catch(() => null);
      if (vivo && c && c.orgId === orgId && c.version === VERSION_COPIA) setCopia(c);
    })();
    return () => {
      vivo = false;
    };
  }, [edificioId, orgId]);

  const contenido = copia && ruta && copia.edificioId === ruta.edificioId ? contenidoDeCopia({ copia, seccion: ruta.seccion, unidadId: ruta.unidadId }) : null;
  if (!copia || !contenido) return <Cargando />;

  return (
    <ProveedorCopia copia={copia} modo="vista-previa">
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          display: "flex",
          gap: 8,
          alignItems: "center",
          width: "fit-content",
          padding: "6px 12px",
          marginBottom: 12,
          borderRadius: 999,
          background: "var(--acento-suave)",
          color: "var(--acento-texto)",
          fontSize: 12.5,
        }}
      >
        <RefreshCw size={13} /> Actualizando… (mostrando los datos de las {formatoHora(copia.sincronizadoEn)})
      </div>
      <div inert style={{ opacity: 0.85 }}>
        {contenido}
      </div>
    </ProveedorCopia>
  );
}
