"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Badge, Button, Campo, Confirmar, Input, Select } from "@/components/ui";
import { useAccion } from "@/hooks/useAccion";
import { montoAlSalir, num, numeroMalEscrito, usd } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { ConceptoCobro } from "@/lib/admin/tipos";
import { mensajeDeError } from "@/lib/errores";

const REPARTOS = {
  monto_por_alicuota: { titulo: "Por alícuota", monto: "Monto total del edificio $", ayuda: "Cada unidad paga su parte según su alícuota." },
  monto_por_unidad: { titulo: "Monto fijo por unidad", monto: "Monto de cada unidad $", ayuda: "Todas las unidades pagan lo mismo." },
} as const;
type Reparto = keyof typeof REPARTOS;

/**
 * Cuotas extraordinarias (ronda 7, bloque 5, caso 83). Es un cobro más de
 * `conceptos_cobro`, con `cuotas` = N: el cierre del mes cobra el monto ÷ N
 * cada mes, la línea dice «(cuota 2 de 3)» y, completas las N, no se cobra
 * más. Cuántas van lo dice la base (`avance_extraordinarias`), contando los
 * recibos de los meses cerrados. Va en el bolsillo de condominio: suma al
 * saldo y cuenta para la mora como la cuota normal.
 */
export function CuotasExtraordinarias({
  orgId,
  edificioId,
  extraordinarias,
  avance,
}: {
  orgId: string;
  edificioId: string;
  extraordinarias: ConceptoCobro[];
  avance: Record<string, number>;
}) {
  const router = useRouter();
  const [nueva, setNueva] = useState({ nombre: "", reparto: "monto_por_alicuota" as Reparto, monto: "", cuotas: "1" });
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<ConceptoCobro | null>(null);

  const agregar = useAccion(async () => {
    const malo = numeroMalEscrito([["El monto", nueva.monto]]);
    const monto = num(nueva.monto);
    const cuotas = Number(nueva.cuotas);
    const problema = !nueva.nombre.trim()
      ? "Falta el nombre: es lo que se lee en el recibo."
      : malo || monto === null || monto <= 0
        ? (malo ?? "Escriba el monto.")
        : !Number.isInteger(cuotas) || cuotas < 1 || cuotas > 60
          ? "Las cuotas van de 1 a 60."
          : null;
    setError(problema);
    if (problema) return false;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").insert({
      org_id: orgId,
      edificio_id: edificioId,
      nombre: nueva.nombre.trim(),
      bolsillo: "condominio",
      modo: nueva.reparto,
      monto: monto!,
      iva: 0,
      cuotas,
      orden: 8,
    });
    if (e) throw e;
    setNueva({ nombre: "", reparto: "monto_por_alicuota", monto: "", cuotas: "1" });
    router.refresh();
  });

  async function cambiarActivo(c: ConceptoCobro) {
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").update({ activo: !c.activo }).eq("id", c.id);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  async function eliminar() {
    if (!borrar) return;
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("conceptos_cobro").delete().eq("id", borrar.id);
    setBorrar(null);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  const cuotasN = Number(nueva.cuotas);
  const montoN = num(nueva.monto);

  return (
    <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Cuotas extraordinarias</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
        Un cobro aparte, con su nombre, que se puede dividir en varios meses. Sale en el recibo como una línea propia
        («cuota 2 de 3»), se suma al saldo y cuenta para la mora igual que la cuota normal. Cuando se cobra la última
        cuota, deja de cobrarse sola.
      </p>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono="rojo" titulo="No se pudo guardar">
            {error}
          </Aviso>
        </div>
      )}

      {extraordinarias.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {extraordinarias.map((c) => {
            const n = c.cuotas ?? 1;
            const van = avance[c.id] ?? 0;
            const terminada = van >= n;
            return (
              <div key={c.id} style={{ border: "1px solid var(--linea)", borderRadius: "var(--radio-chico)", padding: "10px 12px", opacity: c.activo || terminada ? 1 : 0.6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <b style={{ fontSize: 14, overflowWrap: "anywhere" }}>{c.nombre}</b>
                  <Badge tono={terminada ? "neutro" : "marca"}>{terminada ? "Terminada" : `${van} de ${n} ${n === 1 ? "cuota" : "cuotas"} cobradas`}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 3 }}>
                  {REPARTOS[c.modo as Reparto]?.titulo ?? c.modo} · <span className="mono">{usd(c.monto)}</span>
                  {c.modo === "monto_por_unidad" ? " por unidad" : " en total"}
                  {n > 1 && (
                    <>
                      {" "}
                      · {n} cuotas de <span className="mono">{usd(Number(c.monto) / n)}</span>
                      {c.modo === "monto_por_unidad" ? "" : " del edificio"}
                    </>
                  )}
                  {!c.activo && !terminada && " · apagada: no se cobra mientras esté apagada"}
                </div>
                {!terminada && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button type="button" mini variante="secundario" onClick={() => cambiarActivo(c)}>
                      {c.activo ? "Apagar" : "Encender"}
                    </Button>
                    {van === 0 && (
                      <button type="button" onClick={() => setBorrar(c)} title="Eliminar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", alignItems: "end" }}>
        <Campo etiqueta="Nombre en el recibo">
          <Input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Cuota extraordinaria ascensor" />
        </Campo>
        <Campo etiqueta="Cómo se reparte" ayuda={REPARTOS[nueva.reparto].ayuda}>
          <Select value={nueva.reparto} onChange={(e) => setNueva({ ...nueva, reparto: e.target.value as Reparto })}>
            {Object.entries(REPARTOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.titulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo etiqueta={REPARTOS[nueva.reparto].monto}>
          <Input
            className="mono"
            inputMode="decimal"
            value={nueva.monto}
            onChange={(e) => setNueva({ ...nueva, monto: e.target.value })}
            onBlur={() => setNueva({ ...nueva, monto: montoAlSalir(nueva.monto) })}
          />
        </Campo>
        <Campo
          etiqueta="En cuántas cuotas"
          ayuda={montoN && cuotasN > 1 ? `${cuotasN} cuotas mensuales de ${usd(montoN / cuotasN)}` : "1 = se cobra una sola vez"}
        >
          <Input className="mono" inputMode="numeric" value={nueva.cuotas} onChange={(e) => setNueva({ ...nueva, cuotas: e.target.value.replace(/\D/g, "") })} />
        </Campo>
      </div>
      <div style={{ marginTop: 12 }}>
        <Button type="button" cargando={agregar.enviando} onClick={() => agregar.ejecutar()}>
          <Plus size={15} /> Agregar cuota extraordinaria
        </Button>
        <p style={{ fontSize: 12, color: "var(--tenue)", margin: "8px 0 0" }}>
          La primera cuota sale en el próximo mes que se cierre.
        </p>
      </div>

      {borrar && (
        <Confirmar
          titulo="Eliminar esta cuota extraordinaria"
          texto={`"${borrar.nombre}" todavía no se cobró en ningún recibo. Se elimina y no se cobra.`}
          boton="Eliminar"
          tono="peligro"
          onSi={eliminar}
          onNo={() => setBorrar(null)}
        />
      )}
    </div>
  );
}
