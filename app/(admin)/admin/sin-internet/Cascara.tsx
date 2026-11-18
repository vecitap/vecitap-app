"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button, Card, PantallaMarca, Vacio } from "@/components/ui";
import { MarcoAdmin } from "@/components/admin/MarcoAdmin";
import { contenidoDeCopia, leerRutaAdmin } from "@/components/sin-conexion/ContenidoCopia";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { leerCopia, type CopiaEdificio } from "@/lib/local/almacen";
import { ProveedorCopia } from "@/lib/local/contexto";
import { useConexion } from "@/lib/local/conexion";
import { useBandeja } from "@/lib/local/bandeja";
import { RUTA_CASCARA, VERSION_COPIA } from "@/lib/local/config";
import { formatoHora } from "@/lib/local/formato";

/**
 * Lo que dibuja la pantalla sin internet (cambio 3, plan 1.1 c).
 *
 * `?ir=` trae la dirección que se quiso abrir
 * (/admin/<org>/<edificio>/<sección>[/<unidad>]). Se lee la copia de ese
 * edificio y se dibujan **los mismos componentes** que en línea
 * (contenidoDeCopia). Los componentes que en línea piden datos al montarse los
 * leen de la copia (ProveedorCopia).
 *
 * Sin conexión se puede consultar Inicio, Propietarios y la ficha de cada
 * unidad, Pagos recibidos, Gastos del mes y Cortes (último mes cerrado), y
 * registrar pagos, exoneraciones, gastos, cargos, contactos y notas: van a
 * la bandeja («Por enviar») y llegan solos al volver la conexión (partes B y
 * C). Lo demás dice que necesita conexión.
 */

const hrefCascara = (orgId: string, edificioId: string, seccion: string) =>
  `${RUTA_CASCARA}?ir=${encodeURIComponent(`/admin/${orgId}/${edificioId}/${seccion}`)}`;

const NOMBRES: Record<string, string> = {
  mensajes: "Mensajes",
  estadisticas: "Estadísticas",
  estado: "Estado financiero",
  accesos: "Accesos",
  ajustes: "Ajustes",
  cobros: "Cobros",
};

type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin-sesion" }
  | { tipo: "sin-ruta" }
  | { tipo: "sin-copia" }
  | { tipo: "copia"; copia: CopiaEdificio };

export function Cascara() {
  const params = useSearchParams();
  const ir = params.get("ir");
  const ruta = leerRutaAdmin(ir);
  const lenta = params.get("motivo") === "lenta";
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  // Se llegó acá porque la red falló: hasta que una comprobación real diga
  // lo contrario, no hay conexión.
  const enLinea = useConexion("sin-conexion") === "en-linea";
  const pendientes = useBandeja(ruta?.edificioId ?? null).filter((c) => c.estado !== "revisar").length;

  useEffect(() => {
    let vivo = true;
    (async () => {
      const usuarioId = await usuarioLocal();
      if (!vivo) return;
      if (!usuarioId) return setEstado({ tipo: "sin-sesion" });
      const r = leerRutaAdmin(ir);
      if (!r) return setEstado({ tipo: "sin-ruta" });
      const copia = await leerCopia(usuarioId, r.edificioId).catch(() => null);
      if (!vivo) return;
      // Una copia de otra organización (URL armada a mano) o de otra
      // versión del formato no se usa.
      if (!copia || copia.orgId !== r.orgId || copia.version !== VERSION_COPIA) return setEstado({ tipo: "sin-copia" });
      setEstado({ tipo: "copia", copia });
    })();
    return () => {
      vivo = false;
    };
  }, [ir]);

  // Volver a la página pedida: pasa de nuevo por el service worker, que
  // prueba la red primero.
  const volver = () => window.location.assign(ir && ruta ? ir : "/admin");

  if (estado.tipo === "cargando") return null;

  if (estado.tipo !== "copia") {
    const texto =
      estado.tipo === "sin-sesion"
        ? "No hay una sesión abierta en este equipo. Entre cuando vuelva internet."
        : estado.tipo === "sin-copia"
          ? "Este edificio no tiene copia guardada en este equipo. Se guarda sola la próxima vez que lo abra con internet."
          : "No pudimos abrir esa página sin conexión.";
    return (
      <PantallaMarca>
        <Card>
          <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18, display: "flex", gap: 8, alignItems: "center" }}>
            <CloudOff size={18} /> {lenta ? "La conexión está muy lenta" : "Sin conexión"}
          </h1>
          <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>{texto}</p>
          <Button type="button" style={{ width: "100%" }} onClick={volver}>
            Reintentar
          </Button>
        </Card>
      </PantallaMarca>
    );
  }

  const { copia } = estado;
  const r = ruta!;
  const { orgId, edificioId } = copia;

  const contenido: ReactNode = contenidoDeCopia({ copia, seccion: r.seccion, unidadId: r.unidadId }) ?? (
    <Vacio
      titulo={`${NOMBRES[r.seccion] ?? "Esta sección"} necesita conexión`}
      texto="Sin conexión se pueden ver Inicio, Propietarios, Pagos recibidos, Gastos del mes y Cortes de cuenta."
      icono={<WifiOff size={28} />}
    />
  );

  return (
    <ProveedorCopia copia={copia}>
      <MarcoAdmin
        organizacion={copia.marco.organizacion}
        edificios={copia.marco.edificios}
        tasaInicial={copia.marco.tasa}
        local={{ edificioId, seccion: r.seccion, href: (edificio, seccion) => hrefCascara(orgId, edificio, seccion) }}
      >
        <div
          role="status"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 10,
            background: enLinea ? "var(--acento-suave)" : "var(--acento)",
            color: enLinea ? "var(--acento-texto)" : "var(--acento-sobre)",
            fontSize: 13.5,
          }}
        >
          {enLinea ? <Wifi size={16} /> : <CloudOff size={16} />}
          <span style={{ flex: 1, minWidth: 200 }}>
            {enLinea
              ? pendientes > 0
                ? "Volvió la conexión. Se está enviando lo pendiente; después puede ver lo último."
                : "Volvió la conexión. Lo que ve es la copia guardada."
              : `${lenta ? "Conexión muy lenta" : "Sin conexión"}: está viendo los datos de ${formatoHora(copia.sincronizadoEn)}. Lo que registre se guarda en este equipo y se envía solo al volver (puede llegar después del cierre del mes).`}
          </span>
          <Button type="button" mini variante={enLinea ? "primario" : "secundario"} onClick={volver}>
            <RefreshCw size={14} /> {enLinea ? "Ver lo último" : "Reintentar"}
          </Button>
        </div>
        {contenido}
      </MarcoAdmin>
    </ProveedorCopia>
  );
}
