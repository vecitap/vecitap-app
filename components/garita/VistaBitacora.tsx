"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Aviso } from "@/components/ui";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { horaCorta, hoyLocalISO } from "@/lib/formato";
import type { NotaBitacora } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";

const ETIQUETA_TIPO: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  rechazo: "Rechazo",
  novedad: "Novedad",
  ronda: "Ronda",
  relevo: "Relevo",
};

/**
 * Vista 4 · Bitácora — garita.html:838-896. El día completo
 * (`garita_bitacora`) ya está conectado.
 *
 * "Anotar" (`garita_nota`) ya está conectado — confirmado su SQL real con
 * `pg_get_functiondef` el 28-sep. Es **inmutable por diseño**: la función
 * solo hace `insert` (nunca `update`/`delete`) y no hay ningún RPC de borrado
 * — cada llamada agrega una fila nueva, sin excepción.
 */
export function VistaBitacora({ edificioId }: { edificioId: string }) {
  const { aviso, mostrarAviso } = useAvisoTemporal();
  const [fecha, setFecha] = useState(hoyLocalISO());
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("novedad");
  const [enviandoNota, setEnviandoNota] = useState(false);

  // "Cargando" se deriva de la clave (fecha), no de un setState sincrónico
  // dentro del efecto — mismo patrón que Cortes.tsx/Estadisticas.tsx (ver
  // docs/estado-migracion.md, "Patrones nuevos").
  const [cargado, setCargado] = useState<{ fecha: string; notas: NotaBitacora[] } | null>(null);
  const notas = cargado?.fecha === fecha ? cargado.notas : [];
  const cargando = cargado?.fecha !== fecha;

  // `cargar` queda aparte (no solo el efecto de abajo) porque "Anotar"
  // también tiene que refrescar cuando la fecha ya era la de hoy —
  // garita.html:892 llama a cargar() sin condición, no solo cuando cambia
  // $("#fecha").value.
  const cargar = useCallback(async () => {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("garita_bitacora", {
      p_edificio: edificioId,
      p_fecha: fecha,
      p_limite: 200,
    });
    if (error) return mostrarAviso(error.message, "mal");
    setCargado({ fecha, notas: data ?? [] });
  }, [edificioId, fecha, mostrarAviso]);

  // Recarga sola al montar y cada vez que cambia la fecha (garita.html:881,
  // $("#fecha").onchange = cargar) — inline, no `cargar()` (el lint rechaza
  // llamar dentro de un efecto a una función que hace setState).
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase
      .rpc("garita_bitacora", { p_edificio: edificioId, p_fecha: fecha, p_limite: 200 })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) return mostrarAviso(error.message, "mal");
        setCargado({ fecha, notas: data ?? [] });
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edificioId, fecha]);

  const anotar = async (e: FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return mostrarAviso("La nota está vacía.", "mal");

    setEnviandoNota(true);
    const supabase = crearClienteNavegador();
    const { data: id, error } = await supabase.rpc("garita_nota", {
      p_edificio: edificioId,
      p_texto: t,
      p_tipo: tipo,
    });
    setEnviandoNota(false);
    if (error) return mostrarAviso(error.message, "mal");
    if (!id) return;

    setTexto("");
    mostrarAviso("Anotado.");
    setFecha(hoyLocalISO());
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
        <h2>Anotar una novedad</h2>
        <form onSubmit={anotar}>
          <textarea
            id="nota"
            className="garita-campo"
            placeholder="Qué pasó, a qué hora, quién estaba."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="garita-campos" style={{ marginTop: 12 }}>
            <div>
              <label className="garita-label" htmlFor="tipoNota">
                Tipo
              </label>
              <select id="tipoNota" className="garita-campo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="novedad">Novedad</option>
                <option value="ronda">Ronda</option>
                <option value="relevo">Relevo de turno</option>
              </select>
            </div>
          </div>
          <div className="garita-fila">
            <button type="submit" className="garita-boton ancho" disabled={enviandoNota}>
              Anotar
            </button>
          </div>
          <p className="garita-pie">
            Lo anotado queda con su nombre y la hora, y no se puede borrar ni corregir después. Si se equivocó,
            anote una línea nueva.
          </p>
        </form>
      </div>

      <div className="garita-tarjeta">
        <h2>El día</h2>
        <input
          type="date"
          className="garita-campo"
          value={fecha}
          onChange={(e) => setFecha(e.target.value || hoyLocalISO())}
        />
        <div className="garita-lista" style={{ marginTop: 12 }}>
          {cargando ? (
            <div className="garita-vacio">Cargando…</div>
          ) : notas.length ? (
            notas.map((b) => (
              <div className="garita-item" key={b.id}>
                <div>
                  <div className="garita-item-principal">{b.texto}</div>
                  <div className="garita-item-secundario">
                    {ETIQUETA_TIPO[b.tipo] || b.tipo} · {b.vigilante}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 19 }}>{horaCorta(b.creado_en)}</div>
              </div>
            ))
          ) : (
            <div className="garita-vacio">Nada anotado ese día.</div>
          )}
        </div>
      </div>
    </div>
  );
}
