import Link from "next/link";
import { Card } from "@/components/ui";
import { pct, usd } from "@/lib/formato";
import { contarPorEstadoUnidad, tonoEstadoUnidad } from "@/lib/estados-unidad";
import type { SaldoActual } from "@/lib/admin/tipos";

const TONO_COLOR: Record<string, { bg: string; borde: string; texto: string }> = {
  verde: { bg: "var(--verde-bg)", borde: "var(--verde)", texto: "var(--verde)" },
  rojo: { bg: "var(--rojo-bg)", borde: "var(--rojo)", texto: "var(--rojo)" },
  azul: { bg: "var(--azul-bg)", borde: "var(--azul)", texto: "var(--azul)" },
};

/** Un punto de color en vez de un borde grueso — mismo criterio que Punto() en components/operador/ConsolaOperador.tsx. */
function Punto({ color }: { color: string }) {
  return (
    <span
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: color, marginRight: 7 }}
    />
  );
}

/**
 * Portado de Edificio() en app.html:619-689 — cuadrícula de unidades por
 * estado. Usa `estado` de `saldos_actuales` (ya calculado por la base),
 * no un umbral recalculado a mano (ver docs/inventario-admin.md 5f). Sin
 * la animación de hover al pasar el mouse del original (JS de
 * translateY/box-shadow): un Server Component no puede llevar
 * manejadores de evento — queda como pendiente cosmético, no funcional.
 */
export function Edificio({
  saldos,
  sumaAlicuotas,
  tolerancia,
  hrefUnidad,
}: {
  saldos: SaldoActual[];
  sumaAlicuotas: number;
  tolerancia: number | null | undefined;
  hrefUnidad: (unidadId: string) => string;
}) {
  const cuadra = Math.abs(sumaAlicuotas - 100) <= (tolerancia ?? 0.01);
  const cuenta = contarPorEstadoUnidad(saldos.map((s) => ({ estado: s.estado ?? "" })));

  return (
    <Card>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>El edificio</h2>
      <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--tenue)" }}>
        Cada bloque es una unidad. Haga clic para ver su cuenta.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
        {saldos.filter((u): u is SaldoActual & { unidad_id: string } => !!u.unidad_id).map((u) => {
          const unidadId = u.unidad_id;
          const tono = tonoEstadoUnidad(u.estado ?? "");
          const c = TONO_COLOR[tono] ?? TONO_COLOR.verde;
          const total = Number(u.total) || 0;
          return (
            <Link
              key={unidadId}
              href={hrefUnidad(unidadId)}
              title={`${u.codigo} · ${usd(total)}`}
              style={{
                minWidth: 62,
                padding: "9px 6px",
                borderRadius: "var(--radio-chico)",
                textAlign: "center",
                background: c.bg,
                border: `1px solid ${c.borde}`,
                textDecoration: "none",
              }}
            >
              <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: c.texto }}>
                {u.codigo || "—"}
              </div>
              <div style={{ fontSize: 10, color: c.texto, opacity: 0.75, marginTop: 2 }}>
                {Math.abs(total) < 0.01 ? "al día" : usd(total)}
              </div>
            </Link>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
        <span>
          <Punto color="var(--verde)" />
          {cuenta.al_dia} al día
        </span>
        <span>
          <Punto color="var(--rojo)" />
          {cuenta.debe} con deuda
        </span>
        {cuenta.a_favor > 0 && (
          <span>
            <Punto color="var(--azul)" />
            {cuenta.a_favor} con saldo a favor
          </span>
        )}
        <span
          className="mono"
          style={{ marginLeft: "auto", fontWeight: 600, color: cuadra ? "var(--tenue)" : "var(--rojo)" }}
        >
          alícuotas {pct(sumaAlicuotas)}
        </span>
      </div>

      {!cuadra && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--rojo)" }}>
          Las alícuotas no suman 100% — faltan {pct(100 - sumaAlicuotas)} puntos, más de la
          tolerancia del edificio ({pct(tolerancia ?? 0.01)}). Mientras no cuadre, el cierre del
          mes va a ser rechazado. Corríjalo en Propietarios.
        </p>
      )}
    </Card>
  );
}
