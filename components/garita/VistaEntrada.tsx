"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Aviso } from "@/components/ui";
import { useDirectorioGarita } from "@/components/garita/DirectorioContexto";
import { VeredictoPantallaCompleta, type DatosVeredicto } from "@/components/garita/VeredictoPantallaCompleta";
import { useAvisoTemporal } from "@/hooks/useAvisoTemporal";
import { useLectorQR } from "@/hooks/useLectorQR";
import { registrarEntradaGarita } from "@/lib/garita/entrada";
import type { ValidacionCodigo } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

type Veredicto = {
  ok: boolean;
  titulo: string;
  datos?: DatosVeredicto;
  /** Solo en el camino válido — lo que hace falta para "Registrar entrada". */
  fila?: ValidacionCodigo;
};

/**
 * Vista 1 · Entrada — garita.html:630-728. Dos caminos para dejar pasar a
 * alguien: código QR de una invitación (`garita_validar`) o visita sin
 * anunciar con autocompletado por cédula (`garita_visitante`).
 *
 * Las 4 acciones de escritura (`garita_entrada`, `garita_avisar`) ya están
 * conectadas — confirmado su SQL real con `pg_get_functiondef` el 28-sep
 * (ver docs/estado-migracion.md, "Bloques 11 y 12").
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
  const [enviandoSinAnunciar, setEnviandoSinAnunciar] = useState(false);
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

    // garita_validar no es de solo lectura: si el código no existe, inserta
    // ella misma un rechazo en la bitácora (para que quede asentado si
    // alguien prueba códigos al azar en la puerta) — efecto de la función,
    // no algo que este cliente tenga que replicar.
    if (error) return mostrarAviso(mensajeDeError(error), "mal");
    const r = data?.[0];
    if (!r) return;

    // El original arma `datos` antes del if(valido) y lo muestra en los dos
    // casos (garita.html:602-607, 610/626) — quién intentó entrar importa
    // también cuando se lo rechaza.
    const datos: DatosVeredicto = {
      nombre: r.nombre,
      documento: r.documento,
      unidad: r.unidad,
      placa: r.placa,
    };

    setVeredicto(
      r.valido
        ? { ok: true, titulo: "Puede pasar", datos, fila: r }
        : { ok: false, titulo: r.motivo || "No puede pasar", datos }
    );
  };

  const { videoRef, activa, error: errorCamara, abrir: abrirCamara, cerrar: cerrarCamara } = useLectorQR((codigo) => {
    validar(codigo);
  });

  const comprobarCodigoManual = () => validar(codigo);

  const onKeyDownCodigo = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") validar(codigo);
  };

  const registrarEntradaDesdeVeredicto = async () => {
    const fila = veredicto?.fila;
    // Cierra ya mismo, como el original (garita.html:612) — evita un
    // segundo click sobre el mismo veredicto mientras se escribe (garita_entrada
    // no es idempotente: cada llamada crea una visita nueva).
    setVeredicto(null);
    if (!fila) return;

    const unidad = directorio.find((u) => u.codigo === fila.unidad)?.unidad_id ?? null;
    const supabase = crearClienteNavegador();
    // `unidadId: null` cuando el código no resuelve a ninguna unidad del
    // directorio: la firma real de garita_entrada exige el parámetro pero
    // acepta NULL — el detalle está en lib/garita/entrada.ts.
    const { data: id, error } = await registrarEntradaGarita(supabase, {
      edificioId,
      unidadId: unidad,
      nombre: fila.nombre,
      documento: fila.documento ?? undefined,
      placa: fila.placa ?? undefined,
      invitacionId: fila.invitacion_id ?? undefined,
    });
    if (error) return mostrarAviso(mensajeDeError(error), "mal");
    if (!id) return;

    mostrarAviso(`Entrada registrada. ${fila.nombre}`, "ok");
    // Sin esperar el resultado, igual que garita.html:620 — a diferencia del
    // formulario de abajo, este camino no le dice al vigilante si el aviso
    // llegó o no.
    void supabase.rpc("garita_avisar", { p_visita: id });
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
      setNombre((actual) => (actual.trim() ? actual : r.nombre));
      setPistaDoc(
        `Ya vino ${r.veces} ${r.veces === 1 ? "vez" : "veces"}` +
          (r.ultima_unidad ? ` · la última a la ${r.ultima_unidad}` : "")
      );
    }, 350);
  };

  const registrarSinAnunciar = async (e: FormEvent) => {
    e.preventDefault();
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) return mostrarAviso("Falta el nombre de quien entra.", "mal");

    setEnviandoSinAnunciar(true);
    const supabase = crearClienteNavegador();
    // El <select> vacío ("Elegir…") es el caso de `null` explícito: una
    // visita sin anunciar que todavía no dice a quién visita.
    const { data: id, error } = await registrarEntradaGarita(supabase, {
      edificioId,
      unidadId: unidadId || null,
      nombre: nombreLimpio,
      documento: documento.trim() || undefined,
      placa: placa.trim() || undefined,
    });
    setEnviandoSinAnunciar(false);
    if (error) return mostrarAviso(mensajeDeError(error), "mal");
    if (!id) return;

    // Acá sí se espera y se le dice al vigilante si el aviso llegó
    // (garita.html:720-723), a diferencia del camino del veredicto de arriba.
    const { data: n } = await supabase.rpc("garita_avisar", { p_visita: id });
    mostrarAviso(
      (n ?? 0) > 0 ? "Entrada registrada. Se le avisó al residente." : "Entrada registrada. No se le pudo avisar al residente.",
      (n ?? 0) > 0 ? "ok" : "mal"
    );
    setDocumento("");
    setNombre("");
    setPlaca("");
    setUnidadId("");
    setPistaDoc("");
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
            <button type="submit" className="garita-boton ancho" disabled={enviandoSinAnunciar}>
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
