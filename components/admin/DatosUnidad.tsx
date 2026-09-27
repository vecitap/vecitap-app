"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input, Select } from "@/components/ui";
import { num0 } from "@/lib/formato";
import { correoValido } from "@/lib/admin/personas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Unidad, Vinculo } from "@/lib/admin/tipos";

const TRATAMIENTOS = ["Sr.", "Sra.", "Sres.", "Dr.", "Dra.", ""];

type FormPersona = { prefijo: string; nombre: string; documento: string; telefono: string; correo: string; enviar: boolean };

function aForm(v: Vinculo | null): FormPersona {
  return {
    prefijo: v?.personas?.prefijo || "Sr.",
    nombre: v?.personas?.nombre || "",
    documento: v?.personas?.documento || "",
    telefono: v?.personas?.telefono || "",
    correo: v?.personas?.correo || "",
    enviar: v ? v.enviar_corte : true,
  };
}

/** Portado de DatosUnidad() en app.html:2133-2263. */
export function DatosUnidad({
  orgId,
  unidad,
  prop,
  inq,
}: {
  orgId: string;
  unidad: Unidad;
  prop: Vinculo | null;
  inq: Vinculo | null;
}) {
  const router = useRouter();
  const [u, setU] = useState({
    codigo: unidad.codigo,
    alicuota: String(unidad.alicuota),
    saldo: String(unidad.saldo_inicial),
    saldoHon: String(unidad.saldo_inicial_hon),
    activa: unidad.activa,
  });
  const [p, setP] = useState<FormPersona>(aForm(prop));
  const [i, setI] = useState<FormPersona>(aForm(inq));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardarVinculo(tipo: "propietario" | "inquilino", f: FormPersona, actual: Vinculo | null) {
    if (!f.nombre.trim()) return;
    const supabase = crearClienteNavegador();
    const camposPersona = {
      prefijo: f.prefijo || null,
      nombre: f.nombre.trim(),
      documento: f.documento.trim() || null,
      telefono: f.telefono.trim() || null,
      correo: f.correo.trim() || null,
    };

    if (actual?.personas?.id) {
      const { data: dp, error } = await supabase.from("personas").update(camposPersona).eq("id", actual.personas.id).select("id");
      if (error) throw error;
      if (!dp || dp.length === 0) throw new Error(`No se pudo guardar los datos del ${tipo}. Puede ser un permiso.`);

      const { data: dv, error: e2 } = await supabase
        .from("vinculos")
        .update({ enviar_corte: !!f.enviar })
        .eq("id", actual.id)
        .select("id,enviar_corte");
      if (e2) throw e2;
      if (!dv || dv.length === 0) throw new Error(`No se pudo guardar el envío del corte del ${tipo}.`);
      if (dv[0].enviar_corte !== !!f.enviar) throw new Error(`La base guardó otro valor en el envío del corte del ${tipo}.`);
    } else {
      const { data, error } = await supabase.from("personas").insert({ org_id: orgId, ...camposPersona }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("vinculos")
        .insert({ org_id: orgId, unidad_id: unidad.id, persona_id: data.id, tipo, enviar_corte: f.enviar });
      if (e2) throw e2;
    }
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    try {
      const supabase = crearClienteNavegador();
      const { error } = await supabase
        .from("unidades")
        .update({ codigo: u.codigo.trim(), alicuota: num0(u.alicuota), saldo_inicial: num0(u.saldo), saldo_inicial_hon: num0(u.saldoHon), activa: u.activa })
        .eq("id", unidad.id);
      if (error) throw error;
      await guardarVinculo("propietario", p, prop);
      await guardarVinculo("inquilino", i, inq);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setOcupado(false);
  }

  function bloque(titulo: string, f: FormPersona, setF: (f: FormPersona) => void, ayuda: string) {
    const correoMal = !!f.correo && !correoValido(f.correo);
    return (
      <Card>
        <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>{titulo}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--tenue)" }}>{ayuda}</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Campo etiqueta="Tratamiento">
            <Select value={f.prefijo} onChange={(e) => setF({ ...f, prefijo: e.target.value })}>
              {TRATAMIENTOS.map((x) => (
                <option key={x} value={x}>
                  {x || "sin tratamiento"}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Cédula o RIF">
            <Input className="mono" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Input className="mono" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo etiqueta="Correo" error={correoMal ? "Ese correo no se entiende." : undefined}>
              <Input value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} />
            </Campo>
          </div>
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={f.enviar} onChange={(e) => setF({ ...f, enviar: e.target.checked })} />
            Enviarle el corte de cuenta
          </label>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <p style={{ color: "var(--rojo)", fontSize: 13 }}>{error}</p>}
      <Card>
        <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>La unidad</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--tenue)" }}>
          El código sale en el número de cada recibo, así que cambiarlo cambia la numeración de
          los recibos futuros.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Campo etiqueta="Código">
            <Input className="mono" value={u.codigo} onChange={(e) => setU({ ...u, codigo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Alícuota %">
            <Input className="mono" value={u.alicuota} onChange={(e) => setU({ ...u, alicuota: e.target.value })} />
          </Campo>
          <Campo etiqueta="Saldo inicial de condominio" ayuda="Solo cuenta mientras el edificio no tenga ningún mes cerrado.">
            <Input className="mono" value={u.saldo} onChange={(e) => setU({ ...u, saldo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Saldo inicial de administración">
            <Input className="mono" value={u.saldoHon} onChange={(e) => setU({ ...u, saldoHon: e.target.value })} />
          </Campo>
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={u.activa} onChange={(e) => setU({ ...u, activa: e.target.checked })} />
            Unidad activa · una unidad inactiva no se factura, pero conserva su historia
          </label>
        </div>
      </Card>

      {bloque(
        "Propietario",
        p,
        setP,
        "La ley obliga al propietario del momento: quien era dueño en marzo responde por marzo, aunque venda en junio."
      )}
      {bloque("Inquilino", i, setI, "Se registra para poder enviarle el corte, pero la deuda sigue siendo del propietario.")}

      <div>
        <Button type="button" disabled={ocupado} onClick={guardar}>
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
