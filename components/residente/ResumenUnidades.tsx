import Link from "next/link";
import { Card } from "@/components/ui";
import { usd } from "@/lib/formato";
import { estadoSinMonto } from "@/lib/residente/cuotas";
import { aFavorSegunPortal, debeSegunPortal, type LineaResumen, type ResumenPortal } from "@/lib/residente/resumen";

/**
 * Resumen de quien tiene varias unidades, arriba del selector (caso 31 de
 * docs/casos-de-uso-mejorados.md). No existe en `main`. Las cuentas viven en
 * lib/residente/resumen.ts y en la base (`mis_cuotas()`); acá solo se
 * muestran.
 */
export function ResumenUnidades({ resumen }: { resumen: ResumenPortal }) {
  // Ronda 4 (caso 55): unidades de varias administradoras → un bloque por
  // edificio, cada uno con su total, sin total general. Con una sola
  // administradora, igual que antes.
  if (resumen.porEdificio) {
    return (
      <Card style={{ marginBottom: 16 }}>
        {resumen.porEdificio.map((g, i) => (
          <section
            key={g.edificioId}
            style={i > 0 ? { marginTop: 18, paddingTop: 16, borderTop: "2px solid var(--linea)" } : undefined}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{g.edificio}</div>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>Administra {g.organizacion}</div>
            </div>
            <Bloque pagaUsted={g.pagaUsted} totalDeuda={g.totalDeuda} pagaInquilino={g.pagaInquilino} sinEdificio />
          </section>
        ))}
        <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--tenue)", lineHeight: 1.5 }}>
          Cada edificio se paga aparte, a su propia administración.
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <Bloque pagaUsted={resumen.pagaUsted} totalDeuda={resumen.totalDeuda} pagaInquilino={resumen.pagaInquilino} />
    </Card>
  );
}

/** "Lo que usted paga" con su total, y "Lo paga su inquilino". */
function Bloque({
  pagaUsted,
  totalDeuda,
  pagaInquilino,
  sinEdificio = false,
}: {
  pagaUsted: LineaResumen[];
  totalDeuda: number;
  pagaInquilino: LineaResumen[];
  /** Dentro de un grupo por edificio, el nombre ya está arriba. */
  sinEdificio?: boolean;
}) {
  return (
    <>
      {pagaUsted.length > 0 && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 14 }}>
              Lo que usted paga · {pagaUsted.length} {pagaUsted.length === 1 ? "unidad" : "unidades"}
            </h2>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>{totalDeuda > 0 ? "Total que debe" : "Total"}</div>
              {/* Ronda 9 (B2): sin deuda, «Al día» en gris, como en la tarjeta. */}
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: totalDeuda > 0 ? "var(--rojo)" : "var(--tenue)" }}>
                {totalDeuda > 0 ? usd(totalDeuda) : "Al día"}
              </div>
            </div>
          </div>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {pagaUsted.map((l) => (
              <Fila key={l.unidadId} linea={l} conMonto sinEdificio={sinEdificio} />
            ))}
          </ul>
        </section>
      )}

      {pagaInquilino.length > 0 && (
        <section style={pagaUsted.length > 0 ? { marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--linea)" } : undefined}>
          <h2 style={{ margin: 0, fontSize: 14 }}>Lo paga su inquilino</h2>
          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {pagaInquilino.map((l) => (
              <Fila key={l.unidadId} linea={l} sinEdificio={sinEdificio} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Una unidad.
 *  - Con monto (las que paga él): "Debe $ X", "A favor $ X" o "Al día". El
 *    saldo a favor va en esta misma línea y no se resta del total (ronda 2:
 *    antes la unidad salía dos veces, "A su favor" sin monto y otra línea
 *    "Saldo a favor en …").
 *  - Sin monto (lo paga el inquilino): "Al día" o "Debe N cuotas", de
 *    `mis_cuotas()` — ver lib/residente/cuotas.ts.
 */
function Fila({ linea, conMonto = false, sinEdificio = false }: { linea: LineaResumen; conMonto?: boolean; sinEdificio?: boolean }) {
  const { saldo } = linea;

  let texto: string;
  let color: string;
  let mono = false;
  if (!conMonto) {
    const e = estadoSinMonto(saldo, linea.cuotas);
    texto = e.texto;
    color = saldo === null ? "var(--tenue)" : e.debe ? "var(--rojo)" : "var(--tinta)";
  } else if (saldo === null) {
    texto = "ver recibo";
    color = "var(--tenue)";
  } else if (debeSegunPortal(saldo)) {
    texto = `Debe ${usd(saldo)}`;
    color = "var(--rojo)";
    mono = true;
  } else if (aFavorSegunPortal(saldo)) {
    texto = `A favor ${usd(Math.abs(saldo))}`;
    color = "var(--a-favor)";
    mono = true;
  } else {
    texto = "Al día";
    // Ronda 9 (B2): «Al día» en gris, como en la tarjeta de la unidad.
    color = "var(--tenue)";
  }

  return (
    <li style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", fontSize: 13.5 }}>
      <Link href={`/mi/${linea.unidadId}/recibo`} style={{ color: "inherit" }}>
        {!sinEdificio && <>{linea.edificio} · </>}
        <span className="mono">{linea.codigo}</span>
      </Link>
      <span className={mono ? "mono" : undefined} style={{ color }}>
        {texto}
      </span>
    </li>
  );
}
