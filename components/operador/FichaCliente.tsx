"use client";

import { useEffect, useState } from "react";
import { Button, Campo, Card, Input, Select, Table, Textarea } from "@/components/ui";
import { hoyISO, nf, num0, usd, usd0 } from "@/lib/formato";
import { estadoSuscripcion } from "@/lib/estados-suscripcion";
import { calcularCuotaPrevista, PLANES, DESCUENTO } from "@/lib/operador/planes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ClienteCartera, CobroSuscripcion, ConceptoServicio, EdificioOperador } from "@/lib/operador/tipos";

// Los estados que la administradora puede elegir a mano — "sin suscripción"
// es un valor calculado (no hay fila en `suscripciones` todavía), no una
// opción real del select. Portado de operador.html:702-703.
const ESTADOS_EDITABLES = ["prueba", "activa", "vencida", "suspendida", "cancelada"] as const;

type EstadoFicha = {
  plan: string;
  modoPrecio: string;
  precio: string;
  descuentoPct: string;
  estado: string;
  inicio: string;
  proximoCobro: string;
  contacto: string;
  telefono: string;
  correo: string;
  diasGracia: string;
  notas: string;
};

/** Portado de Ficha() en operador.html:599-879. */
export function FichaCliente({
  c,
  notificar,
  fallo,
  onCerrar,
  onGuardado,
}: {
  c: ClienteCartera;
  notificar: (t: string, tipo?: "ok" | "error") => void;
  fallo: (e: unknown) => void;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [s, setS] = useState<EstadoFicha>({
    plan: c.plan || "mensual",
    modoPrecio: c.modo_precio || "fijo",
    precio: String(c.precio ?? 0),
    descuentoPct: String(c.descuento_pct ?? 0),
    estado: c.estado === "sin suscripción" ? "prueba" : c.estado,
    inicio: c.inicio || hoyISO(),
    proximoCobro: c.proximo_cobro || "",
    contacto: c.contacto || "",
    telefono: c.telefono || "",
    correo: c.correo || "",
    diasGracia: String(c.dias_gracia ?? 10),
    notas: c.notas || "",
  });
  const [edificios, setEdificios] = useState<EdificioOperador[] | null>(null);
  const [cobros, setCobros] = useState<CobroSuscripcion[]>([]);
  const [servicio, setServicio] = useState<ConceptoServicio | null>(null);
  // Desvío deliberado de operador.html:823-826 — ver docs/estado-migracion.md
  // (sección "Operador"): el campo de abajo necesita ser controlado para
  // reflejar el monto real una vez que `servicio` carga de forma asíncrona.
  const [montoServicio, setMontoServicio] = useState("0");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    supabase
      .rpc("edificios_operador", { p_org: c.org_id })
      .then(({ data, error }) => {
        if (error) return fallo(error);
        setEdificios(data || []);
      });
    supabase
      .from("cobros_suscripcion")
      .select("id,desde,hasta,unidades,monto,estado,fecha_pago")
      .eq("org_id", c.org_id)
      .order("desde", { ascending: false })
      .limit(12)
      .then(({ data }) => setCobros(data || []));
    supabase
      .from("conceptos_cobro")
      .select("id,nombre,modo,monto,activo")
      .eq("org_id", c.org_id)
      .eq("bolsillo", "servicio")
      .maybeSingle()
      .then(({ data }) => {
        setServicio(data);
        setMontoServicio(String(data?.monto ?? 0));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.org_id]);

  const cuotaPrevista = calcularCuotaPrevista({
    modoPrecio: s.modoPrecio,
    precio: s.precio,
    descuentoPct: s.descuentoPct,
    unidades: c.unidades || 0,
  });

  async function guardar() {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const fila = {
      org_id: c.org_id,
      plan: s.plan,
      modo_precio: s.modoPrecio,
      precio: num0(s.precio),
      descuento_pct: num0(s.descuentoPct),
      estado: s.estado,
      inicio: s.inicio || hoyISO(),
      proximo_cobro: s.proximoCobro || null,
      contacto: s.contacto || null,
      telefono: s.telefono || null,
      correo: s.correo || null,
      dias_gracia: Math.max(0, Math.round(num0(s.diasGracia))),
      notas: s.notas || null,
      actualizada_en: new Date().toISOString(),
    };
    const { error } = await supabase.from("suscripciones").upsert(fila, { onConflict: "org_id" });
    if (!error && (s.estado === "suspendida" || s.estado === "cancelada")) {
      await supabase.from("organizaciones").update({ plan: "suspendido" }).eq("id", c.org_id);
    } else if (!error && s.estado === "activa") {
      await supabase.from("organizaciones").update({ plan: "activo" }).eq("id", c.org_id);
    }
    setOcupado(false);
    if (error) return fallo(error);
    notificar("Suscripción guardada.");
    onGuardado();
  }

  async function generar() {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("generar_cobro", { p_org: c.org_id, p_desde: undefined });
    if (error) return fallo(error);
    notificar("Cobro generado.");
    onGuardado();
  }

  async function marcar(id: string, estado: "pagado" | "anulado") {
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("cobros_suscripcion")
      .update({ estado, fecha_pago: estado === "pagado" ? hoyISO() : null })
      .eq("id", id);
    if (error) return fallo(error);
    notificar(estado === "pagado" ? "Cobro marcado como pagado." : "Cobro anulado.");
    onGuardado();
  }

  async function guardarServicio(monto: number) {
    // Desvío deliberado de operador.html:662-674 — ver docs/estado-migracion.md
    // (sección "Operador"): entrar y salir del campo sin editarlo dispara
    // onBlur igual, y antes de este cambio eso alcanzaba para pisar el monto
    // real (o insertar una fila en cero) sin que nadie tocara nada.
    if (monto === (servicio?.monto ?? 0)) return;

    const supabase = crearClienteNavegador();
    if (servicio) {
      // Sin este refresco, cambiar 1→2 y volver a 1 sin reabrir la ficha
      // comparaba contra el `servicio` viejo (1), la guarda de arriba
      // cancelaba el segundo guardado por "no cambió" y la base se quedaba
      // en 2 mientras la pantalla mostraba 1.
      const { data, error } = await supabase
        .from("conceptos_cobro")
        .update({ monto, activo: monto > 0 })
        .eq("id", servicio.id)
        .select("id,nombre,modo,monto,activo")
        .single();
      if (error) return fallo(error);
      setServicio(data);
    } else {
      // Desvío deliberado de operador.html:667-671: el original nunca vuelve
      // a leer la fila recién creada, así que un segundo guardado sin
      // reabrir la ficha insertaba una fila duplicada (bug heredado #7 del
      // inventario de escritura). Acá se pide la fila creada y se guarda en
      // el estado para que el siguiente guardado ya encuentre `servicio` y
      // haga update.
      const { data, error } = await supabase
        .from("conceptos_cobro")
        .insert({
          org_id: c.org_id,
          edificio_id: null,
          nombre: "Servicio Vecitap",
          bolsillo: "servicio",
          modo: "monto_por_unidad",
          monto,
          iva: 0,
          orden: 9,
        })
        .select("id,nombre,modo,monto,activo")
        .single();
      if (error) return fallo(error);
      setServicio(data);
    }
    notificar("Cobro en el recibo actualizado.");
  }

  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--fondo)", width: "100%", maxWidth: 720, height: "100%", overflow: "auto" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px",
            borderBottom: "1px solid var(--linea)",
            position: "sticky",
            top: 0,
            background: "var(--fondo)",
            zIndex: 5,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>{c.nombre}</h2>
            <div className="mono" style={{ fontSize: 12, color: "var(--tenue)", marginTop: 3 }}>
              {c.rif || "sin RIF"} · {c.edificios} edificios · {c.unidades} unidades
              {c.ultimo_cierre ? ` · último cierre ${c.ultimo_cierre}` : " · sin cerrar ningún mes"}
            </div>
          </div>
          <button
            onClick={onCerrar}
            style={{ background: "none", border: "none", color: "var(--tenue)", cursor: "pointer", fontSize: 20 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>
              Suscripción
            </h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <Campo etiqueta="Estado">
                <Select value={s.estado} onChange={(e) => setS({ ...s, estado: e.target.value })}>
                  {ESTADOS_EDITABLES.map((k) => (
                    <option key={k} value={k}>
                      {estadoSuscripcion(k).etiqueta}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo etiqueta="Plan">
                <Select
                  value={s.plan}
                  onChange={(e) => setS({ ...s, plan: e.target.value, descuentoPct: String(DESCUENTO[e.target.value]) })}
                >
                  {Object.entries(PLANES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo etiqueta="Cómo se cobra">
                <Select value={s.modoPrecio} onChange={(e) => setS({ ...s, modoPrecio: e.target.value })}>
                  <option value="fijo">Monto fijo al mes</option>
                  <option value="por_unidad">Por unidad al mes</option>
                </Select>
              </Campo>
              <Campo etiqueta={s.modoPrecio === "por_unidad" ? "Precio por unidad" : "Precio mensual"}>
                <Input className="mono" value={s.precio} onChange={(e) => setS({ ...s, precio: e.target.value })} />
              </Campo>
              <Campo etiqueta="Descuento %" ayuda="10 en trimestral, 20 en anual">
                <Input className="mono" value={s.descuentoPct} onChange={(e) => setS({ ...s, descuentoPct: e.target.value })} />
              </Campo>
              <Campo etiqueta="Próximo cobro">
                <Input type="date" className="mono" value={s.proximoCobro} onChange={(e) => setS({ ...s, proximoCobro: e.target.value })} />
              </Campo>
              <Campo etiqueta="Días de gracia" ayuda="Pasados estos días sin pagar, la tarea la marca vencida.">
                <Input className="mono" value={s.diasGracia} onChange={(e) => setS({ ...s, diasGracia: e.target.value })} />
              </Campo>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--linea)" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--tenue)" }}>Cuota efectiva al mes</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--acento)" }}>
                  {usd(cuotaPrevista)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--tenue)" }}>Por unidad</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                  {c.unidades ? usd(cuotaPrevista / c.unidades) : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--tenue)" }}>Al año</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                  {usd0(cuotaPrevista * 12)}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>
              Contacto
            </h3>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <Campo etiqueta="Persona">
                <Input value={s.contacto} onChange={(e) => setS({ ...s, contacto: e.target.value })} />
              </Campo>
              <Campo etiqueta="Teléfono">
                <Input className="mono" value={s.telefono} onChange={(e) => setS({ ...s, telefono: e.target.value })} />
              </Campo>
              <Campo etiqueta="Correo">
                <Input value={s.correo} onChange={(e) => setS({ ...s, correo: e.target.value })} />
              </Campo>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              {s.telefono && (
                <Button
                  type="button"
                  variante="secundario"
                  mini
                  onClick={() =>
                    window.open(`https://wa.me/${String(s.telefono).replace(/\D/g, "").replace(/^0/, "58")}`, "_blank")
                  }
                >
                  WhatsApp
                </Button>
              )}
              {s.correo && (
                <Button type="button" variante="secundario" mini onClick={() => window.open(`mailto:${s.correo}`)}>
                  Escribir
                </Button>
              )}
            </div>
            <div style={{ marginTop: 16 }}>
              <Campo etiqueta="Notas">
                <Textarea
                  rows={3}
                  value={s.notas}
                  onChange={(e) => setS({ ...s, notas: e.target.value })}
                  placeholder="Acuerdos, incidencias, próximos pasos…"
                />
              </Campo>
            </div>
          </Card>

          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>Cobros</h3>
              <Button type="button" mini onClick={generar}>
                Generar el cobro del período
              </Button>
            </div>
            <Table>
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th style={{ textAlign: "right" }}>Unidades</th>
                  <th style={{ textAlign: "right" }}>Monto</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{x.desde}</td>
                    <td className="mono">{x.hasta}</td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {x.unidades ?? "—"}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {usd(x.monto)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: x.estado === "pagado" ? "var(--verde)" : x.estado === "anulado" ? "var(--tenue)" : "var(--ambar)",
                        }}
                      >
                        {x.estado}
                        {x.fecha_pago ? ` · ${x.fecha_pago}` : ""}
                      </span>
                    </td>
                    <td>
                      {x.estado === "pendiente" && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <Button type="button" variante="secundario" mini onClick={() => marcar(x.id, "pagado")}>
                            Pagado
                          </Button>
                          <Button
                            type="button"
                            variante="secundario"
                            mini
                            style={{ color: "var(--rojo)" }}
                            onClick={() => marcar(x.id, "anulado")}
                          >
                            Anular
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {cobros.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: "var(--tenue)", textAlign: "center", padding: 22 }}>
                      Todavía no se le ha generado ningún cobro.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          <Card>
            <h3 style={{ margin: "0 0 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>
              Cobro dentro del recibo
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--tenue)", marginTop: 0, lineHeight: 1.6 }}>
              Si se le cobra el servicio al propietario, aparece como una línea más de su recibo, en su propio
              bolsillo. La administradora lo ve pero no lo puede editar ni apagar. Déjelo en cero para facturarle
              solo a la administradora.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 180 }}>
                <Campo etiqueta="USD por unidad al mes">
                  <Input
                    className="mono"
                    value={montoServicio}
                    onChange={(e) => setMontoServicio(e.target.value)}
                    onBlur={(e) => guardarServicio(num0(e.target.value))}
                  />
                </Campo>
              </div>
              {servicio && (
                <span style={{ fontSize: 12, color: servicio.activo ? "var(--verde)" : "var(--tenue)" }}>
                  {servicio.activo ? "activo en los recibos" : "apagado"}
                </span>
              )}
            </div>
          </Card>

          <Card>
            <h3 style={{ margin: "0 0 12px", fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>
              Sus edificios
            </h3>
            {edificios === null ? (
              <div style={{ color: "var(--tenue)", fontSize: 13 }}>Cargando…</div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Edificio</th>
                    <th style={{ textAlign: "right" }}>Unidades</th>
                    <th style={{ textAlign: "right" }}>Morosidad</th>
                    <th style={{ textAlign: "right" }}>Por cobrar</th>
                    <th>Último cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {edificios.map((e) => (
                    <tr key={e.edificio_id}>
                      <td>{e.nombre}</td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {e.unidades}
                      </td>
                      <td
                        className="mono"
                        style={{
                          textAlign: "right",
                          color: e.morosidad_pct > 30 ? "var(--rojo)" : e.morosidad_pct > 15 ? "var(--ambar)" : "var(--tinta-2)",
                        }}
                      >
                        {nf(0).format(e.morosidad_pct)}%
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {usd(e.por_cobrar)}
                      </td>
                      <td style={{ fontSize: 12, color: e.ultimo_cierre ? "var(--tinta-2)" : "var(--rojo)" }}>
                        {e.ultimo_cierre || "nunca"}
                      </td>
                    </tr>
                  ))}
                  {edificios.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--tenue)", textAlign: "center", padding: 22 }}>
                        Todavía no ha cargado ningún edificio.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            )}
            <p style={{ fontSize: 11.5, color: "var(--tenue)", marginBottom: 0, marginTop: 12 }}>
              Aquí se ven los números del edificio, no sus propietarios ni sus pagos. Ese detalle no es suyo y la
              base no se lo entrega ni a usted.
            </p>
          </Card>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", paddingBottom: 20 }}>
            <Button type="button" variante="secundario" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button type="button" disabled={ocupado} onClick={guardar}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
