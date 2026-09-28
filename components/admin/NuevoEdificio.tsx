"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input } from "@/components/ui";
import { num0 } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Portado de NuevoEdificio() en admin.html:6033-6069 (mismos 3 campos
 * visibles que el original — nombre, prefijo, mora; la tolerancia va en
 * `0,01` por omisión sin pedirla, y no pide RIF ni dirección a diferencia
 * de PrimerEdificio: así está en `main`, no es una omisión de la
 * migración).
 *
 * Se abre desde Ajustes, igual que en el original. Entre el 27-sep y este
 * bloque estuvo colgado del selector de edificio porque Ajustes no estaba
 * portado (caso 21 de docs/casos-de-uso-mejorados.md); con Ajustes ya
 * construido vuelve a su lugar.
 *
 * El padre lo monta solo cuando hay que mostrarlo, igual que el original.
 * Mismo patrón de overlay que AltaUnidad.tsx (no el <dialog> nativo de
 * Confirmar.tsx): consistencia dentro del módulo Admin, donde todos los
 * formularios modales ya usan ese patrón.
 */
export function NuevoEdificio({ orgId, onCerrar }: { orgId: string; onCerrar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", prefijo: "", mora: "0", tolerancia: "0,01" });
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function crear() {
    if (!f.nombre.trim() || !f.prefijo.trim()) return setError("Hacen falta el nombre y el prefijo.");
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase
      .from("edificios")
      .insert({
        org_id: orgId,
        nombre: f.nombre.trim(),
        prefijo_recibo: f.prefijo.trim().toUpperCase(),
        interes_mora: num0(f.mora),
        tolerancia_alicuota: num0(f.tolerancia) || 0.01,
        honorario_monto: 0,
      })
      .select("id")
      .single();
    setOcupado(false);
    if (e) return setError(e.message);
    onCerrar();
    router.push(`/admin/${orgId}/${data.id}/inicio`);
    router.refresh();
  }

  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(7,12,28,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--lienzo)",
          borderRadius: "var(--radio)",
          maxWidth: 500,
          width: "100%",
          boxShadow: "var(--sombra-alta)",
          padding: 26,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 4, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Otro edificio</h2>
        <p style={{ fontSize: 12.5, color: "var(--tinta-2)", margin: "0 0 14px" }}>
          Cada edificio lleva sus propias unidades, sus cobros y su numeración de recibos.
        </p>
        {error && <p style={{ color: "var(--rojo)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo etiqueta="Nombre">
              <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
            </Campo>
          </div>
          <Campo etiqueta="Prefijo del recibo">
            <Input className="mono" value={f.prefijo} onChange={(e) => set("prefijo", e.target.value)} placeholder="CON2" />
          </Campo>
          <Campo etiqueta="Interés de mora %">
            <Input className="mono" value={f.mora} onChange={(e) => set("mora", e.target.value)} />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <Button type="button" variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" disabled={ocupado} onClick={crear}>
            Crear
          </Button>
        </div>
      </div>
    </div>
  );
}
