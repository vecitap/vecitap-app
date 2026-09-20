"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input, Select } from "@/components/ui";
import { fechaLarga, hoyISO, nf, num, usd } from "@/lib/formato";
import {
  ACEPTA_COMPROBANTE,
  MAX_BYTES_COMPROBANTE,
  comprimirImagen,
  huellaArchivo,
  tipoRealComprobante,
} from "@/lib/archivos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";

type Banco = Pick<Database["public"]["Tables"]["bancos"]["Row"], "codigo" | "nombre" | "corto">;

/** Cada método de pago se identifica con datos distintos. Pedir siempre
 * los mismos campos hace que la administradora reciba reportes que no
 * puede cruzar contra el banco, que es de lo que se trata todo esto.
 * Portado de METODOS en residente.html:868-875. */
const METODOS: Record<
  string,
  { banco?: boolean; telefono?: boolean; documento?: boolean; referencia?: boolean; correo?: boolean }
> = {
  "Pago móvil": { banco: true, telefono: true, documento: true, referencia: true },
  Transferencia: { banco: true, referencia: true },
  Zelle: { correo: true, referencia: true },
  "Punto de venta": { banco: true, referencia: true },
  Efectivo: {},
  Otro: { referencia: true },
};

// Fase 4 (fix 3): antes un solo input de texto libre. Un V/E/G/J real
// reduce ambigüedad para la administración al conciliar contra el banco.
const TIPOS_DOCUMENTO = ["V", "E", "G", "J"] as const;

type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

type Tasa = { fecha: string; tasa: number; propia: boolean };

type EstadoFormulario = {
  fecha: string;
  monto: string;
  moneda: "VES" | "USD";
  metodo: string;
  referencia: string;
  banco: string;
  telefono: string;
  documentoTipo: TipoDocumento;
  documentoNumero: string;
  correo: string;
};

const VACIO: EstadoFormulario = {
  fecha: hoyISO(),
  monto: "",
  moneda: "VES",
  metodo: "Pago móvil",
  referencia: "",
  banco: "",
  telefono: "",
  documentoTipo: "V",
  documentoNumero: "",
  correo: "",
};

/** Portado de Reportar() en residente.html:907-1102, con las 4
 * correcciones pendientes de la Fase 4 aplicadas:
 * 1. comprobante restringido a jpg/png/pdf validando la firma real del
 *    archivo (ver lib/archivos.ts), no solo la extensión/`type`.
 * 2. al fallar la validación, la pantalla hace scroll hasta el aviso.
 * 3. cédula/RIF como select V/E/G/J + número, en vez de texto libre.
 * 4. campos obligatorios marcados con * (Campo ya lo hace) y validados
 *    antes de enviar, no solo al perder el foco.
 */
export function FormularioReportarPago({
  orgId,
  unidadId,
  usuarioId,
  bancos,
}: {
  orgId: string;
  unidadId: string;
  usuarioId: string;
  bancos: Banco[];
}) {
  const router = useRouter();
  const [f, setF] = useState<EstadoFormulario>(VACIO);
  const [tasa, setTasa] = useState<Tasa | null>(null);
  const [errorTasa, setErrorTasa] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const bannerError = useRef<HTMLDivElement>(null);

  const pide = METODOS[f.metodo] ?? {};

  useEffect(() => {
    // Si la moneda no es VES, la tasa no se usa en ninguna parte (ni en
    // pantalla ni en validar()) — no hace falta limpiarla acá.
    if (f.moneda !== "VES") return;
    let cancelado = false;
    const supabase = crearClienteNavegador();
    supabase.rpc("tasa_de_esa_fecha", { p_fecha: f.fecha }).then(({ data, error }) => {
      if (cancelado) return;
      // El error se muestra: una tasa que "no carga" sin decir por qué
      // deja a la persona sin saber si es culpa suya o del sistema.
      setErrorTasa(error ? error.message : null);
      const r = Array.isArray(data) ? data[0] : data;
      setTasa(r && Number(r.tasa) > 0 ? { fecha: r.fecha, propia: r.propia, tasa: Number(r.tasa) } : null);
    });
    return () => {
      cancelado = true;
    };
  }, [f.fecha, f.moneda]);

  // Fix 2: si aparece un error de validación general, la pantalla baja
  // hasta el aviso — en un formulario largo, un error arriba de todo
  // podía quedar fuera de la vista sin que nadie lo notara.
  useEffect(() => {
    if (errorGeneral) bannerError.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [errorGeneral]);

  async function elegirArchivo(evento: ChangeEvent<HTMLInputElement>) {
    const a = evento.target.files?.[0];
    if (!a) return;

    if (a.size > MAX_BYTES_COMPROBANTE * 3) {
      setErrores((prev) => ({ ...prev, comprobante: "Ese archivo es demasiado grande. Tome la foto de nuevo." }));
      evento.target.value = "";
      return;
    }

    const tipoReal = await tipoRealComprobante(a);
    if (!tipoReal) {
      setErrores((prev) => ({
        ...prev,
        comprobante: "El archivo no es una foto (jpg/png) ni un PDF. Revíselo e intente de nuevo.",
      }));
      evento.target.value = "";
      return;
    }

    const chico = tipoReal === "application/pdf" ? a : await comprimirImagen(a);
    if (chico.size > MAX_BYTES_COMPROBANTE) {
      setErrores((prev) => ({ ...prev, comprobante: "El comprobante pesa más de 5 MB. Use una foto más pequeña." }));
      evento.target.value = "";
      return;
    }

    setErrores((prev) => {
      const resto = { ...prev };
      delete resto.comprobante;
      return resto;
    });
    setArchivo(chico);
  }

  function validar(): Record<string, string> {
    const errs: Record<string, string> = {};
    const monto = num(f.monto);
    if (monto === null || monto <= 0) errs.monto = "El monto no se entiende.";
    if (f.fecha > hoyISO()) errs.fecha = "La fecha del pago no puede ser futura.";
    if (f.moneda === "VES" && !tasa)
      errs.tasa = "Todavía no hay tasa del Banco Central para ese día. Avísele a su administración.";
    if (pide.banco && !f.banco) errs.banco = "Elija el banco.";
    if (pide.telefono && !f.telefono.trim())
      errs.telefono = "Falta el teléfono desde el que hizo el pago móvil.";
    if (pide.documento && !f.documentoNumero.trim()) errs.documento = "Falta la cédula o RIF del que paga.";
    if (pide.correo && !f.correo.trim()) errs.correo = "Falta el correo desde el que envió el Zelle.";
    if (pide.referencia && !f.referencia.trim())
      errs.referencia = "Falta la referencia. Sin ella su pago es muy difícil de ubicar.";
    return errs;
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();

    const errs = validar();
    setErrores((prev) => ({ ...(prev.comprobante ? { comprobante: prev.comprobante } : {}), ...errs }));
    if (Object.keys(errs).length > 0) {
      setErrorGeneral("Revise los campos marcados antes de enviar.");
      return;
    }
    setErrorGeneral(null);
    setEnviando(true);

    const supabase = crearClienteNavegador();
    const monto = num(f.monto) as number;

    const { data: pago, error } = await supabase
      .from("pagos")
      .insert({
        org_id: orgId,
        unidad_id: unidadId,
        fecha: f.fecha,
        monto,
        moneda: f.moneda,
        monto_usd: 0,
        metodo: f.metodo,
        destino: "condominio",
        referencia: f.referencia.trim() || null,
        banco_codigo: pide.banco ? f.banco || null : null,
        telefono_origen: pide.telefono ? f.telefono.trim() : null,
        documento_origen: pide.documento ? `${f.documentoTipo}-${f.documentoNumero.trim()}` : null,
        correo_origen: pide.correo ? f.correo.trim() : null,
        estado: "reportado",
      })
      .select("id")
      .single();

    if (error) {
      setEnviando(false);
      setErrorGeneral(error.message);
      return;
    }

    if (archivo) {
      const ext = (archivo.name.match(/\.(\w+)$/) ?? [, "jpg"])[1]!.toLowerCase();
      const ruta = `${orgId}/${unidadId}/${pago.id}.${ext}`;
      const sha = await huellaArchivo(archivo);
      const subida = await supabase.storage
        .from("comprobantes")
        .upload(ruta, archivo, { contentType: archivo.type, upsert: false });

      if (subida.error) {
        setEnviando(false);
        setErrorGeneral("El pago quedó reportado, pero el comprobante no se pudo subir: " + subida.error.message);
        return;
      }

      const { error: errorComprobante } = await supabase.from("comprobantes").insert({
        org_id: orgId,
        unidad_id: unidadId,
        pago_id: pago.id,
        ruta,
        tipo: archivo.type,
        bytes: archivo.size,
        sha256: sha,
        subido_por: usuarioId,
      });
      if (errorComprobante) {
        setEnviando(false);
        setErrorGeneral(
          "El pago quedó reportado, pero no se pudo registrar el comprobante: " + errorComprobante.message
        );
        return;
      }
    }

    if (entrada.current) entrada.current.value = "";
    router.push(`/mi/${unidadId}/pagos`);
    router.refresh();
  }

  return (
    <Card>
      <p style={{ fontSize: 13.5, color: "var(--tinta-2)", lineHeight: 1.6, marginTop: 0 }}>
        Reportar un pago no lo da por recibido: su administración lo revisa contra el banco y lo confirma.
        Mientras tanto aparece como <b>esperando revisión</b>.
      </p>

      {errorGeneral && (
        <div
          ref={bannerError}
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.5,
            background: "var(--rojo-bg)",
            color: "var(--rojo)",
          }}
        >
          {errorGeneral}
        </div>
      )}

      <form onSubmit={enviar} noValidate>
        <Campo etiqueta="Fecha del pago" obligatorio ayuda="La del día en que hizo la transferencia, no la de hoy." error={errores.fecha}>
          <Input
            type="date"
            className="mono"
            value={f.fecha}
            max={hoyISO()}
            onChange={(e) => setF({ ...f, fecha: e.target.value })}
          />
        </Campo>

        <Campo etiqueta="Moneda" obligatorio>
          <Select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as "VES" | "USD" })}>
            <option value="VES">Bolívares</option>
            <option value="USD">Dólares</option>
          </Select>
        </Campo>

        <Campo
          etiqueta={f.moneda === "VES" ? "Monto en bolívares" : "Monto en dólares"}
          obligatorio
          ayuda="Puede escribirlo con coma: 3.450,75"
          error={errores.monto}
        >
          <Input className="mono" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
        </Campo>

        {f.moneda === "VES" && (
          <div
            style={{
              marginBottom: 12,
              padding: "11px 13px",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.55,
              background: tasa ? "var(--azul-bg)" : "var(--ambar-bg)",
              color: tasa ? "var(--azul)" : "var(--ambar)",
            }}
          >
            {errorTasa ? (
              "No se pudo consultar la tasa: " + errorTasa
            ) : tasa ? (
              <>
                Tasa del Banco Central del {fechaLarga(tasa.fecha)}: <b className="mono">{nf(2).format(tasa.tasa)}</b>
                {num(f.monto) ? (
                  <>
                    {" "}
                    · su pago equivale a <b className="mono">{usd(num(f.monto)! / tasa.tasa)}</b>
                  </>
                ) : null}
                {!tasa.propia && (
                  <>
                    <br />
                    No hubo publicación ese día, se usa la última anterior.
                  </>
                )}
              </>
            ) : (
              "Todavía no hay tasa del Banco Central para esa fecha. Avísele a su administración antes de reportar."
            )}
          </div>
        )}
        {errores.tasa && <p className="campo-error" style={{ marginTop: -8, marginBottom: 12 }}>{errores.tasa}</p>}

        <Campo etiqueta="Cómo pagó" obligatorio>
          <Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
            {Object.keys(METODOS).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Campo>

        {pide.banco && (
          <Campo etiqueta="Banco desde el que pagó" obligatorio error={errores.banco}>
            <Select value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })}>
              <option value="">Elija el banco…</option>
              {bancos.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.codigo} · {b.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        {pide.telefono && (
          <Campo
            etiqueta="Teléfono desde el que pagó"
            obligatorio
            ayuda="El que tiene afiliado al pago móvil. Es lo que aparece en el estado de cuenta."
            error={errores.telefono}
          >
            <Input
              className="mono"
              inputMode="tel"
              value={f.telefono}
              placeholder="04121234567"
              onChange={(e) => setF({ ...f, telefono: e.target.value })}
            />
          </Campo>
        )}

        {pide.documento && (
          <Campo
            etiqueta="Cédula o RIF del que paga"
            obligatorio
            ayuda="El tipo va en el selector de la izquierda; acá solo el número, sin puntos — las letras y puntos que escriba se descartan solos."
            error={errores.documento}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <Select
                style={{ flex: "0 0 76px" }}
                value={f.documentoTipo}
                onChange={(e) => setF({ ...f, documentoTipo: e.target.value as TipoDocumento })}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input
                className="mono"
                inputMode="numeric"
                style={{ flex: 1 }}
                value={f.documentoNumero}
                placeholder="12345678"
                onChange={(e) => setF({ ...f, documentoNumero: e.target.value.replace(/\D/g, "") })}
              />
            </div>
          </Campo>
        )}

        {pide.correo && (
          <Campo etiqueta="Correo desde el que envió el Zelle" obligatorio error={errores.correo}>
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="off"
              value={f.correo}
              onChange={(e) => setF({ ...f, correo: e.target.value })}
            />
          </Campo>
        )}

        {pide.referencia && (
          <Campo
            etiqueta={f.metodo === "Zelle" ? "Número de confirmación" : "Referencia"}
            obligatorio
            ayuda="El número que le dio el banco. Es lo que permite encontrar su pago."
            error={errores.referencia}
          >
            <Input
              className="mono"
              inputMode="numeric"
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.target.value })}
            />
          </Campo>
        )}

        <Campo
          etiqueta="Comprobante"
          ayuda="Foto de la pantalla o PDF del banco. Máximo 5 MB. Solo lo ven usted y su administración."
          error={errores.comprobante}
        >
          <input ref={entrada} type="file" accept={ACEPTA_COMPROBANTE} onChange={elegirArchivo} className="control" style={{ padding: 9 }} />
        </Campo>

        {archivo && (
          <div style={{ marginBottom: 12, fontSize: 12.5, color: "var(--tinta-2)" }}>
            {archivo.name} · {nf(0).format(archivo.size / 1024)} KB
          </div>
        )}

        <Button type="submit" disabled={enviando} style={{ width: "100%" }}>
          {enviando ? "Enviando…" : "Reportar el pago"}
        </Button>
      </form>
    </Card>
  );
}
