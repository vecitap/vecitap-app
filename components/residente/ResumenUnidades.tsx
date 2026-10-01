import Link from "next/link";
import { Card } from "@/components/ui";
import { usd } from "@/lib/formato";
import { debeSegunPortal, type LineaResumen, type ResumenPropietario } from "@/lib/residente/resumen";

/**
 * Resumen del propietario con varias unidades, arriba del selector (caso 31
 * de docs/casos-de-uso-mejorados.md). No existe en `main`. Las cuentas viven
 * en lib/residente/resumen.ts; acá solo se muestran.
 */
export function ResumenUnidades({ resumen }: { resumen: ResumenPropietario }) {
  const { pagaUsted, totalDeuda, pagaInquilino } = resumen;

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
          {pagaUsted.some((l) => l.saldo !== null && l.saldo < 0) && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--tenue)", lineHeight: 1.5 }}>
              Un saldo a favor queda en su unidad: no se descuenta del total de las otras.
            </p>
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

function Fila({ linea, conMonto = false }: { linea: LineaResumen; conMonto?: boolean }) {
  const { saldo } = linea;
  const debe = saldo !== null && debeSegunPortal(saldo);

  let estado: string;
  if (saldo === null) estado = "ver recibo";
  else if (!conMonto) estado = debe ? "Debe" : "Al día";
  else estado = debe ? `Debe ${usd(saldo)}` : saldo < 0 ? `A su favor ${usd(Math.abs(saldo))}` : "Al día";

  return (
    <li style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 13.5 }}>
      <Link href={`/mi/${linea.unidadId}/recibo`} style={{ color: "inherit" }}>
        {linea.edificio} · <span className="mono">{linea.codigo}</span>
      </Link>
      <span className={conMonto && saldo !== null ? "mono" : undefined} style={{ color: saldo === null ? "var(--tenue)" : debe ? "var(--rojo)" : "var(--verde)" }}>
        {estado}
      </span>
    </li>
  );
}
