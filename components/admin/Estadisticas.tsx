"use client";

import { useEffect, useState } from "react";
import { Aviso, Button, Card, Select, Vacio } from "@/components/ui";
import { nf, num0, usd } from "@/lib/formato";
import { MESES } from "@/lib/admin/constantes";
import { informeDeAsambleaEnPapel } from "@/lib/admin/papel-estadisticas";
import { imprimirDocumento } from "@/lib/recibo-papel";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { DatosEstadisticas, PeriodoAdmin } from "@/lib/admin/tipos";

const VACIO: DatosEstadisticas = { resumen: null, categorias: [], top: [], serie: [], mora: [] };

/**
 * Portado de Estadisticas() en admin.html:4596-4916 (pantalla nueva del
 * socio, no existía en la versión que se inventarió en la Sesión 1).
 *
 * Regla de este módulo, del original: **ningún número se calcula acá**.
 * Todo viene de la base, que a su vez lo lee de lo que quedó congelado al
 * cerrar el mes. Si la pantalla hiciera sus propias cuentas, volveríamos a
 * la familia de error que ya mordió tres veces: la pantalla promete un
 * número y el recibo trae otro, y el administrador queda como mentiroso
 * delante de cien personas. Lo único que se calcula acá son los máximos
 * para el ancho de las barras.
 */
export function Estadisticas({
  edificioId,
  organizacion,
  edificio,
  periodos,
}: {
  edificioId: string;
  organizacion: { nombre: string };
  edificio: { nombre: string; rif: string | null };
  periodos: PeriodoAdmin[];
}) {
  const cerrados = periodos
    .filter((p) => p.estado === "cerrado")
    .slice()
    .sort((a, b) => b.anio - a.anio || b.mes - a.mes);

  const [periodoId, setPeriodoId] = useState(cerrados[0]?.id ?? "");
  // Igual que Cortes: lo cargado se guarda junto al período al que
  // pertenece, y "cargando" se deriva. Evita el setState sincrónico dentro
  // del efecto que el lint de este proyecto rechaza.
  const [cargado, setCargado] = useState<{ periodoId: string; datos: DatosEstadisticas } | null>(null);
  const [bloqueado, setBloqueado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const periodo = cerrados.find((p) => p.id === periodoId) ?? null;
  const d = cargado?.periodoId === periodoId ? cargado.datos : VACIO;
  const cargando = !!periodoId && cargado?.periodoId !== periodoId && !bloqueado;

  useEffect(() => {
    if (!periodoId || !edificioId) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    Promise.all([
      supabase.rpc("estadisticas_periodo", { p_periodo: periodoId }),
      supabase.rpc("gastos_por_categoria", { p_periodo: periodoId }),
      supabase.rpc("top_gastos", { p_periodo: periodoId, p_n: 6 }),
      supabase.rpc("serie_edificio", { p_edificio: edificioId, p_meses: 12 }),
      supabase.rpc("morosidad_edificio", { p_edificio: edificioId }),
    ]).then(([r1, r2, r3, r4, r5]) => {
      if (!vivo) return;
      /* El primer error se muestra tal cual. Antes esta pantalla se
         tragaba el error y quedaba igual que "todavía no hay datos", que
         es la peor forma de fallar: nadie sabe qué arreglar. */
      const err = [r1, r2, r3, r4, r5].map((x) => x.error).find(Boolean);
      if (err) {
        setBloqueado(err.message || String(err));
        return;
      }
      setBloqueado(null);
      setCargado({
        periodoId,
        datos: {
          resumen: (r1.data ?? [])[0] ?? null,
          categorias: r2.data ?? [],
          top: r3.data ?? [],
          serie: r4.data ?? [],
          mora: r5.data ?? [],
        },
      });
    });
    return () => {
      vivo = false;
    };
  }, [periodoId, edificioId]);

  const maxCat = Math.max(...d.categorias.map((c) => num0(c.monto)), 0);
  const r = d.resumen;

  function imprimir() {
    if (!r) return setAviso("Todavía no hay un mes cerrado que presentar.");
    setAviso(null);
    imprimirDocumento(
      informeDeAsambleaEnPapel({ datos: d, periodo, edificio, organizacion }),
      () => setAviso("El navegador bloqueó la ventana. Permita las ventanas emergentes."),
      800
    );
  }

  if (!cerrados.length) {
    return (
      <Vacio
        titulo="Todavía no hay un mes cerrado"
        texto="Las estadísticas se arman con lo que quedó congelado al cerrar el mes. Cierre un período y vuelva a esta pantalla."
      />
    );
  }

  if (bloqueado) {
    return <Vacio titulo="No se pudieron cargar las estadísticas" texto={bloqueado} />;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {aviso && <Aviso tono="rojo">{aviso}</Aviso>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Estadísticas del edificio</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
            Lo mismo que dicen los recibos, listo para proyectar en la reunión.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} style={{ minWidth: 170, width: "auto" }}>
            {cerrados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </Select>
          <Button type="button" variante="secundario" onClick={imprimir}>
            Informe para la asamblea
          </Button>
        </div>
      </div>

      {cargando && (
        <Card>
          <span style={{ fontSize: 13.5, color: "var(--tinta-2)" }}>Cargando…</span>
        </Card>
      )}

      {r && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))" }}>
          <Cifra
            rotulo="Gasto del mes"
            valor={usd(r.total_gastos)}
            pie={r.presupuesto ? `Presupuesto ${usd(r.presupuesto)}` : "Sin presupuesto"}
          />
          <Cifra
            rotulo="Facturado"
            valor={usd(r.facturado_mes)}
            pie={`Promedio ${usd(r.cuota_promedio)} por unidad`}
          />
          <Cifra
            rotulo="Cobrado"
            valor={`${nf(1).format(r.pct_cobrado)} %`}
            pie={usd(r.cobrado)}
            tono={num0(r.pct_cobrado) >= 80 ? "verde" : num0(r.pct_cobrado) >= 60 ? "ambar" : "rojo"}
          />
          <Cifra
            rotulo="Deuda al cierre"
            valor={usd(r.deuda_total)}
            pie={`${r.unidades_con_deuda} de ${r.unidades} unidades`}
          />
        </div>
      )}

      {d.categorias.length > 0 && (
        <Card>
          <h3 style={{ fontFamily: "var(--font-titulos)", fontWeight: 600, fontSize: 15, color: "var(--tinta)", margin: "0 0 4px" }}>
            En qué se gastó
          </h3>
          <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "0 0 16px" }}>
            Comparado contra el mes anterior de calendario.
          </p>
          {d.categorias.map((c) => (
            <BarraGasto
              key={c.categoria}
              nombre={c.categoria}
              monto={c.monto}
              pct={c.pct}
              variacion={c.variacion_pct}
              max={maxCat}
            />
          ))}
        </Card>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
        {d.top.length > 0 && (
          <Card>
            <h3 style={{ fontFamily: "var(--font-titulos)", fontWeight: 600, fontSize: 15, color: "var(--tinta)", margin: "0 0 14px" }}>
              Los gastos más grandes
            </h3>
            {d.top.map((g, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "7px 0",
                  borderBottom: i < d.top.length - 1 ? "1px solid var(--linea)" : "none",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, color: "var(--tinta)", display: "block" }}>{g.concepto}</span>
                  <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>{g.categoria}</span>
                </span>
                <span style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  <span className="mono" style={{ fontSize: 13, color: "var(--tinta)", display: "block" }}>
                    {usd(g.monto)}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>{nf(1).format(g.pct)} %</span>
                </span>
              </div>
            ))}
          </Card>
        )}

        {d.mora.length > 0 && (
          <Card>
            <h3 style={{ fontFamily: "var(--font-titulos)", fontWeight: 600, fontSize: 15, color: "var(--tinta)", margin: "0 0 4px" }}>
              Cómo está la morosidad
            </h3>
            <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "0 0 14px" }}>
              En cuotas equivalentes y sin nombres. El detalle por unidad va en el estado de cuenta.
            </p>
            {d.mora.map((t) => {
              const tono = ["var(--tenue)", "var(--verde)", "var(--ambar)", "var(--rojo)", "var(--rojo)"][t.orden] ?? "var(--tenue)";
              /* El tramo peor lleva además fondo: el punto de color solo no
                 distingue "tres meses" de "más de tres", y ese es justo el
                 que la junta necesita ver de lejos. */
              const grave = t.orden === 4 && num0(t.monto) > 0;
              return (
                <div
                  key={t.orden}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: grave ? "7px 10px" : "7px 0",
                    margin: grave ? "0 -10px" : 0,
                    borderRadius: grave ? "var(--radio-chico)" : 0,
                    background: grave ? "var(--rojo-bg)" : "transparent",
                    borderBottom: t.orden < 4 ? "1px solid var(--linea)" : "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--tinta)" }}>
                    <i style={{ width: 9, height: 9, borderRadius: 999, background: tono, display: "inline-block", flexShrink: 0 }} />
                    {t.tramo}
                  </span>
                  <span style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <span className="mono" style={{ fontSize: 13, color: "var(--tinta)", display: "block" }}>
                      {t.unidades} {t.unidades === 1 ? "unidad" : "unidades"}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--tenue)" }}>{usd(t.monto)}</span>
                  </span>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {d.serie.length > 1 && (
        <Card>
          <h3 style={{ fontFamily: "var(--font-titulos)", fontWeight: 600, fontSize: 15, color: "var(--tinta)", margin: "0 0 4px" }}>
            Los últimos meses
          </h3>
          <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "0 0 16px" }}>
            Cuánto se facturó y cuánto entró de verdad, mes a mes.
          </p>
          <SerieAnual filas={d.serie} />
        </Card>
      )}
    </div>
  );
}

/** admin.html:4520-4528. */
function Cifra({
  rotulo,
  valor,
  pie,
  tono,
}: {
  rotulo: string;
  valor: string;
  pie?: string;
  tono?: "verde" | "ambar" | "rojo";
}) {
  return (
    <Card style={{ padding: "16px 18px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)", fontWeight: 700, marginBottom: 7 }}>
        {rotulo}
      </div>
      <div className="mono" style={{ fontSize: 23, fontWeight: 600, color: tono ? `var(--${tono})` : "var(--tinta)" }}>
        {valor}
      </div>
      {pie && <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 3 }}>{pie}</div>}
    </Card>
  );
}

/**
 * admin.html:4530-4554. Las barras van todas del mismo color a propósito:
 * es UNA medida comparada entre categorías, el color no significa nada.
 */
function BarraGasto({
  nombre,
  monto,
  pct,
  variacion,
  max,
}: {
  nombre: string;
  monto: number;
  pct: number;
  variacion: number | null;
  max: number;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
        <span style={{ fontSize: 13.5, color: "var(--tinta)", fontWeight: 500 }}>{nombre}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
          {variacion !== null && variacion !== undefined && Math.abs(variacion) >= 0.5 && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: variacion > 0 ? "var(--rojo)" : "var(--verde)" }}>
              {variacion > 0 ? "▲" : "▼"} {nf(0).format(Math.abs(variacion))} %
            </span>
          )}
          <span className="mono" style={{ fontSize: 13, color: "var(--tinta)" }}>
            {usd(monto)}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--tenue)", minWidth: 38, textAlign: "right", display: "inline-block" }}>
            {nf(1).format(pct)} %
          </span>
        </span>
      </div>
      <div
        style={{ height: 9, background: "var(--fondo)", borderRadius: 999, overflow: "hidden" }}
        title={`${nombre}: ${usd(monto)} · ${nf(1).format(pct)} % del gasto del mes`}
      >
        <div
          style={{
            height: "100%",
            width: `${max > 0 ? (num0(monto) / max) * 100 : 0}%`,
            background: "var(--acento)",
            borderRadius: 999,
            minWidth: num0(monto) > 0 ? 4 : 0,
          }}
        />
      </div>
    </div>
  );
}

/** admin.html:4556-4594. Dos medidas distintas, dos colores, con leyenda. */
function SerieAnual({
  filas,
}: {
  filas: { anio: number; mes: number; etiqueta: string; facturado: number; cobrado: number; pct_cobrado: number }[];
}) {
  if (!filas || filas.length < 2) return null;
  const max = Math.max(...filas.map((f) => Math.max(num0(f.facturado), num0(f.cobrado))), 1);
  const corto = (m: number) => (MESES[(m || 1) - 1] || "").slice(0, 3);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        {(
          [
            ["Facturado", "var(--tinta)"],
            ["Cobrado", "var(--acento)"],
          ] as [string, string][]
        ).map(([t, c]) => (
          <span key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--tinta-2)" }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: c, display: "inline-block" }} />
            {t}
          </span>
        ))}
      </div>
      {/* Ancho tope por mes: con dos o tres meses cerrados, unas barras que
          ocupan media pantalla exageran la diferencia y se leen como otra
          cosa. */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height: 150,
          overflowX: "auto",
          paddingBottom: 2,
          justifyContent: filas.length < 6 ? "flex-start" : "stretch",
        }}
      >
        {filas.map((f) => (
          <div key={`${f.anio}-${f.mes}`} style={{ flex: "1 1 44px", maxWidth: 78, minWidth: 38, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", height: 116, gap: 2 }}>
              <div
                title={`${f.etiqueta} · facturado ${usd(f.facturado)}`}
                style={{
                  width: 20,
                  background: "var(--tinta)",
                  borderRadius: "4px 4px 0 0",
                  height: `${(num0(f.facturado) / max) * 100}%`,
                  minHeight: 2,
                }}
              />
              <div
                title={`${f.etiqueta} · cobrado ${usd(f.cobrado)} (${nf(0).format(f.pct_cobrado)} %)`}
                style={{
                  width: 20,
                  background: "var(--acento)",
                  borderRadius: "4px 4px 0 0",
                  height: `${(num0(f.cobrado) / max) * 100}%`,
                  minHeight: 2,
                }}
              />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--tenue)", marginTop: 6 }}>{corto(f.mes)}</div>
            <div style={{ fontSize: 10, color: "var(--tenue)" }}>{String(f.anio).slice(2)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
