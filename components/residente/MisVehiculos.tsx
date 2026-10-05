"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Aviso, Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";
import { mensajeDeError } from "@/lib/errores";

type Vehiculo = Pick<Database["public"]["Tables"]["vehiculos"]["Row"], "id" | "placa" | "marca" | "modelo" | "color" | "puesto">;

const VACIO = { placa: "", marca: "", color: "", puesto: "" };

/**
 * Portado de la sección "Mis vehículos" de Visitas() en index.html:1057-1088
 * (V3/V4 de docs/inventario-main.md, sección 2.1) — no depende de
 * `crear_invitacion_visita`/`anular_invitacion_visita`, así que se
 * construye junto con el resto del bloque 8 sin esperar esa consulta.
 *
 * **Un solo campo "Marca y modelo"**, no dos — así es main
 * (index.html:1081-1083): el formulario tiene un campo `auto.modelo` en su
 * estado que ningún input llena, así que `modelo` siempre viaja `null` al
 * guardar. Es un bug de main, no de la migración (criterio del 28-sep: un
 * bug de main se copia tal cual salvo que arriesgue datos — acá no arriesga
 * nada, la columna `modelo` simplemente queda sin usar). Acá directamente
 * no se guarda estado para `modelo`, porque cargar uno que ningún campo
 * llena no tiene efecto observable — el resultado es el mismo `null`.
 */
export function MisVehiculos({
  orgId,
  edificioId,
  unidadId,
  vehiculos,
}: {
  orgId: string;
  edificioId: string;
  unidadId: string;
  vehiculos: Vehiculo[];
}) {
  const router = useRouter();
  const [auto, setAuto] = useState(VACIO);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const placa = auto.placa.trim().toUpperCase();
    if (!placa) return setError("Falta la placa.");
    setError(null);
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("vehiculos").insert({
      org_id: orgId,
      edificio_id: edificioId,
      unidad_id: unidadId,
      placa,
      marca: auto.marca.trim() || null,
      modelo: null,
      color: auto.color.trim() || null,
      puesto: auto.puesto.trim() || null,
    });
    setOcupado(false);
    if (e) return setError(mensajeDeError(e));
    setAuto(VACIO);
    router.refresh();
  }

  async function quitar(id: string) {
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("vehiculos").delete().eq("id", id);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  return (
    <Card>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Mis vehículos</h3>
      <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "0 0 14px" }}>
        La garita usa esta lista para saber qué carros son del edificio.
      </p>

      {error && (
        <div style={{ marginBottom: 14 }}>
          <Aviso tono="rojo">{error}</Aviso>
        </div>
      )}

      {vehiculos.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {vehiculos.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                background: "var(--fondo)",
                borderRadius: 10,
                padding: "11px 13px",
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: 15, fontWeight: 700 }}>
                  {v.placa}
                </div>
                <div style={{ fontSize: 12, color: "var(--tenue)" }}>
                  {[v.marca, v.modelo, v.color].filter(Boolean).join(" ") || "sin detalle"}
                  {v.puesto ? ` · puesto ${v.puesto}` : ""}
                </div>
              </div>
              <Button type="button" variante="secundario" mini style={{ color: "var(--rojo)" }} onClick={() => quitar(v.id)}>
                <Trash2 size={13} /> Quitar
              </Button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <Campo etiqueta="Placa">
            <Input
              className="mono"
              value={auto.placa}
              autoCapitalize="characters"
              onChange={(e) => setAuto({ ...auto, placa: e.target.value })}
              placeholder="AB123CD"
            />
          </Campo>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <Campo etiqueta="Marca y modelo">
            <Input value={auto.marca} onChange={(e) => setAuto({ ...auto, marca: e.target.value })} placeholder="Toyota Corolla" />
          </Campo>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <Campo etiqueta="Color">
            <Input value={auto.color} onChange={(e) => setAuto({ ...auto, color: e.target.value })} />
          </Campo>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <Campo etiqueta="Puesto (opcional)">
            <Input value={auto.puesto} onChange={(e) => setAuto({ ...auto, puesto: e.target.value })} />
          </Campo>
        </div>
      </div>
      {/* Nota: `modelo` no tiene campo propio — ver el comentario de arriba
          del componente. */}
      <Button type="button" variante="secundario" disabled={ocupado} onClick={guardar} style={{ width: "100%" }}>
        {ocupado ? "Agregando…" : "Agregar el vehículo"}
      </Button>
    </Card>
  );
}
