"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "@/components/ui";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { formatoHora } from "@/lib/formato";
import type { VisitaDentro } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";
import { SIN_CONEXION_ACTIVO } from "@/lib/local/config";
import { EVENTO_COPIA_SUCIA, encolar, useBandeja } from "@/lib/local/bandeja";
import { claseDeError } from "@/lib/local/envios";
import { useCopiaGarita } from "@/lib/garita/sin-conexion";
import { useDirectorioGarita } from "@/components/garita/DirectorioContexto";

/**
 * Vista 2 · Adentro — garita.html:733-771. Lista de quién está adentro
 * ahora (`garita_dentro`) con refresco automático cada 60s — para el
 * relevo de turno, que tiene que ver lo que dejó el anterior sin tocar nada
 * (garita.html:1004-1009).
 *
 * "Registrar salida" (`garita_salida`) ya está conectado — confirmado su
 * SQL real con `pg_get_functiondef` el 28-sep: es **idempotente** (una
 * visita que ya no está "dentro" hace que la función retorne sin tocar
 * nada), así que un doble click no duplica nada — a diferencia de
 * `garita_entrada`, no hace falta blindarlo contra reenvíos.
 *
 * Cambio 3, parte D: sin conexión la lista sale de la copia de la garita,
 * más las entradas de este equipo que todavía no se enviaron («por enviar»),
 * menos las que tienen la salida por enviar. La salida va a la bandeja con
 * su hora.
 */
type Fila = VisitaDentro & { porEnviar?: boolean; entradaIdEquipo?: string };

export function VistaAdentro({ edificioId }: { edificioId: string }) {
  const { aviso, mostrarAviso } = useAvisoTemporal();
  const copia = useCopiaGarita();
  const directorio = useDirectorioGarita();
  const bandeja = useBandeja(edificioId);
  const [adentroServidor, setAdentro] = useState<VisitaDentro[]>([]);
  const [cargando, setCargando] = useState(!copia);
  const [saliendoIds, setSaliendoIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    if (copia) return;
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("garita_dentro", { p_edificio: edificioId });
    setCargando(false);
    if (error) return mostrarAviso(mensajeDeError(error), "mal");
    setAdentro(data ?? []);
  }, [edificioId, mostrarAviso, copia]);

  useEffect(() => {
    if (copia) return;
    // La carga inicial va inline (no `cargar()`, que el lint rechaza como
    // setState directo dentro de un efecto) — `cargar` queda para el botón
    // "Actualizar" y el refresco cada 60s, que no corren dentro de un
    // efecto.
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("garita_dentro", { p_edificio: edificioId }).then(({ data, error }) => {
      if (!vivo) return;
      setCargando(false);
      if (error) return mostrarAviso(mensajeDeError(error), "mal");
      setAdentro(data ?? []);
    });
    const id = setInterval(cargar, 60000);
    // Cambio 3: cuando llega a la base lo que estaba por enviar, se vuelve a
    // leer (si no, esas visitas desaparecerían de la lista hasta el próximo minuto).
    const llego = (e: Event) => {
      if ((e as CustomEvent<{ edificioId: string }>).detail?.edificioId === edificioId) void cargar();
    };
    window.addEventListener(EVENTO_COPIA_SUCIA, llego);
    return () => {
      vivo = false;
      clearInterval(id);
      window.removeEventListener(EVENTO_COPIA_SUCIA, llego);
    };
  }, [edificioId, mostrarAviso, cargar, copia]);

  // Lo de la base (o de la copia) más lo de la bandeja de este equipo.
  const adentro = useMemo<Fila[]>(() => {
    const base = copia ? copia.dentro : adentroServidor;
    const salen = new Set(
      bandeja
        .filter((c) => c.tipo === "garita.salida")
        .map((c) => {
          const d = c.datos as { visitaId?: string | null; entradaIdEquipo?: string | null };
          return d.visitaId ?? d.entradaIdEquipo ?? "";
        })
    );
    const pendientes: Fila[] = bandeja
      .filter((c) => c.tipo === "garita.entrada" && !salen.has(c.id))
      .map((c) => {
        const d = c.datos as { unidadId: string | null; nombre: string; documento?: string | null; placa?: string | null };
        return {
          visita_id: c.id,
          nombre: d.nombre,
          documento: d.documento ?? "",
          unidad: directorio.find((u) => u.unidad_id === d.unidadId)?.codigo ?? "",
          placa: (d.placa ?? "").toUpperCase(),
          entrada_en: c.hechoEn,
          tipo: "",
          porEnviar: true,
          entradaIdEquipo: c.id,
        };
      });
    return [...pendientes, ...base.filter((v) => !salen.has(v.visita_id))];
  }, [copia, adentroServidor, bandeja, directorio]);

  const salidaABandeja = async (v: Fila) => {
    await encolar({
      orgId: "",
      edificioId,
      unidadId: null,
      tipo: "garita.salida",
      datos: v.entradaIdEquipo ? { entradaIdEquipo: v.entradaIdEquipo } : { visitaId: v.visita_id },
      antes: null,
      resumen: `Salida de ${v.nombre}`,
    });
    mostrarAviso("Sin conexión: la salida quedó guardada en este equipo, con su hora, y se envía sola al volver.");
  };

  const registrarSalida = async (v: Fila) => {
    if (copia || v.porEnviar) return salidaABandeja(v);
    setSaliendoIds((s) => new Set(s).add(v.visita_id));
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("garita_salida", { p_visita: v.visita_id });
    if (error) {
      setSaliendoIds((s) => {
        const n = new Set(s);
        n.delete(v.visita_id);
        return n;
      });
      if (SIN_CONEXION_ACTIVO && claseDeError(error) === "red") return salidaABandeja(v);
      return mostrarAviso(mensajeDeError(error), "mal");
    }
    mostrarAviso("Salida registrada.");
    cargar();
  };

  return (
    <div className="garita">
      {aviso && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono={aviso.tono === "mal" ? "rojo" : "ok"}>{aviso.texto}</Aviso>
        </div>
      )}
      <div className="garita-tarjeta">
        <h2>Adentro ahora · {adentro.length}</h2>
        <div className="garita-lista">
          {cargando ? (
            <div className="garita-vacio">Cargando…</div>
          ) : adentro.length ? (
            adentro.map((v) => (
              <div className="garita-item" key={v.visita_id}>
                <div>
                  <div className="garita-item-principal">{v.nombre}</div>
                  <div className="garita-item-secundario">
                    {v.unidad ? `Unidad ${v.unidad} · ` : ""}
                    entró {formatoHora(v.entrada_en)}
                    {v.placa ? ` · ${v.placa}` : ""}
                    {v.documento ? ` · ${v.documento}` : ""}
                    {v.porEnviar ? " · por enviar" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="garita-boton chico"
                  disabled={saliendoIds.has(v.visita_id)}
                  aria-busy={saliendoIds.has(v.visita_id) || undefined}
                  onClick={() => registrarSalida(v)}
                >
                  Registrar salida
                </button>
              </div>
            ))
          ) : (
            <div className="garita-vacio">No hay visitas adentro.</div>
          )}
        </div>
        {!copia && (
          <div className="garita-fila">
            <button type="button" className="garita-boton suave" onClick={cargar}>
              Actualizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
