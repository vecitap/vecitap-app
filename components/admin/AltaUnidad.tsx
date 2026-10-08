"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Input, Select } from "@/components/ui";
import { num0, numeroMalEscrito } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";

const TRATAMIENTOS = ["Sr.", "Sra.", "Sres.", "Dr.", "Dra.", ""];

/** Portado de AltaUnidad() en app.html:1567-1648. */
export function AltaUnidad({
  orgId,
  edificioId,
  onCerrar,
}: {
  orgId: string;
  edificioId: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    codigo: "",
    alicuota: "",
    saldo: "",
    saldoHon: "",
    prefijo: "Sr.",
    nombre: "",
    documento: "",
    telefono: "",
    correo: "",
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function crear() {
    if (!f.codigo.trim()) return setError("Falta el código de la unidad.");
    const malEscrito = numeroMalEscrito([
      ["La alícuota", f.alicuota],
      ["El saldo inicial de condominio", f.saldo],
      ["El saldo inicial de administración", f.saldoHon],
    ]);
    if (malEscrito) return setError(malEscrito);
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();

    const { data: u, error: e1 } = await supabase
      .from("unidades")
      .insert({
        org_id: orgId,
        edificio_id: edificioId,
        codigo: f.codigo.trim(),
        alicuota: num0(f.alicuota),
        saldo_inicial: num0(f.saldo),
        saldo_inicial_hon: num0(f.saldoHon),
      })
      .select("id")
      .single();
    if (e1) {
      setOcupado(false);
      return setError(e1.message);
    }

    if (f.nombre.trim()) {
      const { data: p, error: e2 } = await supabase
        .from("personas")
        .insert({
          org_id: orgId,
          prefijo: f.prefijo || null,
          nombre: f.nombre.trim(),
          documento: f.documento.trim() || null,
          telefono: f.telefono.trim() || null,
          correo: f.correo.trim() || null,
        })
        .select("id")
        .single();
      if (e2) {
        setOcupado(false);
        return setError(e2.message);
      }
      const { error: e3 } = await supabase
        .from("vinculos")
        .insert({ org_id: orgId, unidad_id: u.id, persona_id: p.id, tipo: "propietario" });
      if (e3) {
        setOcupado(false);
        return setError(e3.message);
      }
    }

    setOcupado(false);
    onCerrar();
    router.refresh();
  }

  return (
    <div
      onClick={onCerrar}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        // rgba de --tinta oscuro (paleta actualizada 27-sep, ver
        // app/globals.css) — este overlay no puede leer la variable CSS
        // porque necesita opacidad propia, distinta del token.
        background: "rgba(10,17,40,.55)",
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
          maxWidth: 560,
          width: "100%",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "var(--sombra-alta)",
          padding: 26,
        }}
      >
        <h2 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Nueva unidad</h2>
        <p style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: -6 }}>
          La alícuota es el porcentaje del gasto que le toca a esta unidad.
        </p>
        {error && <p style={{ color: "var(--rojo)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Campo etiqueta="Código">
            <Input className="mono" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="01A" />
          </Campo>
          <Campo etiqueta="Alícuota %">
            <Input className="mono" value={f.alicuota} onChange={(e) => set("alicuota", e.target.value)} placeholder="2,41144" />
          </Campo>
          <Campo etiqueta="Saldo inicial de condominio" ayuda="Lo que arrastra del sistema anterior.">
            <Input className="mono" value={f.saldo} onChange={(e) => set("saldo", e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo etiqueta="Saldo inicial de administración">
            <Input className="mono" value={f.saldoHon} onChange={(e) => set("saldoHon", e.target.value)} placeholder="0,00" />
          </Campo>
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--linea)", paddingTop: 14 }}>
            <span style={{ fontSize: 12.5, color: "var(--tinta-2)", fontWeight: 600 }}>Propietario (opcional)</span>
          </div>
          <Campo etiqueta="Tratamiento">
            <Select value={f.prefijo} onChange={(e) => set("prefijo", e.target.value)}>
              {TRATAMIENTOS.map((p) => (
                <option key={p} value={p}>
                  {p || "sin tratamiento"}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Nombre">
            <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} />
          </Campo>
          <Campo etiqueta="Cédula o RIF">
            <Input className="mono" value={f.documento} onChange={(e) => set("documento", e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Input className="mono" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="0414-1234567" />
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo etiqueta="Correo">
              <Input value={f.correo} onChange={(e) => set("correo", e.target.value)} />
            </Campo>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20, flexWrap: "wrap" }}>
          <Button type="button" variante="secundario" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="button" cargando={ocupado} onClick={crear}>
            Registrar
          </Button>
        </div>
      </div>
    </div>
  );
}
