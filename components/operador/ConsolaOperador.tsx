"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Campo, Card, Input, Table } from "@/components/ui";
import { hoyISO, nf, num, usd, usd0 } from "@/lib/formato";
import { estadoSuscripcion } from "@/lib/estados-suscripcion";
import { calcularMetricasCartera } from "@/lib/operador/metricas-cartera";
import { csvCartera } from "@/lib/operador/exportar-cartera";
import { PLANES } from "@/lib/operador/planes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ClienteCartera, TareaLog, TasaAtrasada } from "@/lib/operador/tipos";
import { EncabezadoOperador } from "./EncabezadoOperador";
import { Kpi } from "./Kpi";
import { FichaCliente } from "./FichaCliente";

type Aviso = { t: string; tipo: "ok" | "error" };

const FILTROS: [string, string][] = [
  ["todos", "Todos"],
  ["activa", "Activos"],
  ["prueba", "En prueba"],
  ["vencida", "Vencidos"],
  ["suspendida", "Suspendidos"],
  ["sin suscripción", "Sin suscripción"],
];

/** Un punto de color dice lo mismo que un borde grueso y no parte la
 * pantalla en franjas. Portado de Punto() en operador.html:104-107. */
function Punto({ color }: { color: string }) {
  return (
    <span
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: color, marginRight: 7, verticalAlign: "middle" }}
    />
  );
}

/**
 * Portado de App() en operador.html:201-537, sin el chequeo de sesión
 * (proxy.ts + la página del servidor ya lo hacen), sin la pantalla de
 * configuración manual de Supabase (CONFIG queda fijo por variables de
 * entorno) y sin el polling de sesión (Server Component + router.refresh()
 * en vez de volver a pedir todo a mano tras cada acción).
 */
export function ConsolaOperador({
  cartera,
  tarea,
  tasa,
  tasaTarea,
  correo,
}: {
  cartera: ClienteCartera[];
  tarea: TareaLog | null;
  tasa: TasaAtrasada | null;
  tasaTarea: TareaLog | null;
  correo: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<ClienteCartera | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [buscandoTasa, setBuscandoTasa] = useState(false);
  const [tasaManual, setTasaManual] = useState("");

  function notificar(t: string, tipo: "ok" | "error" = "ok") {
    setAviso({ t, tipo });
    setTimeout(() => setAviso(null), 3600);
  }
  function fallo(e: unknown) {
    notificar(e instanceof Error ? e.message : String(e), "error");
  }

  async function correrAhora() {
    setCorriendo(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("correr_cobros_ahora");
    setCorriendo(false);
    if (error) return fallo(error);
    const d = data as { cobros_generados?: number; monto_total?: number; marcadas_vencidas?: number } | null;
    notificar(
      `Tarea corrida: ${d?.cobros_generados ?? 0} cobros por ${usd(d?.monto_total)}` +
        (d?.marcadas_vencidas ? `, ${d.marcadas_vencidas} marcadas vencidas.` : ".")
    );
    router.refresh();
  }

  async function traerTasa() {
    setBuscandoTasa(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("correr_tasa_ahora");
    setBuscandoTasa(false);
    if (error) return fallo(error);
    const d = data as { error?: string; estado?: string; tasa?: number } | null;
    notificar(
      d?.error
        ? `La API respondió: ${d.error}`
        : d?.estado === "pedida"
          ? "Pedido enviado. La respuesta se recoge en la próxima corrida; vuelva a darle en un minuto."
          : `Tasa al día${d?.tasa ? `: ${nf(2).format(d.tasa)}` : ""}.`,
      d?.error ? "error" : "ok"
    );
    router.refresh();
  }

  async function cargarTasaAMano() {
    const v = num(tasaManual);
    if (!v || v <= 0) return notificar("Esa tasa no se entiende.", "error");
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("cargar_tasa", { p_fecha: hoyISO(), p_tasa: v });
    if (error) return fallo(error);
    setTasaManual("");
    notificar("Tasa cargada a mano. La tarea automática ya no la va a pisar.");
    router.refresh();
  }

  function exportar() {
    const csv = csvCartera(cartera);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cartera-${hoyISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notificar("Cartera exportada.");
  }

  const m = calcularMetricasCartera(cartera);
  const diasTasa = tasa ? Number(tasa.dias) : null;

  const visibles = cartera
    .filter((c) => filtro === "todos" || c.estado === filtro)
    .filter(
      (c) =>
        !busca ||
        (c.nombre + " " + (c.rif || "") + " " + (c.contacto || "")).toLowerCase().includes(busca.toLowerCase())
    )
    .sort((a, b) => (b.unidades || 0) - (a.unidades || 0));

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 18px" }}>
      <EncabezadoOperador correo={correo} />

      {aviso && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13.5,
            background: aviso.tipo === "error" ? "var(--rojo-bg)" : "var(--verde-bg)",
            color: aviso.tipo === "error" ? "var(--rojo)" : "var(--verde)",
          }}
        >
          {aviso.t}
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", marginBottom: 12 }}>
        <Kpi destaque etiqueta="Ingreso recurrente mensual" valor={usd(m.ingresoMes)} pie={`${usd0(m.ingresoMes * 12)} al año`} />
        <Kpi
          etiqueta="Clientes activos"
          valor={String(m.activos.length)}
          pie={`${cartera.filter((c) => c.estado === "prueba").length} en prueba · ${cartera.filter((c) => c.estado === "vencida").length} vencidos`}
        />
        <Kpi
          etiqueta="Unidades bajo gestión"
          valor={nf(0).format(m.unidadesActivas)}
          pie={`${m.edificios} edificios · ${nf(0).format(m.unidades)} totales`}
        />
        <Kpi
          etiqueta="Ingreso por unidad"
          valor={m.unidadesActivas ? usd(m.ingresoMes / m.unidadesActivas) : "—"}
          pie={m.activos.length ? `${usd(m.ingresoMes / m.activos.length)} por cliente` : ""}
        />
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)", marginBottom: 3 }}>
              <Punto color={m.cobrosPend ? "var(--ambar)" : "var(--verde)"} />
              Por cobrarle a sus clientes
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: m.cobrosPend ? "var(--ambar)" : "var(--tinta)" }}>
              {usd(m.pendiente)}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--tenue)", maxWidth: 420, textAlign: "right" }}>
            {m.cobrosPend ? `${m.cobrosPend} cobros pendientes · se cobran desde la ficha del cliente` : "Sin cobros pendientes"}
            <br />
            Morosidad en los edificios de sus clientes: {usd0(m.porCobrarClientes)}
          </div>
        </div>
      </Card>

      {/* Tasa del BCV: si esto se atrasa, ningún cliente puede registrar un
          pago en bolívares. Es la pieza más silenciosa y la que más rompe. */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)", marginBottom: 3 }}>
              <Punto color={diasTasa === null || diasTasa > 2 ? "var(--rojo)" : diasTasa > 0 ? "var(--ambar)" : "var(--verde)"} />
              Tasa del Banco Central
            </div>
            {tasa ? (
              <>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: diasTasa && diasTasa > 2 ? "var(--rojo)" : "var(--tinta)" }}>
                  {nf(4).format(tasa.tasa)}
                </div>
                <div style={{ fontSize: 12.5, color: diasTasa && diasTasa > 2 ? "var(--rojo)" : "var(--tenue)" }}>
                  del {tasa.fecha}
                  {diasTasa === 0 ? " · al día" : diasTasa === 1 ? " · de ayer" : ` · atrasada ${diasTasa} días`}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13.5, color: "var(--rojo)" }}>
                No hay ninguna tasa cargada. Sus clientes no pueden registrar pagos en bolívares.
              </div>
            )}
            {tasaTarea && (
              <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
                Última corrida {new Date(tasaTarea.corrida_en).toLocaleString("es-VE")}
                {(tasaTarea.detalle as { error?: string } | null)?.error
                  ? ` · ${(tasaTarea.detalle as { error?: string }).error}`
                  : ""}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ width: 150 }}>
              <Campo etiqueta="Cargarla a mano">
                <Input className="mono" value={tasaManual} placeholder="Bs por dólar" onChange={(e) => setTasaManual(e.target.value)} />
              </Campo>
            </div>
            <Button type="button" variante="secundario" mini onClick={cargarTasaAMano}>
              Guardar la de hoy
            </Button>
            <Button type="button" variante="secundario" mini disabled={buscandoTasa} onClick={traerTasa}>
              {buscandoTasa ? "Buscando…" : "Traer ahora"}
            </Button>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 8 }}>
          Se trae sola desde DolarAPI, cada media hora entre las 8:00 y las 12:30 de Caracas.
        </div>
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)", marginBottom: 3 }}>
              Cobros automáticos
            </div>
            <div style={{ fontSize: 13 }}>
              {tarea ? (
                (() => {
                  const d = (tarea.detalle as { cobros_generados?: number; monto_total?: number; marcadas_vencidas?: number } | null) ?? {};
                  return (
                    <>
                      Última corrida {new Date(tarea.corrida_en).toLocaleString("es-VE")} · <b>{d.cobros_generados ?? 0}</b> cobros
                      generados por <b className="mono">{usd(d.monto_total)}</b>
                      {d.marcadas_vencidas ? ` · ${d.marcadas_vencidas} marcadas vencidas` : ""}
                    </>
                  );
                })()
              ) : (
                <span style={{ color: "var(--ambar)" }}>
                  La tarea no ha corrido todavía. Si no corre sola en 24 horas, pg_cron no quedó activo y hay que
                  correrla a mano.
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 3 }}>
              Corre a las 7:00 de Caracas. Nunca suspende a nadie: eso se decide a mano.
            </div>
          </div>
          <Button type="button" variante="secundario" disabled={corriendo} onClick={correrAhora}>
            {corriendo ? "Corriendo…" : "Correr ahora"}
          </Button>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar administradora, RIF o contacto"
          style={{ flex: 1, minWidth: 220 }}
        />
        {FILTROS.map(([k, t]) => (
          <Button
            key={k}
            type="button"
            variante={filtro === k ? "primario" : "secundario"}
            mini
            onClick={() => setFiltro(k)}
          >
            {k === "todos" ? `${t} (${cartera.length})` : t}
          </Button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Table>
          <thead>
            <tr>
              <th>Administradora</th>
              <th>Contacto</th>
              <th>Plan</th>
              <th style={{ textAlign: "right" }}>Edificios</th>
              <th style={{ textAlign: "right" }}>Unidades</th>
              <th style={{ textAlign: "right" }}>Cuota/mes</th>
              <th style={{ textAlign: "right" }}>Le debe</th>
              <th>Próximo cobro</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const vencido = c.proximo_cobro && c.proximo_cobro < hoyISO();
              const e = estadoSuscripcion(c.estado);
              return (
                <tr key={c.org_id} style={{ cursor: "pointer" }} onClick={() => setAbierto(c)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                    <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)" }}>
                      {c.rif || "sin RIF"}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.contacto || <span style={{ color: "var(--tenue)" }}>—</span>}
                    {c.telefono && (
                      <div className="mono" style={{ color: "var(--tenue)" }}>
                        {c.telefono}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{PLANES[c.plan] || "—"}</td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {c.edificios}
                  </td>
                  <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                    {c.unidades}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {c.cuota_mes ? usd(c.cuota_mes) : "—"}
                  </td>
                  <td className="mono" style={{ textAlign: "right", color: Number(c.monto_pendiente) > 0 ? "var(--ambar)" : "var(--tenue)" }}>
                    {Number(c.monto_pendiente) > 0 ? usd(c.monto_pendiente) : "—"}
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: vencido ? "var(--rojo)" : "var(--tenue)" }}>
                    {c.proximo_cobro || "—"}
                  </td>
                  <td>
                    <Badge tono={e.tono}>{e.etiqueta}</Badge>
                  </td>
                  <td style={{ color: "var(--tenue)" }}>›</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {visibles.length === 0 && (
          <div style={{ padding: 36, textAlign: "center", color: "var(--tenue)", fontSize: 13.5 }}>
            Ningún cliente coincide con el filtro.
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Button type="button" variante="secundario" onClick={exportar}>
          Exportar la cartera
        </Button>
      </div>

      {abierto && (
        <FichaCliente
          c={abierto}
          notificar={notificar}
          fallo={fallo}
          onCerrar={() => setAbierto(null)}
          onGuardado={() => {
            router.refresh();
            setAbierto(null);
          }}
        />
      )}
    </div>
  );
}
