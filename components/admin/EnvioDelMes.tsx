"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui";

/** Lo que devuelve `estado_envio_periodo(p_periodo)` (ronda 10, migración 20261029130000). */
export type EstadoEnvio = {
  enviado_en: string | null;
  enviados: number;
  en_cola: number;
  fallidos: number;
  rebotados: number;
  nuevos: number;
  sin_correo: number;
  problemas: {
    unidad_id: string;
    codigo: string;
    recibo_id: string;
    destino: string | null;
    motivo: string;
    en_cola: boolean;
  }[];
};

/**
 * El envío del mes elegido en Cortes (ronda 10, B2, caso 110): cuántos
 * salieron, cuántos esperan, y **cuáles** fallaron, rebotaron o no tienen a
 * quién ir, con el motivo en palabras, el acceso a la ficha para corregir el
 * correo y «Reenviar recibo» para mandarlo otra vez después de corregirlo.
 * Antes el resumen eran cuatro números de todos los meses juntos.
 */
export function EnvioDelMes({
  estado,
  orgId,
  edificioId,
  reenviando,
  onReenviar,
  pie,
}: {
  estado: EstadoEnvio;
  orgId: string;
  edificioId: string;
  reenviando: string | null;
  onReenviar: (reciboId: string, codigo: string) => void;
  /** Lo que va al final de la franja (el botón «Enviar ahora los pendientes»). */
  pie?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const n = estado.problemas.length;
  const nada = !estado.enviados && !estado.en_cola && !estado.fallidos && !estado.rebotados && !estado.sin_correo;
  if (nada) return null;

  return (
    <div
      style={{
        marginTop: 14,
        padding: "12px 14px",
        background: "var(--fondo)",
        borderRadius: "var(--radio-chico)",
        border: "1px solid var(--linea)",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "var(--tenue)" }}>Este mes:</span>
        <span>
          <b className="mono">{estado.enviados}</b> enviados
        </span>
        {estado.en_cola > 0 && (
          <span style={{ color: "var(--ambar)" }}>
            <b className="mono">{estado.en_cola}</b> en cola
          </span>
        )}
        {estado.fallidos > 0 && (
          <span style={{ color: "var(--rojo)" }}>
            <b className="mono">{estado.fallidos}</b> {estado.fallidos === 1 ? "no salió" : "no salieron"}
          </span>
        )}
        {estado.rebotados > 0 && (
          <span style={{ color: "var(--rojo)" }}>
            <b className="mono">{estado.rebotados}</b> {estado.rebotados === 1 ? "rebotó" : "rebotaron"}
          </span>
        )}
        {estado.sin_correo > 0 && (
          <span style={{ color: "var(--ambar)" }}>
            <b className="mono">{estado.sin_correo}</b> {estado.sin_correo === 1 ? "unidad sin correo" : "unidades sin correo"}
          </span>
        )}
        {n > 0 && (
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            aria-expanded={abierto}
            style={{ background: "none", border: "none", padding: 0, color: "var(--tinta-2)", fontSize: 13, textDecoration: "underline", cursor: "pointer" }}
          >
            {abierto ? "Ocultar cuáles" : n === 1 ? "Ver cuál" : `Ver cuáles (${n})`}
          </button>
        )}
        {pie}
      </div>

      {abierto && n > 0 && (
        <div className="tabla-scroll" style={{ marginTop: 12 }}>
          <table className="tabla apila">
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Correo</th>
                <th>Qué pasó</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estado.problemas.map((p, i) => (
                <tr key={`${p.recibo_id}:${p.destino ?? i}`}>
                  <td className="mono" style={{ fontWeight: 600 }}>
                    {p.codigo}
                  </td>
                  <td style={{ overflowWrap: "anywhere" }}>{p.destino ?? "—"}</td>
                  <td>{p.motivo}</td>
                  <td style={{ width: 230 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <Link
                        href={`/admin/${orgId}/${edificioId}/propietarios/${p.unidad_id}`}
                        className="btn btn-mini btn-secundario"
                        style={{ textDecoration: "none" }}
                      >
                        Corregir en la ficha
                      </Link>
                      <Button type="button" variante="secundario" mini cargando={reenviando === p.recibo_id} onClick={() => onReenviar(p.recibo_id, p.codigo)}>
                        <RotateCw size={13} /> Reenviar recibo
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--tenue)", margin: "8px 0 0", lineHeight: 1.5 }}>
            Corrija el correo en la ficha de la unidad y vuelva acá a tocar «Reenviar recibo»: sale a la dirección nueva.
            Una dirección que rebotó no vuelve a recibir correos.
          </p>
        </div>
      )}
    </div>
  );
}
