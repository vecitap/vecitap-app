"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, FileSpreadsheet, Plus, Search, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { nf, pct, usd } from "@/lib/formato";
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

/**
 * Mismo umbral literal que `main` (admin.html:1740-1741). La Sesión 1 lo
 * había unificado contra la columna `estado` de `saldos_actuales`
 * (docs/casos-de-uso-mejorados.md, caso 11); el criterio del 28-sep es
 * paridad con `main`, así que vuelve el literal.
 */
const COLOR_TOTAL = (total: number) =>
  total > 0.01 ? "var(--rojo)" : total < -0.01 ? "var(--azul)" : "var(--verde)";

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
    const total = Number(s?.total) || 0;
    if (filtro === "deuda" && !(total > 0.01)) return false;
    if (filtro === "aldia" && !(Math.abs(total) <= 0.01)) return false;
    if (filtro === "favor" && !(total < -0.01)) return false;
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
                <FileSpreadsheet size={14} /> Cargar saldos
              </Button>
              <Button type="button" variante="secundario" mini onClick={() => setPantalla("importar")}>
                <Upload size={14} /> Importar unidades
              </Button>
              <Button type="button" mini onClick={() => setAlta(true)}>
                <Plus size={14} /> Nueva unidad
              </Button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "14px 0" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: 13, color: "var(--tenue)" }} />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por unidad o por nombre"
                style={{ paddingLeft: 34 }}
              />
            </div>
            {FILTROS.map(([k, t]) => (
              <Button key={k} type="button" variante={filtro === k ? "primario" : "secundario"} mini onClick={() => setFiltro(k)}>
                {t}
              </Button>
            ))}
          </div>
        </div>

        <div className="tabla-scroll">
          <table className="tabla apila">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Alícuota</th>
                <th>Propietario</th>
                <th>Inquilino</th>
                <th style={{ textAlign: "right" }}>Saldo</th>
                <th></th>
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
                    <td className="mono cabeza" style={{ fontWeight: 600 }}>
                      <Link href={`${base}/${u.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {u.codigo}
                        {!u.activa && <span style={{ color: "var(--tenue)" }}> · inactiva</span>}
                      </Link>
                    </td>
                    <td className="mono" data-t="Alícuota">
                      {nf(5).format(Number(u.alicuota) || 0)}
                    </td>
                    <td data-t="Propietario">
                      {nombreDe(p) || <span style={{ color: "var(--tenue)" }}>sin registrar</span>}
                      {p?.personas?.telefono && (
                        <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)" }}>
                          {p.personas.telefono}
                        </div>
                      )}
                    </td>
                    <td data-t="Inquilino">{nombreDe(i) || <span style={{ color: "var(--tenue)" }}>—</span>}</td>
                    <td className="mono" data-t="Saldo" style={{ textAlign: "right", fontWeight: 600, color: COLOR_TOTAL(total) }}>
                      {usd(total)}
                    </td>
                    <td className="flecha" style={{ width: 28 }}>
                      <Link href={`${base}/${u.id}`}>
                        <ChevronRight size={15} style={{ color: "var(--tenue)" }} />
                      </Link>
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
