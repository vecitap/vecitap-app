"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Badge, Button, Campo, Card, Confirmar, Input, Select, Textarea } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

export type FiltroMensaje = "todos" | "propietarios" | "inquilinos" | "deudores";

const FILTROS: Record<FiltroMensaje, string> = {
  todos: "Todo el edificio (propietarios e inquilinos)",
  propietarios: "Solo propietarios",
  inquilinos: "Solo inquilinos",
  deudores: "Solo quienes deben",
};

type Vista = { destinatarios: number; con_copia: number; correos: number; tope: number; libre_hoy: number; en_cola: number; dias: number };

export type MensajeHistorial = {
  id: string;
  asunto: string;
  texto: string;
  destinatarios: string;
  cantidad: number;
  creado_en: string;
  enviados: number;
  pendientes: number;
  fallidos: number;
};

/**
 * Mensajes masivos por correo (ronda 7, bloque 7, caso 85). Asunto y texto,
 * a quién, la vista previa con cuántos lo reciben y una confirmación antes
 * de enviar. Se encola en `cola_correo` (`enviar_mensaje()`) y sale por
 * Resend con el despachador de siempre, que respeta el tope diario del plan:
 * si no cabe hoy, la vista previa lo dice y el envío se reparte en varios
 * días. El correo de respaldo de cada persona va en copia.
 */
export function Mensajes({ edificioId, historial }: { edificioId: string; historial: MensajeHistorial[] }) {
  const router = useRouter();
  const [asunto, setAsunto] = useState("");
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<FiltroMensaje>("todos");
  const [vista, setVista] = useState<{ filtro: FiltroMensaje; datos: Vista } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<number | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  // La vista previa se pide cada vez que cambia a quién va.
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("vista_previa_mensaje", { p_edificio: edificioId, p_filtro: filtro }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) return setError(mensajeDeError(e));
      setVista({ filtro, datos: data as unknown as Vista });
    });
    return () => {
      vivo = false;
    };
  }, [edificioId, filtro]);

  const v = vista?.filtro === filtro ? vista.datos : null;

  async function enviar() {
    setConfirmar(false);
    setEnviando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.rpc("enviar_mensaje", { p_edificio: edificioId, p_asunto: asunto, p_texto: texto, p_filtro: filtro });
    setEnviando(false);
    if (e) return setError(mensajeDeError(e));
    setHecho((data as { encolados: number }).encolados);
    setAsunto("");
    setTexto("");
    router.refresh();
  }

  const listo = asunto.trim() && texto.trim() && v && v.destinatarios > 0;
  const cuando = !v ? "" : v.dias <= 1 ? "Sale hoy." : `No cabe completo en el cupo de hoy: se reparte en ${v.dias} días (salen primero los recibos).`;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Enviar un mensaje</h2>
        <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
          Llega por correo a cada persona, una sola vez aunque tenga varias unidades, con su correo de respaldo en copia.
          Las respuestas le llegan a su administración.
        </p>
        {hecho !== null && (
          <div style={{ marginBottom: 12 }}>
            <Aviso tono="ok" titulo="Mensaje en camino">
              {hecho === 1 ? "1 correo quedó en la cola de envío." : `${hecho} correos quedaron en la cola de envío.`} Abajo, en «Mensajes enviados»,
              ve cuántos salieron.
            </Aviso>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 12 }}>
            <Aviso tono="rojo" titulo="No se pudo enviar">
              {error}
            </Aviso>
          </div>
        )}
        <div style={{ display: "grid", gap: 12 }}>
          <Campo etiqueta="Para">
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroMensaje)}>
              {Object.entries(FILTROS).map(([k, t]) => (
                <option key={k} value={k}>
                  {t}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Asunto">
            <Input value={asunto} maxLength={200} onChange={(e) => setAsunto(e.target.value)} placeholder="Corte de agua el jueves" />
          </Campo>
          <Campo etiqueta="Mensaje">
            <Textarea value={texto} maxLength={5000} rows={7} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
        </div>

        <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: "var(--fondo)", border: "1px solid var(--linea)", fontSize: 13.5, lineHeight: 1.55 }}>
          {!v ? (
            <span style={{ color: "var(--tenue)" }}>Contando destinatarios…</span>
          ) : v.destinatarios === 0 ? (
            <span>Nadie con correo en este grupo: no hay a quién enviarlo.</span>
          ) : (
            <>
              <b>
                {v.destinatarios} {v.destinatarios === 1 ? "persona" : "personas"}
              </b>
              {v.con_copia > 0 ? ` (${v.con_copia} con copia a su correo de respaldo)` : ""} · {v.correos} {v.correos === 1 ? "correo" : "correos"}.{" "}
              <span style={{ color: v.dias > 1 ? "var(--ambar)" : "var(--tinta-2)", fontWeight: v.dias > 1 ? 600 : 400 }}>{cuando}</span>
              <div style={{ fontSize: 12, color: "var(--tenue)", marginTop: 2 }}>
                El plan de correo permite {v.tope} por día; hoy quedan {v.libre_hoy}
                {v.en_cola ? ` y hay ${v.en_cola} esperando en la cola` : ""}.
              </div>
            </>
          )}
        </div>

        {asunto.trim() && texto.trim() && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "var(--tenue)", marginBottom: 4 }}>Así se va a ver</div>
            <div style={{ border: "1px solid var(--linea)", borderRadius: 10, padding: 14, background: "var(--lienzo)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6, overflowWrap: "anywhere" }}>{asunto}</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, overflowWrap: "anywhere" }}>{texto}</div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <Button type="button" cargando={enviando} disabled={!listo} onClick={() => setConfirmar(true)}>
            Enviar
          </Button>
        </div>
      </Card>

      <Card>
        <h2 style={{ margin: "0 0 10px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Mensajes enviados</h2>
        {!historial.length && <p style={{ fontSize: 13, color: "var(--tenue)", margin: 0 }}>Todavía no se envió ningún mensaje desde este edificio.</p>}
        {historial.map((m) => (
          <div key={m.id} style={{ borderTop: "1px solid var(--linea)", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <button
                type="button"
                onClick={() => setAbierto(abierto === m.id ? null : m.id)}
                style={{ background: "none", border: "none", padding: 0, textAlign: "left", fontWeight: 700, fontSize: 14, color: "var(--tinta)", cursor: "pointer", overflowWrap: "anywhere" }}
              >
                {m.asunto}
              </button>
              <span style={{ fontSize: 12, color: "var(--tenue)" }}>{new Date(m.creado_en).toLocaleString("es-VE", { timeZone: "America/Caracas", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {FILTROS[m.destinatarios as FiltroMensaje] ?? m.destinatarios} · {m.cantidad} {m.cantidad === 1 ? "persona" : "personas"} ·
              <Badge tono="neutro">{m.enviados} enviados</Badge>
              {m.pendientes > 0 && <Badge tono="ambar">{m.pendientes} esperando</Badge>}
              {m.fallidos > 0 && <Badge tono="rojo">{m.fallidos} fallaron</Badge>}
            </div>
            {abierto === m.id && <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--tinta-2)" }}>{m.texto}</div>}
          </div>
        ))}
      </Card>

      {confirmar && v && (
        <Confirmar
          titulo="¿Enviar este mensaje?"
          texto={`«${asunto.trim()}» le llega por correo a ${v.destinatarios} ${v.destinatarios === 1 ? "persona" : "personas"} (${FILTROS[filtro].toLowerCase()}). ${cuando} Una vez enviado no se puede retirar.`}
          boton="Sí, enviar"
          onSi={enviar}
          onNo={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}
