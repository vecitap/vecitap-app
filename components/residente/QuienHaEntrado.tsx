import { Card } from "@/components/ui";
import { fechaHora } from "@/lib/formato";
import type { Database } from "@/types/supabase";

type FilaVisita = Database["public"]["Functions"]["mis_visitas"]["Returns"][number];

/**
 * Portado de la sección "Quién ha entrado" de Visitas() en
 * index.html:1090-1112 — solo lectura (`mis_visitas`), no depende de
 * `crear_invitacion_visita`/`anular_invitacion_visita`.
 */
export function QuienHaEntrado({ visitas }: { visitas: FilaVisita[] }) {
  return (
    <Card>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Quién ha entrado</h3>
      {visitas.length === 0 ? (
        <div style={{ fontSize: 13.5, color: "var(--tenue)" }}>Todavía no hay visitas registradas.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visitas.map((v, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                background: "var(--fondo)",
                borderRadius: 10,
                padding: "11px 13px",
              }}
            >
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.nombre}</div>
                <div style={{ fontSize: 12, color: "var(--tenue)" }}>
                  {fechaHora(v.entrada_en)}
                  {v.placa ? ` · ${v.placa}` : ""}
                  {v.tipo === "anunciada" ? " · anunciada" : " · sin anunciar"}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: v.estado === "dentro" ? "var(--ambar)" : "var(--tenue)" }}>
                {v.estado === "dentro" ? "Adentro" : "Salió " + fechaHora(v.salida_en)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
