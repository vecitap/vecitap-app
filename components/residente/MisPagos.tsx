import { Badge, Card } from "@/components/ui";
import { bs, fechaLarga, nf, usd } from "@/lib/formato";
import { estadoPago } from "@/lib/estados-pago";
import type { Database } from "@/types/supabase";

type Pago = Pick<
  Database["public"]["Tables"]["pagos"]["Row"],
  "id" | "fecha" | "monto" | "moneda" | "monto_usd" | "tasa_aplicada" | "metodo" | "referencia" | "banco" | "estado" | "nota"
>;

/** Portado de MisPagos() en residente.html:1104-1138. La base ya decide
 * qué puede ver cada quien (RLS) — no hay filtro extra acá. */
export function MisPagos({ pagos }: { pagos: Pago[] }) {
  if (pagos.length === 0) {
    return (
      <Card>
        <div style={{ color: "var(--tinta-2)", fontSize: 14, lineHeight: 1.6 }}>
          Todavía no ha reportado ningún pago.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {pagos.map((p) => {
        const { etiqueta, tono } = estadoPago(p.estado);
        return (
          <Card key={p.id} style={{ padding: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div className="mono" style={{ fontSize: 17, fontWeight: 700 }}>
                  {p.moneda === "VES" ? bs(p.monto) : usd(p.monto)}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>{fechaLarga(p.fecha)}</div>
                <div style={{ fontSize: 12.5, color: "var(--tenue)", marginTop: 2 }}>
                  {p.metodo}
                  {p.referencia ? ` · ref ${p.referencia}` : ""}
                  {p.banco ? ` · ${p.banco}` : ""}
                </div>
                {p.moneda === "VES" && Number(p.tasa_aplicada) > 0 && (
                  <div style={{ fontSize: 12, color: "var(--tenue)", marginTop: 2 }}>
                    {usd(p.monto_usd)} a la tasa {nf(2).format(p.tasa_aplicada ?? 0)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <Badge tono={tono}>{etiqueta}</Badge>
                {p.estado === "reportado" && (
                  <span style={{ fontSize: 11, color: "var(--tenue)", textAlign: "right", maxWidth: 140, lineHeight: 1.4 }}>
                    Su saldo no cambia hasta que se confirme.
                  </span>
                )}
              </div>
            </div>
            {p.nota && (
              <div
                style={{ marginTop: 12, fontSize: 12.5, color: "var(--tinta-2)", borderTop: "1px solid var(--linea)", paddingTop: 10, lineHeight: 1.55 }}
              >
                {p.nota}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
