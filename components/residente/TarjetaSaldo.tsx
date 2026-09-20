import { Card } from "@/components/ui";
import { nf, usd } from "@/lib/formato";
import { estadoUnidadDesdeSaldo, type EstadoUnidad } from "@/lib/estados-unidad";
import type { Database } from "@/types/supabase";

type Unidad = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

const ETIQUETAS: Record<EstadoUnidad, string> = {
  debe: "Debe",
  a_favor: "A su favor",
  al_dia: "Al día",
};

const COLORES: Record<EstadoUnidad, string> = {
  debe: "var(--rojo)",
  a_favor: "var(--azul)",
  al_dia: "var(--verde)",
};

/**
 * Portado de la tarjeta de cabecera de Unidad() en residente.html:464-491.
 * Nota: el original solo usaba dos colores (rojo si debe, verde para todo
 * lo demás, incluido "a favor"). Acá se reutiliza la paleta de 3 tonos que
 * ya existe en lib/estados-unidad.ts (Fase 3, para el lado admin) para que
 * "a favor" y "al día" no compartan color — es una mejora menor, no un
 * cambio de comportamiento pedido.
 */
export function TarjetaSaldo({ unidad }: { unidad: Unidad }) {
  // types/supabase.ts declara `saldo: number` (nunca null) porque el
  // generador de Supabase no marca nullable las columnas de un RETURNS
  // TABLE — pero saldo_visible() (la función detrás de mis_unidades())
  // devuelve NULL a propósito para un inquilino en una unidad con
  // inquilino_ve='mes'. El chequeo de acá es necesario en runtime aunque
  // TypeScript diga que la rama `null` es inalcanzable.
  const estado = unidad.saldo === null ? null : estadoUnidadDesdeSaldo(unidad.saldo);

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
          {estado === null ? (
            <div style={{ fontSize: 13, color: "var(--tenue)", maxWidth: 170, lineHeight: 1.5 }}>
              Su administración no muestra el saldo acumulado en esta unidad.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "var(--tenue)" }}>{ETIQUETAS[estado]}</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: COLORES[estado] }}>
                {usd(Math.abs(Number(unidad.saldo)))}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
