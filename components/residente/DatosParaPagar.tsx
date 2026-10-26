"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { usd } from "@/lib/formato";
import { etiquetaCuenta, gruposDePago, tipoPago, type CuentaPago } from "@/lib/datos-pago";

/**
 * «Datos para pagar» en el portal (ronda 7, bloque 2, caso 80), debajo del
 * saldo. Los datos y cuánto va a cada cuenta salen de `datos_pago_de()`: la
 * base reparte el saldo de hoy (el honorario a la cuenta de honorarios, lo
 * demás a la del condominio). `monto` null = la base no le muestra el saldo
 * a quien mira; entonces van solo las cuentas.
 */
export function DatosParaPagar({ filas }: { filas: (CuentaPago & { monto: number | null })[] }) {
  if (!filas.length) return null;
  const montoDe = (destino: string) => filas.find((f) => (destino === "honorarios" ? f.destino === "honorarios" : f.destino !== "honorarios"))?.monto ?? null;
  const conMonto = filas.some((f) => f.monto !== null);
  const reparto = conMonto ? { condominio: Number(montoDe("condominio") ?? 0), honorarios: Number(montoDe("honorarios") ?? 0) } : null;
  const grupos = gruposDePago(filas, reparto);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "var(--tenue)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Datos para pagar</div>
      {grupos.map((g) => (
        <div key={g.destino} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            {g.titulo}
            {g.monto !== null && grupos.length > 1 && <span className="mono"> · {usd(g.monto)}</span>}
          </div>
          {g.cuentas.map((c, i) => (
            <div key={c.id ?? i} style={{ fontSize: 13, lineHeight: 1.55, padding: "7px 0", borderTop: i ? "1px solid var(--linea)" : undefined }}>
              <b>{tipoPago(c.tipo)}</b>
              {c.banco ? ` · ${c.banco}` : ""}
              {c.titular && <div>Titular: {c.titular}</div>}
              {c.documento && (
                <div>
                  RIF/CI: <span className="mono">{c.documento}</span> <Copiar texto={c.documento} />
                </div>
              )}
              {c.cuenta && (
                <div>
                  {etiquetaCuenta(c.tipo)}: <span className="mono" style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{c.cuenta}</span> <Copiar texto={c.cuenta} />
                </div>
              )}
              {c.nota && <div style={{ color: "var(--tenue)" }}>{c.nota}</div>}
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

function Copiar({ texto }: { texto: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto.replace(/\s+/g, "")).then(
          () => {
            setListo(true);
            setTimeout(() => setListo(false), 1500);
          },
          () => {}
        );
      }}
      style={{ border: "1px solid var(--linea)", background: "transparent", borderRadius: 6, padding: "1px 7px", fontSize: 11.5, color: "var(--tinta-2)", cursor: "pointer" }}
    >
      {listo ? "Copiado" : "Copiar"}
    </button>
  );
}
