"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Printer } from "lucide-react";
import { Badge, Button, type TonoBadge } from "@/components/ui";
import { nf, usd } from "@/lib/formato";
import { nombreDe, normalizarTel, vigente } from "@/lib/admin/personas";
import { imprimirEstado } from "@/lib/admin/imprimir-estado";
import type { Database } from "@/types/supabase";
import type { OrganizacionAdmin, SaldoActual, UnidadConPaga } from "@/lib/admin/tipos";
import { DatosUnidad } from "./DatosUnidad";

type FilaHistorial = Database["public"]["Functions"]["historial_unidad"]["Returns"][number];
type PagoPendiente = Pick<Database["public"]["Tables"]["pagos"]["Row"], "id" | "fecha" | "monto_usd" | "metodo" | "referencia" | "destino">;

type FilaMostrar = {
  fecha: string | null;
  concepto: string;
  detalle?: string | null;
  cargo: number;
  abono: number;
  saldo: number;
  monto?: number;
  tipo?: "pendiente";
};

/** Portado de Ficha() en app.html:1977-2132 — la pestaña "cuenta" (Datos vive en DatosUnidad.tsx, ver ese archivo). */
export function Ficha({
  orgId,
  edificioId,
  unidad,
  saldo,
  edificio,
  organizacion,
  historial,
  pendientes,
  tasa,
}: {
  orgId: string;
  edificioId: string;
  unidad: UnidadConPaga;
  saldo: SaldoActual | null;
  edificio: { id: string; nombre: string; rif: string | null; direccion: string | null };
  organizacion: Pick<OrganizacionAdmin, "id" | "nombre">;
  historial: FilaHistorial[];
  pendientes: PagoPendiente[];
  tasa: number | null;
}) {
  const [pest, setPest] = useState<"cuenta" | "datos">("cuenta");
  const prop = vigente(unidad.vinculos, "propietario");
  const inq = vigente(unidad.vinculos, "inquilino");
  const total = Number(saldo?.total) || 0;
  // Mismos literales que main (admin.html:2233, 2258). La Sesión 1 los
  // había unificado contra `estado` de `saldos_actuales`
  // (docs/casos-de-uso-mejorados.md, caso 11); el criterio del 28-sep es
  // paridad con main, así que vuelven los literales.
  // Ronda 2 (caso 36): a favor en `--a-favor`, no en `--azul`.
  const tono: TonoBadge = total > 0.01 ? "rojo" : total < -0.01 ? "favor" : "verde";
  const color = total > 0.01 ? "var(--rojo)" : total < -0.01 ? "var(--a-favor)" : "var(--verde)";
  const etiquetaEstado = total > 0.01 ? "debe" : total < -0.01 ? "a favor" : "al día";

  const filasImpresion: FilaMostrar[] = [
    ...historial,
    ...pendientes.map((p) => ({
      fecha: p.fecha,
      concepto: "Pago reportado, sin conciliar",
      detalle: [p.metodo, p.referencia ? `ref ${p.referencia}` : ""].filter(Boolean).join(" · "),
      cargo: 0,
      abono: 0,
      saldo: 0,
      monto: p.monto_usd,
      tipo: "pendiente" as const,
    })),
  ];

  const telWa = prop?.personas?.telefono ? normalizarTel(prop.personas.telefono) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="mono" style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              {unidad.codigo}
            </h1>
            <Badge tono={tono}>
              {etiquetaEstado} {usd(Math.abs(total))}
            </Badge>
          </div>
          <p style={{ fontSize: 13, color: "var(--tinta-2)", margin: "4px 0 0" }}>
            {nombreDe(prop) || "Sin propietario registrado"}
          </p>
        </div>
        <Link href={`/admin/${orgId}/${edificioId}/propietarios`} className="btn btn-secundario btn-mini" style={{ textDecoration: "none" }}>
          Volver a Propietarios
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button type="button" variante={pest === "cuenta" ? "primario" : "secundario"} mini onClick={() => setPest("cuenta")}>
          Estado de cuenta
        </Button>
        <Button type="button" variante={pest === "datos" ? "primario" : "secundario"} mini onClick={() => setPest("datos")}>
          Datos
        </Button>
      </div>

      {pest === "cuenta" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
            <Tarjetita etiqueta="Condominio" valor={usd(saldo?.condominio)} />
            <Tarjetita etiqueta="Administración" valor={usd(saldo?.administracion)} />
            <Tarjetita etiqueta="Servicio" valor={usd(saldo?.servicio)} />
            <Tarjetita etiqueta={total < -0.01 ? "A favor" : "Total"} valor={usd(total < -0.01 ? Math.abs(total) : total)} color={color} />
          </div>

          {pendientes.length > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: "var(--radio-chico)", background: "var(--ambar-bg)" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ambar)" }}>
                {pendientes.length} pago(s) por {usd(pendientes.reduce((a, p) => a + Number(p.monto_usd), 0))}. No
                bajan el saldo hasta que se confirme que el dinero entró.
              </p>
            </div>
          )}

          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th style={{ textAlign: "right" }}>Cargo</th>
                  <th style={{ textAlign: "right" }}>Abono</th>
                  <th style={{ textAlign: "right" }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filasImpresion.map((f, i) => (
                  <tr key={i}>
                    <td className="mono">{f.fecha || "—"}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: f.tipo === "pendiente" ? "var(--ambar)" : "inherit" }}>{f.concepto}</div>
                      {f.detalle && <div style={{ fontSize: 11.5, color: "var(--tenue)" }}>{f.detalle}</div>}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>{Number(f.cargo) ? nf(2).format(f.cargo) : ""}</td>
                    <td className="mono" style={{ textAlign: "right", color: f.tipo === "pendiente" ? "var(--ambar)" : "var(--verde)" }}>
                      {Number(f.abono) ? nf(2).format(f.abono) : f.tipo === "pendiente" ? `(${nf(2).format(f.monto || 0)})` : ""}
                    </td>
                    <td className="mono" style={{ textAlign: "right", fontWeight: 600 }}>
                      {f.tipo === "pendiente" ? "" : nf(2).format(f.saldo)}
                    </td>
                  </tr>
                ))}
                {filasImpresion.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", color: "var(--tenue)", padding: 28 }}>
                      Sin movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              type="button"
              variante="secundario"
              onClick={() =>
                imprimirEstado({
                  edificio,
                  organizacion,
                  unidad,
                  propietario: nombreDe(prop),
                  inquilino: nombreDe(inq),
                  filas: filasImpresion,
                  saldoFinal: total,
                  tasa,
                })
              }
            >
              <Printer size={15} /> Imprimir o guardar en PDF
            </Button>
            {telWa && (
              <a
                className="btn btn-secundario"
                style={{ textDecoration: "none" }}
                href={`https://wa.me/${telWa}?text=${encodeURIComponent(
                  `Hola ${nombreDe(prop)}. Le escribimos de ${edificio.nombre} sobre la unidad ${unidad.codigo}. Su saldo actual es ${usd(total)}.`
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={15} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      ) : (
        <DatosUnidad orgId={orgId} unidad={unidad} prop={prop} inq={inq} />
      )}
    </div>
  );
}

function Tarjetita({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div style={{ background: "var(--fondo)", borderRadius: "var(--radio)", padding: "12px 14px" }}>
      <div style={{ fontSize: 11.5, color: "var(--tenue)" }}>{etiqueta}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: color ?? "inherit" }}>
        {valor}
      </div>
    </div>
  );
}
