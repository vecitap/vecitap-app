"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { num0 } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/** Portado de PrimerEdificio() en app.html:1292-1343. */
export function PrimerEdificio({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", prefijo: "CON1", mora: "0", tolerancia: "0,01", rif: "", direccion: "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function crear() {
    if (!f.nombre.trim()) return setError("Falta el nombre del edificio.");
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase
      .from("edificios")
      .insert({
        org_id: orgId,
        nombre: f.nombre.trim(),
        rif: f.rif.trim() || null,
        direccion: f.direccion.trim() || null,
        prefijo_recibo: (f.prefijo.trim() || "CON1").toUpperCase(),
        interes_mora: num0(f.mora),
        tolerancia_alicuota: num0(f.tolerancia) || 0.01,
        honorario_monto: 0,
      })
      .select("id")
      .single();
    setOcupado(false);
    if (e) return setError(mensajeDeError(e));
    // Bloque D (08-oct): sin refresh(), el layout de la organización (lateral
    // y selector de edificios) seguía sin el edificio nuevo, y parecía que
    // "no se había guardado". NuevoEdificio.tsx ya lo hacía.
    router.push(`/admin/${orgId}/${data.id}/inicio`);
    router.refresh();
  }

  return (
    <Card style={{ maxWidth: 620, width: "100%" }}>
      <h2 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Registre su primer edificio</h2>
      <p style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: -6 }}>
        Un edificio, una urbanización de casas o un centro de oficinas: para el sistema es lo mismo.
      </p>
      {error && <p style={{ color: "var(--rojo)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo etiqueta="Nombre">
            <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Residencias Ejemplo" />
          </Campo>
        </div>
        <Campo etiqueta="Prefijo del recibo" ayuda="Único dentro de la administradora. Sale en cada número de recibo.">
          <Input className="mono" value={f.prefijo} onChange={(e) => set("prefijo", e.target.value)} />
        </Campo>
        <Campo etiqueta="Interés de mora mensual %" ayuda="Cero si el condominio no cobra intereses.">
          <Input className="mono" value={f.mora} onChange={(e) => set("mora", e.target.value)} />
        </Campo>
        <Campo etiqueta="Tolerancia de alícuotas" ayuda="Los documentos de condominio rara vez suman 100 exacto. 0,01 es un margen razonable.">
          <Input className="mono" value={f.tolerancia} onChange={(e) => set("tolerancia", e.target.value)} />
        </Campo>
        <Campo etiqueta="RIF (opcional)">
          <Input className="mono" value={f.rif} onChange={(e) => set("rif", e.target.value)} />
        </Campo>
        <div style={{ gridColumn: "1 / -1" }}>
          <Campo etiqueta="Dirección (opcional)">
            <Input value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </Campo>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        <Button type="button" cargando={ocupado} onClick={crear}>
          Crear edificio
        </Button>
      </div>
    </Card>
  );
}
