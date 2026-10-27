"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Badge, Button, Campo, Card, Confirmar, Input, Select, Textarea } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";
import { cuandoSale, esperaCupo } from "@/lib/cupo-correo";

export type FiltroMensaje = "todos" | "propietarios" | "inquilinos" | "deudores";

const FILTROS: Record<FiltroMensaje, string> = {
  todos: "Todo el edificio (propietarios e inquilinos)",
  propietarios: "Solo propietarios",
  inquilinos: "Solo inquilinos",
  deudores: "Solo quienes deben",
};

type Vista = {
  destinatarios: number;
  con_copia: number;
  correos: number;
  tope: number;
  libre_hoy: number;
  en_cola: number;
  dias: number;
  sale_en: string | null;
};

/** Una unidad del edificio, con si el filtro la elige y quién recibe ahí (ronda 8). */
type UnidadMensaje = { unidad_id: string; codigo: string; incluida: boolean; quien: string | null; con_correo: boolean };

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
  /** Ronda 8: cuántos esperan el cupo diario, y cuándo sale el último. */
  esperan_cupo: number;
  sale_en: string | null;
  a_mano: boolean;
};

/**
 * Mensajes masivos por correo (ronda 7, bloque 7, caso 85). Asunto y texto,
 * a quién, la vista previa con cuántos lo reciben y una confirmación antes
 * de enviar. Se encola en `cola_correo` (`enviar_mensaje()`) y sale por
 * Resend con el despachador de siempre, que respeta el tope diario del plan.
 *
 * Ronda 8 (prueba 13 de Gustavo, caso 88): la pantalla muestra a qué
 * unidades va con cualquier filtro y deja agregar o quitar unidades a mano;
 * y dice cuántos salieron, cuántos esperan el cupo y cuándo salen.
 */
export function Mensajes({ edificioId, historial }: { edificioId: string; historial: MensajeHistorial[] }) {
  const router = useRouter();
  const [asunto, setAsunto] = useState("");
  const [texto, setTexto] = useState("");
  const [filtro, setFiltro] = useState<FiltroMensaje>("todos");
  const [unidades, setUnidades] = useState<{ filtro: FiltroMensaje; lista: UnidadMensaje[] } | null>(null);
  /** Lo cambiado a mano sobre lo que elige el filtro: unidad → va o no va. */
  const [aMano, setAMano] = useState<Record<string, boolean>>({});
  const [verUnidades, setVerUnidades] = useState(false);
  const [vista, setVista] = useState<{ clave: string; datos: Vista } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ encolados: number; sale_en: string | null } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  // Las unidades que elige el filtro, cada vez que cambia.
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("unidades_mensaje", { p_edificio: edificioId, p_filtro: filtro }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) return setError(mensajeDeError(e));
      setUnidades({ filtro, lista: (data ?? []) as UnidadMensaje[] });
      setAMano({});
    });
    return () => {
      vivo = false;
    };
  }, [edificioId, filtro]);

  const lista = unidades?.filtro === filtro ? unidades.lista : null;
  const va = (u: UnidadMensaje) => aMano[u.unidad_id] ?? u.incluida;
  const elegidas = useMemo(() => (lista ? lista.filter(va) : []), [lista, aMano]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiadas = Object.keys(aMano).length > 0;
  // null = las del filtro (la base las elige); con cambios, la lista final.
  const pUnidades = cambiadas ? elegidas.map((u) => u.unidad_id) : null;
  const claveVista = `${filtro}|${pUnidades?.join(",") ?? ""}`;

  // La vista previa se pide cada vez que cambia a quién va.
  useEffect(() => {
    if (!lista) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase
      .rpc("vista_previa_mensaje", { p_edificio: edificioId, p_filtro: filtro, ...(pUnidades ? { p_unidades: pUnidades } : {}) })
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) return setError(mensajeDeError(e));
        setVista({ clave: claveVista, datos: data as unknown as Vista });
      });
    return () => {
      vivo = false;
    };
  }, [edificioId, claveVista, lista]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = vista?.clave === claveVista ? vista.datos : null;

  async function enviar() {
    setConfirmar(false);
    setEnviando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.rpc("enviar_mensaje", {
      p_edificio: edificioId,
      p_asunto: asunto,
      p_texto: texto,
      p_filtro: filtro,
      ...(pUnidades ? { p_unidades: pUnidades } : {}),
    });
    setEnviando(false);
    if (e) return setError(mensajeDeError(e));
    setHecho(data as unknown as { encolados: number; sale_en: string | null });
    setAsunto("");
    setTexto("");
    router.refresh();
  }

  const listo = asunto.trim() && texto.trim() && v && v.destinatarios > 0;
  const cuando = !v
    ? ""
    : !esperaCupo(v.sale_en)
      ? "Sale en los próximos minutos."
      : `No cabe completo en el cupo de hoy: una parte espera y lo último sale ${cuandoSale(v.sale_en)} (salen primero los recibos).`;
  const codigos = (us: UnidadMensaje[]) => (us.length > 14 ? `${us.slice(0, 14).map((u) => u.codigo).join(", ")}…` : us.map((u) => u.codigo).join(", "));

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Enviar un mensaje</h2>
        <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
          Llega por correo a cada persona, una sola vez aunque tenga varias unidades, con su correo de respaldo en copia.
          Las respuestas le llegan a su administración.
        </p>
        <div>
          {hecho !== null && (
            <div style={{ marginBottom: 12 }}>
              <Aviso tono="ok" titulo="Mensaje en camino">
                {hecho.encolados === 1 ? "1 correo quedó en la cola de envío" : `${hecho.encolados} correos quedaron en la cola de envío`}:{" "}
                {esperaCupo(hecho.sale_en)
                  ? `una parte espera el cupo diario y lo último sale ${cuandoSale(hecho.sale_en)}.`
                  : "salen en los próximos minutos."}{" "}
                Abajo, en «Mensajes enviados», ve cuántos salieron.
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
        </div>
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

          {/* Ronda 8: a qué unidades va, y agregar o quitar a mano. */}
          <div style={{ border: "1px solid var(--linea)", borderRadius: 10, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5 }}>
            {!lista ? (
              <span style={{ color: "var(--tenue)" }}>Buscando las unidades…</span>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    <b>
                      Va a {elegidas.length} {elegidas.length === 1 ? "unidad" : "unidades"}
                    </b>
                    {elegidas.length > 0 && `: ${codigos(elegidas)}`}
                    {cambiadas && <span style={{ color: "var(--tinta-2)" }}> (elegidas a mano)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVerUnidades(!verUnidades)}
                    aria-expanded={verUnidades}
                    style={{ background: "none", border: "none", padding: 0, color: "var(--tinta-2)", fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
                  >
                    {verUnidades ? "Listo" : "Ver y cambiar"}
                  </button>
                </div>
                {verUnidades && (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
                      <Button type="button" mini variante="secundario" onClick={() => setAMano(Object.fromEntries(lista.map((u) => [u.unidad_id, true])))}>
                        Todas
                      </Button>
                      <Button type="button" mini variante="secundario" onClick={() => setAMano(Object.fromEntries(lista.map((u) => [u.unidad_id, false])))}>
                        Ninguna
                      </Button>
                      {cambiadas && (
                        <Button type="button" mini variante="secundario" onClick={() => setAMano({})}>
                          Volver a «{FILTROS[filtro]}»
                        </Button>
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", maxHeight: 280, overflowY: "auto" }}>
                      {lista.map((u) => (
                        <label
                          key={u.unidad_id}
                          title={u.quien ?? "sin nadie registrado"}
                          style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 13, padding: "3px 0", minWidth: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={va(u)}
                            onChange={(e) => setAMano((m) => ({ ...m, [u.unidad_id]: e.target.checked }))}
                            style={{ marginTop: 3 }}
                          />
                          <span style={{ minWidth: 0 }}>
                            <b className="mono">{u.codigo}</b>
                            {!u.con_correo && <span style={{ display: "block", fontSize: 11, color: "var(--ambar)" }}>sin correo: no le llega</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

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
            <span>Nadie con correo en estas unidades: no hay a quién enviarlo.</span>
          ) : (
            <>
              <b>
                {v.destinatarios} {v.destinatarios === 1 ? "persona" : "personas"}
              </b>
              {v.con_copia > 0 ? ` (${v.con_copia} con copia a su correo de respaldo)` : ""} · {v.correos} {v.correos === 1 ? "correo" : "correos"}.{" "}
              <span style={{ color: esperaCupo(v.sale_en) ? "var(--ambar)" : "var(--tinta-2)", fontWeight: esperaCupo(v.sale_en) ? 600 : 400 }}>{cuando}</span>
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
        {historial.map((m) => {
          const enCamino = m.pendientes - m.esperan_cupo;
          return (
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
                {FILTROS[m.destinatarios as FiltroMensaje] ?? m.destinatarios}
                {m.a_mano ? " (unidades elegidas a mano)" : ""} · {m.cantidad} {m.cantidad === 1 ? "persona" : "personas"} ·
                <Badge tono="neutro">{m.enviados} enviados</Badge>
                {enCamino > 0 && <Badge tono="neutro">{enCamino} salen en los próximos minutos</Badge>}
                {m.esperan_cupo > 0 && <Badge tono="ambar">{m.esperan_cupo} esperan el cupo diario</Badge>}
                {m.fallidos > 0 && <Badge tono="rojo">{m.fallidos} fallaron</Badge>}
              </div>
              {m.esperan_cupo > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--ambar)", marginTop: 4, lineHeight: 1.5 }}>
                  Se llegó al tope de correos por día del plan. Salen solos a medida que se libera cupo: lo último, {cuandoSale(m.sale_en)}.
                </div>
              )}
              {abierto === m.id && <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.6, marginTop: 8, color: "var(--tinta-2)" }}>{m.texto}</div>}
            </div>
          );
        })}
      </Card>

      {confirmar && v && (
        <Confirmar
          titulo="¿Enviar este mensaje?"
          texto={`«${asunto.trim()}» le llega por correo a ${v.destinatarios} ${v.destinatarios === 1 ? "persona" : "personas"} de ${elegidas.length} ${elegidas.length === 1 ? "unidad" : "unidades"} (${cambiadas ? "elegidas a mano" : FILTROS[filtro].toLowerCase()}). ${cuando} Una vez enviado no se puede retirar.`}
          boton="Sí, enviar"
          onSi={enviar}
          onNo={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}
