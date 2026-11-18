"use client";

import { useEffect, useState } from "react";
import { Badge, Card, type TonoBadge } from "@/components/ui";
import { nf } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { estadoMes, mesesDeDeuda, type MesDeuda } from "@/lib/reparto";
import { useCopiaLocal } from "@/lib/local/contexto";
import { deudaDesdeCopia } from "@/lib/admin/pantallas/ficha";

const TONO: Record<ReturnType<typeof estadoMes>, TonoBadge> = { Pagado: "neutro", "En parte": "ambar", Pendiente: "rojo" };

/**
 * Cambio 2 de ING3: qué meses quedaron pagados, cuál a medias y cuánto falta.
 *
 * Lo calcula la base (`deuda_por_mes`) con la misma regla del cierre: un pago
 * cubre primero la mora, después las cuotas extraordinarias, después las
 * cuotas y los cargos del mes más antiguo al más reciente, y al final las
 * multas. El saldo total no cambia: esto solo dice a qué mes corresponde.
 * Todas las cuentas (condominio, honorarios, servicio) van sumadas por mes.
 *
 * Lo usan la ficha de la unidad (Administración) y «Mi recibo» (Residente).
 * Si la sesión no puede ver el saldo (el inquilino con «Solo el recibo del
 * mes»), la base contesta «Sin acceso» y el bloque no aparece.
 */
export function DeudaPorMes({ unidadId, enTarjeta = false }: { unidadId: string; enTarjeta?: boolean }) {
  // Cambio 3: sin conexión, lo que devolvió deuda_por_mes() al bajar la copia.
  const copia = useCopiaLocal();
  const [pedidos, setMeses] = useState<MesDeuda[] | null>(null);
  const meses = copia ? mesesDeDeuda(deudaDesdeCopia(copia.fichas, unidadId)) : pedidos;
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    if (copia) return;
    let vivo = true;
    crearClienteNavegador()
      .rpc("deuda_por_mes", { p_unidad: unidadId })
      .then(({ data, error }) => {
        if (!vivo) return;
        setMeses(error || !data ? [] : mesesDeDeuda(data));
      });
    return () => {
      vivo = false;
    };
  }, [unidadId, copia]);

  if (!meses || meses.length === 0) return null;
  const pendientes = meses.filter((m) => m.falta > 0.005);
  const pagados = meses.length - pendientes.length;
  const filas = todos ? meses : pendientes;

  const bloque = (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14.5, fontFamily: "var(--font-titulos)" }}>Detalle por mes</h3>
        {pagados > 0 && (
          <button
            type="button"
            onClick={() => setTodos(!todos)}
            style={{ background: "none", border: 0, padding: 0, color: "var(--tinta-2)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}
          >
            {todos ? "Ver solo lo pendiente" : `Ver también los meses pagados (${pagados})`}
          </button>
        )}
      </div>
      {filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--tinta-2)" }}>Todos los meses están pagados.</p>
      ) : (
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th style={{ textAlign: "right" }}>Cuota</th>
                <th style={{ textAlign: "right" }}>Abonado</th>
                <th style={{ textAlign: "right" }}>Falta</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => {
                const estado = estadoMes(m);
                return (
                  <tr key={`${m.anio ?? "a"}-${m.mes ?? ""}`}>
                    <td>{m.etiqueta}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{nf(2).format(m.cargo)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{m.abonado > 0.005 ? nf(2).format(m.abonado) : "—"}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>{m.falta > 0.005 ? nf(2).format(m.falta) : "—"}</td>
                    <td>
                      <Badge tono={TONO[estado]}>{estado}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--tenue)" }}>
        Montos en dólares. Cada pago cubre primero lo más antiguo: la mora, las cuotas extraordinarias, las cuotas y cargos
        de cada mes, y al final las multas.
      </p>
    </div>
  );
  return enTarjeta ? <Card>{bloque}</Card> : bloque;
}
