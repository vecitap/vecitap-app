"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText, RotateCcw, Trash2 } from "lucide-react";
import { Aviso, Badge, Button, Campo, Confirmar, Flechas, Input, Select } from "@/components/ui";
import { nf, num, num0, usd } from "@/lib/formato";
import { MESES } from "@/lib/admin/constantes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { CategoriaAdmin, ConceptoCobro, GastoAdmin, PeriodoAdmin, SimulacionCierre } from "@/lib/admin/tipos";
import type { Database } from "@/types/supabase";
import { mensajeDeError } from "@/lib/errores";

type ActualizarGasto = Database["public"]["Tables"]["gastos"]["Update"];
type InsertarGasto = Database["public"]["Tables"]["gastos"]["Insert"];

type Mensaje = { texto: string; tipo: "ok" | "error" };
type Confirma =
  | { que: "cerrar" }
  | { que: "reabrir"; id: string; etiqueta: string; enviado: boolean }
  | { que: "reabrir_enviado"; id: string; texto: string };

const serie = (a: number, m: number) => a * 12 + m;

/**
 * Portado de CierreMes() en app.html:2435-3074. `gastos` es estado propio
 * de este componente (se carga por su cuenta cuando cambia el período
 * abierto, igual que el original) — a diferencia de app.html, cada fila
 * usa inputs controlados (value + onChange), nunca defaultValue: la
 * lista se refresca con `cargarGastos()` después de cada escritura, así
 * que siempre refleja lo que quedó guardado.
 */
export function CierreMes({
  orgId,
  edificioId,
  unidades,
  conceptos,
  periodos,
  categorias,
  tasaValor,
}: {
  orgId: string;
  edificioId: string;
  unidades: { id: string; codigo: string }[];
  conceptos: ConceptoCobro[];
  periodos: PeriodoAdmin[];
  categorias: CategoriaAdmin[];
  tasaValor: number;
}) {
  const router = useRouter();
  const periodoAbierto = periodos.find((p) => p.estado === "abierto") ?? null;
  const cerrados = periodos.filter((p) => p.estado === "cerrado");
  // Nota: app.html:2451 también calcula `usaGasto` acá y tampoco lo usa en
  // este componente (solo en Cobros) — no es un olvido de la migración.
  const usaPresupuesto = conceptos.some((c) => c.activo && c.modo.startsWith("presupuesto"));

  const [gastos, setGastos] = useState<GastoAdmin[]>([]);
  const [nuevo, setNuevo] = useState({ concepto: "", referencia: "", monto: "", tipo: "comun", unidad: "", bolsillo: "condominio", categoria: "" });
  const [abrir, setAbrir] = useState({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, tasa: "", presupuesto: "" });
  const [correccion, setCorreccion] = useState({ presupuesto: "", tasa: "" });
  const [previa, setPrevia] = useState<SimulacionCierre[] | null>(null);
  const [simulable, setSimulable] = useState(true);
  const [confirma, setConfirma] = useState<Confirma | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(mensajeDeError(e), "error");
  }

  const ultimoCerrado = cerrados.reduce<PeriodoAdmin | null>(
    (mejor, p) => (!mejor || serie(p.anio, p.mes) > serie(mejor.anio, mejor.mes) ? p : mejor),
    null
  );
  const serieMinima = ultimoCerrado ? serie(ultimoCerrado.anio, ultimoCerrado.mes) + 1 : null;
  const mesPermitido = !serieMinima || serie(Number(abrir.anio), Number(abrir.mes)) >= serieMinima;

  async function cargarGastos() {
    if (!periodoAbierto) return;
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase
      .from("gastos")
      .select("id,concepto,referencia,monto,tipo,unidad_id,bolsillo,categoria_id,orden")
      .eq("periodo_id", periodoAbierto.id)
      .order("orden")
      .order("creado_en");
    if (error) return fallo(error);
    setGastos(data ?? []);
  }

  // Reinicia el formulario de corrección al cambiar de período abierto —
  // ajuste de estado durante el render, no en un efecto (React lo
  // recomienda así: https://react.dev/learn/you-might-not-need-an-effect).
  const periodoAnteriorRef = useRef<string | null>(null);
  if ((periodoAbierto?.id ?? null) !== periodoAnteriorRef.current) {
    periodoAnteriorRef.current = periodoAbierto?.id ?? null;
    setCorreccion({
      presupuesto: periodoAbierto?.presupuesto != null ? String(periodoAbierto.presupuesto) : "",
      tasa: String(periodoAbierto?.tasa_bcv ?? ""),
    });
  }

  useEffect(() => {
    if (!periodoAbierto) return;
    const supabase = crearClienteNavegador();
    supabase
      .from("gastos")
      .select("id,concepto,referencia,monto,tipo,unidad_id,bolsillo,categoria_id,orden")
      .eq("periodo_id", periodoAbierto.id)
      .order("orden")
      .order("creado_en")
      .then(({ data, error }) => {
        if (error) return fallo(error);
        setGastos(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoAbierto?.id]);

  const comunes = gastos.filter((g) => g.tipo === "comun").reduce((s, g) => s + Number(g.monto), 0);

  useEffect(() => {
    if (!periodoAbierto || !simulable) return;
    const supabase = crearClienteNavegador();
    supabase.rpc("simular_cierre", { p_periodo: periodoAbierto.id }).then(({ data, error }) => {
      if (error) {
        if (/does not exist|función|function/i.test(error.message)) {
          setSimulable(false);
          return;
        }
        fallo(error);
        return;
      }
      setPrevia(data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoAbierto?.id, gastos.length, periodoAbierto?.presupuesto]);

  async function abrirMes() {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("abrir_periodo", {
      p_edificio: edificioId,
      p_anio: Number(abrir.anio),
      p_mes: Number(abrir.mes),
      p_etiqueta: `${MESES[Number(abrir.mes) - 1]} ${abrir.anio}`,
      p_tasa: num0(abrir.tasa) || 0,
      p_presupuesto: num(abrir.presupuesto) ?? undefined,
    });
    setOcupado(false);
    if (error) return fallo(error);
    notificar("Mes abierto. Las partidas fijas entraron solas.");
    router.refresh();
  }

  async function descartarMes() {
    if (!periodoAbierto) return;
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("descartar_periodo", { p_periodo: periodoAbierto.id });
    setOcupado(false);
    setDescartando(false);
    if (error) return fallo(error);
    notificar("El mes se descartó. No se emitió ningún recibo.");
    router.refresh();
  }

  async function corregir() {
    if (!periodoAbierto) return;
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("periodos")
      .update({ presupuesto: num(correccion.presupuesto), tasa_bcv: num0(correccion.tasa) || 1 })
      .eq("id", periodoAbierto.id);
    if (error) return fallo(error);
    notificar("Mes actualizado.");
    router.refresh();
  }

  async function agregarGasto() {
    if (!periodoAbierto) return;
    const monto = num(nuevo.monto);
    if (monto === null) return notificar("Falta el monto.", "error");
    if (nuevo.tipo === "directo" && !nuevo.unidad) return notificar("Un gasto directo tiene que decir a qué unidad se le carga.", "error");
    const enEsaCat = gastos.filter((g) => (g.categoria_id || "") === (nuevo.categoria || ""));
    const ultimo = Math.max(0, ...enEsaCat.map((g) => g.orden || 0));
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("gastos").insert({
      org_id: orgId,
      periodo_id: periodoAbierto.id,
      orden: ultimo + 10,
      categoria_id: nuevo.categoria || null,
      concepto: nuevo.concepto.trim() || "Sin concepto",
      referencia: nuevo.referencia.trim() || null,
      monto,
      tipo: nuevo.tipo,
      unidad_id: nuevo.tipo === "directo" ? nuevo.unidad : null,
      bolsillo: nuevo.tipo === "directo" ? nuevo.bolsillo : "condominio",
    });
    if (error) return fallo(error);
    setNuevo({ ...nuevo, concepto: "", referencia: "", monto: "" });
    cargarGastos();
  }

  async function quitarGasto(id: string) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) return fallo(error);
    cargarGastos();
  }

  async function moverGasto(id: string, arriba: boolean) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("mover_gasto", { p_id: id, p_arriba: arriba });
    if (error) return fallo(error);
    cargarGastos();
  }

  async function editarGasto(id: string, campos: ActualizarGasto) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("gastos").update(campos).eq("id", id);
    if (error) return fallo(error);
    cargarGastos();
  }

  async function reabrir(periodoId: string, confirmado: boolean) {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("reabrir_periodo", { p_periodo: periodoId, p_confirmar: !!confirmado });
    setOcupado(false);
    if (error) {
      if (/ya se enviaron/i.test(error.message || "")) {
        setConfirma({ que: "reabrir_enviado", id: periodoId, texto: error.message });
        return;
      }
      return fallo(error);
    }
    setConfirma(null);
    notificar("Mes reabierto. Los recibos de ese mes se borraron: hay que volver a cerrarlo.");
    router.refresh();
  }

  async function traerFijas() {
    if (!periodoAbierto) return;
    const supabase = crearClienteNavegador();
    const { data: pf, error } = await supabase
      .from("partidas_fijas")
      .select("id,concepto,referencia,monto,categoria_id,categorias!inner(edificio_id)")
      .eq("categorias.edificio_id", edificioId);
    if (error) return fallo(error);
    const clave = (x: { categoria_id: string | null; concepto: string | null; referencia: string | null }) =>
      [x.categoria_id || "", (x.concepto || "").trim().toLowerCase(), (x.referencia || "").trim().toLowerCase()].join("|");
    const actuales = new Map(gastos.filter((g) => g.tipo === "comun").map((g) => [clave(g), g]));
    const nuevas: InsertarGasto[] = [];
    const rellenar: [string, number][] = [];
    (pf ?? []).forEach((p) => {
      const g = actuales.get(clave(p));
      if (!g) {
        nuevas.push({ org_id: orgId, periodo_id: periodoAbierto.id, categoria_id: p.categoria_id, concepto: p.concepto, referencia: p.referencia, monto: p.monto, tipo: "comun", bolsillo: "condominio" });
      } else if (Number(g.monto) === 0 && Number(p.monto) !== 0) {
        rellenar.push([g.id, p.monto]);
      }
    });
    if (nuevas.length) {
      const { error: e1 } = await supabase.from("gastos").insert(nuevas);
      if (e1) return fallo(e1);
    }
    for (const [id, monto] of rellenar) await supabase.from("gastos").update({ monto }).eq("id", id);
    if (!nuevas.length && !rellenar.length) {
      notificar("No faltaba ninguna partida fija.");
    } else {
      notificar(`${nuevas.length} partidas agregadas, ${rellenar.length} rellenadas.`);
    }
    cargarGastos();
  }

  async function cerrar() {
    if (!periodoAbierto) return;
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("cerrar_periodo", { p_periodo: periodoAbierto.id });
    setOcupado(false);
    setConfirma(null);
    if (error) return fallo(error);
    const r = Array.isArray(data) ? data[0] : data;
    notificar(`${periodoAbierto.etiqueta} cerrado: ${r.recibos_emitidos} recibos por ${usd(r.total_facturado)}.`);
    router.refresh();
  }

  const grupos = useMemo(() => {
    const m = new Map<string, GastoAdmin[]>();
    gastos.filter((g) => g.tipo === "comun").forEach((g) => {
      const k = g.categoria_id || "__sin__";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    });
    m.forEach((lista) => lista.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)));
    const arr = [...m.entries()].map(([k, lista]) => {
      const cat = categorias.find((c) => c.id === k);
      return {
        id: k,
        nombre: k === "__sin__" ? "Sin categoría" : cat ? cat.nombre : "Categoría de otro edificio",
        orden: k === "__sin__" ? 9999 : cat ? cat.orden ?? 998 : 998,
        lista,
        total: lista.reduce((sum, g) => sum + Number(g.monto), 0),
      };
    });
    arr.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    return arr;
  }, [gastos, categorias]);

  const directos = gastos.filter((g) => g.tipo === "directo");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {mensaje && (
        <Aviso tono={mensaje.tipo === "error" ? "rojo" : "verde"}>{mensaje.texto}</Aviso>
      )}

      {!periodoAbierto ? (
        <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Abrir un mes</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
            {cerrados.length ? `El último cerrado fue ${cerrados[0].etiqueta}.` : "Todavía no se ha cerrado ningún mes en este edificio."}
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Campo etiqueta="Año">
              <Input className="mono" value={String(abrir.anio)} onChange={(e) => setAbrir({ ...abrir, anio: Number(e.target.value) || abrir.anio })} />
            </Campo>
            <Campo etiqueta="Mes">
              <Select value={abrir.mes} onChange={(e) => setAbrir({ ...abrir, mes: Number(e.target.value) })}>
                {MESES.map((m, idx) => (
                  <option key={m} value={idx + 1} disabled={!!serieMinima && serie(Number(abrir.anio), idx + 1) < serieMinima}>
                    {m}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Tasa BCV del mes" ayuda="Déjela en blanco y el sistema usa la del BCV del último día del mes.">
              <Input className="mono" value={abrir.tasa} placeholder={tasaValor ? nf(2).format(tasaValor) : "0,00"} onChange={(e) => setAbrir({ ...abrir, tasa: e.target.value })} />
            </Campo>
            {usaPresupuesto && (
              <Campo etiqueta="Presupuesto del mes USD" ayuda="Este edificio reparte un presupuesto, no el gasto ejecutado.">
                <Input className="mono" value={abrir.presupuesto} placeholder="5.630,15" onChange={(e) => setAbrir({ ...abrir, presupuesto: e.target.value })} />
              </Campo>
            )}
          </div>
          {!mesPermitido && ultimoCerrado && (
            <div style={{ marginTop: 14 }}>
              <Aviso tono="ambar" titulo="Ese mes ya pasó">
                El último mes cerrado es {ultimoCerrado.etiqueta}. Los saldos se calculan en orden
                de calendario, así que un mes anterior quedaría fuera de todos los estados de
                cuenta. Si necesita corregir {ultimoCerrado.etiqueta}, reábralo desde la lista de
                meses cerrados en vez de abrir uno viejo.
              </Aviso>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Button type="button" disabled={ocupado || !mesPermitido} onClick={abrirMes}>
              Abrir el mes
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>El mes abierto</h2>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--tenue)" }}>
                  {usaPresupuesto ? "Se reparte el presupuesto. Los gastos se cargan igual, para la rendición y para ver el sobrante o el faltante." : "Se reparte lo que se gastó este mes."}
                </p>
              </div>
              <Badge tono="marca">{periodoAbierto.etiqueta}</Badge>
            </div>

            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", alignItems: "end", marginTop: 14 }}>
              {usaPresupuesto && (
                <Campo etiqueta="Presupuesto del mes USD">
                  <Input className="mono" value={correccion.presupuesto} onChange={(e) => setCorreccion({ ...correccion, presupuesto: e.target.value })} />
                </Campo>
              )}
              <Campo etiqueta="Tasa BCV del mes">
                <Input className="mono" value={correccion.tasa} onChange={(e) => setCorreccion({ ...correccion, tasa: e.target.value })} />
              </Campo>
              <div>
                <Button type="button" variante="secundario" onClick={corregir}>
                  Guardar
                </Button>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--linea)" }}>
              {!descartando ? (
                <button
                  onClick={() => setDescartando(true)}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--tenue)", fontSize: 12.5, textDecoration: "underline" }}
                >
                  Descartar este mes
                </button>
              ) : (
                <div style={{ padding: 14, borderRadius: "var(--radio-chico)", background: "var(--rojo-bg)" }}>
                  <div style={{ fontSize: 13, marginBottom: 10 }}>
                    Se borra {periodoAbierto.etiqueta} con todos los gastos que le cargó. No se
                    puede deshacer. Los pagos ya registrados no se tocan.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Button type="button" mini disabled={ocupado} style={{ background: "var(--rojo)", borderColor: "var(--rojo)" }} onClick={descartarMes}>
                      Sí, descartar {periodoAbierto.etiqueta}
                    </Button>
                    <Button type="button" variante="secundario" mini onClick={() => setDescartando(false)}>
                      No
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {usaPresupuesto && !periodoAbierto.presupuesto && (
              <div style={{ marginTop: 14 }}>
                <Aviso tono="rojo" titulo="Falta el presupuesto">
                  Sin él la base rechaza el cierre.
                </Aviso>
              </div>
            )}
            {usaPresupuesto && !!periodoAbierto.presupuesto && periodoAbierto.presupuesto > 0 && (
              <div style={{ marginTop: 14 }}>
                <Aviso tono={comunes > periodoAbierto.presupuesto ? "ambar" : "verde"} titulo={comunes > periodoAbierto.presupuesto ? "El mes va en déficit" : "El mes va con sobrante"}>
                  Presupuestado {usd(periodoAbierto.presupuesto)} · ejecutado {usd(comunes)} ·
                  diferencia {usd(periodoAbierto.presupuesto - comunes)}.
                </Aviso>
              </div>
            )}
          </div>

          <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
            <div style={{ padding: "18px 18px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Gastos del mes</h2>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
                    Los gastos comunes se reparten entre todos. Los directos se le cargan solo a
                    una unidad.
                  </p>
                </div>
                <Button type="button" variante="secundario" mini onClick={traerFijas}>
                  <RotateCcw size={14} /> Traer partidas fijas
                </Button>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1.4fr 1.4fr 1.2fr 1fr auto", alignItems: "end", margin: "14px 0" }}>
                <Campo etiqueta="Concepto">
                  <Input value={nuevo.concepto} onChange={(e) => setNuevo({ ...nuevo, concepto: e.target.value })} placeholder="Vigilancia" />
                </Campo>
                <Campo etiqueta="Referencia">
                  <Input className="mono" value={nuevo.referencia} onChange={(e) => setNuevo({ ...nuevo, referencia: e.target.value })} />
                </Campo>
                <Campo etiqueta="Categoría">
                  <Select value={nuevo.categoria} onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}>
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo etiqueta="Tipo">
                  <Select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}>
                    <option value="comun">Se reparte entre todos</option>
                    <option value="directo">Solo a una unidad</option>
                  </Select>
                </Campo>
                <Campo etiqueta="Monto USD">
                  <Input className="mono" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} />
                </Campo>
                <Button type="button" onClick={agregarGasto}>
                  <Plus size={15} />
                </Button>
              </div>

              {nuevo.tipo === "directo" && (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
                  <Campo etiqueta="¿A qué unidad?">
                    <Select value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}>
                      <option value="">Elija la unidad</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.codigo}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo etiqueta="¿De quién es ese dinero?" ayuda="Una reparación es del condominio. Un recargo por gestión de cobranza es de quien administra.">
                    <Select value={nuevo.bolsillo} onChange={(e) => setNuevo({ ...nuevo, bolsillo: e.target.value })}>
                      <option value="condominio">Condominio</option>
                      <option value="administracion">Administración</option>
                    </Select>
                  </Campo>
                </div>
              )}
            </div>

            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Referencia</th>
                    <th>Categoría</th>
                    <th style={{ textAlign: "right", width: 130 }}>Monto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((gr) => (
                    <FragmentoGrupo
                      key={gr.id}
                      grupo={gr}
                      comunes={comunes}
                      categorias={categorias}
                      onMover={moverGasto}
                      onEditar={editarGasto}
                      onQuitar={quitarGasto}
                    />
                  ))}
                  {directos.length > 0 && (
                    <FilasDirectas gastos={directos} unidades={unidades} onEditar={editarGasto} onQuitar={quitarGasto} />
                  )}
                  {gastos.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 26, textAlign: "center", color: "var(--tenue)", fontSize: 13.5 }}>
                        Todavía no hay gastos cargados en este mes.
                      </td>
                    </tr>
                  )}
                  <tr style={{ borderTop: "2px solid var(--linea-fuerte)" }}>
                    <td colSpan={3} style={{ fontWeight: 700 }}>Gastos comunes del mes</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{usd(comunes)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {previa && previa.length > 0 && (
            <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
              <div style={{ padding: "18px 18px 0" }}>
                <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cómo se reparte</h2>
                <p style={{ margin: "3px 0 12px", fontSize: 12.5, color: "var(--tenue)" }}>
                  Esto es exactamente lo que se va a emitir. Lo calcula la base, no el navegador.
                </p>
              </div>
              <div className="tabla-scroll" style={{ maxHeight: 420 }}>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Unidad</th>
                      <th>Alícuota</th>
                      <th>Condominio</th>
                      <th>Administración</th>
                      <th>Servicio</th>
                      <th>Anterior</th>
                      <th>Mora</th>
                      <th style={{ textAlign: "right" }}>Total del recibo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((r) => (
                      <tr key={r.codigo}>
                        <td className="mono" style={{ fontWeight: 600 }}>{r.codigo}</td>
                        <td className="mono">{nf(5).format(r.alicuota)}</td>
                        <td className="mono">{usd(r.condominio)}</td>
                        <td className="mono">{usd(r.administracion)}</td>
                        <td className="mono">{usd(r.servicio)}</td>
                        <td className="mono">{usd(r.anterior)}</td>
                        <td className="mono">{usd(r.mora)}</td>
                        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{usd(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!simulable && (
            <Aviso tono="azul" titulo="La previa del reparto no está disponible">
              Falta instalar la función simular_cierre en la base. Sin ella no se puede mostrar el
              reparto sin emitir los recibos. El cierre funciona igual.
            </Aviso>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" disabled={ocupado} onClick={() => setConfirma({ que: "cerrar" })}>
              <ReceiptText size={16} /> Cerrar el mes y emitir recibos
            </Button>
            {cerrados.length > 0 && (
              <Button
                type="button"
                variante="secundario"
                onClick={() => setConfirma({ que: "reabrir", id: cerrados[0].id, etiqueta: cerrados[0].etiqueta, enviado: !!cerrados[0].enviado_en })}
              >
                <RotateCcw size={15} /> Reabrir {cerrados[0].etiqueta}
              </Button>
            )}
          </div>
        </>
      )}

      {cerrados.length > 0 && (
        <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
          <div style={{ padding: "18px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Meses cerrados</h2>
          </div>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th style={{ textAlign: "right" }}>Presupuesto</th>
                  <th style={{ textAlign: "right" }}>Gastos</th>
                  <th style={{ textAlign: "right" }}>Tasa</th>
                  <th>Recibos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cerrados.slice(0, 12).map((p, i) => (
                  <tr key={p.id}>
                    <td>{p.etiqueta}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{p.presupuesto ? usd(p.presupuesto) : "—"}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{usd(p.total_gastos)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{nf(2).format(p.tasa_bcv)}</td>
                    <td>{p.enviado_en ? <Badge tono="verde">enviados</Badge> : <Badge tono="ambar">sin enviar</Badge>}</td>
                    <td style={{ width: 110 }}>
                      {i === 0 ? (
                        <Button
                          type="button"
                          variante="secundario"
                          mini
                          disabled={ocupado}
                          onClick={() => setConfirma({ que: "reabrir", id: p.id, etiqueta: p.etiqueta, enviado: !!p.enviado_en })}
                        >
                          Reabrir
                        </Button>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>reabra antes el más reciente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirma?.que === "reabrir" && (
        <Confirmar
          titulo={`Reabrir ${confirma.etiqueta}`}
          texto={
            "Se borran los recibos y los cortes de ese mes, y los pagos vuelven a quedar sin aplicar. Después hay que volver a cerrarlo. " +
            (confirma.enviado
              ? "OJO: los recibos de este mes YA SE ENVIARON. Los propietarios tienen en la mano un recibo que va a cambiar."
              : "Los recibos todavía no se han enviado, así que nadie va a notar el cambio.")
          }
          boton="Reabrir el mes"
          tono={confirma.enviado ? "peligro" : "primario"}
          onSi={() => reabrir(confirma.id, confirma.enviado)}
          onNo={() => setConfirma(null)}
        />
      )}

      {confirma?.que === "reabrir_enviado" && (
        <Confirmar
          titulo="Este mes ya se envió"
          texto={confirma.texto + " Si confirma, se borran esos recibos y habrá que emitirlos y enviarlos de nuevo."}
          boton="Sí, reabrir igual"
          tono="peligro"
          onSi={() => reabrir(confirma.id, true)}
          onNo={() => setConfirma(null)}
        />
      )}

      {confirma?.que === "cerrar" && periodoAbierto && (
        <Confirmar
          titulo={`Cerrar ${periodoAbierto.etiqueta}`}
          texto="Se emiten los recibos de todas las unidades activas y se guarda la instantánea de saldos. Se puede reabrir después, pero los recibos emitidos quedarían anulados."
          boton="Cerrar y emitir"
          onSi={cerrar}
          onNo={() => setConfirma(null)}
        />
      )}
    </div>
  );
}

function FragmentoGrupo({
  grupo,
  comunes,
  categorias,
  onMover,
  onEditar,
  onQuitar,
}: {
  grupo: { id: string; nombre: string; lista: GastoAdmin[]; total: number };
  comunes: number;
  categorias: CategoriaAdmin[];
  onMover: (id: string, arriba: boolean) => void;
  onEditar: (id: string, campos: ActualizarGasto) => void;
  onQuitar: (id: string) => void;
}) {
  return (
    <>
      <tr style={{ background: "var(--fondo)" }}>
        <td colSpan={3} style={{ fontWeight: 700, fontSize: 13 }}>
          {grupo.nombre}
          <span style={{ fontWeight: 400, color: "var(--tenue)", marginLeft: 8 }}>
            {grupo.lista.length} {grupo.lista.length === 1 ? "partida" : "partidas"}
            {comunes > 0 && ` · ${nf(1).format((grupo.total / comunes) * 100)}% del mes`}
          </span>
        </td>
        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>{usd(grupo.total)}</td>
        <td />
      </tr>
      {grupo.lista.map((g) => (
        <FilaGasto key={g.id} g={g} categorias={categorias} onMover={onMover} onEditar={onEditar} onQuitar={onQuitar} />
      ))}
    </>
  );
}

function FilasDirectas({
  gastos,
  unidades,
  onEditar,
  onQuitar,
}: {
  gastos: GastoAdmin[];
  unidades: { id: string; codigo: string }[];
  onEditar: (id: string, campos: ActualizarGasto) => void;
  onQuitar: (id: string) => void;
}) {
  return (
    <>
      <tr style={{ background: "var(--fondo)" }}>
        <td colSpan={3} style={{ fontWeight: 700, fontSize: 13 }}>
          Cargos a una sola unidad
          <span style={{ fontWeight: 400, color: "var(--tenue)", marginLeft: 8 }}>no entran en el reparto</span>
        </td>
        <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
          {usd(gastos.reduce((sum, g) => sum + Number(g.monto), 0))}
        </td>
        <td />
      </tr>
      {gastos.map((g) => (
        <tr key={g.id}>
          <CampoTexto key={`concepto:${g.concepto}`} valor={g.concepto ?? ""} onGuardar={(v) => onEditar(g.id, { concepto: v || "Sin concepto" })} />
          <CampoTexto key={`referencia:${g.referencia}`} mono valor={g.referencia ?? ""} onGuardar={(v) => onEditar(g.id, { referencia: v || null })} />
          <td style={{ fontSize: 12.5 }}>
            {unidades.find((u) => u.id === g.unidad_id)?.codigo || "—"}
          </td>
          <CampoMonto key={`monto:${g.monto}`} valor={Number(g.monto)} onGuardar={(v) => onEditar(g.id, { monto: v })} />
          <td style={{ width: 34 }}>
            <button onClick={() => onQuitar(g.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
              <Trash2 size={15} />
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}

function FilaGasto({
  g,
  categorias,
  onMover,
  onEditar,
  onQuitar,
}: {
  g: GastoAdmin;
  categorias: CategoriaAdmin[];
  onMover: (id: string, arriba: boolean) => void;
  onEditar: (id: string, campos: ActualizarGasto) => void;
  onQuitar: (id: string) => void;
}) {
  return (
    <tr>
      <td>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Flechas onSubir={() => onMover(g.id, true)} onBajar={() => onMover(g.id, false)} />
          <div style={{ flex: 1 }}>
            <CampoTextoInline
              key={`concepto:${g.concepto}`}
              valor={g.concepto ?? ""}
              onGuardar={(v) => onEditar(g.id, { concepto: v || "Sin concepto" })}
            />
          </div>
        </div>
      </td>
      <td>
        <CampoTextoInline key={`referencia:${g.referencia}`} mono valor={g.referencia ?? ""} onGuardar={(v) => onEditar(g.id, { referencia: v || null })} />
      </td>
      <td>
        <Select value={g.categoria_id || ""} onChange={(e) => onEditar(g.id, { categoria_id: e.target.value || null })}>
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </td>
      <CampoMonto key={`monto:${g.monto}`} valor={Number(g.monto)} onGuardar={(v) => onEditar(g.id, { monto: v })} />
      <td style={{ width: 34 }}>
        <button onClick={() => onQuitar(g.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
          <Trash2 size={15} />
        </button>
      </td>
    </tr>
  );
}

/**
 * Input controlado con guardado al salir del campo. Sembrado con `valor`
 * solo al montar — quien lo llama le pasa un `key` que incluye `valor`
 * (ver FilaGasto/FilasDirectas más arriba), así que un cambio externo
 * remonta este componente con el valor fresco en vez de dejar un buffer
 * local desactualizado.
 */
function CampoTextoInline({ valor, mono, onGuardar }: { valor: string; mono?: boolean; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  return (
    <Input
      className={mono ? "mono" : undefined}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== valor && onGuardar(v)}
    />
  );
}

function CampoTexto({ valor, mono, onGuardar }: { valor: string; mono?: boolean; onGuardar: (v: string) => void }) {
  return (
    <td>
      <CampoTextoInline valor={valor} mono={mono} onGuardar={onGuardar} />
    </td>
  );
}

/** Mismo criterio que CampoTextoInline — remonta por `key`, no por efecto/ref. */
function CampoMonto({ valor, onGuardar }: { valor: number; onGuardar: (v: number) => void }) {
  const [v, setV] = useState(String(valor));
  return (
    <td>
      <Input
        className="mono"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = num0(v);
          if (n !== valor) onGuardar(n);
        }}
        style={{ textAlign: "right" }}
      />
    </td>
  );
}
