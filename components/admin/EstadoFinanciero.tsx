"use client";

import { useEffect, useState } from "react";
import { Aviso, Button, Campo, Card, Select } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";
import { usd } from "@/lib/formato";
import { descargarExcelEstado, nombreMes, rangoDeMeses, tituloRango, type EstadoFinanciero } from "@/lib/admin/estado-financiero";

type Periodo = { anio: number; mes: number; etiqueta: string; estado: string };

const clave = (p: { anio: number; mes: number }) => `${p.anio}-${String(p.mes).padStart(2, "0")}`;

/**
 * Estado financiero del edificio (ronda 7, bloque 8, caso 86): un mes o un
 * rango; saldo inicial, ingresos (pagos confirmados), egresos (gastos del mes)
 * y saldo final. Descarga en PDF (la vista para imprimir, como el recibo) y en
 * Excel.
 */
export function EstadoFinancieroPantalla({
  orgId,
  edificioId,
  edificio,
  periodos,
  desdeInicial,
  hastaInicial,
}: {
  orgId: string;
  edificioId: string;
  edificio: string;
  periodos: Periodo[];
  desdeInicial?: string;
  hastaInicial?: string;
}) {
  const meses = [...new Set(periodos.map(clave))];
  const ultimoCerrado = [...periodos].reverse().find((p) => p.estado === "cerrado");
  const porOmision = ultimoCerrado ? clave(ultimoCerrado) : meses[meses.length - 1];
  const valido = (m?: string) => (m && meses.includes(m) ? m : undefined);
  const [desde, setDesde] = useState(valido(desdeInicial) ?? porOmision ?? "");
  const [hasta, setHasta] = useState(valido(hastaInicial) ?? porOmision ?? "");
  const [cargado, setCargado] = useState<{ rango: string; estado: EstadoFinanciero } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  const rango = desde && hasta ? rangoDeMeses(desde, hasta) : null;
  const claveRango = `${desde}:${hasta}`;

  useEffect(() => {
    if (!rango) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("estado_financiero", { p_edificio: edificioId, p_desde: rango.desde, p_hasta: rango.hasta }).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) return setError(mensajeDeError(e));
      setError(null);
      setCargado({ rango: claveRango, estado: data as unknown as EstadoFinanciero });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edificioId, claveRango]);

  const e = cargado?.rango === claveRango ? cargado.estado : null;

  if (!meses.length) {
    return (
      <Card>
        <p style={{ margin: 0, fontSize: 14 }}>Todavía no hay ningún mes en este edificio: el estado financiero sale cuando se abre el primero.</p>
      </Card>
    );
  }

  const fila = (t: string, v: number, fuerte = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--linea)", fontWeight: fuerte ? 700 : 400, fontSize: fuerte ? 16 : 14 }}>
      <span>{t}</span>
      <span className="mono" style={{ color: fuerte && v < 0 ? "var(--rojo)" : undefined }}>
        {usd(v)}
      </span>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Estado financiero</h2>
        <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
          Lo cobrado y lo gastado del edificio en un mes o en varios. Todo en dólares.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <Campo etiqueta="Desde">
            <Select value={desde} onChange={(x) => setDesde(x.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Hasta">
            <Select value={hasta} onChange={(x) => setHasta(x.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        {!rango && (
          <div style={{ marginTop: 12 }}>
            <Aviso tono="ambar">«Desde» tiene que ser antes que «Hasta».</Aviso>
          </div>
        )}
        {error && (
          <div style={{ marginTop: 12 }}>
            <Aviso tono="rojo" titulo="No se pudo calcular">
              {error}
            </Aviso>
          </div>
        )}
      </Card>

      {rango && e && (
        <Card>
          <div style={{ fontSize: 12, color: "var(--tenue)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>
            {edificio} · {tituloRango(desde, hasta)}
          </div>
          {fila("Saldo inicial", e.saldo_inicial)}
          {fila("Ingresos (pagos confirmados)", e.ingresos)}
          {fila("Egresos (gastos del mes)", -e.egresos)}
          {fila("Saldo final", e.saldo_final, true)}
          <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "8px 0 0", lineHeight: 1.5 }}>
            {e.detalle_ingresos.length} pagos y {e.detalle_egresos.length} gastos en el período.
            {e.honorarios > 0 ? ` Aparte, ${usd(e.honorarios)} cobrados para honorarios de administración (no entran en el saldo).` : ""}
          </p>
          {e.meses_abiertos.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Aviso tono="ambar">Sin cerrar todavía: {e.meses_abiertos.join(", ")}. Sus gastos todavía pueden cambiar.</Aviso>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <a href={`/admin/${orgId}/${edificioId}/estado/papel?desde=${desde}&hasta=${hasta}`} className="btn" style={{ textDecoration: "none" }}>
              Descargar PDF
            </a>
            <Button
              type="button"
              variante="secundario"
              cargando={bajando}
              onClick={async () => {
                setBajando(true);
                try {
                  await descargarExcelEstado({
                    estado: e,
                    edificio,
                    titulo: tituloRango(desde, hasta),
                    archivo: `Estado financiero ${edificio} ${desde === hasta ? desde : `${desde} a ${hasta}`}.xlsx`,
                  });
                } catch (x) {
                  setError(mensajeDeError(x));
                }
                setBajando(false);
              }}
            >
              Descargar Excel
            </Button>
          </div>
          <p style={{ fontSize: 12, color: "var(--tenue)", margin: "8px 0 0" }}>
            «Descargar PDF» abre la hoja lista para imprimir; ahí elija «Guardar como PDF». Con «Volver» regresa aquí.
          </p>
        </Card>
      )}
      {rango && !e && !error && <p style={{ fontSize: 13, color: "var(--tenue)" }}>Calculando…</p>}
    </div>
  );
}
