"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CloudOff, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button, Card, PantallaMarca, Vacio } from "@/components/ui";
import { MarcoAdmin } from "@/components/admin/MarcoAdmin";
import { Propietarios } from "@/components/admin/Propietarios";
import { PantallaInicio } from "@/components/admin/PantallaInicio";
import { Ficha } from "@/components/admin/Ficha";
import { Pagos } from "@/components/admin/Pagos";
import { CierreMes } from "@/components/admin/CierreMes";
import { Cortes } from "@/components/admin/Cortes";
import { armarPropsPropietarios } from "@/lib/admin/pantallas/propietarios";
import { armarPropsInicio } from "@/lib/admin/pantallas/inicio";
import { fichaDesdeCopia } from "@/lib/admin/pantallas/ficha";
import { armarPropsPagos } from "@/lib/admin/pantallas/pagos";
import { armarPropsMes } from "@/lib/admin/pantallas/mes";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { leerCopia, type CopiaEdificio } from "@/lib/local/almacen";
import { ProveedorCopia } from "@/lib/local/contexto";
import { useConexion } from "@/lib/local/conexion";
import { RUTA_CASCARA, VERSION_COPIA } from "@/lib/local/config";
import { formatoHora } from "@/lib/local/formato";
import { esUuid } from "@/lib/validacion";

/**
 * Lo que dibuja la pantalla sin internet (cambio 3, plan 1.1 c).
 *
 * `?ir=` trae la dirección que se quiso abrir
 * (/admin/<org>/<edificio>/<sección>[/<unidad>]). Se lee la copia de ese
 * edificio y se dibujan **los mismos componentes** que en línea, con props
 * armadas por **las mismas funciones** (lib/admin/pantallas). Los
 * componentes que en línea piden datos al montarse los leen de la copia
 * (ProveedorCopia).
 *
 * Sin conexión se puede consultar: Inicio, Propietarios y la ficha de cada
 * unidad, Pagos recibidos, Gastos del mes y Cortes (último mes cerrado). Lo
 * demás dice que necesita conexión. Registrar o cambiar algo sin conexión es
 * la parte B; hoy, si se intenta, la base no contesta y se avisa el error.
 */

type Ruta = { orgId: string; edificioId: string; seccion: string; unidadId: string | null; destino: string };

function leerRuta(ir: string | null): Ruta | null {
  if (!ir || !ir.startsWith("/admin/")) return null;
  const [, , orgId, edificioId, seccion = "inicio", unidadId] = ir.split("?")[0].split("/");
  if (!esUuid(orgId ?? "") || !esUuid(edificioId ?? "")) return null;
  return { orgId, edificioId, seccion, unidadId: unidadId && esUuid(unidadId) ? unidadId : null, destino: ir };
}

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
  const ruta = leerRuta(ir);
  const lenta = params.get("motivo") === "lenta";
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  // Se llegó acá porque la red falló: hasta que una comprobación real diga
  // lo contrario, no hay conexión.
  const enLinea = useConexion("sin-conexion") === "en-linea";

  useEffect(() => {
    let vivo = true;
    (async () => {
      const usuarioId = await usuarioLocal();
      if (!vivo) return;
      if (!usuarioId) return setEstado({ tipo: "sin-sesion" });
      const r = leerRuta(ir);
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
  const volver = () => window.location.assign(ruta?.destino ?? "/admin");

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

  let contenido: ReactNode;
  switch (r.seccion) {
    case "inicio":
      contenido = (
        <PantallaInicio
          orgId={orgId}
          edificioId={edificioId}
          tolerancia={copia.marco.edificios.find((e) => e.id === edificioId)?.tolerancia_alicuota}
          props={armarPropsInicio(copia.inicio)}
        />
      );
      break;
    case "propietarios": {
      const ficha = r.unidadId ? fichaDesdeCopia(copia.propietarios, copia.fichas, r.unidadId) : null;
      contenido = ficha ? (
        <Ficha orgId={orgId} edificioId={edificioId} {...ficha} />
      ) : r.unidadId ? (
        <Vacio titulo="Esa unidad no está en la copia" texto="Puede que se haya agregado después de la última copia." icono={<WifiOff size={28} />} />
      ) : (
        <Propietarios orgId={orgId} edificioId={edificioId} {...armarPropsPropietarios(copia.propietarios)} />
      );
      break;
    }
    case "pagos":
      contenido = <Pagos orgId={orgId} edificioId={edificioId} {...armarPropsPagos(copia.pagos)} />;
      break;
    case "mes":
      contenido = <CierreMes orgId={orgId} edificioId={edificioId} {...armarPropsMes(copia.mes)} />;
      break;
    case "cortes":
      contenido = <Cortes orgId={orgId} edificioId={edificioId} {...copia.cortes} puedeOperar={false} />;
      break;
    default:
      contenido = (
        <Vacio
          titulo={`${NOMBRES[r.seccion] ?? "Esta sección"} necesita conexión`}
          texto="Sin conexión se pueden ver Inicio, Propietarios, Pagos recibidos, Gastos del mes y Cortes de cuenta."
          icono={<WifiOff size={28} />}
        />
      );
  }

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
              ? "Volvió la conexión. Lo que ve es la copia guardada."
              : `${lenta ? "Conexión muy lenta" : "Sin conexión"}: está viendo los datos de ${formatoHora(copia.sincronizadoEn)}. Para registrar o cambiar algo, espere a que vuelva internet.`}
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
