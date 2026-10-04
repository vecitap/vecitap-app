import Link from "next/link";
import { Card } from "@/components/ui";
import { usd } from "@/lib/formato";
import { aFavorSegunPortal, debeSegunPortal, type LineaResumen, type ResumenPortal } from "@/lib/residente/resumen";

/**
 * Resumen de quien tiene varias unidades, arriba del selector (caso 31 de
 * docs/casos-de-uso-mejorados.md). No existe en `main`. Las cuentas viven en
 * lib/residente/resumen.ts; acá solo se muestran.
 */
export function ResumenUnidades({ resumen }: { resumen: ResumenPortal }) {
  const { pagaUsted, totalDeuda, aFavor, pagaInquilino } = resumen;

  return (
    <Card style={{ marginBottom: 16 }}>
      {pagaUsted.length > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>
              Lo que usted paga · {pagaUsted.length} {pagaUsted.length === 1 ? "unidad" : "unidades"}
            </h2>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>{totalDeuda > 0 ? "Total que debe" : "Total"}</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: totalDeuda > 0 ? "var(--rojo)" : "var(--verde)" }}>
                {totalDeuda > 0 ? usd(totalDeuda) : "Al día"}
              </div>
            </div>
          </div>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {pagaUsted.map((l) => (
              <Fila key={l.unidadId} linea={l} conMonto />
            ))}
          </ul>
          {aFavor.length > 0 && (
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: "8px 0 0", borderTop: "1px dashed var(--linea)" }}>
              {aFavor.map((l) => (
                <li key={l.unidadId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", fontSize: 13.5 }}>
                  <span>
                    Saldo a favor en <span className="mono">{l.codigo}</span>
                  </span>
                  <span className="mono" style={{ color: "var(--verde)" }}>
                    {usd(Math.abs(l.saldo ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pagaInquilino.length > 0 && (
        <section style={pagaUsted.length > 0 ? { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--linea)" } : undefined}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Lo paga su inquilino</h2>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {pagaInquilino.map((l) => (
              <Fila key={l.unidadId} linea={l} />
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

/**
 * Una unidad. Con monto: "Debe $ X" o "Al día" — un saldo a favor dice "Al
 * día" acá y su monto va en la línea "Saldo a favor en …", que no se suma al
 * total. Sin monto (lo paga el inquilino): solo "Debe" o "Al día".
 */
function Fila({ linea, conMonto = false }: { linea: LineaResumen; conMonto?: boolean }) {
  const { saldo } = linea;
  const debe = saldo !== null && debeSegunPortal(saldo);

  let estado: string;
  if (saldo === null) estado = "ver recibo";
  else if (debe) estado = conMonto ? `Debe ${usd(saldo)}` : "Debe";
  else estado = conMonto && aFavorSegunPortal(saldo) ? "A su favor" : "Al día";

  return (
    <li style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 13.5 }}>
      <Link href={`/mi/${linea.unidadId}/recibo`} style={{ color: "inherit" }}>
        {linea.edificio} · <span className="mono">{linea.codigo}</span>
      </Link>
      <span className={conMonto && debe ? "mono" : undefined} style={{ color: saldo === null ? "var(--tenue)" : debe ? "var(--rojo)" : "var(--verde)" }}>
        {estado}
      </span>
    </li>
  );
}
