"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Button, Campo, Card, Confirmar, EstadoGuardado, Input, Select } from "@/components/ui";
import { useAccion } from "@/hooks/useAccion";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { DESTINOS_PAGO, TIPOS_PAGO, etiquetaCuenta, type CuentaPago } from "@/lib/datos-pago";
import { mensajeDeError } from "@/lib/errores";

type Banco = { codigo: string; nombre: string };

const VACIA = { destino: "condominio", tipo: "transferencia", banco: "", titular: "", documento: "", cuenta: "", nota: "" };

/**
 * «Datos para pagar» del edificio, en Ajustes (ronda 7, bloque 2, caso 80).
 * Lo que se carga aquí sale junto al monto en el portal del propietario, en
 * el recibo impreso y en el correo del recibo. Una tarjeta por cuenta, en
 * una columna: se usa igual desde el teléfono.
 */
export function DatosPago({ orgId, edificioId, cuentas, bancos }: { orgId: string; edificioId: string; cuentas: CuentaPago[]; bancos: Banco[] }) {
  const router = useRouter();
  const [nueva, setNueva] = useState(VACIA);
  const [borrar, setBorrar] = useState<CuentaPago | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agregar = useAccion(async () => {
    if (!nueva.cuenta.trim() && !nueva.nota.trim()) {
      setError("Escriba el número de cuenta (o el teléfono del pago móvil), o una nota que diga cómo pagar.");
      return false;
    }
    setError(null);
    const supabase = crearClienteNavegador();
    // El orden sale de la base: si se agregan dos seguidas, la lista de
    // `cuentas` todavía no se refrescó (validación de la ronda 7).
    const { count } = await supabase.from("datos_pago").select("id", { count: "exact", head: true }).eq("edificio_id", edificioId);
    const { error: e } = await supabase.from("datos_pago").insert({
      org_id: orgId,
      edificio_id: edificioId,
      destino: nueva.destino,
      tipo: nueva.tipo,
      banco: nueva.banco.trim() || null,
      titular: nueva.titular.trim() || null,
      documento: nueva.documento.trim() || null,
      cuenta: nueva.cuenta.trim() || null,
      nota: nueva.nota.trim() || null,
      orden: (count ?? cuentas.length) + 1,
    });
    if (e) throw e;
    setNueva(VACIA);
    router.refresh();
  });

  async function eliminar() {
    if (!borrar?.id) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("datos_pago").delete().eq("id", borrar.id);
    setBorrar(null);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  const sinHonorarios = !cuentas.some((c) => c.destino === "honorarios");

  return (
    <Card>
      <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Datos para pagar</h2>
      <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
        Las cuentas de este edificio. Salen junto al monto en el portal del propietario, en el recibo impreso y en el
        correo del recibo. El honorario de administración va a la cuenta de honorarios; todo lo demás, a la del
        condominio.{sinHonorarios ? " Si no carga una cuenta de honorarios, todo se paga en la del condominio." : ""}
      </p>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono="rojo" titulo="No se pudo guardar">
            {error}
          </Aviso>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {cuentas.map((c) => (
          <FilaCuenta
            key={`${c.id}:${c.destino}:${c.tipo}:${c.banco}:${c.titular}:${c.documento}:${c.cuenta}:${c.nota}`}
            cuenta={c}
            bancos={bancos}
            onBorrar={() => setBorrar(c)}
          />
        ))}
        {!cuentas.length && <p style={{ fontSize: 13, color: "var(--tenue)", margin: 0 }}>Todavía no hay datos para pagar.</p>}
      </div>

      <div style={{ borderTop: "1px solid var(--linea)", marginTop: 16, paddingTop: 14 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Agregar una cuenta</h3>
        <CamposCuenta valor={nueva} bancos={bancos} onChange={(v) => setNueva(v)} />
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Button type="button" cargando={agregar.enviando} onClick={() => agregar.ejecutar()}>
            <Plus size={15} /> Agregar
          </Button>
          <EstadoGuardado estado={agregar.estado} error={agregar.error} texto="Agregada" />
        </div>
      </div>

      {borrar && (
        <Confirmar
          titulo="Quitar esta cuenta"
          texto={`Deja de salir en el portal, en los recibos y en los correos que se envíen de ahora en adelante.`}
          boton="Quitar"
          tono="peligro"
          onSi={eliminar}
          onNo={() => setBorrar(null)}
        />
      )}
    </Card>
  );
}

type Valor = typeof VACIA;

function CamposCuenta({ valor: v, bancos, onChange }: { valor: Valor; bancos: Banco[]; onChange: (v: Valor) => void }) {
  const enLista = !v.banco || bancos.some((b) => b.nombre === v.banco);
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
      <Campo etiqueta="Para pagar">
        <Select value={v.destino} onChange={(e) => onChange({ ...v, destino: e.target.value })}>
          {Object.entries(DESTINOS_PAGO).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Tipo">
        <Select value={v.tipo} onChange={(e) => onChange({ ...v, tipo: e.target.value })}>
          {Object.entries(TIPOS_PAGO).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo etiqueta="Banco">
        <Select value={enLista ? v.banco : "__otro"} onChange={(e) => onChange({ ...v, banco: e.target.value === "__otro" ? " " : e.target.value })}>
          <option value="">—</option>
          {bancos.map((b) => (
            <option key={b.codigo} value={b.nombre}>
              {b.nombre}
            </option>
          ))}
          <option value="__otro">Otro…</option>
        </Select>
        {!enLista && <Input value={v.banco.trimStart()} onChange={(e) => onChange({ ...v, banco: e.target.value })} placeholder="Nombre del banco" style={{ marginTop: 6 }} />}
      </Campo>
      <Campo etiqueta="Titular">
        <Input value={v.titular} onChange={(e) => onChange({ ...v, titular: e.target.value })} />
      </Campo>
      <Campo etiqueta="RIF o cédula">
        <Input className="mono" value={v.documento} onChange={(e) => onChange({ ...v, documento: e.target.value })} />
      </Campo>
      <Campo etiqueta={etiquetaCuenta(v.tipo)}>
        <Input
          className="mono"
          inputMode={v.tipo === "pago_movil" ? "tel" : "numeric"}
          value={v.cuenta}
          onChange={(e) => onChange({ ...v, cuenta: e.target.value })}
        />
      </Campo>
      <div style={{ gridColumn: "1 / -1" }}>
        <Campo etiqueta="Nota (opcional)" ayuda="Por ejemplo: «Indique la unidad en el concepto».">
          <Input value={v.nota} onChange={(e) => onChange({ ...v, nota: e.target.value })} maxLength={300} />
        </Campo>
      </div>
    </div>
  );
}

function FilaCuenta({ cuenta: c, bancos, onBorrar }: { cuenta: CuentaPago; bancos: Banco[]; onBorrar: () => void }) {
  const router = useRouter();
  const inicial: Valor = {
    destino: c.destino,
    tipo: c.tipo,
    banco: c.banco ?? "",
    titular: c.titular ?? "",
    documento: c.documento ?? "",
    cuenta: c.cuenta ?? "",
    nota: c.nota ?? "",
  };
  const [v, setV] = useState(inicial);
  const cambiado = JSON.stringify(v) !== JSON.stringify(inicial);
  const guardar = useAccion(async () => {
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("datos_pago")
      .update({
        destino: v.destino,
        tipo: v.tipo,
        banco: v.banco.trim() || null,
        titular: v.titular.trim() || null,
        documento: v.documento.trim() || null,
        cuenta: v.cuenta.trim() || null,
        nota: v.nota.trim() || null,
      })
      .eq("id", c.id!);
    if (error) throw error;
    router.refresh();
  });
  return (
    <div style={{ border: "1px solid var(--linea)", borderRadius: "var(--radio-chico)", padding: 12 }}>
      <CamposCuenta valor={v} bancos={bancos} onChange={setV} />
      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Button type="button" mini cargando={guardar.enviando} disabled={!cambiado} onClick={() => guardar.ejecutar()}>
          Guardar
        </Button>
        <EstadoGuardado estado={guardar.estado} error={guardar.error} />
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onBorrar} title="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
