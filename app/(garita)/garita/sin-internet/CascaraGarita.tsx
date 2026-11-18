"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MarcoGarita } from "@/components/garita/MarcoGarita";
import { DirectorioProvider } from "@/components/garita/DirectorioContexto";
import { VistaEntrada } from "@/components/garita/VistaEntrada";
import { VistaAdentro } from "@/components/garita/VistaAdentro";
import { ModoGarita } from "@/components/garita/ModoGarita";
import { SECCIONES_GARITA, SECCION_INICIAL } from "@/lib/garita/secciones";
import { ProveedorCopiaGarita } from "@/lib/garita/sin-conexion";
import { VERSION_COPIA_GARITA, type CopiaGarita } from "@/lib/garita/sin-conexion-tipos";
import { leerCopiaGarita } from "@/lib/local/almacen";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { useConexion } from "@/lib/local/conexion";
import { formatoHora } from "@/lib/local/formato";
import { esUuid } from "@/lib/validacion";

/**
 * Lo que dibuja la garita sin internet (cambio 3, parte D).
 *
 * `?ir=/garita/<edificio>/<sección>`. Con la copia de esa garita se pueden
 * usar **Entrada** (validar con la lista del día guardada y registrar
 * entradas, también sin anunciar) y **Adentro** (registrar salidas). Todo lo
 * que se registra va a la bandeja con la hora del equipo y llega solo al
 * volver. Consultar y Bitácora necesitan conexión.
 */
const RUTA = "/garita/sin-internet";
const href = (edificioId: string, seccion: string) => `${RUTA}?ir=${encodeURIComponent(`/garita/${edificioId}/${seccion}`)}`;

function leerRuta(ir: string | null) {
  if (!ir || !ir.startsWith("/garita/")) return null;
  const [, , edificioId, seccion = SECCION_INICIAL] = ir.split("?")[0].split("/");
  return esUuid(edificioId ?? "") ? { edificioId, seccion, destino: ir } : null;
}

type Estado = { tipo: "cargando" } | { tipo: "sin-sesion" } | { tipo: "sin-copia" } | { tipo: "copia"; copia: CopiaGarita };

export function CascaraGarita() {
  const params = useSearchParams();
  const ir = params.get("ir");
  const ruta = leerRuta(ir);
  const lenta = params.get("motivo") === "lenta";
  const enLinea = useConexion("sin-conexion") === "en-linea";
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      const u = await usuarioLocal();
      if (!vivo) return;
      if (!u) return setEstado({ tipo: "sin-sesion" });
      const r = leerRuta(ir);
      const c = r ? await leerCopiaGarita(u, r.edificioId).catch(() => null) : null;
      if (!vivo) return;
      if (!c || c.version !== VERSION_COPIA_GARITA) return setEstado({ tipo: "sin-copia" });
      setEstado({ tipo: "copia", copia: c });
    })();
    return () => {
      vivo = false;
    };
  }, [ir]);

  const volver = () => window.location.assign(ruta?.destino ?? "/garita");

  if (estado.tipo === "cargando") return null;

  if (estado.tipo !== "copia" || !ruta) {
    return (
      <>
        <MarcoGarita />
        <main className="garita-main">
          <div className="garita-tarjeta">
            <h2>{lenta ? "La conexión está muy lenta" : "Sin conexión"}</h2>
            <p>
              {estado.tipo === "sin-sesion"
                ? "No hay una sesión abierta en este equipo. Entre cuando vuelva internet."
                : "Esta garita no tiene la lista del día guardada en este equipo. Se guarda sola la próxima vez que se abra con internet."}
            </p>
            <div className="garita-fila">
              <button type="button" className="garita-boton ancho" onClick={volver}>
                Reintentar
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  const { copia } = estado;
  const actual = copia.garitas.find((g) => g.edificio_id === copia.edificioId);
  const seccion = ruta.seccion;

  return (
    <ProveedorCopiaGarita copia={copia}>
      <MarcoGarita correo={copia.correo} edificioNombre={actual?.nombre} organizacion={actual?.org} garitas={copia.garitas} edificioIdActual={copia.edificioId} />
      <nav className="garita-nav">
        {SECCIONES_GARITA.map((s) => (
          <a key={s.slug} href={href(copia.edificioId, s.slug)} aria-current={s.slug === seccion ? "page" : undefined}>
            {s.titulo}
          </a>
        ))}
      </nav>
      <ModoGarita edificioId={copia.edificioId} local />
      <main className="garita-main">
        <div className="garita-tarjeta" role="status" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            {enLinea
              ? "Volvió la conexión. Lo pendiente se envía solo."
              : `${lenta ? "Conexión muy lenta" : "Sin conexión"}: se valida con la lista del día guardada a las ${formatoHora(copia.sincronizadoEn)}. Una invitación creada después no aparece. Lo que registre se envía solo al volver.`}
          </span>
          <button type="button" className="garita-boton suave chico" onClick={volver}>
            {enLinea ? "Ver lo último" : "Reintentar"}
          </button>
        </div>
        <DirectorioProvider directorio={copia.directorio}>
          {seccion === "adentro" ? (
            <VistaAdentro edificioId={copia.edificioId} />
          ) : seccion === "entrada" ? (
            <VistaEntrada edificioId={copia.edificioId} />
          ) : (
            <div className="garita-tarjeta">
              <h2>{seccion === "bitacora" ? "Bitácora" : "Consultar"} necesita conexión</h2>
              <p>Sin conexión se pueden registrar entradas y salidas.</p>
            </div>
          )}
        </DirectorioProvider>
      </main>
    </ProveedorCopiaGarita>
  );
}
