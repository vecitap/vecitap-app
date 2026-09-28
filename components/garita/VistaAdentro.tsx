"use client";

import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@/components/ui";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { horaCorta } from "@/lib/formato";
import { mensajePendienteEscritura } from "@/lib/garita/pendiente-escritura";
import type { VisitaDentro } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Vista 2 · Adentro — garita.html:733-771. Lista de quién está adentro
 * ahora (`garita_dentro`, lectura) con refresco automático cada 60s — para
 * el relevo de turno, que tiene que ver lo que dejó el anterior sin tocar
 * nada (garita.html:1004-1009).
 *
 * "Registrar salida" llama a `garita_salida`, escritura, pendiente de
 * confirmar el SQL antes de conectarse (docs/estado-migracion.md, bloque 11).
 */
export function VistaAdentro({ edificioId }: { edificioId: string }) {
  const { aviso, mostrarAviso } = useAvisoTemporal();
  const [adentro, setAdentro] = useState<VisitaDentro[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("garita_dentro", { p_edificio: edificioId });
    setCargando(false);
    if (error) return mostrarAviso(error.message, "mal");
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
      if (error) return mostrarAviso(error.message, "mal");
      setAdentro(data ?? []);
    });
    const id = setInterval(cargar, 60000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [edificioId, mostrarAviso, cargar]);

  const registrarSalida = () => {
    mostrarAviso(mensajePendienteEscritura("Registrar salida"), "mal");
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
                <button type="button" className="garita-boton chico" onClick={registrarSalida}>
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
