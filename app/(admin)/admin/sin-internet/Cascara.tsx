"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { CloudOff, RefreshCw, Users, Wifi } from "lucide-react";
import { Button, Card, PantallaMarca } from "@/components/ui";
import { useConexion } from "@/lib/local/conexion";
import { Propietarios } from "@/components/admin/Propietarios";
import { armarPropsPropietarios } from "@/lib/admin/pantallas/propietarios";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { leerCopia, type CopiaEdificio } from "@/lib/local/almacen";
import { RUTA_CASCARA, VERSION_COPIA } from "@/lib/local/config";
import { formatoHora } from "@/lib/local/formato";
import { esUuid } from "@/lib/validacion";

/**
 * Lo que dibuja la cáscara sin internet (prueba de concepto: Propietarios).
 *
 * `?ir=` trae la dirección que se quiso abrir (/admin/<org>/<edificio>/<sección>).
 * Se lee la copia de ese edificio y se dibuja **el mismo componente** que en
 * línea, con props armadas por **la misma función** (lib/admin/pantallas).
 */

type Ruta = { orgId: string; edificioId: string; seccion: string; destino: string };

function leerRuta(ir: string | null): Ruta | null {
  if (!ir || !ir.startsWith("/admin/")) return null;
  const [, , orgId, edificioId, seccion = "inicio"] = ir.split("?")[0].split("/");
  if (!esUuid(orgId ?? "") || !esUuid(edificioId ?? "")) return null;
  return { orgId, edificioId, seccion, destino: ir };
}

type Estado =
  | { tipo: "cargando" }
  | { tipo: "sin-sesion" }
  | { tipo: "sin-ruta" }
  | { tipo: "sin-copia" }
  | { tipo: "copia"; copia: CopiaEdificio };

export function Cascara() {
  const params = useSearchParams();
  const ruta = leerRuta(params.get("ir"));
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
      if (!ruta) return setEstado({ tipo: "sin-ruta" });
      const copia = await leerCopia(usuarioId, ruta.edificioId).catch(() => null);
      if (!vivo) return;
      // Una copia de otra organización (URL armada a mano) o de otra
      // versión del formato no se usa.
      if (!copia || copia.orgId !== ruta.orgId || copia.version !== VERSION_COPIA) return setEstado({ tipo: "sin-copia" });
      setEstado({ tipo: "copia", copia });
    })();
    return () => {
      vivo = false;
    };
    // ruta se deriva de la URL: alcanza con depender del texto de `ir`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get("ir")]);

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
  const props = armarPropsPropietarios(copia.propietarios);
  // Dentro de la cáscara se navega cambiando `?ir=` con el history del
  // navegador (Next sincroniza useSearchParams): no pide nada a la red.
  const irA = (seccion: string) =>
    window.history.pushState(null, "", `${RUTA_CASCARA}?ir=${encodeURIComponent(`/admin/${copia.orgId}/${copia.edificioId}/${seccion}`)}`);

  let contenido: ReactNode;
  if (ruta!.seccion === "propietarios") {
    contenido = <Propietarios orgId={copia.orgId} edificioId={copia.edificioId} {...props} />;
  } else {
    contenido = (
      <Card>
        <p style={{ marginTop: 0, fontSize: 14 }}>
          Esta sección todavía no se puede ver sin conexión. En esta prueba, sin conexión solo está Propietarios.
        </p>
        <Button type="button" onClick={() => irA("propietarios")}>
          <Users size={16} /> Ver Propietarios
        </Button>
      </Card>
    );
  }

  return (
    <div className="admin-marco">
      <main className="admin-principal">
        <div
          role="status"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            padding: "10px 16px",
            background: enLinea ? "var(--acento-suave)" : "var(--acento)",
            color: enLinea ? "var(--acento-texto)" : "var(--acento-sobre)",
            fontSize: 13.5,
          }}
        >
          {enLinea ? <Wifi size={16} /> : <CloudOff size={16} />}
          <span style={{ flex: 1, minWidth: 200 }}>
            {enLinea
              ? "Volvió la conexión. Lo que ve es la copia guardada."
              : `${lenta ? "Conexión muy lenta" : "Sin conexión"}: está viendo los datos de ${formatoHora(copia.sincronizadoEn)}.`}
          </span>
          <Button type="button" variante={enLinea ? "primario" : "secundario"} onClick={volver}>
            <RefreshCw size={15} /> {enLinea ? "Ver lo último" : "Reintentar"}
          </Button>
        </div>
        <header className="admin-cabecera">
          <div style={{ minWidth: 0 }}>
            <h1 className="admin-titulo">{copia.edificioNombre}</h1>
            <p className="admin-subtitulo">Copia sin conexión de este equipo</p>
          </div>
        </header>
        <div className="admin-relleno">{contenido}</div>
      </main>
    </div>
  );
}
