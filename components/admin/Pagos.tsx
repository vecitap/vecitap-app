"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Badge, Button, Campo, Card, Input, Select, type TonoBadge } from "@/components/ui";
import { bs, hoyLocalISO, nf, num, usd } from "@/lib/formato";
import { BOLSILLOS, DESTINOS_PAGO, METODOS, PIDE } from "@/lib/admin/constantes";
import {
  detectarColumnas,
  leerPDF,
  leerTabla,
  movimientosDesdeFilas,
  movimientosDesdeLineas,
  type MapaColumnas,
  type MovimientoBanco,
} from "@/lib/admin/archivos-tabla";
import { cruzarConBanco } from "@/lib/admin/conciliacion";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { BancoFila, ComprobanteFila, PagoAdmin } from "@/lib/admin/tipos";

type Mensaje = { texto: string; tipo: "ok" | "error" };
type Pestana = "registrar" | "conciliar" | "exonerar";
type Filtro = "reportado" | "conciliado" | "anulado" | "todos";

/** Fila de `tasa_de_esa_fecha(p_fecha)`. */
type TasaDeFecha = { tasa: number; fecha: string; propia: boolean; fuente: string | null };

const TONO_ESTADO: Record<string, TonoBadge> = { conciliado: "verde", anulado: "rojo" };

/**
 * Portado de Pagos() en admin.html:3289-3897. Tres pestañas (Registrar ·
 * Conciliar con el banco · Exoneraciones), la tabla de movimientos con sus
 * filtros, el visor de comprobante y la purga de imágenes vencidas.
 *
 * `pagos`/`bancos`/`comprobantes` vienen del Server Component como props
 * (una carga menos en el navegador), pero las mutaciones refrescan con
 * `router.refresh()` — mismo patrón que Cobros/Operador. Lo que sí es
 * estado propio es el archivo del banco: nunca sale del navegador.
 *
 * `monto_usd: 0` y `tasa_aplicada` sin mandar son deliberados, igual que en
 * el original: los calcula la base con la tasa del día del pago. Mandarlos
 * desde acá sería dejar que el navegador decida cuánto vale un pago.
 */
export function Pagos({
  orgId,
  unidades,
  pagos,
  bancos,
  comprobantes,
}: {
  orgId: string;
  unidades: { id: string; codigo: string }[];
  pagos: PagoAdmin[];
  bancos: BancoFila[];
  comprobantes: ComprobanteFila[];
}) {
  const router = useRouter();
  const [pest, setPest] = useState<Pestana>("registrar");
  const [filtro, setFiltro] = useState<Filtro>("reportado");
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [f, setF] = useState({
    unidad: "",
    fecha: hoyLocalISO(),
    monto: "",
    moneda: "USD",
    metodo: "Pago móvil",
    destino: "condominio",
    referencia: "",
    banco: "",
    telefono: "",
    documento: "",
    correo: "",
  });
  // `tfCargada` es lo último que respondió la base; `tf` (más abajo) es lo
  // que la pantalla usa — en dólares no hay tasa que mostrar, y derivarlo
  // en vez de poner `null` desde el efecto evita el setState sincrónico que
  // el lint de este proyecto rechaza (mismo patrón que Cobros/CierreMes).
  const [tfCargada, setTfCargada] = useState<TasaDeFecha | null>(null);
  const [huecoTasa, setHuecoTasa] = useState("");
  const [guardandoTasa, setGuardandoTasa] = useState(false);

  const [ex, setEx] = useState({ unidad: "", monto: "", motivo: "", destino: "condominio" });

  const [viendo, setViendo] = useState<{ url: string; tipo: string; pago: PagoAdmin; ficha: ComprobanteFila } | null>(null);
  const [purga, setPurga] = useState<number | null>(null);

  const [mov, setMov] = useState<MovimientoBanco[] | null>(null);
  const [filasCrudas, setFilasCrudas] = useState<string[][] | null>(null);
  const [mapa, setMapa] = useState<(MapaColumnas & { encabezados: string[] }) | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(e instanceof Error ? e.message : String(e), "error");
  }

  const comps = useMemo(() => {
    const m: Record<string, ComprobanteFila> = {};
    comprobantes.forEach((c) => {
      if (c.pago_id) m[c.pago_id] = c;
    });
    return m;
  }, [comprobantes]);

  const codigo = (id: string | null) => unidades.find((u) => u.id === id)?.codigo || "—";

  /* ── Tasa del BCV de la fecha del pago ──
     No la elige nadie: la pone la base. `propia` = es la publicada ESE
     día, no una heredada de un día anterior. */
  useEffect(() => {
    if (f.moneda !== "VES") return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("tasa_de_esa_fecha", { p_fecha: f.fecha }).then(({ data }) => {
      if (!vivo) return;
      const r = Array.isArray(data) ? data[0] : data;
      setTfCargada(r && Number(r.tasa) > 0 ? ({ ...r, tasa: Number(r.tasa) } as TasaDeFecha) : null);
    });
    return () => {
      vivo = false;
    };
  }, [f.fecha, f.moneda]);

  // La tasa cargada solo vale si es la de la fecha que está en el formulario:
  // al cambiar la fecha, hasta que responda la base no se muestra la vieja.
  const tf = f.moneda === "VES" && tfCargada?.fecha ? tfCargada : null;

  async function verTasa() {
    const supabase = crearClienteNavegador();
    const { data } = await supabase.rpc("tasa_de_esa_fecha", { p_fecha: f.fecha });
    const r = Array.isArray(data) ? data[0] : data;
    setTfCargada(r && Number(r.tasa) > 0 ? ({ ...r, tasa: Number(r.tasa) } as TasaDeFecha) : null);
  }

  async function guardarHueco() {
    const v = num(huecoTasa);
    if (!v || v <= 0) return notificar("La tasa no se entiende.", "error");
    setGuardandoTasa(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("completar_tasa", { p_fecha: f.fecha, p_tasa: v });
    setGuardandoTasa(false);
    if (error) return fallo(error);
    setHuecoTasa("");
    notificar(`Tasa del ${f.fecha} guardada. Queda registrada a su nombre.`);
    verTasa();
  }

  async function registrar() {
    if (!f.unidad) return notificar("Elija la unidad.", "error");
    const monto = num(f.monto);
    if (monto === null || monto <= 0) return notificar("El monto no se entiende.", "error");
    if (f.moneda === "VES" && !tf) return notificar("No hay tasa del BCV para esa fecha. Cárguela abajo.", "error");
    setOcupado(true);
    const pide = PIDE[f.metodo] ?? {};
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("pagos").insert({
      org_id: orgId,
      unidad_id: f.unidad,
      fecha: f.fecha,
      monto,
      moneda: f.moneda,
      monto_usd: 0,
      metodo: f.metodo,
      destino: f.destino,
      referencia: f.referencia.trim() || null,
      banco_codigo: pide.banco ? f.banco || null : null,
      telefono_origen: pide.telefono ? f.telefono.trim() : null,
      documento_origen: pide.documento ? f.documento.trim() : null,
      correo_origen: pide.correo ? f.correo.trim() : null,
      estado: "reportado",
    });
    setOcupado(false);
    if (error) return fallo(error);
    setF({ ...f, monto: "", referencia: "" });
    notificar("Pago registrado como reportado. Falta conciliarlo.");
    router.refresh();
  }

  async function cambiarEstado(p: PagoAdmin, estado: string) {
    const campos = estado === "conciliado" ? { estado, conciliado_en: new Date().toISOString() } : { estado };
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("pagos").update(campos).eq("id", p.id);
    if (error) return fallo(error);
    router.refresh();
  }

  async function exonerar() {
    if (!ex.unidad) return notificar("Elija la unidad.", "error");
    const monto = num(ex.monto);
    if (monto === null || monto === 0) return notificar("El monto no se entiende.", "error");
    if (!ex.motivo.trim()) return notificar("Escriba el motivo: queda en la auditoría.", "error");
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("ajustes").insert({
      org_id: orgId,
      unidad_id: ex.unidad,
      fecha: hoyLocalISO(),
      monto,
      motivo: ex.motivo.trim(),
      destino: ex.destino,
    });
    if (error) return fallo(error);
    setEx({ ...ex, monto: "", motivo: "" });
    notificar("Exoneración registrada.");
    router.refresh();
  }

  async function verComprobante(p: PagoAdmin) {
    const c = comps[p.id];
    if (!c) return;
    if (c.imagen_borrada_en)
      return notificar(
        "La imagen de ese comprobante ya venció y se borró. Queda su huella digital para comprobarlo.",
        "error"
      );
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.storage.from("comprobantes").createSignedUrl(c.ruta, 120);
    if (error) return fallo(error);
    setViendo({ url: data.signedUrl, tipo: c.tipo ?? "", pago: p, ficha: c });
  }

  /* Imágenes vencidas: conciliadas hace más de 3 meses y con el mes ya
     cerrado. Se borra el archivo; el pago, su referencia y la huella del
     comprobante se quedan para siempre. */
  async function purgarVencidos() {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("comprobantes_caducados");
    if (error) return fallo(error);
    if (!data || !data.length) {
      setPurga(0);
      return notificar("No hay imágenes vencidas.");
    }
    const rutas = data.map((x) => x.ruta);
    const { error: e2 } = await supabase.storage.from("comprobantes").remove(rutas);
    if (e2) return fallo(e2);
    for (const x of data) await supabase.rpc("marcar_comprobante_borrado", { p_id: x.id });
    setPurga(data.length);
    notificar(`${data.length} imágenes vencidas borradas.`);
    router.refresh();
  }

  async function leerBanco(file: File | undefined) {
    if (!file) return;
    setMensaje(null);
    try {
      /* El PDF no tiene columnas: se lee como texto suelto y cada renglón
         se interpreta a mano (admin.html:3441-3445). Por eso no hay mapa
         de columnas que corregir en esa rama. */
      if (/\.pdf$/i.test(file.name)) {
        setFilasCrudas(null);
        setMapa(null);
        setMov(movimientosDesdeLineas(await leerPDF(file)));
        return;
      }
      const crudas = await leerTabla(file);
      const encabezados = crudas[0] ?? [];
      const filas = crudas.slice(1);
      const m = detectarColumnas(encabezados, filas);
      setFilasCrudas(filas);
      setMapa({ ...m, encabezados });
      setMov(movimientosDesdeFilas(filas, m));
    } catch (e) {
      setMov(null);
      setMapa(null);
      setFilasCrudas(null);
      fallo(e);
    }
  }

  function recalcular(campo: keyof MapaColumnas, valor: number) {
    if (!mapa || !filasCrudas) return;
    const m = { ...mapa, [campo]: valor };
    setMapa(m);
    setMov(movimientosDesdeFilas(filasCrudas, m));
  }

  const cruce = useMemo(() => {
    if (!mov) return null;
    const reportados = pagos
      .filter((p) => p.estado === "reportado")
      .map((p) => ({ id: p.id, monto: Number(p.monto), referencia: p.referencia, banco: p.banco, unidad_id: p.unidad_id }));
    return cruzarConBanco(mov, reportados);
  }, [mov, pagos]);

  async function conciliarLote() {
    if (!cruce) return;
    setOcupado(true);
    const supabase = crearClienteNavegador();
    for (const c of cruce.casan) {
      const { error } = await supabase
        .from("pagos")
        .update({ estado: "conciliado", conciliado_en: new Date().toISOString(), banco: c.pago.banco || null })
        .eq("id", c.pago.id);
      if (error) {
        setOcupado(false);
        return fallo(error);
      }
    }
    setOcupado(false);
    notificar(`${cruce.casan.length} pagos conciliados.`);
    setMov(null);
    setMapa(null);
    setFilasCrudas(null);
    router.refresh();
  }

  const visibles = pagos.filter((p) => filtro === "todos" || p.estado === filtro);
  const pide = PIDE[f.metodo] ?? {};
  const montoVes = num(f.monto);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {mensaje && <Aviso tono={mensaje.tipo === "error" ? "rojo" : "verde"}>{mensaje.texto}</Aviso>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["registrar", "Registrar"],
            ["conciliar", "Conciliar con el banco"],
            ["exonerar", "Exoneraciones"],
          ] as [Pestana, string][]
        ).map(([k, t]) => (
          <Button key={k} type="button" mini variante={pest === k ? "primario" : "secundario"} onClick={() => setPest(k)}>
            {t}
          </Button>
        ))}
      </div>

      {pest === "registrar" && (
        <Card>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Registrar un pago</h2>
          <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
            Un pago entra como reportado y no baja el saldo hasta que se confirme que el dinero
            llegó.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Campo etiqueta="Unidad">
              <Select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })}>
                <option value="">Elija</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Fecha del pago">
              <Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
            </Campo>
            <Campo etiqueta="Moneda">
              <Select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
                <option value="USD">Dólares</option>
                <option value="VES">Bolívares</option>
              </Select>
            </Campo>
            <Campo etiqueta={f.moneda === "VES" ? "Monto en Bs" : "Monto en USD"}>
              <Input className="mono" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
            </Campo>
            {f.moneda === "VES" && (
              <Campo
                etiqueta="Tasa del BCV de esa fecha"
                ayuda={
                  tf && tf.propia
                    ? tf.fuente === "dolarapi"
                      ? "publicada ese día"
                      : "cargada a mano"
                    : tf
                      ? `no hay publicación de ese día: se usa la del ${tf.fecha}`
                      : "no hay ninguna tasa de ese día ni anterior"
                }
              >
                <div
                  className="mono"
                  style={{
                    padding: "9px 11px",
                    borderRadius: 8,
                    border: "1px solid var(--linea)",
                    background: "var(--fondo)",
                    color: tf ? "var(--tinta)" : "var(--rojo)",
                    fontSize: 13.5,
                  }}
                >
                  {tf ? nf(2).format(tf.tasa) : "sin tasa"}
                </div>
              </Campo>
            )}
            <Campo etiqueta="Método">
              <Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
                {METODOS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Abona a">
              <Select value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value })}>
                {DESTINOS_PAGO.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Referencia">
              <Input className="mono" value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
            </Campo>
            {pide.banco && (
              <Campo etiqueta="Banco de origen">
                <Select value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })}>
                  <option value="">Elija</option>
                  {bancos.map((b) => (
                    <option key={b.codigo} value={b.codigo}>
                      {b.codigo} · {b.corto || b.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            {pide.telefono && (
              <Campo etiqueta="Teléfono de origen" ayuda="Es lo que aparece en el estado de cuenta.">
                <Input
                  className="mono"
                  value={f.telefono}
                  placeholder="04121234567"
                  onChange={(e) => setF({ ...f, telefono: e.target.value })}
                />
              </Campo>
            )}
            {pide.documento && (
              <Campo etiqueta="Cédula o RIF del que paga">
                <Input className="mono" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
              </Campo>
            )}
            {pide.correo && (
              <Campo etiqueta="Correo de origen">
                <Input value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} />
              </Campo>
            )}
          </div>

          {f.moneda === "VES" && montoVes !== null && tf && (
            <p style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 10, lineHeight: 1.6 }}>
              Equivale a <b>{usd(montoVes / tf.tasa)}</b> a la tasa del BCV del {tf.fecha}. Vale esa
              y no la de hoy: si el propietario transfirió el lunes y usted concilia el jueves,
              cobrarle a tasa de jueves sería cobrarle de más.
            </p>
          )}

          {f.moneda === "VES" && (!tf || !tf.propia) && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid var(--linea)",
                background: "var(--fondo)",
              }}
            >
              <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginBottom: 8, lineHeight: 1.55 }}>
                {tf ? (
                  <>
                    No hay tasa publicada del <b>{f.fecha}</b>. Si fue sábado, domingo o feriado está
                    bien usar la del {tf.fecha}. Si fue día hábil y usted tiene la del BCV de ese
                    día, cárguela.
                  </>
                ) : (
                  <>
                    No hay ninguna tasa del <b>{f.fecha}</b> ni anterior. Cargue la del BCV de ese
                    día para poder registrar el pago.
                  </>
                )}
                <br />
                <span style={{ color: "var(--tenue)" }}>
                  Solo se puede rellenar un día vacío. Un día que ya tiene tasa no lo cambia nadie
                  desde aquí. Queda registrado que la cargó usted.
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div style={{ width: 170 }}>
                  <Input
                    className="mono"
                    value={huecoTasa}
                    placeholder="Bs por dólar"
                    onChange={(e) => setHuecoTasa(e.target.value)}
                  />
                </div>
                <Button type="button" variante="secundario" mini disabled={guardandoTasa} onClick={guardarHueco}>
                  Guardar la tasa del {f.fecha}
                </Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button type="button" disabled={ocupado} onClick={registrar}>
              Registrar como reportado
            </Button>
          </div>
        </Card>
      )}

      {pest === "exonerar" && (
        <Card>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>
            Exoneración o nota de crédito
          </h2>
          <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
            Una exoneración baja el saldo sin que haya entrado dinero. Queda registrada en la
            auditoría con su motivo.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Campo etiqueta="Unidad">
              <Select value={ex.unidad} onChange={(e) => setEx({ ...ex, unidad: e.target.value })}>
                <option value="">Elija</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Monto USD" ayuda="Positivo baja la deuda. Negativo la sube.">
              <Input className="mono" value={ex.monto} onChange={(e) => setEx({ ...ex, monto: e.target.value })} />
            </Campo>
            <Campo etiqueta="Aplica a">
              <Select value={ex.destino} onChange={(e) => setEx({ ...ex, destino: e.target.value })}>
                {DESTINOS_PAGO.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </Select>
            </Campo>
            <div style={{ gridColumn: "1 / -1" }}>
              <Campo etiqueta="Motivo">
                <Input
                  value={ex.motivo}
                  placeholder="Acuerdo de junta del 12 de marzo"
                  onChange={(e) => setEx({ ...ex, motivo: e.target.value })}
                />
              </Campo>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Button type="button" onClick={exonerar}>
              Registrar
            </Button>
          </div>
        </Card>
      )}

      {pest === "conciliar" && (
        <>
          <Card>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Conciliar con el banco</h2>
            <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              Suba el archivo del banco: Excel, CSV o PDF. Se cruza por referencia contra los pagos
              reportados.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf"
              onChange={(e) => leerBanco(e.target.files?.[0])}
              className="control"
              style={{ padding: 10 }}
            />
            {mapa && (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <p style={{ fontSize: 12.5, color: "var(--tinta-2)", margin: 0 }}>
                  Columnas detectadas. Si adivinó mal, corríjalo aquí.
                </p>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
                  {(["referencia", "monto", "fecha", "descripcion"] as const).map((campo) => (
                    <Campo key={campo} etiqueta={campo}>
                      <Select value={mapa[campo]} onChange={(e) => recalcular(campo, Number(e.target.value))}>
                        <option value={-1}>— ninguna —</option>
                        {mapa.encabezados.map((h, i) => (
                          <option key={i} value={i}>
                            {String(h || `columna ${i + 1}`)}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {cruce && (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
                <Card>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
                    Cuadran
                  </div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--verde)" }}>
                    {cruce.casan.length}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
                    misma referencia y mismo monto
                  </div>
                </Card>
                <Card>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
                    Monto distinto
                  </div>
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                    {cruce.dudosos.length}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
                    la referencia coincide, el monto no
                  </div>
                </Card>
                <Card>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
                    Del banco, sin pago reportado
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 22, fontWeight: 700, color: cruce.huerfanos.length ? "var(--rojo)" : undefined }}
                  >
                    {cruce.huerfanos.length}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
                    plata que entró y no se sabe de quién es
                  </div>
                </Card>
              </div>

              {cruce.casan.length > 0 && (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "18px 18px 0" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cuadran</h2>
                    <p style={{ margin: "3px 0 12px", fontSize: 12.5, color: "var(--tenue)" }}>
                      Listos para conciliar de una vez.
                    </p>
                  </div>
                  <div className="tabla-scroll" style={{ maxHeight: 300 }}>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Referencia</th>
                          <th>Unidad</th>
                          <th style={{ textAlign: "right" }}>Reportado</th>
                          <th style={{ textAlign: "right" }}>Banco</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cruce.casan.map((c, i) => (
                          <tr key={i}>
                            <td className="mono">{c.mov.referencia}</td>
                            <td className="mono">{codigo(c.pago.unidad_id)}</td>
                            <td className="mono" style={{ textAlign: "right" }}>
                              {nf(2).format(c.pago.monto)}
                            </td>
                            <td className="mono" style={{ textAlign: "right" }}>
                              {nf(2).format(c.mov.monto || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: 18, borderTop: "1px solid var(--linea)" }}>
                    <Button type="button" disabled={ocupado} onClick={conciliarLote}>
                      Conciliar {cruce.casan.length} pagos
                    </Button>
                  </div>
                </Card>
              )}

              {cruce.huerfanos.length > 0 && (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "18px 18px 0" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>
                      Movimientos del banco sin pago reportado
                    </h2>
                    <p style={{ margin: "3px 0 12px", fontSize: 12.5, color: "var(--tenue)" }}>
                      Entró dinero al banco y ningún propietario lo reportó. Hay que averiguar de
                      quién es.
                    </p>
                  </div>
                  <div className="tabla-scroll" style={{ maxHeight: 300 }}>
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Referencia</th>
                          <th>Descripción</th>
                          <th style={{ textAlign: "right" }}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cruce.huerfanos.map((m, i) => (
                          <tr key={i}>
                            <td className="mono">{m.fecha || "—"}</td>
                            <td className="mono">{m.referencia || "—"}</td>
                            <td style={{ fontSize: 12, color: "var(--tinta-2)" }}>{(m.descripcion || "").slice(0, 70)}</td>
                            <td className="mono" style={{ textAlign: "right" }}>
                              {m.monto === null ? "—" : nf(2).format(m.monto)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {viendo && (
        <div
          onClick={() => setViendo(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(0,0,0,.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              color: "#0A1128",
              borderRadius: "var(--radio)",
              maxWidth: 760,
              width: "100%",
              maxHeight: "92vh",
              overflow: "auto",
              padding: 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>Comprobante · {codigo(viendo.pago.unidad_id)}</div>
                <div className="mono" style={{ fontSize: 12, color: "#64748B" }}>
                  {viendo.pago.fecha} · {viendo.pago.metodo}
                  {viendo.pago.referencia ? ` · ref ${viendo.pago.referencia}` : ""}
                </div>
              </div>
              <Button type="button" variante="secundario" mini onClick={() => setViendo(null)}>
                Cerrar
              </Button>
            </div>
            {/^image\//.test(viendo.tipo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viendo.url}
                alt="Comprobante"
                style={{ maxWidth: "100%", borderRadius: "var(--radio-chico)", display: "block" }}
              />
            ) : (
              <iframe
                src={viendo.url}
                title="Comprobante"
                style={{ width: "100%", height: "70vh", border: "1px solid #E4E9F0", borderRadius: "var(--radio-chico)" }}
              />
            )}
            <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 10, wordBreak: "break-all" }}>
              Huella del archivo: <span className="mono">{viendo.ficha.sha256 || "sin huella"}</span>
              <br />
              Sirve para comprobar dentro de dos años que un comprobante que le muestren es
              exactamente este, aunque la imagen ya se haya borrado.
            </div>
          </div>
        </div>
      )}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Movimientos registrados</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  ["reportado", "Reportados"],
                  ["conciliado", "Conciliados"],
                  ["anulado", "Anulados"],
                  ["todos", "Todos"],
                ] as [Filtro, string][]
              ).map(([k, t]) => (
                <Button
                  key={k}
                  type="button"
                  mini
                  variante={filtro === k ? "primario" : "secundario"}
                  onClick={() => setFiltro(k)}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="tabla-scroll" style={{ marginTop: 14 }}>
          <table className="tabla apila">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Unidad</th>
                <th>Método</th>
                <th>Ref.</th>
                <th>Origen</th>
                <th>Abona a</th>
                <th style={{ textAlign: "right" }}>USD</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td className="mono" data-t="Fecha">
                    {p.fecha}
                  </td>
                  <td className="mono cabeza" style={{ fontWeight: 600 }}>
                    {codigo(p.unidad_id)}
                  </td>
                  <td data-t="Método">
                    {p.metodo}
                    {p.moneda === "VES" && (
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)" }}>
                        {bs(p.monto)} a {nf(2).format(Number(p.tasa_aplicada) || 0)}
                      </div>
                    )}
                  </td>
                  <td className="mono" data-t="Referencia">
                    {p.referencia || "—"}
                  </td>
                  <td style={{ fontSize: 12 }} data-t="Origen">
                    {p.banco || <span style={{ color: "var(--tenue)" }}>—</span>}
                    {p.telefono_origen && (
                      <div className="mono" style={{ color: "var(--tenue)" }}>
                        {p.telefono_origen}
                      </div>
                    )}
                    {p.correo_origen && <div style={{ color: "var(--tenue)" }}>{p.correo_origen}</div>}
                    {comps[p.id] && (
                      <button
                        type="button"
                        onClick={() => verComprobante(p)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--acento-texto)",
                          cursor: "pointer",
                          padding: "3px 0",
                          fontSize: 12,
                          fontFamily: "inherit",
                        }}
                      >
                        {comps[p.id].imagen_borrada_en ? "comprobante vencido" : "ver comprobante"}
                      </button>
                    )}
                  </td>
                  <td data-t="Abona a">
                    {BOLSILLOS[p.destino === "honorarios" ? "administracion" : p.destino]?.t ?? p.destino}
                  </td>
                  <td className="mono" data-t="Monto" style={{ textAlign: "right", fontWeight: 600 }}>
                    {usd(p.monto_usd)}
                  </td>
                  <td data-t="Estado">
                    <Badge tono={TONO_ESTADO[p.estado] ?? "ambar"}>
                      {p.estado}
                      {p.periodo_cierre_id ? " · en cierre" : ""}
                    </Badge>
                  </td>
                  <td className="acciones" style={{ width: 150 }}>
                    {p.estado === "reportado" && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <Button type="button" mini onClick={() => cambiarEstado(p, "conciliado")}>
                          Conciliar
                        </Button>
                        <Button type="button" mini variante="secundario" onClick={() => cambiarEstado(p, "anulado")}>
                          Anular
                        </Button>
                      </div>
                    )}
                    {p.estado === "conciliado" && !p.periodo_cierre_id && (
                      <Button type="button" mini variante="secundario" onClick={() => cambiarEstado(p, "anulado")}>
                        Anular
                      </Button>
                    )}
                    {p.periodo_cierre_id && (
                      <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>ya está dentro de un cierre</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <div style={{ padding: 34, textAlign: "center", color: "var(--tenue)", fontSize: 14 }}>
              No hay pagos con ese filtro.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Comprobantes vencidos</h2>
        <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.6 }}>
          Las imágenes de los comprobantes se borran a los 3 meses de conciliado el pago y con el
          mes ya cerrado. El pago, su referencia y la huella del archivo se quedan para siempre: la
          evidencia sobrevive al borrado.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button type="button" variante="secundario" onClick={purgarVencidos}>
            Borrar las imágenes vencidas
          </Button>
          {purga !== null && (
            <span style={{ fontSize: 13, color: "var(--tinta-2)" }}>
              {purga === 0 ? "No había ninguna." : `${purga} borradas.`}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
