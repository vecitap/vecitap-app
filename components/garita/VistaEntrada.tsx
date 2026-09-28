"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Aviso } from "@/components/ui";
import { useDirectorioGarita } from "@/components/garita/DirectorioContexto";
import { VeredictoPantallaCompleta, type DatosVeredicto } from "@/components/garita/VeredictoPantallaCompleta";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { useLectorQR } from "@/hooks/useLectorQR";
import { mensajePendienteEscritura } from "@/lib/garita/pendiente-escritura";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Veredicto = {
  ok: boolean;
  titulo: string;
  datos?: DatosVeredicto;
};

/**
 * Vista 1 · Entrada — garita.html:630-728. Dos caminos para dejar pasar a
 * alguien: código QR de una invitación (`garita_validar`) o visita sin
 * anunciar con autocompletado por cédula (`garita_visitante`). Los dos son
 * de lectura y ya están conectados a la base.
 *
 * "Registrar entrada" (adentro del veredicto y en el formulario de abajo)
 * llama a `garita_entrada` + `garita_avisar`, escritura, y queda pendiente
 * de confirmar el SQL real con `pg_get_functiondef` antes de conectarse —
 * ver docs/estado-migracion.md, bloque 11.
 */
export function VistaEntrada({ edificioId }: { edificioId: string }) {
  const directorio = useDirectorioGarita();
  const { aviso, mostrarAviso } = useAvisoTemporal();

  const [codigo, setCodigo] = useState("");
  const [validando, setValidando] = useState(false);
  const [veredicto, setVeredicto] = useState<Veredicto | null>(null);

  const [documento, setDocumento] = useState("");
  const [nombre, setNombre] = useState("");
  const [unidadId, setUnidadId] = useState("");
  const [placa, setPlaca] = useState("");
  const [pistaDoc, setPistaDoc] = useState("");
  const temporizadorDoc = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validar = async (codigoBruto: string) => {
    // Acepta un enlace completo, igual que garita.html:594.
    const limpio = String(codigoBruto || "").trim().replace(/^.*\//, "");
    if (!limpio) return;

    setValidando(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("garita_validar", {
      p_edificio: edificioId,
      p_codigo: limpio,
    });
    setValidando(false);

    if (error) return mostrarAviso(error.message, "mal");
    const r = data?.[0];
    if (!r) return;

    const datos: DatosVeredicto = {
      nombre: r.nombre,
      documento: r.documento,
      unidad: r.unidad,
      placa: r.placa,
    };

    setVeredicto(
      r.valido
        ? { ok: true, titulo: "Puede pasar", datos }
        : { ok: false, titulo: r.motivo || "No puede pasar" }
    );
  };

  const { videoRef, activa, error: errorCamara, abrir: abrirCamara, cerrar: cerrarCamara } = useLectorQR((codigo) => {
    validar(codigo);
  });

  const comprobarCodigoManual = () => validar(codigo);

  const onKeyDownCodigo = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") validar(codigo);
  };

  const registrarEntradaDesdeVeredicto = () => {
    setVeredicto(null);
    mostrarAviso(mensajePendienteEscritura("Registrar entrada"), "mal");
  };

  const onInputDocumento = (valor: string) => {
    setDocumento(valor);
    if (temporizadorDoc.current) clearTimeout(temporizadorDoc.current);
    const limpio = valor.replace(/[^0-9A-Za-z]/g, "");
    if (limpio.length < 6) {
      setPistaDoc("");
      return;
    }
    temporizadorDoc.current = setTimeout(async () => {
      const supabase = crearClienteNavegador();
      const { data } = await supabase.rpc("garita_visitante", {
        p_edificio: edificioId,
        p_documento: valor,
      });
      const r = data?.[0];
      if (!r) {
        setPistaDoc("");
        return;
      }
      setNombre((actual) => actual.trim() ? actual : r.nombre);
      setPistaDoc(
        `Ya vino ${r.veces} ${r.veces === 1 ? "vez" : "veces"}` +
          (r.ultima_unidad ? ` · la última a la ${r.ultima_unidad}` : "")
      );
    }, 350);
  };

  const registrarSinAnunciar = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return mostrarAviso("Falta el nombre de quien entra.", "mal");
    mostrarAviso(mensajePendienteEscritura("Registrar y avisar al residente"), "mal");
  };

  return (
    <div className="garita">
      {aviso && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono={aviso.tono === "mal" ? "rojo" : "verde"}>{aviso.texto}</Aviso>
        </div>
      )}

      <div className="garita-tarjeta">
        <h2>Visita anunciada · código QR</h2>
        <video
          ref={videoRef}
          playsInline
          muted
          className="garita-camara"
          style={{ display: activa ? "block" : "none" }}
        />
        {errorCamara && (
          <div style={{ marginBottom: 12 }}>
            <Aviso tono="rojo">{errorCamara}</Aviso>
          </div>
        )}
        <div className="garita-fila">
          <button type="button" className="garita-boton" onClick={abrirCamara}>
            Abrir la cámara
          </button>
          <button type="button" className="garita-boton suave" onClick={cerrarCamara}>
            Cerrar la cámara
          </button>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="garita-label" htmlFor="codigo">
            O escriba el código que trae la visita
          </label>
          <input
            id="codigo"
            className="garita-campo"
            style={{ fontFamily: "var(--font-mono)" }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="A1B2C3D4E5F6A7B8"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={onKeyDownCodigo}
          />
        </div>
        <div className="garita-fila">
          <button type="button" className="garita-boton ancho" disabled={validando} onClick={comprobarCodigoManual}>
            {validando ? "Comprobando…" : "Comprobar"}
          </button>
        </div>
      </div>

      <div className="garita-tarjeta">
        <h2>Visita sin anunciar</h2>
        <form onSubmit={registrarSinAnunciar}>
          <div className="garita-campos">
            <div>
              <label className="garita-label" htmlFor="doc">
                Cédula
              </label>
              <input
                id="doc"
                className="garita-campo"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="V-12345678"
                value={documento}
                onChange={(e) => onInputDocumento(e.target.value)}
              />
            </div>
            <div>
              <label className="garita-label" htmlFor="nom">
                Nombre
              </label>
              <input
                id="nom"
                className="garita-campo"
                autoComplete="off"
                placeholder="Nombre y apellido"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div>
              <label className="garita-label" htmlFor="uni">
                Unidad que visita
              </label>
              <select
                id="uni"
                className="garita-campo"
                value={unidadId}
                onChange={(e) => setUnidadId(e.target.value)}
              >
                <option value="">Elegir…</option>
                {directorio.map((u) => (
                  <option key={u.unidad_id} value={u.unidad_id}>
                    {u.codigo}
                    {u.residente ? ` · ${u.residente}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="garita-label" htmlFor="placa">
                Vehículo <span style={{ opacity: 0.7 }}>(opcional)</span>
              </label>
              <input
                id="placa"
                className="garita-campo"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="AB123CD"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
              />
            </div>
          </div>
          <div className="garita-fila">
            <button type="submit" className="garita-boton ancho">
              Registrar y avisar al residente
            </button>
          </div>
          <p className="garita-pie">{pistaDoc}</p>
        </form>
      </div>

      {veredicto && (
        <VeredictoPantallaCompleta
          ok={veredicto.ok}
          titulo={veredicto.titulo}
          datos={veredicto.datos}
          acciones={
            veredicto.ok
              ? [
                  { texto: "Registrar entrada", fuerte: true, onClick: registrarEntradaDesdeVeredicto },
                  { texto: "Cancelar", onClick: () => setVeredicto(null) },
                ]
              : [{ texto: "Cerrar", fuerte: true, onClick: () => setVeredicto(null) }]
          }
        />
      )}
    </div>
  );
}
