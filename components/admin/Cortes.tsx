"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Download, Eye, Mail, MessageCircle, Printer, RotateCw, Send, Undo2 } from "lucide-react";
import { Aviso, Badge, Button, Campo, Card, Cargando, Confirmar, Input, Select, Textarea, Vacio, type TonoBadge } from "@/components/ui";
import { cuandoSale, esperaCupo, type CupoCorreo } from "@/lib/cupo-correo";
import { bs, nf, usd } from "@/lib/formato";
import { PLANTILLA_WHATSAPP } from "@/lib/admin/constantes";
import { usePreferenciaLocal } from "@/lib/preferencia-local";
import { nombreDe, normalizarTel, vigente } from "@/lib/admin/personas";
import { csvDeCortes, descargarCSV, listadoDeCortesEnPapel } from "@/lib/admin/papel-cortes";
import { imprimirDocumento } from "@/lib/recibo-papel";
import { reciboAdminEnPapel } from "@/lib/admin/papel-recibos";
import type { CuentaPago } from "@/lib/datos-pago";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { PeriodoAdmin, ReciboAdmin, TasaViva, Unidad, Vinculo } from "@/lib/admin/tipos";
import { mensajeDeError } from "@/lib/errores";

type Mensaje = { texto: string; tipo: "ok" | "error" };

/** Fila de `resumen_correos(p_org)`. */
type ResumenCorreos = {
  enviados: number;
  pendientes: number;
  fallidos: number;
  malos: number;
  ultimo_envio: string | null;
};

/** Fila de `estado_correos_periodo(p_periodo)` (ronda 8): cómo va el correo de cada recibo. */
type EstadoCorreo = {
  unidad_id: string | null;
  recibo_id: string | null;
  destino: string;
  tipo: string;
  estado: string;
  evento: string | null;
  encolado_en: string;
  enviado_en: string | null;
  sale_en: string | null;
  rebotado: boolean;
  error: string | null;
};

/**
 * El estado de un correo en palabras (ronda 8, caso 89). «Entregado» y
 * «Abierto» los informa Resend (`last_event`); «Abierto» no es del todo
 * confiable: hay correos que cargan las imágenes solos y otros que las
 * bloquean.
 */
function estadoEnPalabras(e: EstadoCorreo): { texto: string; tono: TonoBadge } {
  if (e.evento === "bounced" || (e.rebotado && e.estado !== "pendiente")) return { texto: "Rebotó", tono: "rojo" };
  if (e.evento === "complained") return { texto: "Lo marcó como spam", tono: "rojo" };
  if (e.estado === "fallido") return { texto: "No salió", tono: "rojo" };
  if (e.estado === "pendiente")
    return esperaCupo(e.sale_en) ? { texto: `Espera el cupo: sale ${cuandoSale(e.sale_en)}`, tono: "ambar" } : { texto: "Saliendo", tono: "neutro" };
  if (e.evento === "opened" || e.evento === "clicked") return { texto: "Abierto", tono: "favor" };
  if (e.evento === "delivered") return { texto: "Entregado", tono: "neutro" };
  if (e.evento === "delivery_delayed") return { texto: "Demorado", tono: "ambar" };
  return { texto: "Enviado", tono: "neutro" };
}

/** Fila de `correo_recibo(p_recibo)` — una por destinatario. */
type CorreoArmado = { destino: string; rol: string; asunto: string; html: string };

const VENTANA_BLOQUEADA = "El navegador bloqueó la ventana. Permita las ventanas emergentes.";

/**
 * Portado de Cortes() en admin.html:4918-5617.
 *
 * La plantilla del recibo en papel vive en `lib/recibo-papel.ts`, la misma
 * que usa el portal del residente (en `main` ese código está dos veces,
 * byte a byte). El correo lo arma la BASE (`correo_recibo`), no esta
 * pantalla: si lo armara acá, la vista previa y lo que manda la tarea
 * automática serían dos códigos distintos y tarde o temprano dirían cosas
 * diferentes. Acá solo se pide y se muestra.
 */
export function Cortes({
  orgId,
  edificioId,
  organizacion,
  edificio,
  unidades,
  periodos,
  tasa,
  cuentas,
  soloUsd,
  periodoInicial,
}: {
  orgId: string;
  edificioId: string;
  organizacion: { nombre: string; logo_url: string | null };
  edificio: { nombre: string; rif: string | null };
  unidades: Unidad[];
  periodos: PeriodoAdmin[];
  tasa: TasaViva | null;
  /** Los datos para pagar del edificio (ronda 7). */
  cuentas: CuentaPago[];
  /** La organización cobra solo en dólares (ronda 7, bloque 4). */
  soloUsd: boolean;
  /** `?periodo=` de la dirección: el mes que estaba elegido antes de imprimir. */
  periodoInicial?: string;
}) {
  const router = useRouter();
  const cerrados = periodos.filter((p) => p.estado === "cerrado");

  // Al volver de imprimir, la ruta trae `?periodo=`: se queda en ese mes.
  const [periodoId, setPeriodoId] = useState(
    (periodoInicial && cerrados.some((p) => p.id === periodoInicial) ? periodoInicial : cerrados[0]?.id) ?? ""
  );
  // Los recibos se guardan junto al período al que pertenecen: así
  // "cargando" se deriva (¿lo cargado es del mes que está elegido?) en vez
  // de necesitar un setState sincrónico dentro del efecto, que el lint de
  // este proyecto rechaza.
  const [cargado, setCargado] = useState<{ periodoId: string; filas: ReciboAdmin[] } | null>(null);
  const [plantilla, ponerPlantilla] = usePreferenciaLocal("vecitap_plantilla", PLANTILLA_WHATSAPP);
  const [previa, setPrevia] = useState<ReciboAdmin | null>(null);
  const [nota, setNota] = useState({ texto: "", hasta: "" });
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [verNota, setVerNota] = useState(false);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [correo, setCorreo] = useState<CorreoArmado | null>(null);
  const [destinos, setDestinos] = useState<CorreoArmado[]>([]);
  const [destinoPrueba, setDestinoPrueba] = useState("");
  const [envio, setEnvio] = useState<ResumenCorreos | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmaEnvio, setConfirmaEnvio] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  // Ronda 8: el estado del correo de cada recibo, el cupo del día y el reenvío.
  const [estados, setEstados] = useState<{ periodoId: string; filas: EstadoCorreo[] } | null>(null);
  const [cupo, setCupo] = useState<CupoCorreo | null>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(mensajeDeError(e), "error");
  }

  const periodo = cerrados.find((p) => p.id === periodoId) ?? null;
  const recibos = cargado?.periodoId === periodoId ? cargado.filas : [];
  const cargando = !!periodoId && cargado?.periodoId !== periodoId;

  useEffect(() => {
    if (!periodoId) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase
      .from("recibos")
      .select(
        "id,unidad_id,numero,cuota,directos,anterior,a_favor,mora,honorario,servicio,anterior_hon,anterior_serv,total,conceptos,detalle,tasa_bcv,vence_el,alicuota"
      )
      .eq("periodo_id", periodoId)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) return fallo(error);
        setCargado({ periodoId, filas: data ?? [] });
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoId]);

  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("resumen_correos", { p_org: orgId }).then(({ data }) => {
      if (!vivo) return;
      setEnvio(((Array.isArray(data) ? data[0] : data) as ResumenCorreos | null) ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [orgId, periodoId]);

  /* Nota de la administradora: un mensaje suyo que se anexa al correo de
     todos los recibos. Se guarda por organización, no por envío. */
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase
      .from("ajustes_correo")
      .select("nota,nota_hasta")
      .eq("org_id", orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return;
        setNota({ texto: data?.nota ?? "", hasta: data?.nota_hasta ?? "" });
      });
    return () => {
      vivo = false;
    };
  }, [orgId]);

  async function cargarEnvio() {
    const supabase = crearClienteNavegador();
    const { data } = await supabase.rpc("resumen_correos", { p_org: orgId });
    setEnvio(((Array.isArray(data) ? data[0] : data) as ResumenCorreos | null) ?? null);
    cargarEstados();
  }

  async function cargarEstados() {
    if (!periodoId) return;
    const supabase = crearClienteNavegador();
    const [e, q] = await Promise.all([supabase.rpc("estado_correos_periodo", { p_periodo: periodoId }), supabase.rpc("cupo_correo")]);
    if (!e.error) setEstados({ periodoId, filas: (e.data ?? []) as EstadoCorreo[] });
    if (!q.error) setCupo(q.data as unknown as CupoCorreo);
  }

  // Al cambiar de mes, y cada minuto mientras haya correos saliendo.
  const filasEstado = estados?.periodoId === periodoId ? estados.filas : [];
  const haySaliendo = filasEstado.some((e) => e.estado === "pendiente");
  useEffect(() => {
    cargarEstados();
    if (!haySaliendo) return;
    const t = setInterval(cargarEstados, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoId, haySaliendo]);

  /** El último correo de cada destinatario de una unidad. */
  function estadoDe(unidadId: string) {
    const visto = new Set<string>();
    return filasEstado.filter((e) => e.unidad_id === unidadId && !visto.has(e.destino) && visto.add(e.destino));
  }

  /**
   * Cuántos correos lleva el mes (ronda 8): uno por cada propietario e
   * inquilino con «recibe corte» y correo, más uno por su correo de
   * respaldo. Es lo que cuenta para el cupo diario.
   */
  const correosDelMes = recibos.reduce((n, r) => {
    const u = unidades.find((x) => x.id === r.unidad_id);
    for (const rol of ["propietario", "inquilino"] as const) {
      const v = vigente(u?.vinculos, rol);
      if (!v || v.enviar_corte === false) continue;
      const pr = v.personas?.correo?.trim().toLowerCase();
      const re = v.personas?.correo_respaldo?.trim().toLowerCase();
      if (pr) n++;
      if (re && re !== pr) n++;
    }
    return n;
  }, 0);

  async function reenviar(r: ReciboAdmin, codigo: string) {
    setReenviando(r.id);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("reenviar_recibo", { p_recibo: r.id });
    if (error) {
      setReenviando(null);
      return fallo(error);
    }
    const d = await supabase.rpc("despachar_ahora");
    setReenviando(null);
    const n = Number(data) || 0;
    notificar(
      `Recibo de ${codigo} reenviado: ${n === 1 ? "1 correo" : `${n} correos`} en la cola.` +
        (d.error ? " Salen en los próximos minutos." : "")
    );
    cargarEstados();
  }

  async function guardarNota(texto: string, hasta: string) {
    setGuardandoNota(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("ajustes_correo")
      .upsert({ org_id: orgId, nota: texto.trim() || null, nota_hasta: hasta || null }, { onConflict: "org_id" });
    setGuardandoNota(false);
    if (error) return fallo(error);
    notificar(
      texto.trim()
        ? "Nota guardada. Va a salir en los correos de los recibos."
        : "Nota borrada. Los correos vuelven a salir sin mensaje."
    );
    const { data } = await supabase.from("ajustes_correo").select("nota,nota_hasta").eq("org_id", orgId).maybeSingle();
    setNota({ texto: data?.nota ?? "", hasta: data?.nota_hasta ?? "" });
  }

  /* Encolar y despachar son dos pasos a propósito: encolar deja los
     correos listos y no se queda esperando a que un servicio de afuera
     responda. Si el despacho falla, la cola queda y se reintenta sola. */
  async function enviarRecibos() {
    setEnviando(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("encolar_recibos", { p_periodo: periodoId });
    if (error) {
      setEnviando(false);
      return fallo(error);
    }
    const x = (Array.isArray(data) ? data[0] : data) as
      | { encolados: number; sin_correo: number; rebotados: number; ya_estaban: number }
      | null;

    const d = await supabase.rpc("despachar_ahora");
    setEnviando(false);
    const errorDespacho = d.error?.message ?? (d.data as { error?: string } | null)?.error;
    if (errorDespacho) {
      notificar(`Se encolaron ${x?.encolados ?? 0} correos, pero el envío falló: ${errorDespacho}`, "error");
    } else {
      notificar(
        `${x?.encolados ?? 0} correos encolados` +
          (x?.sin_correo ? ` · ${x.sin_correo} unidades sin correo` : "") +
          (x?.rebotados ? ` · ${x.rebotados} con dirección rebotada` : "") +
          (x?.ya_estaban ? ` · ${x.ya_estaban} ya se habían enviado` : "")
      );
    }
    cargarEnvio();
    router.refresh();
  }

  /* correo_recibo devuelve una fila por destinatario: al propietario, al
     inquilino, o a los dos. La vista previa enseña el primero y dice a
     cuántos va. */
  useEffect(() => {
    if (prueba === null) return;
    const r = recibos.find((x) => x.unidad_id === prueba) ?? recibos[0];
    if (!r) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("correo_recibo", { p_recibo: r.id }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) return fallo(error);
      const filas = (Array.isArray(data) ? data : data ? [data] : []) as CorreoArmado[];
      setDestinos(filas);
      setCorreo(filas[0] ?? null);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prueba, recibos]);

  function cerrarPrueba() {
    setPrueba(null);
    setCorreo(null);
    setDestinos([]);
  }

  async function enviarPrueba() {
    const r = recibos.find((x) => x.unidad_id === prueba) ?? recibos[0];
    if (!r) return;
    if (!/.+@.+\..+/.test(destinoPrueba.trim())) return notificar("Escriba a qué correo mandarla.", "error");
    setEnviando(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("encolar_prueba", { p_recibo: r.id, p_destino: destinoPrueba.trim() });
    if (error) {
      setEnviando(false);
      return fallo(error);
    }
    const d = await supabase.rpc("despachar_ahora");
    setEnviando(false);
    const errorDespacho = d.error?.message ?? (d.data as { error?: string } | null)?.error;
    if (errorDespacho) return notificar("Se encoló, pero el envío falló: " + errorDespacho, "error");
    notificar(`Prueba enviada a ${destinoPrueba.trim()}. Revise la bandeja y también el spam.`);
    cargarEnvio();
  }

  function textoDe(r: ReciboAdmin) {
    const u = unidades.find((x) => x.id === r.unidad_id);
    const p = vigente(u?.vinculos, "propietario");
    const t = Number(r.total) || 0;
    return plantilla
      .replace(/{nombre}/g, nombreDe(p) || "estimado propietario")
      .replace(/{unidad}/g, u?.codigo ?? "")
      .replace(/{periodo}/g, periodo?.etiqueta ?? "")
      .replace(/{recibo}/g, r.numero)
      .replace(/{cuota}/g, usd(r.cuota))
      .replace(/{anterior}/g, usd(Number(r.anterior) + Number(r.anterior_hon) + Number(r.anterior_serv)))
      .replace(/{mora}/g, usd(r.mora))
      .replace(/{total}/g, usd(t))
      .replace(/{totalBs}/g, periodo?.tasa_bcv ? bs(t * periodo.tasa_bcv) : "—")
      .replace(/{tasa}/g, periodo?.tasa_bcv ? nf(2).format(periodo.tasa_bcv) : "—");
  }

  const datosPapel = { edificio, organizacion, unidades, etiqueta: periodo?.etiqueta, tasa, cuentas, soloUsd };
  const armar = (r: ReciboAdmin) => reciboAdminEnPapel(r, datosPapel);
  /* Imprimir va por una dirección propia bajo /admin, en la misma pestaña y
     con «Volver» (ronda 4, caso 53). Antes, una ventana en blanco. La ruta
     vuelve a comprobar el rol: no confía en que se llegó desde acá. */
  const rutaPapel = (unidadId?: string) =>
    `/admin/${orgId}/${edificioId}/cortes/papel?periodo=${periodoId}${unidadId ? `&unidad=${unidadId}` : ""}`;

  async function marcarEnviados(enviado: boolean) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("marcar_enviado", { p_periodo: periodoId, p_enviado: enviado });
    if (error) return fallo(error);
    notificar(
      enviado ? "Mes marcado como enviado. Reabrirlo ahora pide confirmación aparte." : "Se quitó la marca de enviado."
    );
    router.refresh();
  }

  function listadoPDF() {
    if (!recibos.length) return notificar("No hay recibos que listar.", "error");
    imprimirDocumento(
      listadoDeCortesEnPapel({ recibos, unidades, periodo, edificio, organizacion }),
      () => notificar(VENTANA_BLOQUEADA, "error"),
      800
    );
  }

  function exportarCSV() {
    descargarCSV(csvDeCortes(recibos, unidades), `cortes-${periodo?.etiqueta || "mes"}.csv`);
    notificar("Listado exportado.");
  }

  if (!cerrados.length) {
    return (
      <Vacio
        titulo="Todavía no hay recibos que enviar"
        texto="Los cortes de cuenta se arman con los recibos de un mes ya cerrado."
        icono={<Send size={28} />}
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {mensaje && <Aviso tono={mensaje.tipo === "error" ? "rojo" : "ok"}>{mensaje.texto}</Aviso>}

      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cortes de cuenta</h2>
        <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
          Los recibos ya emitidos. El correo sale solo con el diseño de Vecitap; WhatsApp y la
          impresión quedan para los casos sueltos.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
          <Campo etiqueta="Mes">
            <Select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)}>
              {cerrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                </option>
              ))}
            </Select>
          </Campo>
          <div style={{ alignSelf: "end", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              variante="secundario"
              mini
              onClick={listadoPDF}
              title="Abre el listado del mes listo para imprimir o guardar como PDF"
            >
              <Printer size={15} /> Listado en PDF
            </Button>
            <Button
              type="button"
              variante="secundario"
              mini
              onClick={exportarCSV}
              title="El mismo listado como archivo de Excel, para el contador"
            >
              <Download size={15} /> CSV
            </Button>
            {recibos.length > 0 && (
              <a href={rutaPapel()} className="btn btn-secundario btn-mini" style={{ textDecoration: "none" }}>
                <Printer size={15} /> Imprimir los {recibos.length} recibos
              </a>
            )}
            <Button
              type="button"
              variante="secundario"
              mini
              disabled={!recibos.length}
              onClick={() => setPrueba(recibos[0]?.unidad_id ?? "")}
            >
              <Mail size={15} /> Probar el correo
            </Button>
            <Button type="button" mini cargando={enviando} disabled={!recibos.length} onClick={() => setConfirmaEnvio(true)}>
              <Send size={15} /> Enviar por correo
            </Button>
            {periodo &&
              (periodo.enviado_en ? (
                <Button type="button" variante="secundario" mini onClick={() => marcarEnviados(false)}>
                  <Undo2 size={15} /> Quitar &quot;enviados&quot;
                </Button>
              ) : (
                <Button type="button" variante="secundario" mini onClick={() => marcarEnviados(true)}>
                  <Check size={15} /> Marcar como enviados
                </Button>
              ))}
          </div>
        </div>

        {envio && (envio.pendientes > 0 || envio.enviados > 0 || envio.fallidos > 0) && (
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: 14,
              padding: "12px 14px",
              background: "var(--fondo)",
              borderRadius: "var(--radio-chico)",
              border: "1px solid var(--linea)",
              fontSize: 13,
            }}
          >
            <span>
              <b className="mono">{envio.enviados}</b> enviados
            </span>
            {envio.pendientes > 0 && (
              <span style={{ color: "var(--ambar)" }}>
                <b className="mono">{envio.pendientes}</b> en cola
              </span>
            )}
            {envio.fallidos > 0 && (
              <span style={{ color: "var(--rojo)" }}>
                <b className="mono">{envio.fallidos}</b> fallidos
              </span>
            )}
            {envio.malos > 0 && (
              <span style={{ color: "var(--tenue)" }}>
                <b className="mono">{envio.malos}</b> direcciones que rebotaron
              </span>
            )}
            {envio.ultimo_envio && (
              <span style={{ color: "var(--tenue)" }}>
                último {String(envio.ultimo_envio).slice(0, 16).replace("T", " ")}
              </span>
            )}
            <Button
              type="button"
              variante="secundario"
              mini
              title={
                "Los correos no salen en el instante: quedan en una cola y una tarea automática los " +
                "manda cada 5 minutos. Este botón los manda ya, sin esperar esa tarea. Sirve para " +
                "comprobar de una vez que están saliendo."
              }
              onClick={async () => {
                const supabase = crearClienteNavegador();
                const d = await supabase.rpc("despachar_ahora");
                if (d.error) return fallo(d.error);
                notificar("Se mandaron los correos que estaban en cola.");
                cargarEnvio();
              }}
            >
              Enviar ahora los pendientes
            </Button>
          </div>
        )}
        {envio && (
          <p style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 8, lineHeight: 1.6 }}>
            Los correos no salen en el instante: quedan en una cola y una tarea automática los manda
            cada 5 minutos. Así, si el servicio de correo falla un momento, el envío se reintenta
            solo en vez de perderse.
          </p>
        )}

        {periodo && (
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--tinta-2)" }}>
            {periodo.enviado_en ? (
              <>
                Marcado como <b>enviado</b> el {String(periodo.enviado_en).slice(0, 10)}. Desde
                «Gastos del mes», reabrirlo va a pedir una confirmación aparte.
              </>
            ) : (
              <>
                Todavía <b>sin marcar como enviado</b>. Mientras esté así, el mes se puede reabrir y
                corregir sin ceremonia.
              </>
            )}
          </div>
        )}

        {/* ── Nota opcional dentro del correo ──
            Va guardada por administradora y sale en el correo de todos los
            recibos. Con fecha de caducidad para que no se quede colgada de
            un mes al siguiente sin que nadie lo note. */}
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: "var(--radio-chico)",
            background: nota.texto ? "var(--ambar-bg)" : "var(--fondo)",
            border: "1px solid var(--linea)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Mensaje de la administradora en el correo</div>
              <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
                {nota.texto ? (
                  <>
                    Sale en el correo de todos los recibos
                    {nota.hasta ? <> · hasta el {nota.hasta}</> : <> · sin fecha de fin</>}
                  </>
                ) : (
                  "Ninguno. Opcional: un aviso suyo dentro del correo del recibo."
                )}
              </div>
            </div>
            <Button type="button" variante="secundario" mini onClick={() => setVerNota(!verNota)}>
              {verNota ? "Cerrar" : nota.texto ? "Cambiar" : "Escribir uno"}
            </Button>
          </div>

          {verNota && (
            <div style={{ marginTop: 14 }}>
              <Campo
                etiqueta="El mensaje"
                ayuda="Por ejemplo: la asamblea es el sábado 12 a las 10 am en el salón."
              >
                <Textarea
                  rows={3}
                  value={nota.texto}
                  maxLength={600}
                  placeholder="Escriba aquí el aviso que quiere que lean sus propietarios"
                  onChange={(e) => setNota({ ...nota, texto: e.target.value })}
                  style={{ fontSize: 13.5 }}
                />
              </Campo>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", marginTop: 12 }}>
                <Campo etiqueta="Dejar de mostrarlo el" ayuda="En blanco se queda hasta que usted lo borre.">
                  <Input type="date" value={nota.hasta} onChange={(e) => setNota({ ...nota, hasta: e.target.value })} />
                </Campo>
                <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
                  <Button type="button" cargando={guardandoNota} onClick={() => guardarNota(nota.texto, nota.hasta)}>
                    Guardar
                  </Button>
                  {nota.texto && (
                    <Button
                      type="button"
                      variante="secundario"
                      disabled={guardandoNota}
                      onClick={() => {
                        setNota({ texto: "", hasta: "" });
                        guardarNota("", "");
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4, lineHeight: 1.6 }}>
                Va dentro del correo, arriba del monto, en un recuadro aparte. Se guarda una sola vez
                y sale en todos los envíos hasta que lo borre o llegue la fecha. Use la vista previa
                de abajo para verlo antes de mandar nada.
              </p>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <Campo
            etiqueta="Mensaje para WhatsApp"
            ayuda={
              "Este es el texto de los botones de WhatsApp de la lista de abajo. El correo NO usa " +
              "esto: el correo se arma solo, con el diseño de Vecitap. Entre llaves van los datos " +
              "que se reemplazan en cada envío."
            }
          >
            <Textarea
              rows={6}
              value={plantilla}
              onChange={(e) => ponerPlantilla(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </Campo>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 6 }}>
            {"{nombre} {unidad} {periodo} {recibo} {cuota} {anterior} {mora} {total} {totalBs} {tasa}"}
          </p>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>A quién se le envía</h2>
          <p style={{ margin: "3px 0 12px", fontSize: 12.5, color: "var(--tenue)" }}>
            {recibos.length} recibos emitidos en {periodo?.etiqueta ?? ""}
            {correosDelMes > 0 && ` · ${correosDelMes} correos con los de respaldo`}
            {cupo && ` · hoy quedan ${cupo.libre} de ${cupo.tope} correos del plan`}
          </p>
        </div>
        {cargando ? (
          <Cargando />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla apila">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Recibo</th>
                  <th>Propietario</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th>Correo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recibos.map((r) => {
                  const u = unidades.find((x) => x.id === r.unidad_id);
                  const p = vigente(u?.vinculos, "propietario");
                  const q = vigente(u?.vinculos, "inquilino");

                  /* El corte no es solo del dueño. Hay edificios donde quien
                     paga es el inquilino, y hay dueños que viven fuera. Se le
                     manda a todo el que esté registrado y tenga marcado el
                     envío. */
                  const gente = ([
                    { rol: "Propietario", v: p },
                    { rol: "Inquilino", v: q },
                  ].filter((x) => x.v && x.v.enviar_corte !== false) as { rol: string; v: Vinculo }[])
                    .map((x) => ({
                      ...x,
                      correo: x.v.personas?.correo ?? "",
                      tel: normalizarTel(x.v.personas?.telefono),
                    }))
                    .filter((x) => x.correo || x.tel);

                  const asunto = `Su recibo de condominio · ${u?.codigo} · ${periodo?.etiqueta}`;
                  return (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {u?.codigo}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {r.numero}
                      </td>
                      <td>
                        {[
                          { rol: "Propietario", v: p },
                          { rol: "Inquilino", v: q },
                        ]
                          .filter((x) => x.v)
                          .map((x) => (
                            <div key={x.rol} style={{ marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: "var(--tenue)" }}>{x.rol}: </span>
                              {nombreDe(x.v)}
                              {x.v!.enviar_corte === false && (
                                <span style={{ fontSize: 11, color: "var(--tenue)" }}> · no recibe</span>
                              )}
                              {x.v!.personas?.correo && (
                                <div style={{ fontSize: 11.5, color: "var(--tenue)" }}>{x.v!.personas!.correo}</div>
                              )}
                            </div>
                          ))}
                        {!p && !q && <span style={{ color: "var(--tenue)" }}>sin registrar</span>}
                      </td>
                      <td className="mono" style={{ textAlign: "right", fontWeight: 700 }}>
                        {usd(r.total)}
                      </td>
                      <td style={{ minWidth: 170 }}>
                        {estadoDe(r.unidad_id).map((e) => {
                          const s = estadoEnPalabras(e);
                          return (
                            <div key={e.destino} style={{ marginBottom: 4 }}>
                              <Badge tono={s.tono}>{s.texto}</Badge>
                              <div style={{ fontSize: 11, color: "var(--tenue)", overflowWrap: "anywhere" }}>{e.destino}</div>
                            </div>
                          );
                        })}
                        {!estadoDe(r.unidad_id).length && <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>no se ha enviado</span>}
                      </td>
                      <td style={{ width: 240 }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {gente.map((x) => (
                            <span key={x.rol} style={{ display: "contents" }}>
                              {x.tel && (
                                <a
                                  className="btn btn-mini btn-secundario"
                                  style={{ textDecoration: "none" }}
                                  target="_blank"
                                  rel="noreferrer"
                                  href={`https://wa.me/${x.tel}?text=${encodeURIComponent(textoDe(r))}`}
                                >
                                  <MessageCircle size={13} /> {x.rol.slice(0, 4)}.
                                </a>
                              )}
                              {x.correo && (
                                <a
                                  className="btn btn-mini btn-secundario"
                                  style={{ textDecoration: "none" }}
                                  href={`mailto:${x.correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(
                                    textoDe(r)
                                  )}`}
                                >
                                  <Mail size={13} /> {x.rol.slice(0, 4)}.
                                </a>
                              )}
                            </span>
                          ))}
                          {gente.length === 0 && (
                            <span style={{ fontSize: 11.5, color: "var(--ambar)" }}>
                              {p || q ? "sin correo ni teléfono" : "sin nadie registrado"}
                            </span>
                          )}
                          <Button type="button" variante="secundario" mini onClick={() => setPrevia(r)}>
                            <Eye size={13} /> Vista previa
                          </Button>
                          {gente.some((x) => x.correo) && (
                            <Button type="button" variante="secundario" mini cargando={reenviando === r.id} onClick={() => reenviar(r, u?.codigo ?? "")}>
                              <RotateCw size={13} /> Reenviar recibo
                            </Button>
                          )}
                          <Link
                            href={`/admin/${orgId}/${edificioId}/propietarios/${r.unidad_id}`}
                            className="btn btn-mini btn-secundario"
                            style={{ textDecoration: "none" }}
                          >
                            Ficha
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmaEnvio && (
        <Confirmar
          titulo={`Enviar los recibos de ${periodo?.etiqueta ?? ""}`}
          texto={
            "Se le manda un correo a cada propietario e inquilino que tenga dirección cargada (y otro a su correo de respaldo), con el enlace a " +
            "su recibo. Las unidades sin correo se saltean y se le dice cuántas fueron. Un recibo " +
            "que ya se envió no se manda dos veces." +
            (cupo
              ? correosDelMes + cupo.en_cola <= cupo.libre
                ? ` Son ${correosDelMes} correos y hoy quedan ${cupo.libre}: salen todos hoy.`
                : ` Son ${correosDelMes} correos y hoy quedan ${cupo.libre}${cupo.en_cola ? ` (y hay ${cupo.en_cola} esperando)` : ""}: los que no caben esperan el cupo y salen solos en las próximas horas.`
              : "")
          }
          boton="Enviar"
          onSi={() => {
            setConfirmaEnvio(false);
            enviarRecibos();
          }}
          onNo={() => setConfirmaEnvio(false)}
        />
      )}

      {prueba !== null &&
        (() => {
          const r = recibos.find((x) => x.unidad_id === prueba) ?? recibos[0];
          if (!r) return null;
          return (
            <div
              onClick={cerrarPrueba}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 90,
                background: "rgba(0,0,0,.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
            >
              <div
                onClick={(ev) => ev.stopPropagation()}
                style={{
                  background: "var(--lienzo)",
                  borderRadius: "var(--radio)",
                  maxWidth: 720,
                  width: "100%",
                  maxHeight: "94vh",
                  overflow: "auto",
                  padding: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Cómo va a llegar el correo</div>
                    <div style={{ fontSize: 12.5, color: "var(--tenue)" }}>
                      Esto lo arma la base, es exactamente lo que se manda.
                    </div>
                  </div>
                  <Button type="button" variante="secundario" mini onClick={cerrarPrueba}>
                    Cerrar
                  </Button>
                </div>

                <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ width: 150 }}>
                    <Campo etiqueta="Unidad">
                      <Select value={prueba} onChange={(ev) => setPrueba(ev.target.value)}>
                        {recibos.map((x) => {
                          const uu = unidades.find((y) => y.id === x.unidad_id);
                          return (
                            <option key={x.id} value={x.unidad_id}>
                              {uu?.codigo}
                            </option>
                          );
                        })}
                      </Select>
                    </Campo>
                  </div>
                  <div style={{ width: 240 }}>
                    <Campo etiqueta="Mandar la prueba a">
                      <Input
                        value={destinoPrueba}
                        placeholder="su-correo@ejemplo.com"
                        onChange={(ev) => setDestinoPrueba(ev.target.value)}
                      />
                    </Campo>
                  </div>
                  <Button type="button" cargando={enviando} onClick={enviarPrueba}>
                    <Send size={14} /> Enviar la prueba
                  </Button>
                </div>

                {correo ? (
                  <>
                    <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginBottom: 6 }}>
                      <b>Asunto:</b> {correo.asunto}
                      <br />
                      <b>Iría a:</b>{" "}
                      {destinos.map((d, i) => (
                        <span key={d.destino}>
                          {i > 0 && " · "}
                          {d.destino} <span style={{ color: "var(--tenue)" }}>({d.rol})</span>
                        </span>
                      ))}
                    </div>
                    <iframe
                      title="Correo"
                      srcDoc={correo.html}
                      style={{ width: "100%", height: "56vh", border: "1px solid var(--linea)", borderRadius: "var(--radio-chico)", background: "#fff" }}
                    />
                  </>
                ) : destinos.length === 0 ? (
                  <Aviso tono="ambar" titulo="Esta unidad no le manda correo a nadie">
                    No hay propietario ni inquilino con correo y con el envío marcado. Cárguelo en
                    Propietarios, o marque la casilla &quot;enviarle el corte de cuenta&quot;. El
                    botón de prueba de arriba sí funciona: se manda al correo que escriba.
                  </Aviso>
                ) : (
                  <Cargando />
                )}

                <p style={{ fontSize: 12, color: "var(--tenue)", marginTop: 12, lineHeight: 1.6 }}>
                  La prueba sale por el mismo camino que los envíos de verdad y llega marcada con{" "}
                  <b>[PRUEBA]</b> en el asunto. Si no aparece en unos minutos, revise también la
                  carpeta de spam: eso indica que falta afinar el dominio.
                </p>
              </div>
            </div>
          );
        })()}

      {previa &&
        (() => {
          const u = unidades.find((x) => x.id === previa.unidad_id);
          const p = vigente(u?.vinculos, "propietario");
          return (
            <div
              onClick={() => setPrevia(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 90,
                background: "rgba(0,0,0,.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
            >
              <div
                onClick={(ev) => ev.stopPropagation()}
                style={{
                  background: "var(--lienzo)",
                  borderRadius: "var(--radio)",
                  maxWidth: 860,
                  width: "100%",
                  maxHeight: "94vh",
                  overflow: "auto",
                  padding: 18,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Así lo va a recibir {nombreDe(p) || "el propietario"}</div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--tenue)" }}>
                      {u?.codigo} · {previa.numero}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a href={rutaPapel(previa.unidad_id)} className="btn btn-mini" style={{ textDecoration: "none" }}>
                      <Printer size={14} /> Imprimir o guardar PDF
                    </a>
                    <Button type="button" variante="secundario" mini onClick={() => setPrevia(null)}>
                      Cerrar
                    </Button>
                  </div>
                </div>

                <iframe
                  title="Recibo"
                  srcDoc={armar(previa)}
                  style={{ width: "100%", height: "62vh", border: "1px solid var(--linea)", borderRadius: "var(--radio-chico)", background: "#fff" }}
                />

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>
                    Mensaje que acompaña al recibo
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 12.5,
                      color: "var(--tinta-2)",
                      background: "var(--fondo)",
                      padding: "12px 14px",
                      borderRadius: "var(--radio-chico)",
                      border: "1px solid var(--linea)",
                      margin: 0,
                      fontFamily: "var(--font-texto)",
                    }}
                  >
                    {textoDe(previa)}
                  </pre>
                </div>

                <p style={{ fontSize: 12, color: "var(--tenue)", marginTop: 12, lineHeight: 1.6 }}>
                  <b>Guardar PDF</b> usa la impresión del navegador: elija &quot;Guardar como
                  PDF&quot; como destino. El correo automático no lleva el PDF adjunto a propósito:
                  lleva un enlace al portal, donde el propietario ve el recibo al día y se lo baja él
                  mismo. Un adjunto se queda viejo en cuanto el propietario paga.
                </p>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
