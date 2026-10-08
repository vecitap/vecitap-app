"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@/components/ui";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { horaCorta } from "@/lib/formato";
import type { VisitaDentro } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

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
 */
export function VistaAdentro({ edificioId }: { edificioId: string }) {
  const { aviso, mostrarAviso } = useAvisoTemporal();
  const [adentro, setAdentro] = useState<VisitaDentro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [saliendoIds, setSaliendoIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("garita_dentro", { p_edificio: edificioId });
    setCargando(false);
    if (error) return mostrarAviso(mensajeDeError(error), "mal");
    setAdentro(data ?? []);
  }, [edificioId, mostrarAviso]);

  useEffect(() => {
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
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [edificioId, mostrarAviso, cargar]);

  const registrarSalida = async (visitaId: string) => {
    setSaliendoIds((s) => new Set(s).add(visitaId));
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("garita_salida", { p_visita: visitaId });
    if (error) {
      setSaliendoIds((s) => {
        const n = new Set(s);
        n.delete(visitaId);
        return n;
      });
      return mostrarAviso(mensajeDeError(error), "mal");
    }
    mostrarAviso("Salida registrada.");
    cargar();
  };

  return (
    <div className="garita">
      {aviso && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono={aviso.tono === "mal" ? "rojo" : "verde"}>{aviso.texto}</Aviso>
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
                    entró {horaCorta(v.entrada_en)}
                    {v.placa ? ` · ${v.placa}` : ""}
                    {v.documento ? ` · ${v.documento}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="garita-boton chico"
                  disabled={saliendoIds.has(v.visita_id)}
                  aria-busy={saliendoIds.has(v.visita_id) || undefined}
                  onClick={() => registrarSalida(v.visita_id)}
                >
                  Registrar salida
                </button>
              </div>
            ))
          ) : (
            <div className="garita-vacio">No hay visitas adentro.</div>
          )}
        </div>
        <div className="garita-fila">
          <button type="button" className="garita-boton suave" onClick={cargar}>
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
}
