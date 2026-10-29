"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Aviso, Badge, Button, Campo, Confirmar, Input, Select } from "@/components/ui";
import { useAccion } from "@/hooks/useAccion";
import { montoAlSalir, num, numeroMalEscrito, paraCampo, usd } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";
import { compararCodigos } from "@/lib/orden-unidades";

/**
 * Un cargo de este mes a una sola unidad. Puede venir de dos tablas:
 *  - `cargo`: `cargos_unidad` (multa, consumo u otro cobro). No es un gasto
 *    del edificio: no sale como egreso en el estado financiero.
 *  - `gasto`: el gasto «Solo a una unidad» de siempre (`gastos`, tipo
 *    'directo'), para lo que el edificio pagó y le cobra a una unidad (una
 *    reparación): es egreso al registrarlo.
 * Ver supabase/migrations/20261029160000_cargos_unidad.sql.
 */
export type CargoDelMes = {
  id: string;
  origen: "cargo" | "gasto";
  unidad_id: string;
  concepto: string;
  referencia: string | null;
  monto: number;
};

const VACIO = { unidad: "", concepto: "", referencia: "", monto: "", lopago: false };

/**
 * «Cargo a una sola unidad» (ronda 10, bloque C, pedido de Gustavo). Va en
 * Cobros hasta la reorganización del menú (después del piloto). Sale como
 * línea propia, con su motivo, en el próximo recibo de esa unidad; entra en
 * la previa y en el cierre con el mismo cálculo (bolsillo condominio, antes
 * de la mora y del redondeo). Mientras el mes está abierto se corrige o se
 * quita; al cerrarlo, la base no deja tocarlo.
 */
export function CargosUnidad({
  orgId,
  mes,
  unidades,
  cargos,
}: {
  orgId: string;
  /** El mes abierto del edificio, si hay uno. */
  mes: { id: string; etiqueta: string } | null;
  unidades: { id: string; codigo: string }[];
  cargos: CargoDelMes[];
}) {
  const router = useRouter();
  const [f, setF] = useState(VACIO);
  const [editando, setEditando] = useState<CargoDelMes | null>(null);
  const [quitar, setQuitar] = useState<CargoDelMes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const codigo = (id: string) => unidades.find((u) => u.id === id)?.codigo ?? "—";
  const lista = cargos.slice().sort((a, b) => compararCodigos(codigo(a.unidad_id), codigo(b.unidad_id)));

  function cambiar(v: typeof f) {
    setError(null);
    setF(v);
  }

  function empezarEdicion(c: CargoDelMes) {
    setError(null);
    setEditando(c);
    setF({ unidad: c.unidad_id, concepto: c.concepto, referencia: c.referencia ?? "", monto: paraCampo(c.monto), lopago: c.origen === "gasto" });
  }

  function cancelarEdicion() {
    setEditando(null);
    setF(VACIO);
    setError(null);
  }

  const guardar = useAccion(async () => {
    if (!mes) return false;
    const malo = numeroMalEscrito([["El monto", f.monto]]);
    const monto = num(f.monto);
    const problema = !f.unidad
      ? "Elija a qué unidad se le carga."
      : !f.concepto.trim()
        ? "Falta el motivo: es lo que se lee en el recibo."
        : malo || monto === null || monto <= 0
          ? (malo ?? "Escriba el monto.")
          : null;
    setError(problema);
    if (problema) return false;
    const campos = {
      unidad_id: f.unidad,
      concepto: f.concepto.trim(),
      referencia: f.referencia.trim() || null,
      monto: Math.round(monto! * 100) / 100,
    };
    const supabase = crearClienteNavegador();
    const tabla = (editando ? editando.origen : f.lopago ? "gasto" : "cargo") === "gasto" ? "gastos" : "cargos_unidad";
    const { error: e } = editando
      ? await supabase.from(tabla).update(campos).eq("id", editando.id)
      : tabla === "gastos"
        ? await supabase
            .from("gastos")
            .insert({ ...campos, org_id: orgId, periodo_id: mes.id, tipo: "directo", bolsillo: "condominio", categoria_id: null, orden: 10 })
        : await supabase.from("cargos_unidad").insert({ ...campos, org_id: orgId, periodo_id: mes.id });
    if (e) throw e;
    setEditando(null);
    setF(VACIO);
    router.refresh();
  });

  async function confirmarQuitar() {
    if (!quitar) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase
      .from(quitar.origen === "gasto" ? "gastos" : "cargos_unidad")
      .delete()
      .eq("id", quitar.id);
    if (editando?.id === quitar.id) cancelarEdicion();
    setQuitar(null);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  return (
    <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cargo a una sola unidad</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
        Una multa, un consumo o una reparación que se le cobra a una sola unidad. Sale en su próximo recibo como una
        línea propia, con el motivo, y se suma a lo que debe de condominio: si no lo paga, cuenta para la mora igual
        que la cuota. Mientras el mes esté abierto se puede corregir o quitar; al cerrarlo, queda en el recibo.
      </p>

      {!mes ? (
        <Aviso tono="ambar" titulo="No hay ningún mes abierto">
          El cargo va en el recibo del mes que todavía no se cerró. Abra el mes en «Gastos del mes» y vuelva aquí.
        </Aviso>
      ) : (
        <>
          {error && (
            <div style={{ marginBottom: 12 }}>
              <Aviso tono="rojo" titulo="No se pudo guardar">
                {error}
              </Aviso>
            </div>
          )}
          {guardar.error && !error && (
            <div style={{ marginBottom: 12 }}>
              <Aviso tono="rojo" titulo="No se pudo guardar">
                {guardar.error}
              </Aviso>
            </div>
          )}

          <div style={{ fontSize: 13, color: "var(--tinta-2)", marginBottom: 10 }}>
            Cargos del recibo de <b>{mes.etiqueta}</b>
          </div>
          {lista.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--tenue)", margin: "0 0 16px" }}>Este mes no hay cargos a una sola unidad.</p>
          ) : (
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {lista.map((c) => (
                <div
                  key={c.origen + c.id}
                  style={{
                    border: `1px solid ${editando?.id === c.id ? "var(--acento)" : "var(--linea)"}`,
                    borderRadius: "var(--radio-chico)",
                    padding: "10px 12px",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <b className="mono" style={{ minWidth: 48 }}>
                    {codigo(c.unidad_id)}
                  </b>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, overflowWrap: "anywhere" }}>
                      {c.concepto}
                      {c.referencia && <span style={{ color: "var(--tenue)", fontSize: 12.5 }}> · {c.referencia}</span>}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <Badge tono={c.origen === "gasto" ? "azul" : "neutro"}>
                        {c.origen === "gasto" ? "Lo pagó el edificio · es un egreso" : "Multa o cobro · no es un egreso"}
                      </Badge>
                    </div>
                  </div>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {usd(c.monto)}
                  </span>
                  <button type="button" onClick={() => empezarEdicion(c)} title="Corregir" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
                    <Pencil size={15} />
                  </button>
                  <button type="button" onClick={() => setQuitar(c)} title="Quitar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", alignItems: "end" }}>
            <Campo etiqueta="Unidad">
              <Select value={f.unidad} onChange={(e) => cambiar({ ...f, unidad: e.target.value })}>
                <option value="">Elija la unidad</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Motivo (sale en el recibo)">
              <Input value={f.concepto} maxLength={120} onChange={(e) => cambiar({ ...f, concepto: e.target.value })} placeholder="Multa por ruido" />
            </Campo>
            <Campo etiqueta="Referencia (opcional)">
              <Input value={f.referencia} maxLength={120} onChange={(e) => cambiar({ ...f, referencia: e.target.value })} placeholder="Acta del 12/10" />
            </Campo>
            <Campo etiqueta="Monto $">
              <Input
                className="mono"
                inputMode="decimal"
                value={f.monto}
                onChange={(e) => cambiar({ ...f, monto: e.target.value })}
                onBlur={() => setF({ ...f, monto: montoAlSalir(f.monto) })}
              />
            </Campo>
          </div>

          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: editando ? "default" : "pointer", marginTop: 12, opacity: editando ? 0.7 : 1 }}>
            <input
              type="checkbox"
              checked={f.lopago}
              disabled={!!editando}
              onChange={(e) => cambiar({ ...f, lopago: e.target.checked })}
              style={{ marginTop: 3, width: 18, height: 18 }}
            />
            <span>
              <b>El edificio pagó esto</b>
              <span style={{ display: "block", fontSize: 12.5, color: "var(--tinta-2)", lineHeight: 1.5 }}>
                Márquelo para una reparación que el condominio le pagó a alguien y le cobra a esta unidad: sale como
                egreso del edificio. Sin marcar (una multa, un consumo), no es un egreso; lo que pague la unidad entra
                como ingreso.
                {editando && " Para cambiarlo, quite el cargo y cárguelo de nuevo."}
              </span>
            </span>
          </label>

          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button type="button" cargando={guardar.enviando} onClick={() => guardar.ejecutar()}>
              {editando ? (
                "Guardar cambios"
              ) : (
                <>
                  <Plus size={15} /> Agregar cargo
                </>
              )}
            </Button>
            {editando && (
              <Button type="button" variante="secundario" onClick={cancelarEdicion}>
                Cancelar
              </Button>
            )}
          </div>
        </>
      )}

      {quitar && (
        <Confirmar
          titulo="Quitar este cargo"
          texto={`"${quitar.concepto}" (${usd(quitar.monto)}) a la unidad ${codigo(quitar.unidad_id)} no se cobra en el recibo de ${mes?.etiqueta ?? "este mes"}.`}
          boton="Quitar"
          tono="peligro"
          onSi={confirmarQuitar}
          onNo={() => setQuitar(null)}
        />
      )}
    </div>
  );
}
