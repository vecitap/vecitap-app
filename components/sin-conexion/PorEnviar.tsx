"use client";

import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { Badge, Button, Card, Confirmar, type TonoBadge } from "@/components/ui";
import { formatoFecha, nf } from "@/lib/formato";
import { formatoHora } from "@/lib/local/formato";
import { descartar, enviarPendientes, reenviar, useBandeja } from "@/lib/local/bandeja";
import type { Cosa } from "@/lib/local/bandeja-tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/**
 * «Por enviar» (cambio 3, parte B, plan 2.2–2.5): lo hecho en este equipo
 * que todavía no llegó a la base. Se muestra aparte y **no toca los saldos**:
 * los saldos son los que dio la base.
 *
 * Lo que la base no aceptó queda en «Revisar», con el motivo y lo que se
 * puede hacer. Nada se borra solo.
 *
 * `filtro` elige qué mostrar (en la ficha, los de esa unidad; en Gastos del
 * mes, los gastos y cargos). Sin cosas, no dibuja nada.
 */

const ESTADO: Record<Cosa["estado"], [string, TonoBadge]> = {
  por_enviar: ["Por enviar", "ambar"],
  enviando: ["Enviando…", "azul"],
  revisar: ["Revisar", "rojo"],
};

const NOMBRE_CAMPO: Record<string, string> = {
  concepto: "concepto",
  monto: "monto",
  referencia: "referencia",
  nota: "nota",
  nombre: "nombre",
  correo: "correo",
  telefono: "teléfono",
  documento: "cédula",
  categoria_id: "categoría",
  tipo: "tipo",
  bolsillo: "bolsillo",
  unidad_id: "unidad",
};

function textoValor(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return nf(2).format(v);
  return String(v);
}

export function PorEnviar({
  edificioId,
  filtro,
  titulo = "Por enviar",
  codigos = {},
}: {
  edificioId?: string | null;
  filtro?: (c: Cosa) => boolean;
  titulo?: string;
  /** id de unidad → código, para mostrar los posibles duplicados. */
  codigos?: Record<string, string>;
}) {
  const todas = useBandeja(edificioId);
  const cosas = filtro ? todas.filter(filtro) : todas;
  const [borrar, setBorrar] = useState<Cosa | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mandando, setMandando] = useState(false);

  if (!cosas.length) return null;

  const enviarYa = async () => {
    setMandando(true);
    setError(null);
    const r = await enviarPendientes().catch(() => null);
    setMandando(false);
    if (r && r.enviadas === 0 && cosas.some((c) => c.estado === "por_enviar")) setError("Todavía no hay conexión. Se vuelve a intentar solo.");
  };

  /** «Pasarlo al mes abierto»: el mes de ese gasto o cargo se cerró. */
  const alMesAbierto = async (c: Cosa) => {
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.from("periodos").select("id").eq("edificio_id", c.edificioId).eq("estado", "abierto").maybeSingle();
    if (e) return setError(mensajeDeError(e));
    if (!data) return setError("Este edificio no tiene un mes abierto. Abra el mes y vuelva a intentarlo.");
    const fila = { ...(c.datos.fila as Record<string, unknown>), periodo_id: data.id };
    await reenviar(c.id, { datos: { ...c.datos, fila } });
  };

  const porEnviar = cosas.filter((c) => c.estado !== "revisar").length;

  return (
    <Card style={{ borderTop: "3px solid var(--acento)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontFamily: "var(--font-titulos)", display: "flex", gap: 8, alignItems: "center" }}>
          <CloudUpload size={17} /> {titulo} ({cosas.length})
        </h3>
        {porEnviar > 0 && (
          <Button type="button" mini variante="secundario" cargando={mandando} onClick={enviarYa}>
            Enviar ahora
          </Button>
        )}
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 12.5, color: "var(--tenue)" }}>
        Hecho en este equipo, todavía no está en la base. No cambia los saldos hasta que llegue.
      </p>
      {error && <p style={{ color: "var(--rojo)", fontSize: 13, margin: "0 0 8px" }}>{error}</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {cosas.map((c) => {
          const [etq, tono] = ESTADO[c.estado];
          const r = c.revisar;
          return (
            <div key={c.id} style={{ border: "1px solid var(--linea)", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tono={tono}>{etq}</Badge>
                <span style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>{c.resumen}</span>
                <span style={{ fontSize: 12, color: "var(--tenue)" }}>
                  {formatoFecha(c.hechoEn)} {formatoHora(c.hechoEn)}
                </span>
              </div>

              {r && <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-2)" }}>{r.mensaje}</p>}

              {r?.clase === "duplicado" && (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--tinta-2)" }}>
                  {r.candidatos.map((p) => (
                    <li key={p.id}>
                      {codigos[p.unidad_id] ?? "Unidad"} · {formatoFecha(p.fecha)} · {p.moneda === "VES" ? "Bs. " : "$ "}
                      {nf(2).format(p.monto)} · {p.metodo ?? "—"} · ref. {p.referencia || "—"} · {p.estado}
                    </li>
                  ))}
                </ul>
              )}

              {r?.clase === "conflicto" && c.antes && (
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", display: "grid", gap: 2 }}>
                  {Object.keys(c.antes)
                    .filter((k) => k in ((c.datos.campos as object) ?? {}) || k === "nota")
                    .map((k) => (
                      <span key={k}>
                        {NOMBRE_CAMPO[k] ?? k}: la otra persona dejó «{textoValor(r.actual?.[k])}»; usted escribió «
                        {textoValor(k === "nota" ? c.datos.texto : (c.datos.campos as Record<string, unknown>)[k])}».
                      </span>
                    ))}
                </div>
              )}

              {c.estado === "revisar" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {r?.clase === "duplicado" && (
                    <>
                      <Button type="button" mini variante="secundario" onClick={() => setBorrar(c)}>
                        Es el mismo: descartar el mío
                      </Button>
                      <Button type="button" mini onClick={() => reenviar(c.id, { permitirDuplicado: true })}>
                        Son distintos: enviar igual
                      </Button>
                    </>
                  )}
                  {r?.clase === "repetido" && (
                    <Button type="button" mini variante="secundario" onClick={() => setBorrar(c)}>
                      Es el mismo: descartar el mío
                    </Button>
                  )}
                  {r?.clase === "conflicto" && (
                    <>
                      <Button type="button" mini onClick={() => reenviar(c.id, { pisar: true })}>
                        Usar lo mío
                      </Button>
                      <Button type="button" mini variante="secundario" onClick={() => setBorrar(c)}>
                        Quedarme con lo de la otra persona
                      </Button>
                    </>
                  )}
                  {r?.clase === "mes_cerrado" && c.tipo === "fila.crear" && (
                    <Button type="button" mini onClick={() => alMesAbierto(c)}>
                      Pasarlo al mes abierto
                    </Button>
                  )}
                  {(r?.clase === "rechazo" || r?.clase === "mes_cerrado") && (
                    <Button type="button" mini variante="secundario" onClick={() => reenviar(c.id)}>
                      Reintentar
                    </Button>
                  )}
                  {r?.clase !== "conflicto" && r?.clase !== "duplicado" && r?.clase !== "repetido" && (
                    <Button type="button" mini variante="secundario" onClick={() => setBorrar(c)}>
                      Descartar
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {borrar && (
        <Confirmar
          titulo="¿Descartar?"
          texto={`«${borrar.resumen}» se borra de este equipo y no se envía. No se puede deshacer.`}
          boton="Descartar"
          tono="peligro"
          onNo={() => setBorrar(null)}
          onSi={() => {
            void descartar(borrar.id);
            setBorrar(null);
          }}
        />
      )}
    </Card>
  );
}
