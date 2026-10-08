"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Campo, Card, Input } from "@/components/ui";
import { fechaHora } from "@/lib/formato";
import { componerTarjetaVisita, generarQR, nombreArchivoTarjeta, type DatosTarjeta } from "@/lib/residente/tarjeta-visita";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import { mensajeDeError } from "@/lib/errores";

type InvitacionFila = Pick<
  Database["public"]["Tables"]["invitaciones_visita"]["Row"],
  "id" | "codigo" | "nombre" | "documento" | "placa" | "desde" | "hasta" | "usos" | "usos_max" | "estado"
>;

type Nueva = { id: string; codigo: string; nombre: string };
type Mensaje = { texto: string; tipo: "ok" | "error" };

/** Portado de `enDosHoras()` en index.html:749-753. */
function enDosHoras(): string {
  const d = new Date(Date.now() + 2 * 3600 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const FORM_VACIO = { nombre: "", documento: "", placa: "", usos: "1", hasta: "" };

/**
 * Portado de las secciones "Invitar a alguien" e "Invitaciones activas" de
 * Visitas() en index.html:725-993 (V1/V2 de docs/inventario-main.md,
 * sección 2.1). El SQL de `crear_invitacion_visita`/`anular_invitacion_visita`
 * se confirmó antes de escribir esto (ver docs/estado-migracion.md, bloque
 * 8) — de ahí salen estos detalles:
 *
 * - `p_hasta` tiene que ser futura y a lo sumo 30 días adelante (lo valida
 *   la función, no el formulario — igual que main, que tampoco lo valida
 *   del lado del cliente).
 * - La función normaliza `p_documento`/`p_placa` (mayúsculas, sin
 *   caracteres raros) y clampa `p_usos` entre 1 y 50 — el cliente manda el
 *   valor crudo, la base decide qué queda.
 * - El código (`codigo`) lo genera la base, no el navegador.
 * - `anular_invitacion_visita` autoriza por `unidades_visibles()` — el
 *   mismo criterio de RLS que ya filtra qué unidades ve esta sesión —, así
 *   que alcanza con mandarle el id de la invitación.
 */
export function InvitarVisitas({
  edificio,
  unidadCodigo,
  unidadId,
  invitaciones,
}: {
  edificio: string;
  unidadCodigo: string;
  unidadId: string;
  invitaciones: InvitacionFila[];
}) {
  const router = useRouter();
  // "Hasta cuándo vale" arranca en +2 horas — inicializador perezoso, no un
  // setState dentro de un efecto (el lint de este proyecto lo rechaza; ver
  // el mismo criterio en `VACIO.fecha` de FormularioReportarPago.tsx).
  const [f, setF] = useState(() => ({ ...FORM_VACIO, hasta: enDosHoras() }));
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [nueva, setNueva] = useState<Nueva | null>(null);
  const [qr, setQr] = useState("");
  const [tarjeta, setTarjeta] = useState("");
  const refCodigo = useRef<HTMLDivElement>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(mensajeDeError(e), "error");
  }

  /* La tarjeta del código aparece ARRIBA del formulario y de la lista. Sin
     este scroll queda fuera de la pantalla y parece que el botón no hizo
     nada — bug real que el socio encontró (index.html:735-745). */
  useEffect(() => {
    if (!nueva || !refCodigo.current) return;
    refCodigo.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [nueva]);

  async function armarTarjeta(datos: DatosTarjeta) {
    setQr("");
    setTarjeta("");
    let url = "";
    try {
      url = await generarQR(datos.codigo);
      setQr(url);
    } catch {
      return;
    }
    try {
      setTarjeta(await componerTarjetaVisita(datos, url));
    } catch {
      setTarjeta("");
    }
  }

  async function crear() {
    const nombre = f.nombre.trim();
    if (!nombre) return notificar("Falta el nombre de la visita.", "error");
    if (!f.hasta) return notificar("Falta hasta cuándo vale la invitación.", "error");
    setOcupado(true);
    const hastaISO = new Date(f.hasta).toISOString();
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("crear_invitacion_visita", {
      p_unidad: unidadId,
      p_nombre: nombre,
      p_hasta: hastaISO,
      p_documento: f.documento.trim() || undefined,
      p_placa: f.placa.trim() || undefined,
      p_usos: Math.max(1, parseInt(f.usos, 10) || 1),
    });
    setOcupado(false);
    if (error) return fallo(error);
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return;
    setNueva({ id: r.id, codigo: r.codigo, nombre });
    armarTarjeta({ edificio, unidadCodigo, nombre, codigo: r.codigo, hasta: hastaISO });
    setF({ ...FORM_VACIO, hasta: enDosHoras() });
    router.refresh();
  }

  function verCodigo(i: InvitacionFila) {
    setNueva({ id: i.id, codigo: i.codigo, nombre: i.nombre });
    armarTarjeta({ edificio, unidadCodigo, nombre: i.nombre, codigo: i.codigo, hasta: i.hasta });
  }

  async function anular(id: string) {
    setAnulando(id);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("anular_invitacion_visita", { p_invitacion: id });
    setAnulando(null);
    if (error) return fallo(error);
    notificar("Invitación anulada.");
    if (nueva?.id === id) {
      setNueva(null);
      setQr("");
      setTarjeta("");
    }
    router.refresh();
  }

  function descargar(inv: Nueva) {
    if (!tarjeta) return notificar("La imagen todavía se está armando.", "error");
    const a = document.createElement("a");
    a.href = tarjeta;
    a.download = nombreArchivoTarjeta(inv.nombre);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copiarImagen(inv: Nueva) {
    if (!tarjeta) return notificar("La imagen todavía se está armando.", "error");
    try {
      const blob = await (await fetch(tarjeta)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      notificar("Imagen copiada. Péguela donde quiera.");
    } catch {
      try {
        await navigator.clipboard.writeText(inv.codigo);
        notificar("Su navegador no copia imágenes. Se copió el código.", "error");
      } catch {
        notificar("No se pudo copiar. Use Descargar.", "error");
      }
    }
  }

  async function porWhatsApp(inv: Nueva) {
    const txt =
      `Hola ${inv.nombre}: este es su acceso a ${edificio}, unidad ${unidadCodigo}. ` +
      `Muestre el código en la garita.\n\n${inv.codigo}`;
    try {
      if (tarjeta && navigator.canShare) {
        const blob = await (await fetch(tarjeta)).blob();
        const archivo = new File([blob], nombreArchivoTarjeta(inv.nombre), { type: "image/png" });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: txt });
          return;
        }
      }
    } catch {
      // si cancela o no se puede, se cae al enlace de abajo
    }
    window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank");
  }

  const activas = invitaciones.filter(
    (i) => i.estado === "activa" && new Date(i.hasta) > new Date() && i.usos < i.usos_max
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {mensaje && (
        <Aviso tono={mensaje.tipo === "error" ? "rojo" : "verde"}>{mensaje.texto}</Aviso>
      )}

      {nueva && (
        <div ref={refCodigo}>
          <Card style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "var(--tinta-2)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>
              Código para {nueva.nombre}
            </div>
            {tarjeta ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tarjeta}
                alt="Invitación con el código QR"
                style={{ width: "100%", maxWidth: 300, margin: "14px auto 4px", display: "block", borderRadius: 12 }}
              />
            ) : qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="Código QR de la invitación"
                style={{ width: 220, height: 220, margin: "14px auto 8px", display: "block", borderRadius: 12, background: "#fff", padding: 8 }}
              />
            ) : (
              <div style={{ fontSize: 13, color: "var(--tenue)", margin: "14px 0 8px" }}>
                Armando la imagen… Si no aparece, pase el código escrito.
              </div>
            )}
            <div className="mono" style={{ fontSize: 19, fontWeight: 700, letterSpacing: ".06em", wordBreak: "break-all", marginTop: 10 }}>
              {nueva.codigo}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tenue)", marginTop: 8, lineHeight: 1.5 }}>
              Muéstrelo en la garita. Vence solo y se gasta al usarse.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
              <Button type="button" onClick={() => porWhatsApp(nueva)}>
                Enviar por WhatsApp
              </Button>
              <Button type="button" variante="secundario" onClick={() => descargar(nueva)}>
                Descargar
              </Button>
              <Button type="button" variante="secundario" onClick={() => copiarImagen(nueva)}>
                Copiar imagen
              </Button>
            </div>
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setNueva(null);
                  setQr("");
                  setTarjeta("");
                }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--tenue)", fontSize: 13 }}
              >
                Listo
              </button>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Invitar a alguien</h3>
        <Campo etiqueta="Nombre de quien viene">
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Nombre y apellido" />
        </Campo>
        <Campo etiqueta="Hasta cuándo vale">
          <Input type="datetime-local" className="mono" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
        </Campo>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <Campo etiqueta="Cédula (opcional)">
              <Input
                className="mono"
                value={f.documento}
                autoCapitalize="characters"
                onChange={(e) => setF({ ...f, documento: e.target.value })}
                placeholder="V-12345678"
              />
            </Campo>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <Campo etiqueta="Placa (opcional)">
              <Input
                className="mono"
                value={f.placa}
                autoCapitalize="characters"
                onChange={(e) => setF({ ...f, placa: e.target.value })}
                placeholder="AB123CD"
              />
            </Campo>
          </div>
        </div>
        <Campo etiqueta="Cuántas entradas" ayuda="Una sola para una visita normal. Varias si va a entrar y salir el mismo día.">
          <Input className="mono" inputMode="numeric" value={f.usos} onChange={(e) => setF({ ...f, usos: e.target.value })} />
        </Campo>
        <Button type="button" onClick={crear} cargando={ocupado} style={{ width: "100%" }}>
          Crear la invitación
        </Button>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Invitaciones activas</h3>
        <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "0 0 14px" }}>
          Si ya no quiere que entre, anúlela: deja de servir en el momento.
        </p>
        {activas.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "var(--tenue)" }}>No hay invitaciones activas.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {activas.map((i) => (
              <div
                key={i.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  background: "var(--fondo)",
                  borderRadius: 10,
                  padding: "11px 13px",
                }}
              >
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{i.nombre}</div>
                  <div style={{ fontSize: 12, color: "var(--tenue)" }}>
                    Hasta {fechaHora(i.hasta)} · {i.usos} de {i.usos_max} usadas
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button type="button" variante="secundario" mini onClick={() => verCodigo(i)}>
                    Ver el código
                  </Button>
                  <Button
                    type="button"
                    variante="secundario"
                    mini
                    cargando={anulando === i.id}
                    style={{ color: "var(--rojo)" }}
                    onClick={() => anular(i.id)}
                  >
                    Anular
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
