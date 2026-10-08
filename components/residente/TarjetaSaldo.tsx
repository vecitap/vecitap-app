import { Card } from "@/components/ui";
import { nf, usd } from "@/lib/formato";
import type { Database } from "@/types/supabase";

type Unidad = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];


/**
 * Portado de la tarjeta de cabecera de Unidad() en index.html:646-675.
 *
 * **Dos tonos, no tres** (index.html:668-671): rojo si debe, verde para
 * todo lo demás — "a favor" y "al día" comparten color, y la comparación
 * es contra cero, sin margen. Entre el 23-sep y el 28-sep esta tarjeta usó
 * 3 tonos y el umbral de `lib/estados-unidad.ts`; el criterio del 28-sep
 * es paridad con `main` también en lo visual, así que se revirtió (ver
 * docs/casos-de-uso-mejorados.md, caso 1). Ronda 2 (08-oct): el saldo a
 * favor dice "A favor" y va en `--a-favor`, un verde sobrio que en el tema
 * oscuro no es el menta de `--verde` (caso 36).
 *
 * `estado` (ronda 2, caso 35): la unidad la paga el inquilino y quien mira
 * es el propietario. La tarjeta muestra solo el estado ("Al día", "Debe 2
 * cuotas"), sin monto — lo mismo que el resumen de arriba.
 */
export function TarjetaSaldo({ unidad, estado }: { unidad: Unidad; estado?: { texto: string; debe: boolean } }) {
  // types/supabase.ts declara `saldo: number` (nunca null) porque el
  // generador de Supabase no marca nullable las columnas de un RETURNS
  // TABLE — pero saldo_visible() (la función detrás de mis_unidades())
  // devuelve NULL a propósito para un inquilino en una unidad con
  // inquilino_ve='mes'. El chequeo de acá es necesario en runtime aunque
  // TypeScript diga que la rama `null` es inalcanzable.
  const saldo = unidad.saldo === null ? null : Number(unidad.saldo);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--tenue)", textTransform: "uppercase", letterSpacing: ".08em" }}>
            {unidad.edificio}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{unidad.codigo}</div>
          <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 2 }}>
            {unidad.relacion === "inquilino" ? "Inquilino" : "Propietario"} · alícuota{" "}
            <span className="mono">{nf(4).format(unidad.alicuota)}%</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {estado ? (
            <>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>Lo paga su inquilino</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: estado.debe ? "var(--rojo)" : "var(--verde)" }}>
                {estado.texto}
              </div>
            </>
          ) : saldo === null ? (
            <div style={{ fontSize: 13, color: "var(--tenue)", maxWidth: 170, lineHeight: 1.5 }}>
              Su administración no muestra el saldo acumulado en esta unidad.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>
                {saldo > 0 ? "Debe" : saldo < 0 ? "A favor" : "Al día"}
              </div>
              <div
                className="mono"
                style={{ fontSize: 26, fontWeight: 700, color: saldo > 0 ? "var(--rojo)" : saldo < 0 ? "var(--a-favor)" : "var(--verde)" }}
              >
                {usd(Math.abs(saldo))}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
