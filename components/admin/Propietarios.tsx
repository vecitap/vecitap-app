"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@/components/ui";
import { pct, usd } from "@/lib/formato";
import { nombreDe, vigente } from "@/lib/admin/personas";
import type { SaldoActual, Unidad } from "@/lib/admin/tipos";
import { AltaUnidad } from "./AltaUnidad";
import { ImportarUnidades } from "./ImportarUnidades";
import { ImportarSaldos } from "./ImportarSaldos";

const FILTROS: [string, string][] = [
  ["todos", "Todas"],
  ["deuda", "Con deuda"],
  ["aldia", "Al día"],
  ["favor", "A favor"],
  ["sinduenio", "Sin propietario"],
];

const COLOR_TOTAL = (estado: string | null | undefined) =>
  estado === "debe" ? "var(--rojo)" : estado === "a_favor" ? "var(--azul)" : "var(--verde)";

/**
 * Portado de Propietarios() en app.html:1449-1566. La ficha (antes un
 * drawer superpuesto, `<Ficha>`/`fichaDe`) ahora es una subruta propia —
 * decisión de ruteo del inventario, sección 2 — así que acá solo hay un
 * <Link>, no estado ni componente montado.
 */
export function Propietarios({
  orgId,
  edificioId,
  unidades,
  saldos,
  sumaAlicuotas,
}: {
  orgId: string;
  edificioId: string;
  unidades: Unidad[];
  saldos: SaldoActual[];
  sumaAlicuotas: number;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [alta, setAlta] = useState(false);
  const [pantalla, setPantalla] = useState<"lista" | "importar" | "saldos">("lista");

  const mapaSaldo = useMemo(() => {
    const m: Record<string, SaldoActual> = {};
    saldos.forEach((s) => {
      if (s.unidad_id) m[s.unidad_id] = s;
    });
    return m;
  }, [saldos]);

  const base = `/admin/${orgId}/${edificioId}/propietarios`;

  if (pantalla === "importar") {
    return <ImportarUnidades orgId={orgId} edificioId={edificioId} unidades={unidades} onVolver={() => setPantalla("lista")} />;
  }
  if (pantalla === "saldos") {
    return <ImportarSaldos edificioId={edificioId} unidades={unidades} onVolver={() => setPantalla("lista")} />;
  }

  const visibles = unidades.filter((u) => {
    const s = mapaSaldo[u.id];
    if (filtro === "deuda" && s?.estado !== "debe") return false;
    if (filtro === "aldia" && s?.estado !== "al_dia") return false;
    if (filtro === "favor" && s?.estado !== "a_favor") return false;
    if (filtro === "sinduenio" && vigente(u.vinculos, "propietario")) return false;
    if (!busca) return true;
    const t = [u.codigo, nombreDe(vigente(u.vinculos, "propietario")), nombreDe(vigente(u.vinculos, "inquilino"))]
      .join(" ")
      .toLowerCase();
    return t.includes(busca.toLowerCase());
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
        <div style={{ padding: "18px 18px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Propietarios</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
                {unidades.length} unidades · las alícuotas suman {pct(sumaAlicuotas)}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button type="button" variante="secundario" mini onClick={() => setPantalla("saldos")}>
                Cargar saldos
              </Button>
              <Button type="button" variante="secundario" mini onClick={() => setPantalla("importar")}>
                Importar unidades
              </Button>
              <Button type="button" mini onClick={() => setAlta(true)}>
                Nueva unidad
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "14px 0" }}>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por unidad o por nombre"
              style={{ flex: 1, minWidth: 200 }}
            />
            {FILTROS.map(([k, t]) => (
              <Button key={k} type="button" variante={filtro === k ? "primario" : "secundario"} mini onClick={() => setFiltro(k)}>
                {t}
              </Button>
            ))}
          </div>
        </div>

        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Alícuota</th>
                <th>Propietario</th>
                <th>Inquilino</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((u) => {
                const s = mapaSaldo[u.id];
                const total = Number(s?.total) || 0;
                const p = vigente(u.vinculos, "propietario");
                const i = vigente(u.vinculos, "inquilino");
                return (
                  <tr key={u.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <Link href={`${base}/${u.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {u.codigo}
                        {!u.activa && <span style={{ color: "var(--tenue)" }}> · inactiva</span>}
                      </Link>
                    </td>
                    <td className="mono">{pct(u.alicuota)}</td>
                    <td>
                      {nombreDe(p) || <span style={{ color: "var(--tenue)" }}>sin registrar</span>}
                      {p?.personas?.telefono && (
                        <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)" }}>
                          {p.personas.telefono}
                        </div>
                      )}
                    </td>
                    <td>{nombreDe(i) || <span style={{ color: "var(--tenue)" }}>—</span>}</td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600, color: COLOR_TOTAL(s?.estado) }}>
                      {usd(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibles.length === 0 && (
            <div style={{ padding: 34, textAlign: "center", color: "var(--tenue)", fontSize: 14 }}>
              Ninguna unidad coincide con el filtro.
            </div>
          )}
        </div>
      </div>

      {alta && <AltaUnidad orgId={orgId} edificioId={edificioId} onCerrar={() => setAlta(false)} />}
    </div>
  );
}
