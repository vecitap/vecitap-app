"use client";

import { useEffect, useMemo, useState } from "react";
import { useBorrador } from "@/lib/local/borrador";
import { AvisoBorrador } from "@/components/sin-conexion/AvisoBorrador";
import { PorEnviar } from "@/components/sin-conexion/PorEnviar";
import { hacer, marcasEquipo, textoEnBandeja, useBandeja, type Resultado } from "@/lib/local/bandeja";
import { buscarPosiblesDuplicados, claseDeError } from "@/lib/local/envios";
import { SIN_CONEXION_ACTIVO } from "@/lib/local/config";
import { useModoCopia } from "@/lib/local/contexto";
import type { CandidatoDuplicado } from "@/lib/local/bandeja-tipos";
import { useRouter } from "next/navigation";
import { Aviso, Badge, Button, Campo, Card, Confirmar, Input, InputFecha, Select, type TonoBadge } from "@/components/ui";
import { bs, hoyLocalISO, montoAlSalir, nf, num, paraCampo, usd, formatoFecha } from "@/lib/formato";
import { BOLSILLOS, DESTINOS_PAGO, METODOS, MOTIVOS_TASA, PIDE } from "@/lib/admin/constantes";
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
import { mensajeDeError } from "@/lib/errores";
import { repartirTransferencia, textoCubre } from "@/lib/reparto";

type Mensaje = { texto: string; tipo: "ok" | "error" };
type Pestana = "registrar" | "conciliar" | "exonerar";
type Filtro = "reportado" | "conciliado" | "anulado" | "todos";

/** Fila de `tasa_de_esa_fecha(p_fecha)`. */
type TasaDeFecha = { tasa: number; fecha: string; propia: boolean; fuente: string | null };

const TONO_ESTADO: Record<string, TonoBadge> = { conciliado: "neutro", anulado: "rojo" };

/**
 * Portado de Pagos() en admin.html:3289-3897. Tres pestañas (Registrar ·
 * Conciliar con el banco · Exoneraciones), la tabla de movimientos con sus
 * filtros, el visor de comprobante y la purga de imágenes vencidas.
 *
 * `pagos`/`bancos`/`comprobantes` vienen del Server Component como props
 * (una carga menos en el navegador), pero las mutaciones refrescan con
 * `router.refresh()` — mismo patrón que ReglasCobro/Operador. Lo que sí es
 * estado propio es el archivo del banco: nunca sale del navegador.
 *
 * `monto_usd: 0` y `tasa_aplicada` sin mandar son deliberados, igual que en
 * el original: los calcula la base con la tasa del día del pago. Mandarlos
 * desde acá sería dejar que el navegador decida cuánto vale un pago.
 *
 * Cambio 1 (17-nov): la excepción es la tasa ajustada. Si la administración
 * escribe otra tasa para un pago, se manda `tasa_manual` con la tasa y el
 * motivo; la base comprueba que quien escribe administra la organización y
 * que la tasa es creíble, y calcula el monto_usd igual (`pago_convierte`).
 * Para un pago ya registrado se usa `ajustar_tasa_pago`.
 */

/** Diferencia de tasa por debajo de la cual se considera la misma (medio céntimo). */
const MISMA_TASA = 0.005;
export function Pagos({
  orgId,
  edificioId,
  unidades,
  pagos,
  bancos,
  comprobantes,
}: {
  orgId: string;
  /** Para la clave de los borradores (cambio 3). */
  edificioId: string;
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
  // el lint de este proyecto rechaza (mismo patrón que ReglasCobro/CierreMes).
  const [tfCargada, setTfCargada] = useState<TasaDeFecha | null>(null);
  const [huecoTasa, setHuecoTasa] = useState("");
  const [guardandoTasa, setGuardandoTasa] = useState(false);
  // Cambio 1: `null` = la del BCV; un texto = la que escribió la administración.
  const [tasaTxt, setTasaTxt] = useState<string | null>(null);
  const [motivoTasa, setMotivoTasa] = useState("");
  const [detalleTasa, setDetalleTasa] = useState("");
  // Cambio 1: cambiar la tasa de un pago ya registrado (reportado o confirmado).
  const [editTasa, setEditTasa] = useState<{
    pago: PagoAdmin;
    tasa: string;
    motivo: string;
    detalle: string;
    bcv: TasaDeFecha | null;
  } | null>(null);

  const [ex, setEx] = useState({ unidad: "", monto: "", motivo: "", destino: "condominio" });
  // Ronda 7 (bloque 9): una transferencia repartida entre varias unidades.
  const [agrupado, setAgrupado] = useState(false);
  const [partes, setPartes] = useState<{ unidad: string; monto: string }[]>([
    { unidad: "", monto: "" },
    { unidad: "", monto: "" },
  ]);
  // Cambio 2: lo que propuso «Repartir automáticamente», por unidad. La línea
  // «Cubre …» se muestra solo mientras el monto siga siendo el propuesto.
  const [cubre, setCubre] = useState<Record<string, { monto: string; texto: string }>>({});

  // Cambio 3 (plan, sección 3): lo que se está escribiendo no se pierde.
  const borradorPago = useBorrador(
    `pagos.registrar·${edificioId}`,
    { f, agrupado, partes },
    (b) => {
      setF(b.f);
      setAgrupado(b.agrupado);
      setPartes(b.partes);
    },
    (b) => !b.f.monto.trim() && !b.f.referencia.trim() && b.partes.every((x) => !x.monto.trim())
  );
  const borradorEx = useBorrador(`pagos.exonerar·${edificioId}`, ex, setEx, (b) => !b.monto.trim() && !b.motivo.trim());

  // Cambio 3, parte B: en la pantalla sin internet lo que se guarda va a la
  // bandeja; «Pagos por enviar» muestra lo de este edificio.
  const sinConexion = useModoCopia() === "sin-conexion";
  const bandeja = useBandeja(edificioId);
  /** Pagos con un cambio de estado esperando para enviarse. */
  const pendienteDe = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of bandeja) {
      if (c.tipo !== "pago.estado") continue;
      const d = c.datos as { pagoId?: string; grupoId?: string | null; estado: string };
      const texto = d.estado === "conciliado" ? "por enviar: conciliar" : "por enviar: anular";
      if (d.grupoId) pagos.filter((x) => x.grupo_id === d.grupoId).forEach((x) => (m[x.id] = texto));
      else if (d.pagoId) m[d.pagoId] = texto;
    }
    return m;
  }, [bandeja, pagos]);
  // Aviso de posible duplicado en línea (plan 2.4, aprobado el 17-nov).
  const [duplicados, setDuplicados] = useState<{ candidatos: CandidatoDuplicado[]; seguir: () => void } | null>(null);
  const codigos = useMemo(() => Object.fromEntries(unidades.map((u) => [u.id, u.codigo])), [unidades]);

  const [viendo, setViendo] = useState<{ url: string; tipo: string; pago: PagoAdmin; ficha: ComprobanteFila } | null>(null);
  const [purga, setPurga] = useState<number | null>(null);

  const [mov, setMov] = useState<MovimientoBanco[] | null>(null);
  const [filasCrudas, setFilasCrudas] = useState<string[][] | null>(null);
  const [mapa, setMapa] = useState<(MapaColumnas & { encabezados: string[] }) | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(mensajeDeError(e), "error");
  }

  const comps = useMemo(() => {
    const m: Record<string, ComprobanteFila> = {};
    comprobantes.forEach((c) => {
      if (c.pago_id) m[c.pago_id] = c;
    });
    return m;
  }, [comprobantes]);

  const codigo = (id: string | null) => unidades.find((u) => u.id === id)?.codigo || "—";

  // Ronda 7 (bloque 9): los pagos de una misma transferencia (grupo_id).
  const grupos = useMemo(() => {
    const m: Record<string, PagoAdmin[]> = {};
    pagos.forEach((p) => {
      if (p.grupo_id) (m[p.grupo_id] ??= []).push(p);
    });
    return m;
  }, [pagos]);
  /** El comprobante de un pago, o el de su grupo (se sube uno por transferencia). */
  const compDe = (p: PagoAdmin) =>
    comps[p.id] ?? (p.grupo_id ? grupos[p.grupo_id]?.map((x) => comps[x.id]).find(Boolean) : undefined);
  const sumaPartes = partes.reduce((s, x) => s + (num(x.monto) ?? 0), 0);

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

  /* ── Cambio 1: tasa escrita para este pago ── */
  const tasaEscrita = tasaTxt === null ? null : num(tasaTxt);
  const ajustada =
    f.moneda === "VES" &&
    tasaTxt !== null &&
    tasaEscrita !== null &&
    (!tf || Math.abs(tasaEscrita - tf.tasa) >= MISMA_TASA);
  const tasaEfectiva = ajustada ? tasaEscrita : (tf?.tasa ?? null);

  /** El primer problema con la tasa del formulario, o null si se puede guardar. */
  function errorTasa(): string | null {
    if (f.moneda !== "VES") return null;
    if (tasaTxt !== null && tasaTxt.trim() !== "" && (tasaEscrita === null || tasaEscrita <= 0))
      return "La tasa no se entiende.";
    // Sin conexión no se puede leer la tasa de esa fecha: la pone la base al
    // enviarse (pago_convierte), igual que cuando el pago lo carga el residente.
    if (!ajustada) return tf || sinConexion ? null : "No hay tasa del BCV para esa fecha. Cárguela abajo o escriba la tasa de este pago.";
    if (!motivoTasa) return "Elija el motivo del cambio de tasa.";
    if (motivoTasa === "otro" && !detalleTasa.trim()) return "Escriba el motivo del cambio de tasa.";
    return null;
  }

  /** Lo que se suma al INSERT cuando la tasa fue ajustada. */
  function camposTasa() {
    if (!ajustada) return {};
    return {
      tasa_manual: true,
      tasa_aplicada: tasaEscrita,
      tasa_motivo: motivoTasa,
      tasa_motivo_detalle: motivoTasa === "otro" ? detalleTasa.trim() : null,
    };
  }

  function limpiarTasa() {
    setTasaTxt(null);
    setMotivoTasa("");
    setDetalleTasa("");
  }

  async function abrirEditorTasa(p: PagoAdmin) {
    const supabase = crearClienteNavegador();
    const { data } = await supabase.rpc("tasa_de_esa_fecha", { p_fecha: p.fecha });
    const r = Array.isArray(data) ? data[0] : data;
    setEditTasa({
      pago: p,
      tasa: paraCampo(Number(p.tasa_aplicada) || 0, 2),
      motivo: p.tasa_motivo ?? "",
      detalle: p.tasa_motivo_detalle ?? "",
      bcv: r && Number(r.tasa) > 0 ? ({ ...r, tasa: Number(r.tasa) } as TasaDeFecha) : null,
    });
  }

  async function guardarTasaPago(volverAlBcv: boolean) {
    if (!editTasa) return;
    const { pago, bcv, motivo, detalle } = editTasa;
    let tasa: number | null = null;
    if (!volverAlBcv) {
      tasa = num(editTasa.tasa);
      if (!tasa || tasa <= 0) return notificar("La tasa no se entiende.", "error");
      // Escribir la misma del BCV es volver a ella.
      if (bcv && Math.abs(tasa - bcv.tasa) < MISMA_TASA) tasa = null;
    }
    if (tasa !== null) {
      if (!motivo) return notificar("Elija el motivo del cambio de tasa.", "error");
      if (motivo === "otro" && !detalle.trim()) return notificar("Escriba el motivo del cambio de tasa.", "error");
    }
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("ajustar_tasa_pago", {
      p_pago: pago.id,
      // El tipo generado no marca nullable los argumentos de una función, pero
      // ajustar_tasa_pago acepta p_tasa = NULL: volver a la tasa del BCV.
      p_tasa: tasa as number,
      ...(tasa !== null ? { p_motivo: motivo, ...(motivo === "otro" ? { p_detalle: detalle.trim() } : {}) } : {}),
    });
    setOcupado(false);
    if (error) return fallo(error);
    const partes = pago.grupo_id ? (grupos[pago.grupo_id]?.length ?? 0) : 0;
    notificar(
      (tasa === null ? "El pago volvió a la tasa del BCV." : "Tasa del pago cambiada. Queda registrado quién la cambió y por qué.") +
        (partes > 1 ? ` Se aplicó a toda la transferencia (${partes} unidades).` : "")
    );
    setEditTasa(null);
    router.refresh();
  }

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
    notificar(`Tasa del ${formatoFecha(f.fecha)} guardada. Queda registrada a su nombre.`);
    verTasa();
  }

  async function registrar() {
    if (agrupado) return registrarAgrupado();
    if (!f.unidad) return notificar("Elija la unidad.", "error");
    const monto = num(f.monto);
    if (monto === null || monto <= 0) return notificar("El monto no se entiende.", "error");
    // Ronda 5: escrita a mano, el navegador acepta una fecha futura aunque el calendario no la ofrezca.
    if (!f.fecha || f.fecha > hoyLocalISO()) return notificar("La fecha del pago no puede ser futura.", "error");
    const eTasa = errorTasa();
    if (eTasa) return notificar(eTasa, "error");
    setOcupado(true);
    const pide = PIDE[f.metodo] ?? {};
    const id = crypto.randomUUID();
    const fila = {
      ...camposTasa(),
      ...marcasEquipo(id),
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
    };
    await conDuplicados([fila], async (permitirDuplicado) => {
      const r = await hacer({
        id,
        orgId,
        edificioId,
        unidadId: f.unidad,
        tipo: "pago.registrar",
        datos: { filas: [fila] },
        antes: null,
        resumen: `Pago de ${codigo(f.unidad)} · ${f.moneda === "VES" ? bs(monto) : usd(monto)} · ${formatoFecha(f.fecha)}`,
        permitirDuplicado,
      });
      if (!terminar(r)) return;
      setF({ ...f, monto: "", referencia: "" });
      limpiarTasa();
      borradorPago.limpiar();
      if (r.tipo === "enviado") notificar("Pago registrado como reportado. Falta conciliarlo.");
    });
    setOcupado(false);
  }

  /**
   * Lo que devolvió hacer() (cambio 3): en la bandeja, el aviso; rechazado,
   * el error de siempre. Devuelve si hay que limpiar el formulario.
   */
  function terminar(r: Resultado): boolean {
    if (r.tipo === "rechazado") {
      fallo(r.error);
      return false;
    }
    if (r.tipo === "en_bandeja") notificar(textoEnBandeja());
    else router.refresh();
    return true;
  }

  /**
   * Cambio 3 (plan 2.4): antes de registrar con conexión, busca un pago no
   * anulado de la misma unidad, mismo monto y fecha a ±3 días. Si lo hay,
   * pregunta. Sin conexión no se puede mirar: lo mira el envío al volver.
   */
  async function conDuplicados(
    filas: { unidad_id: string; monto: number; moneda: string; fecha: string }[],
    seguir: (permitirDuplicado: boolean) => Promise<void>
  ) {
    if (!SIN_CONEXION_ACTIVO || sinConexion) return seguir(false);
    let candidatos: CandidatoDuplicado[] = [];
    try {
      candidatos = await buscarPosiblesDuplicados(crearClienteNavegador(), filas);
    } catch (e) {
      // Sin red para mirar: que lo mire el envío al volver.
      if (claseDeError(e) !== "base") return seguir(false);
      return fallo(e);
    }
    if (!candidatos.length) return seguir(true);
    setDuplicados({
      candidatos,
      seguir: () => {
        setDuplicados(null);
        setOcupado(true);
        void seguir(true).finally(() => setOcupado(false));
      },
    });
  }

  /**
   * Cambio 3 (plan 2.1): sin conexión no se le puede pedir el reparto a la
   * base. Se elige el total y las unidades, y la transferencia queda en la
   * bandeja; al volver, el envío pide el reparto con la deuda de ese momento.
   */
  async function repartirAlVolver() {
    const total = num(f.monto);
    if (total === null || total <= 0) return notificar("Escriba el total de la transferencia.", "error");
    const ids = [...new Set(partes.map((x) => x.unidad).filter(Boolean))];
    if (ids.length < 2) return notificar("Elija al menos dos unidades para repartir.", "error");
    if (!f.fecha || f.fecha > hoyLocalISO()) return notificar("La fecha del pago no puede ser futura.", "error");
    if (f.moneda === "VES" && !tasaEfectiva) return notificar("Para repartir en bolívares sin conexión, escriba la tasa de este pago.", "error");
    const eTasa = errorTasa();
    if (eTasa) return notificar(eTasa, "error");
    setOcupado(true);
    const pide = PIDE[f.metodo] ?? {};
    const hechoEn = new Date().toISOString();
    const r = await hacer({
      orgId,
      edificioId,
      unidadId: null,
      tipo: "pago.repartir",
      hechoEn,
      datos: {
        base: {
          ...camposTasa(),
          hecho_en: hechoEn,
          org_id: orgId,
          monto_usd: 0,
          metodo: f.metodo,
          destino: f.destino,
          referencia: f.referencia.trim() || null,
          banco_codigo: pide.banco ? f.banco || null : null,
          telefono_origen: pide.telefono ? f.telefono.trim() : null,
          documento_origen: pide.documento ? f.documento.trim() : null,
          correo_origen: pide.correo ? f.correo.trim() : null,
          estado: "reportado",
        },
        total,
        unidades: ids,
        moneda: f.moneda,
        tasa: tasaEfectiva,
        destino: f.destino,
        fecha: f.fecha,
        grupo: crypto.randomUUID(),
        ids: Object.fromEntries(ids.map((u) => [u, crypto.randomUUID()])),
      },
      antes: null,
      resumen: `Transferencia de ${f.moneda === "VES" ? bs(total) : usd(total)} para ${ids.map(codigo).join(", ")}, a repartir al volver · ${formatoFecha(f.fecha)}`,
    });
    setOcupado(false);
    if (!terminar(r)) return;
    setF({ ...f, monto: "", referencia: "" });
    setPartes([
      { unidad: "", monto: "" },
      { unidad: "", monto: "" },
    ]);
    setCubre({});
    limpiarTasa();
    borradorPago.limpiar();
  }

  /**
   * Cambio 2: reparte el total entre las unidades elegidas por antigüedad
   * entre todas (la regla del cierre; la cuenta la hace la base). Se puede
   * retocar antes de guardar.
   */
  async function repartirAuto() {
    const total = num(f.monto);
    if (total === null || total <= 0) return notificar("Escriba primero el total de la transferencia.", "error");
    const ids = [...new Set(partes.map((x) => x.unidad).filter(Boolean))];
    if (ids.length < 2) return notificar("Elija al menos dos unidades para repartir.", "error");
    if (f.moneda === "VES" && !tasaEfectiva) return notificar("Falta la tasa del día del pago para repartir en bolívares.", "error");
    setOcupado(true);
    const r = await repartirTransferencia(crearClienteNavegador(), {
      unidades: ids,
      total,
      moneda: f.moneda,
      tasa: tasaEfectiva,
      destino: f.destino,
    });
    setOcupado(false);
    if ("error" in r) return fallo(r.error);
    const conMonto = r.partes.filter((x) => x.monto > 0.005);
    const sinMonto = r.partes.filter((x) => x.monto <= 0.005);
    const nuevas = conMonto.map((x) => ({ unidad: x.unidad_id, monto: paraCampo(x.monto) }));
    while (nuevas.length < 2) nuevas.push({ unidad: "", monto: "" });
    setPartes(nuevas);
    setCubre(Object.fromEntries(conMonto.map((x) => [x.unidad_id, { monto: paraCampo(x.monto), texto: textoCubre(x.detalle) }])));
    if (conMonto.length < 2)
      notificar(
        `Toda la transferencia va a ${conMonto[0]?.codigo ?? "una unidad"}: regístrela como el pago de una sola unidad.`,
        "error"
      );
    else if (sinMonto.length)
      notificar(`Repartido por antigüedad. ${sinMonto.map((x) => x.codigo).join(", ")} no recibe nada: el total no alcanza.`);
    else notificar("Repartido por antigüedad. Puede cambiar los montos antes de registrar.");
  }

  /** Ronda 7 (bloque 9): una transferencia para varias unidades; la suma de las partes es el total. */
  async function registrarAgrupado() {
    const total = num(f.monto);
    if (total === null || total <= 0) return notificar("Escriba el total de la transferencia.", "error");
    const filas = partes.filter((x) => x.unidad || x.monto.trim());
    if (filas.length < 2) return notificar("Un pago agrupado reparte la transferencia entre dos o más unidades.", "error");
    if (filas.some((x) => !x.unidad)) return notificar("Falta elegir la unidad de una de las partes.", "error");
    if (new Set(filas.map((x) => x.unidad)).size !== filas.length) return notificar("Una unidad aparece dos veces.", "error");
    const montos = filas.map((x) => num(x.monto) ?? 0);
    if (montos.some((m) => m <= 0)) return notificar("El monto de una de las partes no se entiende.", "error");
    const suma = montos.reduce((s, m) => s + m, 0);
    if (Math.abs(suma - total) > 0.005)
      return notificar(`Las partes suman ${nf(2).format(suma)} y el total es ${nf(2).format(total)}: tienen que ser iguales.`, "error");
    if (!f.fecha || f.fecha > hoyLocalISO()) return notificar("La fecha del pago no puede ser futura.", "error");
    const eTasa = errorTasa();
    if (eTasa) return notificar(eTasa, "error");
    setOcupado(true);
    const pide = PIDE[f.metodo] ?? {};
    const grupo = crypto.randomUUID();
    const hechoEn = new Date().toISOString();
    // Una sola llamada: o entran todas las partes o ninguna. Cada parte lleva
    // su id_equipo, para que un reintento no la duplique (cambio 3).
    const nuevas = filas.map((x, i) => ({
        // Una transferencia, una tasa: la misma en todas las partes.
        ...camposTasa(),
        ...marcasEquipo(crypto.randomUUID(), hechoEn),
        org_id: orgId,
        unidad_id: x.unidad,
        fecha: f.fecha,
        monto: montos[i],
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
        grupo_id: grupo,
      }));
    await conDuplicados(nuevas, async (permitirDuplicado) => {
      const r = await hacer({
        orgId,
        edificioId,
        unidadId: null,
        tipo: "pago.registrar",
        hechoEn,
        datos: { filas: nuevas },
        antes: null,
        resumen: `Transferencia de ${f.moneda === "VES" ? bs(total) : usd(total)} para ${filas.map((x) => codigo(x.unidad)).join(", ")} · ${formatoFecha(f.fecha)}`,
        permitirDuplicado,
      });
      if (!terminar(r)) return;
      setF({ ...f, monto: "", referencia: "" });
      setPartes([
        { unidad: "", monto: "" },
        { unidad: "", monto: "" },
      ]);
      setCubre({});
      limpiarTasa();
      borradorPago.limpiar();
      if (r.tipo === "enviado") notificar(`Transferencia registrada para ${filas.length} unidades, como reportada. Falta conciliarla.`);
    });
    setOcupado(false);
  }

  async function cambiarEstado(p: PagoAdmin, estado: "conciliado" | "anulado") {
    // Ronda 7 (bloque 9): un pago agrupado se confirma o se anula con todo su grupo.
    // Cambio 3: solo cambia si el pago todavía está como se lo vio (`desde`);
    // si otra persona lo tocó antes, va a «Revisar».
    const r = await hacer({
      orgId,
      edificioId,
      unidadId: p.unidad_id,
      tipo: "pago.estado",
      datos: { pagoId: p.id, grupoId: p.grupo_id, estado, desde: p.estado },
      antes: null,
      resumen: `${estado === "conciliado" ? "Conciliar" : "Anular"} el pago de ${codigo(p.unidad_id)} · ${usd(p.monto_usd)} · ${formatoFecha(p.fecha)}${p.grupo_id ? " (toda la transferencia)" : ""}`,
    });
    if (!terminar(r)) return;
    if (r.tipo === "enviado" && p.grupo_id)
      notificar(
        `Se ${estado === "conciliado" ? "confirmó" : "anuló"} la transferencia completa (${grupos[p.grupo_id]?.length ?? 0} unidades).`
      );
  }

  async function exonerar() {
    if (!ex.unidad) return notificar("Elija la unidad.", "error");
    const monto = num(ex.monto);
    if (monto === null || monto === 0) return notificar("El monto no se entiende.", "error");
    if (!ex.motivo.trim()) return notificar("Escriba el motivo: queda en la auditoría.", "error");
    const id = crypto.randomUUID();
    const fila = {
      ...marcasEquipo(id),
      org_id: orgId,
      unidad_id: ex.unidad,
      fecha: hoyLocalISO(),
      monto,
      motivo: ex.motivo.trim(),
      destino: ex.destino,
    };
    const r = await hacer({
      id,
      orgId,
      edificioId,
      unidadId: ex.unidad,
      tipo: "ajuste.registrar",
      datos: { fila },
      antes: null,
      resumen: `Exoneración a ${codigo(ex.unidad)} · ${usd(monto)} · ${ex.motivo.trim()}`,
    });
    if (!terminar(r)) return;
    setEx({ ...ex, monto: "", motivo: "" });
    borradorEx.limpiar();
    if (r.tipo === "enviado") notificar("Exoneración registrada.");
  }

  async function verComprobante(p: PagoAdmin) {
    const c = compDe(p);
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
    // Ronda 7 (bloque 9): una transferencia agrupada es UN movimiento del
    // banco, así que se compara contra la suma de su grupo.
    const sueltos = pagos
      .filter((p) => p.estado === "reportado" && !p.grupo_id)
      .map((p) => ({ id: p.id, monto: Number(p.monto), referencia: p.referencia, banco: p.banco, unidad_id: p.unidad_id }));
    const agrupados = Object.entries(grupos)
      .filter(([, ps]) => ps.every((p) => p.estado === "reportado"))
      .map(([g, ps]) => ({
        id: `g:${g}`,
        monto: ps.reduce((s, p) => s + Number(p.monto), 0),
        referencia: ps[0].referencia,
        banco: ps[0].banco,
        unidad_id: ps[0].unidad_id,
      }));
    return cruzarConBanco(mov, [...sueltos, ...agrupados]);
  }, [mov, pagos, grupos]);

  async function conciliarLote() {
    if (!cruce) return;
    setOcupado(true);
    let enBandeja = 0;
    for (const c of cruce.casan) {
      // Un grupo (id «g:…») se concilia entero.
      const grupo = c.pago.id.startsWith("g:") ? c.pago.id.slice(2) : null;
      const pago = grupo ? grupos[grupo]?.[0] : pagos.find((x) => x.id === c.pago.id);
      const r = await hacer({
        orgId,
        edificioId,
        unidadId: pago?.unidad_id ?? null,
        tipo: "pago.estado",
        datos: { pagoId: grupo ? undefined : c.pago.id, grupoId: grupo, estado: "conciliado", desde: "reportado", banco: c.pago.banco || null },
        antes: null,
        resumen: `Conciliar con el banco el pago de ${codigo(pago?.unidad_id ?? null)} · ${nf(2).format(c.pago.monto)}${grupo ? " (toda la transferencia)" : ""}`,
      });
      if (r.tipo === "rechazado") {
        setOcupado(false);
        return fallo(r.error);
      }
      if (r.tipo === "en_bandeja") enBandeja++;
    }
    setOcupado(false);
    notificar(enBandeja ? `${cruce.casan.length} pagos marcados para conciliar. ${textoEnBandeja()}` : `${cruce.casan.length} pagos conciliados.`);
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
      {mensaje && <Aviso tono={mensaje.tipo === "error" ? "rojo" : "ok"}>{mensaje.texto}</Aviso>}

      {/* Cambio 3, parte B: lo hecho en este equipo que todavía no llegó. */}
      <PorEnviar
        edificioId={edificioId}
        filtro={(c) => c.tipo.startsWith("pago.") || c.tipo === "ajuste.registrar"}
        titulo="Pagos por enviar"
        codigos={codigos}
      />
      {duplicados && (
        <Confirmar
          titulo="¿Es un pago distinto?"
          texto={`Ya hay ${duplicados.candidatos.length === 1 ? "un pago" : "pagos"} de la misma unidad, por el mismo monto y con fecha cercana: ${duplicados.candidatos
            .map((x) => `${codigo(x.unidad_id)}, ${formatoFecha(x.fecha)}, ref. ${x.referencia || "—"}, ${x.metodo ?? "—"}, ${x.estado}`)
            .join("; ")}. Si es el mismo pago, no lo registre de nuevo.`}
          boton="Es distinto: registrar"
          onNo={() => setDuplicados(null)}
          onSi={duplicados.seguir}
        />
      )}

      {/* Ronda 5 (pedido de Gustavo): lo registrado va arriba y destacado; registrar,
          conciliar y exonerar, abajo. */}
      <Card style={{ padding: 0, overflow: "hidden", borderTop: "3px solid var(--acento)" }}>
        <div style={{ padding: "18px 18px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-titulos)" }}>Movimientos registrados</h2>
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
                {/* Ronda 12 (D): la unidad primero, que es la columna que queda fija al deslizar. */}
                <th>Unidad</th>
                <th>Fecha</th>
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
                  <td className="mono cabeza" style={{ fontWeight: 600 }}>
                    {codigo(p.unidad_id)}
                    {p.grupo_id && grupos[p.grupo_id] && (
                      <div style={{ fontWeight: 400, fontSize: 11.5, color: "var(--tinta-2)", whiteSpace: "normal", maxWidth: 200 }}>
                        Agrupado con{" "}
                        {grupos[p.grupo_id]
                          .filter((x) => x.id !== p.id)
                          .map((x) => codigo(x.unidad_id))
                          .join(", ")}{" "}
                        · total {usd(grupos[p.grupo_id].reduce((s, x) => s + Number(x.monto_usd), 0))}
                      </div>
                    )}
                  </td>
                  <td className="mono" data-t="Fecha">
                    {formatoFecha(p.fecha)}
                  </td>
                  <td data-t="Método">
                    {p.metodo}
                    {p.moneda === "VES" && (
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)" }}>
                        {bs(p.monto)} a {nf(2).format(Number(p.tasa_aplicada) || 0)}
                      </div>
                    )}
                    {p.tasa_manual && (
                      <div
                        style={{ fontSize: 11.5, color: "var(--acento-texto)", whiteSpace: "normal", maxWidth: 220 }}
                        title={p.tasa_motivo_detalle || undefined}
                      >
                        tasa ajustada ·{" "}
                        {p.tasa_motivo === "otro"
                          ? p.tasa_motivo_detalle
                          : (MOTIVOS_TASA.find(([k]) => k === p.tasa_motivo)?.[1] ?? p.tasa_motivo)}
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
                    {compDe(p) && (
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
                        {compDe(p)!.imagen_borrada_en ? "comprobante vencido" : "ver comprobante"}
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
                    {pendienteDe[p.id] && (
                      <div style={{ marginTop: 4 }}>
                        <Badge tono="azul">{pendienteDe[p.id]}</Badge>
                      </div>
                    )}
                  </td>
                  <td className="acciones" style={{ width: 150 }}>
                    {p.estado === "reportado" && !pendienteDe[p.id] && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <Button type="button" mini onClick={() => cambiarEstado(p, "conciliado")}>
                          Conciliar
                        </Button>
                        <Button type="button" mini variante="secundario" onClick={() => cambiarEstado(p, "anulado")}>
                          Anular
                        </Button>
                      </div>
                    )}
                    {p.estado === "conciliado" && !p.periodo_cierre_id && !pendienteDe[p.id] && (
                      <Button type="button" mini variante="secundario" onClick={() => cambiarEstado(p, "anulado")}>
                        Anular
                      </Button>
                    )}
                    {p.periodo_cierre_id && (
                      <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>ya está dentro de un cierre</span>
                    )}
                    {p.moneda === "VES" && p.estado !== "anulado" && !p.periodo_cierre_id && (
                      <div style={{ marginTop: 4 }}>
                        <Button type="button" mini variante="secundario" onClick={() => abrirEditorTasa(p)}>
                          Cambiar tasa
                        </Button>
                      </div>
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

      {editTasa && (
        <Card style={{ borderTop: "3px solid var(--acento)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>
            Cambiar la tasa del pago · {codigo(editTasa.pago.unidad_id)}
          </h2>
          <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.6 }}>
            {bs(editTasa.pago.monto)} del {formatoFecha(editTasa.pago.fecha)}.{" "}
            {editTasa.bcv
              ? `La tasa del BCV de esa fecha es ${nf(2).format(editTasa.bcv.tasa)}.`
              : "No hay tasa del BCV de esa fecha."}{" "}
            Vale solo para este pago
            {editTasa.pago.grupo_id && (grupos[editTasa.pago.grupo_id]?.length ?? 0) > 1
              ? " y las demás unidades de la misma transferencia"
              : ""}
            : la tasa del BCV de ese día no cambia.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <Campo etiqueta="Tasa del pago">
              <Input
                className="mono"
                inputMode="decimal"
                value={editTasa.tasa}
                onChange={(e) => setEditTasa({ ...editTasa, tasa: e.target.value })}
                onBlur={() => setEditTasa({ ...editTasa, tasa: montoAlSalir(editTasa.tasa) })}
              />
            </Campo>
            <Campo etiqueta="Motivo del cambio">
              <Select value={editTasa.motivo} onChange={(e) => setEditTasa({ ...editTasa, motivo: e.target.value })}>
                <option value="">Elija</option>
                {MOTIVOS_TASA.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </Select>
            </Campo>
            {editTasa.motivo === "otro" && (
              <Campo etiqueta="Escriba el motivo">
                <Input value={editTasa.detalle} onChange={(e) => setEditTasa({ ...editTasa, detalle: e.target.value })} />
              </Campo>
            )}
          </div>
          {!!num(editTasa.tasa) && (
            <p style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 10 }}>
              Equivale a <b>{usd(Number(editTasa.pago.monto) / (num(editTasa.tasa) ?? 1))}</b>.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <Button type="button" cargando={ocupado} onClick={() => guardarTasaPago(false)}>
              Guardar la tasa
            </Button>
            {editTasa.pago.tasa_manual && editTasa.bcv && (
              <Button type="button" variante="secundario" cargando={ocupado} onClick={() => guardarTasaPago(true)}>
                Volver a la del BCV
              </Button>
            )}
            <Button type="button" variante="secundario" onClick={() => setEditTasa(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

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

      {pest === "registrar" && <AvisoBorrador {...borradorPago} />}
      {pest === "registrar" && (
        <Card>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Registrar un pago</h2>
          <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
            Un pago entra como reportado y no baja el saldo hasta que se confirme que el dinero
            llegó.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" checked={agrupado} onChange={(e) => setAgrupado(e.target.checked)} />
                Una sola transferencia para varias unidades
              </label>
            </div>
            {agrupado ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                {partes.map((x, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <Select
                      value={x.unidad}
                      onChange={(e) => setPartes(partes.map((y, j) => (j === i ? { ...y, unidad: e.target.value } : y)))}
                      style={{ flex: "1 1 140px", width: "auto" }}
                    >
                      <option value="">Unidad</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.codigo}
                        </option>
                      ))}
                    </Select>
                    <Input
                      className="mono"
                      inputMode="decimal"
                      placeholder={f.moneda === "VES" ? "Bs de esta unidad" : "USD de esta unidad"}
                      value={x.monto}
                      onChange={(e) => setPartes(partes.map((y, j) => (j === i ? { ...y, monto: e.target.value } : y)))}
                      onBlur={() => setPartes(partes.map((y, j) => (j === i ? { ...y, monto: montoAlSalir(y.monto) } : y)))}
                      style={{ flex: "1 1 120px", width: "auto" }}
                    />
                    {partes.length > 2 && (
                      <Button type="button" mini variante="secundario" onClick={() => setPartes(partes.filter((_, j) => j !== i))}>
                        Quitar
                      </Button>
                    )}
                    {x.unidad && cubre[x.unidad] && cubre[x.unidad].monto === x.monto && (
                      <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--tinta-2)" }}>{cubre[x.unidad].texto}</span>
                    )}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  <Button type="button" mini variante="secundario" onClick={() => setPartes([...partes, { unidad: "", monto: "" }])}>
                    + Otra unidad
                  </Button>
                  {sinConexion ? (
                    <Button
                      type="button"
                      mini
                      variante="secundario"
                      disabled={ocupado}
                      onClick={repartirAlVolver}
                      title="El reparto lo calcula la base con la deuda del momento en que vuelva la conexión"
                    >
                      Repartir al volver
                    </Button>
                  ) : (
                    <Button type="button" mini variante="secundario" disabled={ocupado} onClick={repartirAuto}>
                      Repartir automáticamente
                    </Button>
                  )}
                  <span style={{ color: "var(--tinta-2)" }}>
                    Suma de las partes: <b className="mono">{nf(2).format(sumaPartes)}</b>
                    {num(f.monto) !== null && Math.abs(sumaPartes - (num(f.monto) ?? 0)) > 0.005 && (
                      <span style={{ color: "var(--ambar)", fontWeight: 600 }}> · no es igual al total</span>
                    )}
                  </span>
                </div>
              </div>
            ) : (
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
            )}
            <Campo etiqueta="Fecha del pago">
              <InputFecha sinFuturo value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
            </Campo>
            <Campo etiqueta="Moneda">
              <Select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value })}>
                <option value="USD">Dólares</option>
                <option value="VES">Bolívares</option>
              </Select>
            </Campo>
            <Campo etiqueta={(agrupado ? "Total de la transferencia" : "Monto") + (f.moneda === "VES" ? " en Bs" : " en USD")}>
              <Input className="mono" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} onBlur={() => setF({ ...f, monto: montoAlSalir(f.monto) })} />
            </Campo>
            {f.moneda === "VES" && (
              <Campo
                etiqueta="Tasa del pago ✎ editable"
                ayuda={
                  ajustada
                    ? tf
                      ? `ajustada · la del BCV es ${nf(2).format(tf.tasa)}`
                      : "escrita a mano para este pago"
                    : tf && tf.propia
                      ? tf.fuente === "dolarapi"
                        ? "la del BCV, publicada ese día"
                        : "la del BCV, cargada a mano"
                      : tf
                        ? `no hay publicación de ese día: se usa la del ${formatoFecha(tf.fecha)}`
                        : "no hay ninguna tasa de ese día ni anterior"
                }
              >
                <Input
                  className="mono"
                  inputMode="decimal"
                  placeholder={tf ? undefined : "sin tasa"}
                  value={tasaTxt ?? (tf ? paraCampo(tf.tasa, 2) : "")}
                  onChange={(e) => setTasaTxt(e.target.value)}
                  onBlur={() => tasaTxt !== null && setTasaTxt(tasaTxt.trim() ? montoAlSalir(tasaTxt) : null)}
                  style={ajustada ? { borderColor: "var(--acento)" } : undefined}
                />
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

          {f.moneda === "VES" && ajustada && (
            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid var(--acento)",
                background: "var(--fondo)",
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tono="ambar">Tasa ajustada{tf ? ` · BCV era ${nf(2).format(tf.tasa)}` : ""}</Badge>
                {tf && (
                  <Button type="button" mini variante="secundario" onClick={limpiarTasa}>
                    Volver a la del BCV
                  </Button>
                )}
              </div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
                <Campo etiqueta="Motivo del cambio">
                  <Select value={motivoTasa} onChange={(e) => setMotivoTasa(e.target.value)}>
                    <option value="">Elija</option>
                    {MOTIVOS_TASA.map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Campo>
                {motivoTasa === "otro" && (
                  <Campo etiqueta="Escriba el motivo">
                    <Input value={detalleTasa} onChange={(e) => setDetalleTasa(e.target.value)} />
                  </Campo>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--tenue)", lineHeight: 1.55 }}>
                Vale solo para este pago: la tasa del BCV de ese día no cambia. Queda registrado quién la
                cambió, cuándo y por qué.
              </div>
            </div>
          )}

          {f.moneda === "VES" && montoVes !== null && tasaEfectiva !== null && tasaEfectiva > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 10, lineHeight: 1.6 }}>
              Equivale a <b>{usd(montoVes / tasaEfectiva)}</b>
              {ajustada || !tf ? (
                " a la tasa escrita para este pago."
              ) : (
                <>
                  {" "}
                  a la tasa del BCV del {formatoFecha(tf.fecha)}. Vale esa y no la de hoy: si el
                  propietario transfirió el lunes y usted concilia el jueves, cobrarle a tasa de jueves
                  sería cobrarle de más.
                </>
              )}
            </p>
          )}

          {f.moneda === "VES" && !ajustada && (!tf || !tf.propia) && (
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
                    No hay tasa publicada del <b>{formatoFecha(f.fecha)}</b>. Si fue sábado, domingo o feriado está
                    bien usar la del {formatoFecha(tf.fecha)}. Si fue día hábil y usted tiene la del BCV de ese
                    día, cárguela.
                  </>
                ) : (
                  <>
                    No hay ninguna tasa del <b>{formatoFecha(f.fecha)}</b> ni anterior. Cargue la del BCV de ese
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
                    onBlur={() => setHuecoTasa(montoAlSalir(huecoTasa))}
                  />
                </div>
                <Button type="button" variante="secundario" mini cargando={guardandoTasa} onClick={guardarHueco}>
                  Guardar la tasa del {formatoFecha(f.fecha)}
                </Button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button type="button" cargando={ocupado} onClick={registrar}>
              Registrar como reportado
            </Button>
          </div>
        </Card>
      )}

      {pest === "exonerar" && <AvisoBorrador {...borradorEx} />}
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
              <Input className="mono" value={ex.monto} onChange={(e) => setEx({ ...ex, monto: e.target.value })} onBlur={() => setEx({ ...ex, monto: montoAlSalir(ex.monto) })} />
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
              onChange={(e) => {
                leerBanco(e.target.files?.[0]);
                // Ronda 8: para que volver a elegir el mismo archivo lo lea otra vez.
                e.target.value = "";
              }}
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
                  <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--tinta)" }}>
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
                    <table className="tabla tabla-fija">
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
                    <Button type="button" cargando={ocupado} onClick={conciliarLote}>
                      {cruce.casan.length === 1 ? "Conciliar 1 pago" : `Conciliar ${cruce.casan.length} pagos`}
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
                    <table className="tabla tabla-fija">
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
                  {formatoFecha(viendo.pago.fecha)} · {viendo.pago.metodo}
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
