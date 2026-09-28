"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Badge, Button, Campo, Confirmar, Input, Select, type TonoBadge } from "@/components/ui";
import { num0 } from "@/lib/formato";
import { BOLSILLOS, MODOS_COBRO } from "@/lib/admin/constantes";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ConceptoCobro } from "@/lib/admin/tipos";
import type { Database } from "@/types/supabase";

type ActualizarConcepto = Database["public"]["Tables"]["conceptos_cobro"]["Update"];

const TONO_BOLSILLO: Record<string, TonoBadge> = { condominio: "neutro", administracion: "azul", servicio: "marca" };

/**
 * Portado de Cobros() en app.html:2271-2427. A diferencia del original
 * (defaultValue + onBlur sobre un input no controlado, ver
 * docs/inventario-admin.md 5a), cada campo editable es un input
 * controlado (`FilaConcepto`, más abajo). En vez de mantener una copia
 * local de toda la lista sincronizada con un efecto (patrón que este
 * proyecto no permite, ver eslint-plugin-react-hooks), se renderiza
 * directo desde la prop `conceptos` y cada fila se remonta con `key`
 * cuando su valor guardado cambia — el reset de estado al cambiar una
 * prop que React recomienda (https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes).
 */
export function Cobros({
  orgId,
  edificioId,
  conceptos,
}: {
  orgId: string;
  edificioId: string;
  conceptos: ConceptoCobro[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState({ nombre: "", bolsillo: "condominio", modo: "presupuesto_alicuota", monto: "0", iva: "0" });
  const [borrar, setBorrar] = useState<ConceptoCobro | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function editar(id: string, campos: ActualizarConcepto) {
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").update(campos).eq("id", id);
    if (e) return setError(e.message);
    router.refresh();
  }

  async function agregar() {
    if (!nuevo.nombre.trim()) return setError("Falta el nombre.");
    setError(null);
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").insert({
      org_id: orgId,
      edificio_id: edificioId,
      nombre: nuevo.nombre.trim(),
      bolsillo: nuevo.bolsillo,
      modo: nuevo.modo,
      monto: num0(nuevo.monto),
      iva: num0(nuevo.iva),
      orden: 5,
    });
    if (e) return setError(e.message);
    setNuevo({ ...nuevo, nombre: "", monto: "0" });
    router.refresh();
  }

  async function eliminar() {
    if (!borrar) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").delete().eq("id", borrar.id);
    setBorrar(null);
    if (e) return setError(e.message);
    router.refresh();
  }

  const usaPresupuesto = conceptos.some((c) => c.activo && c.modo.startsWith("presupuesto"));
  const usaGasto = conceptos.some((c) => c.activo && c.modo.startsWith("gasto"));

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {error && (
        <Aviso tono="rojo" titulo="No se pudo guardar">
          {error}
        </Aviso>
      )}

      <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
        <div style={{ padding: "18px 18px 0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Qué se le cobra a cada unidad</h2>
          <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
            Todo lo que aparece en el recibo sale de esta lista. Agregar un cobro nuevo es agregar
            una fila, no programar.
          </p>
          {!conceptos.some((c) => c.activo) && (
            <div style={{ marginBottom: 14 }}>
              <Aviso tono="rojo" titulo="Sin cobros activos el mes no se puede cerrar">
                Un edificio necesita al menos un cobro encendido.
              </Aviso>
            </div>
          )}
          {usaPresupuesto && usaGasto && (
            <div style={{ marginBottom: 14 }}>
              <Aviso tono="ambar" titulo="Este edificio mezcla presupuesto y gasto ejecutado">
                Se puede hacer, pero conviene revisarlo: normalmente un condominio cobra de una
                forma o de la otra, no de las dos a la vez.
              </Aviso>
            </div>
          )}
        </div>

        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre en el recibo</th>
                <th>Bolsillo</th>
                <th>Cómo se calcula</th>
                <th style={{ textAlign: "right" }}>Monto o %</th>
                <th style={{ textAlign: "right" }}>IVA %</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c) => (
                <FilaConcepto key={`${c.id}:${c.nombre}:${c.monto}:${c.iva}`} concepto={c} onEditar={editar} onEliminar={() => setBorrar(c)} />
              ))}
            </tbody>
          </table>
        </div>

        {conceptos.some((c) => c.bolsillo === "servicio") && (
          <div style={{ padding: "0 18px 18px" }}>
            <p style={{ fontSize: 12, color: "var(--tenue)" }}>
              El cobro del servicio lo define Vecitap desde su consola y no se puede editar ni
              apagar desde aquí. Aparece en el recibo para que el propietario sepa qué paga.
            </p>
          </div>
        )}
      </div>

      <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Agregar un cobro</h2>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
          Un fondo de reserva, una cuota extraordinaria, vigilancia adicional: todo se modela
          igual.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr 2fr 1fr 1fr auto", alignItems: "end" }}>
          <Campo etiqueta="Nombre en el recibo">
            <Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Fondo de reserva" />
          </Campo>
          <Campo etiqueta="Bolsillo">
            <Select value={nuevo.bolsillo} onChange={(e) => setNuevo({ ...nuevo, bolsillo: e.target.value })}>
              <option value="condominio">Condominio</option>
              <option value="administracion">Administración</option>
            </Select>
          </Campo>
          <Campo etiqueta="Cómo se calcula">
            <Select value={nuevo.modo} onChange={(e) => setNuevo({ ...nuevo, modo: e.target.value })}>
              {Object.entries(MODOS_COBRO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Monto o %">
            <Input className="mono" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} />
          </Campo>
          <Campo etiqueta="IVA %">
            <Input className="mono" value={nuevo.iva} onChange={(e) => setNuevo({ ...nuevo, iva: e.target.value })} />
          </Campo>
          <Button type="button" onClick={agregar}>
            <Plus size={15} /> Agregar
          </Button>
        </div>
      </div>

      {borrar && (
        <Confirmar
          titulo="Eliminar este cobro"
          texto={`"${borrar.nombre}" dejará de aparecer en los recibos que se emitan de ahora en adelante. Los recibos ya emitidos no cambian.`}
          boton="Eliminar"
          tono="peligro"
          onSi={eliminar}
          onNo={() => setBorrar(null)}
        />
      )}
    </div>
  );
}

/**
 * Una fila de la tabla. `nombre`/`monto`/`iva` son inputs controlados con
 * estado propio, sembrado desde `concepto` — el padre le da un `key` que
 * incluye esos mismos valores (ver el `.map` de arriba), así que un
 * cambio externo (guardado propio, u otra sesión) remonta la fila con el
 * valor fresco en vez de dejar un buffer local desactualizado.
 */
function FilaConcepto({
  concepto: c,
  onEditar,
  onEliminar,
}: {
  concepto: ConceptoCobro;
  onEditar: (id: string, campos: ActualizarConcepto) => void;
  onEliminar: () => void;
}) {
  const [nombre, setNombre] = useState(c.nombre);
  const [monto, setMonto] = useState(String(c.monto));
  const [iva, setIva] = useState(String(c.iva));
  const deVecitap = c.bolsillo === "servicio";

  return (
    <tr style={{ opacity: c.activo ? 1 : 0.5 }}>
      <td>
        <Input
          value={nombre}
          disabled={deVecitap}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={() => nombre !== c.nombre && onEditar(c.id, { nombre })}
          style={{ padding: "7px 9px", fontSize: 13 }}
        />
      </td>
      <td>
        <Badge tono={TONO_BOLSILLO[c.bolsillo] ?? "neutro"}>{BOLSILLOS[c.bolsillo]?.t ?? c.bolsillo}</Badge>
      </td>
      <td>
        <Select value={c.modo} disabled={deVecitap} onChange={(e) => onEditar(c.id, { modo: e.target.value })} style={{ padding: "7px 9px", fontSize: 13 }}>
          {Object.entries(MODOS_COBRO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </td>
      <td style={{ width: 110 }}>
        <Input
          className="mono"
          value={monto}
          disabled={deVecitap}
          onChange={(e) => setMonto(e.target.value)}
          onBlur={() => {
            const v = num0(monto);
            if (v !== Number(c.monto)) onEditar(c.id, { monto: v });
          }}
          style={{ padding: "7px 9px", fontSize: 13, textAlign: "right" }}
        />
      </td>
      <td style={{ width: 84 }}>
        <Input
          className="mono"
          value={iva}
          disabled={deVecitap}
          onChange={(e) => setIva(e.target.value)}
          onBlur={() => {
            const v = num0(iva);
            if (v !== Number(c.iva)) onEditar(c.id, { iva: v });
          }}
          style={{ padding: "7px 9px", fontSize: 13, textAlign: "right" }}
        />
      </td>
      <td style={{ width: 96 }}>
        <Button type="button" variante="secundario" mini disabled={deVecitap} onClick={() => onEditar(c.id, { activo: !c.activo })}>
          {c.activo ? "Apagar" : "Encender"}
        </Button>
      </td>
      <td style={{ width: 34 }}>
        {!deVecitap && (
          <button onClick={onEliminar} title="Eliminar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
            <Trash2 size={15} />
          </button>
        )}
      </td>
    </tr>
  );
}
