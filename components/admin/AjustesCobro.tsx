"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, EstadoGuardado, Select } from "@/components/ui";
import { useAccion } from "@/hooks/useAccion";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { REDONDEOS, type AjustesCobro as Ajustes, type Redondeo } from "@/lib/cobro-opciones";

/**
 * «Cómo cobra la administradora» (ronda 7): opciones de toda la organización,
 * no de un edificio. Bloque 4: cobrar solo en dólares. Bloque 6: redondear la
 * cuota al cerrar el mes (siempre hacia arriba; la diferencia va al fondo de
 * reserva). Lo aplica `cerrar_periodo()`: no cambia meses ya cerrados.
 */
export function AjustesCobro({ orgId, ajustes }: { orgId: string; ajustes: Ajustes }) {
  const router = useRouter();
  const [soloUsd, setSoloUsd] = useState(ajustes.soloUsd);
  const [redondeo, setRedondeo] = useState<Redondeo>(ajustes.redondeo);
  const cambiado = soloUsd !== ajustes.soloUsd || redondeo !== ajustes.redondeo;

  const guardar = useAccion(async () => {
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("ajustes_cobro")
      .upsert({ org_id: orgId, solo_usd: soloUsd, redondeo, actualizado_en: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw error;
    router.refresh();
  });

  return (
    <Card>
      <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cómo cobra la administradora</h2>
      <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>Vale para todos los edificios de la administradora.</p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={soloUsd} onChange={(e) => setSoloUsd(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
        <span>
          <b>Cobrar solo en dólares</b>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--tinta-2)", lineHeight: 1.5 }}>
            Encendido, no se muestran bolívares en el recibo impreso, en el portal ni en el correo del recibo, y el
            propietario solo puede reportar pagos en dólares. Apagado, todo sigue como hoy.
          </span>
        </span>
      </label>

      <div style={{ marginTop: 16, maxWidth: 360 }}>
        <Campo
          etiqueta="Redondeo de las cuotas"
          ayuda="Al cerrar el mes, lo que se emite a cada unidad se redondea siempre hacia arriba. La diferencia sale en el recibo como «Fondo de reserva por redondeo». No cambia los meses ya cerrados."
        >
          <Select value={redondeo} onChange={(e) => setRedondeo(e.target.value as Redondeo)}>
            {Object.entries(REDONDEOS).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Button type="button" cargando={guardar.enviando} disabled={!cambiado} onClick={() => guardar.ejecutar()}>
          Guardar
        </Button>
        <EstadoGuardado estado={guardar.estado} error={guardar.error} />
      </div>
    </Card>
  );
}
