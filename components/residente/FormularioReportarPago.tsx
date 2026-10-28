"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Campo, Card, Input, InputFecha, Select } from "@/components/ui";
import { bs, fechaLarga, hoyLocalISO, montoAlSalir, nf, num, paraCampo, usd } from "@/lib/formato";
import { bolivaresExactos, bolivaresParaCopiar } from "@/lib/residente/monto-exacto";
import type { APagarHoy } from "@/lib/residente/a-pagar";
import {
  ACEPTA_COMPROBANTE,
  MAX_BYTES_COMPROBANTE,
  comprimirImagen,
  huellaArchivo,
  tipoRealComprobante,
} from "@/lib/archivos";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import { mensajeDeError } from "@/lib/errores";
import { useSubirAlAviso } from "@/hooks/useSubirAlAviso";

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

type Tasa = { fecha: string; tasa: number; propia: boolean };

type EstadoFormulario = {
  fecha: string;
  monto: string;
  moneda: "VES" | "USD";
  metodo: string;
  referencia: string;
  banco: string;
  telefono: string;
  documento: string;
  correo: string;
  /** A qué cuenta pagó (ronda 7): solo se pregunta si el edificio tiene cuenta de honorarios. */
  destino: "condominio" | "honorarios";
};

const VACIO: EstadoFormulario = {
  fecha: hoyLocalISO(),
  monto: "",
  moneda: "VES",
  metodo: "Pago móvil",
  referencia: "",
  banco: "",
  telefono: "",
  documento: "",
  correo: "",
  destino: "condominio",
};

/**
 * Portado de Reportar() en index.html:1522-1717 — mismos campos, mismo
 * orden, mismas validaciones y mismos textos que `main`.
 *
 * **Un solo desvío, y es de seguridad:** el comprobante se valida por la
 * firma real del archivo (`lib/archivos.ts` lee los bytes de cabecera), no
 * por la extensión ni por el `type` que reporta el navegador, que un
 * archivo mal etiquetado puede burlar. Un comprobante inválido guardado
 * como si fuera válido dificulta la conciliación con el banco y ensucia la
 * evidencia (ver docs/casos-de-uso-mejorados.md, caso 3).
 *
 * Los otros tres agregados de la Sesión 1 —selector V/E/G/J para la
 * cédula, marcas de campo obligatorio y scroll automático hasta el aviso—
 * se revirtieron el 28-sep por el criterio de paridad con `main` (casos 4
 * y 5 de ese mismo archivo).
 */
export function FormularioReportarPago({
  orgId,
  unidadId,
  usuarioId,
  bancos,
  deudaUsd: deudaTotal,
  hoy = null,
  reparto = null,
  soloUsd = false,
  unidadesGrupo = [],
}: {
  orgId: string;
  unidadId: string;
  usuarioId: string;
  bancos: Banco[];
  /** Saldo de esta unidad en dólares (`mis_unidades()`); null si la base no lo muestra. */
  deudaUsd: number | null;
  /**
   * Lo que se debe hoy (ronda 9, A1, `lib/residente/a-pagar.ts`): con los
   * pagos confirmados después del último recibo. Si no debe nada, el
   * formulario lo dice arriba (antes lo decía solo si el RECIBO quedaba a
   * favor, y un recibo ya pagado seguía pidiendo el total).
   */
  hoy?: APagarHoy | null;
  /**
   * Ronda 7 (bloque 2): si el edificio tiene una cuenta de honorarios aparte,
   * cuánto de la deuda va a cada cuenta (`datos_pago_de()`). Con él, el
   * formulario pregunta a qué cuenta pagó y el pago se abona a esa parte
   * (`pagos.destino`). null = una sola cuenta, todo a condominio, como antes.
   */
  reparto?: { condominio: number; honorarios: number } | null;
  /** La organización cobra solo en dólares (ronda 7, bloque 4): solo se aceptan dólares. */
  soloUsd?: boolean;
  /**
   * Ronda 7 (bloque 9): las unidades de este edificio que paga quien mira
   * (esta primero), con su saldo. Con dos o más, el formulario ofrece repartir
   * una sola transferencia entre ellas: una fila de `pagos` por unidad, con el
   * mismo `grupo_id`, en una sola llamada.
   */
  unidadesGrupo?: { unidad_id: string; codigo: string; saldo: number | null }[];
}) {
  const router = useRouter();
  const [f, setF] = useState<EstadoFormulario>(soloUsd ? { ...VACIO, moneda: "USD", metodo: "Zelle" } : VACIO);
  const [tasa, setTasa] = useState<Tasa | null>(null);
  const [errorTasa, setErrorTasa] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // Ronda 9 (B4): el error general no es <Aviso>; sube con el mismo hook.
  const refError = useSubirAlAviso();
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  // Con dos cuentas, la deuda que se muestra es la de la cuenta elegida.
  const deudaUsd = reparto ? reparto[f.destino] : deudaTotal;

  // Ronda 7 (bloque 9): una transferencia para varias unidades.
  const [agrupar, setAgrupar] = useState(false);
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({});
  const [partes, setPartes] = useState<Record<string, string>>({});
  const puedeAgrupar = unidadesGrupo.length >= 2;
  /** Lo que se propone por omisión: el saldo de cada unidad (en Bs, a la tasa de la fecha del pago). */
  const propuesta = (saldo: number | null) => {
    if (saldo === null || saldo <= 0.009) return 0;
    if (f.moneda === "VES") return tasa ? bolivaresExactos(saldo, tasa.tasa) : 0;
    return Math.round(saldo * 100) / 100;
  };
  const marcada = (u: { unidad_id: string; saldo: number | null }) =>
    marcadas[u.unidad_id] ?? (u.unidad_id === unidadId || (u.saldo ?? 0) > 0.009);
  const parteDe = (u: { unidad_id: string; saldo: number | null }) => partes[u.unidad_id] ?? paraCampo(propuesta(u.saldo));
  const elegidas = unidadesGrupo.filter(marcada);
  const sumaPartes = elegidas.reduce((s, u) => s + (num(parteDe(u)) ?? 0), 0);

  // Lo exacto a transferir para quedar al día (ronda 4, caso 54): la deuda de
  // esta unidad por la tasa de la FECHA DEL PAGO, la misma con la que la base
  // va a convertir. Cambia sola al cambiar la fecha. Solo en bolívares y solo
  // si hay deuda (con saldo a favor o al día no hay nada que transferir).
  const exacto =
    !agrupar && f.moneda === "VES" && tasa && deudaUsd !== null && deudaUsd > 0.009 ? bolivaresExactos(deudaUsd, tasa.tasa) : null;

  async function copiar(valor: number) {
    try {
      await navigator.clipboard.writeText(bolivaresParaCopiar(valor));
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

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
      setErrorTasa(error ? mensajeDeError(error) : null);
      const r = Array.isArray(data) ? data[0] : data;
      setTasa(r && Number(r.tasa) > 0 ? { fecha: r.fecha, propia: r.propia, tasa: Number(r.tasa) } : null);
    });
    return () => {
      cancelado = true;
    };
  }, [f.fecha, f.moneda]);

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
    if (f.fecha > hoyLocalISO()) errs.fecha = "La fecha del pago no puede ser futura.";
    if (f.moneda === "VES" && !tasa)
      errs.tasa = "Todavía no hay tasa del Banco Central para ese día. Avísele a su administración.";
    if (pide.banco && !f.banco) errs.banco = "Elija el banco.";
    if (pide.telefono && !f.telefono.trim())
      errs.telefono = "Falta el teléfono desde el que hizo el pago móvil.";
    if (pide.correo && !f.correo.trim()) errs.correo = "Falta el correo desde el que envió el Zelle.";
    if (pide.referencia && !f.referencia.trim())
      errs.referencia = "Falta la referencia. Sin ella su pago es muy difícil de ubicar.";
    if (agrupar) {
      if (elegidas.length < 2) errs.grupo = "Marque al menos dos unidades, o quite «paga varias de mis unidades».";
      else if (elegidas.some((u) => !((num(parteDe(u)) ?? 0) > 0))) errs.grupo = "Cada unidad marcada necesita su monto.";
      else if (monto !== null && Math.abs(sumaPartes - monto) > 0.005)
        errs.grupo = `Lo que reparte suma ${nf(2).format(sumaPartes)} y la transferencia es de ${nf(2).format(monto)}: tienen que ser iguales.`;
    }
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

    const comun = {
      org_id: orgId,
      fecha: f.fecha,
      moneda: f.moneda,
      monto_usd: 0,
      metodo: f.metodo,
      destino: reparto ? f.destino : "condominio",
      referencia: f.referencia.trim() || null,
      banco_codigo: pide.banco ? f.banco || null : null,
      telefono_origen: pide.telefono ? f.telefono.trim() : null,
      documento_origen: pide.documento ? f.documento.trim() : null,
      correo_origen: pide.correo ? f.correo.trim() : null,
      estado: "reportado",
    };
    // Ronda 7 (bloque 9): agrupado, una fila por unidad con el mismo grupo_id,
    // en un solo INSERT (entran todas o ninguna). El comprobante va con la
    // primera: es una sola transferencia.
    const grupo = agrupar ? crypto.randomUUID() : null;
    const filas = agrupar
      ? elegidas.map((u) => ({ ...comun, unidad_id: u.unidad_id, monto: num(parteDe(u)) as number, grupo_id: grupo }))
      : [{ ...comun, unidad_id: unidadId, monto }];
    const { data: insertados, error } = await supabase.from("pagos").insert(filas).select("id");
    const pago = insertados?.[0];

    if (error || !pago) {
      setEnviando(false);
      setErrorGeneral(mensajeDeError(error ?? "No se pudo reportar el pago."));
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
        setErrorGeneral("El pago quedó reportado, pero el comprobante no se pudo subir: " + mensajeDeError(subida.error));
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
          "El pago quedó reportado, pero no se pudo registrar el comprobante: " + mensajeDeError(errorComprobante)
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
          ref={refError}
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

      {/* Ronda 5 (pedido de Gustavo): solo avisa, no bloquea. Puede querer
          adelantar el mes que viene. */}
      {hoy && hoy.monto <= 0 && (
        <div style={{ marginBottom: 14 }}>
          <Aviso
            tono="favor"
            titulo={hoy.monto < 0 ? `Hoy no tiene que pagar: tiene ${usd(-hoy.monto)} a favor` : "Hoy no tiene que pagar: está al día"}
          >
            Ya se descontaron los pagos que su administración confirmó. Si igual quiere adelantar un pago, puede reportarlo aquí.
          </Aviso>
        </div>
      )}
      {hoy && hoy.enRevision > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Aviso tono="ambar" titulo={`Tiene ${usd(hoy.enRevision)} en pagos que su administración todavía no confirma`}>
            Si ya pagó, no vuelva a pagar: se descuentan cuando los confirme. Puede verlos en «Mis pagos».
          </Aviso>
        </div>
      )}

      <form onSubmit={enviar} noValidate>
        <Campo etiqueta="Fecha del pago" ayuda="La del día en que hizo la transferencia, no la de hoy." error={errores.fecha}>
          <InputFecha className="mono" sinFuturo value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Campo>

        {reparto && (
          <Campo
            etiqueta="¿A qué cuenta pagó?"
            ayuda={`Su administración tiene una cuenta para el condominio y otra para los honorarios. Condominio: ${usd(reparto.condominio)} · Honorarios: ${usd(reparto.honorarios)}. Si pagó las dos, reporte un pago por cada una.`}
          >
            <Select value={f.destino} onChange={(e) => setF({ ...f, destino: e.target.value as EstadoFormulario["destino"] })}>
              <option value="condominio">Condominio</option>
              <option value="honorarios">Honorarios de administración</option>
            </Select>
          </Campo>
        )}

        {soloUsd ? (
          <p style={{ fontSize: 13, color: "var(--tinta-2)", margin: "0 0 12px" }}>Su administración cobra solo en dólares.</p>
        ) : (
          <Campo etiqueta="Moneda">
            <Select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as "VES" | "USD" })}>
              <option value="VES">Bolívares</option>
              <option value="USD">Dólares</option>
            </Select>
          </Campo>
        )}

        {exacto !== null && tasa && (
          <div
            style={{
              marginBottom: 14,
              padding: "13px 14px",
              borderRadius: 10,
              border: "1px solid var(--linea)",
              background: "var(--fondo)",
              fontSize: 13.5,
              lineHeight: 1.55,
            }}
          >
            <div style={{ color: "var(--tinta-2)" }}>
              Para pagar su deuda de <b className="mono">{usd(deudaUsd)}</b> transfiera
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, margin: "2px 0" }}>
              {bs(exacto)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tenue)" }}>
              Tasa del Banco Central del {fechaLarga(tasa.fecha)}: <span className="mono">{nf(2).format(tasa.tasa)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 8px" }}>
              <Button
                type="button"
                mini
                onClick={() => {
                  setCopiado(null);
                  setF({ ...f, monto: paraCampo(exacto) });
                }}
              >
                Pagar deuda total
              </Button>
              <Button type="button" mini variante="secundario" onClick={() => copiar(exacto)}>
                {copiado === "si" ? "Copiado ✓" : "Copiar el monto"}
              </Button>
            </div>
            {copiado === "no" && (
              <div style={{ fontSize: 12.5, color: "var(--rojo)", marginBottom: 6 }}>
                No se pudo copiar. Escríbalo a mano: {bolivaresParaCopiar(exacto)}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: "var(--ambar)", fontWeight: 600 }}>
              Transfiera el monto exacto, con los céntimos. Si paga otro día, la tasa cambia y el monto también:
              ponga arriba la fecha en que transfiere.
            </div>
          </div>
        )}

        <Campo
          etiqueta={(agrupar ? "Total de la transferencia" : "Monto") + (f.moneda === "VES" ? " en bolívares" : " en dólares")}
          ayuda="Puede escribirlo con coma: 3.450,75"
          error={errores.monto}
        >
          <Input className="mono" inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} onBlur={() => setF({ ...f, monto: montoAlSalir(f.monto) })} />
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

        {puedeAgrupar && (
          <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--linea)", background: agrupar ? "var(--fondo)" : undefined }}>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
              <span>
                <b>Esta transferencia paga varias de mis unidades</b>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--tinta-2)" }}>
                  Reparta el total entre sus unidades. Se propone lo que debe cada una; puede cambiarlo.
                </span>
              </span>
            </label>
            {agrupar && (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {unidadesGrupo.map((u) => (
                  <div key={u.unidad_id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 120px", fontSize: 14 }}>
                      <input type="checkbox" checked={marcada(u)} onChange={(e) => setMarcadas({ ...marcadas, [u.unidad_id]: e.target.checked })} />
                      <b className="mono">{u.codigo}</b>
                      {u.saldo !== null && <span style={{ fontSize: 12, color: "var(--tenue)" }}>debe {usd(Math.max(u.saldo, 0))}</span>}
                    </label>
                    <Input
                      className="mono"
                      inputMode="decimal"
                      disabled={!marcada(u)}
                      value={marcada(u) ? parteDe(u) : ""}
                      onChange={(e) => setPartes({ ...partes, [u.unidad_id]: e.target.value })}
                      onBlur={() => setPartes({ ...partes, [u.unidad_id]: montoAlSalir(parteDe(u)) })}
                      style={{ flex: "1 1 120px", width: "auto" }}
                      aria-label={`Monto para ${u.codigo}`}
                    />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                  <span>
                    Suma: <b className="mono">{f.moneda === "VES" ? bs(sumaPartes) : usd(sumaPartes)}</b>
                  </span>
                  <Button type="button" mini variante="secundario" onClick={() => setF({ ...f, monto: paraCampo(sumaPartes) })}>
                    Usar la suma como monto
                  </Button>
                </div>
                {errores.grupo && <p className="campo-error" style={{ margin: 0 }}>{errores.grupo}</p>}
              </div>
            )}
          </div>
        )}

        <Campo etiqueta="Cómo pagó">
          <Select value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })}>
            {Object.keys(METODOS).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Campo>

        {pide.banco && (
          <Campo etiqueta="Banco desde el que pagó" error={errores.banco}>
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
          <Campo etiqueta="Cédula o RIF del que paga" ayuda="Solo los números, sin puntos.">
            <Input
              className="mono"
              inputMode="numeric"
              value={f.documento}
              placeholder="12345678"
              onChange={(e) => setF({ ...f, documento: e.target.value })}
            />
          </Campo>
        )}

        {pide.correo && (
          <Campo etiqueta="Correo desde el que envió el Zelle" error={errores.correo}>
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

        <Button type="submit" cargando={enviando} style={{ width: "100%" }}>
          Reportar el pago
        </Button>
      </form>
    </Card>
  );
}
