"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Campo, Card, Select } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Database } from "@/types/supabase";

type FilaModulo = Database["public"]["Functions"]["modulos_de"]["Returns"][number];

/**
 * Portado de PanelModulos() en operador.html:709-849 — qué módulos tiene
 * contratados un cliente, dentro de la ficha (entre "Suscripción" y
 * "Contacto", igual que main). El interruptor vive en la base (RLS +
 * `fijar_modulo`/`soltar_modulo`): esta pantalla solo muestra y cambia, si
 * alguien apaga un módulo acá la base lo rechaza aunque otra pantalla
 * siguiera mostrando el botón.
 */
export function PanelModulos({
  orgId,
  edificios,
  notificar,
  fallo,
}: {
  orgId: string;
  edificios: { edificio_id: string; nombre: string }[] | null;
  notificar: (t: string, tipo?: "ok" | "error") => void;
  fallo: (e: unknown) => void;
}) {
  const [filas, setFilas] = useState<FilaModulo[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState({ clave: "", edificio: "" });

  async function cargar() {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("modulos_de", { p_org: orgId });
    if (error) return fallo(error);
    setFilas(data ?? []);
  }

  // Mismo dato que cargar() (reusado después de cada mutación), pero acá el
  // fetch queda inline dentro del efecto: llamar a una función declarada
  // afuera que termina en setState dispara react-hooks/set-state-in-effect
  // — mismo patrón que Accesos.tsx/CierreMes.tsx.
  useEffect(() => {
    const supabase = crearClienteNavegador();
    supabase.rpc("modulos_de", { p_org: orgId }).then(({ data, error }) => {
      if (error) return fallo(error);
      setFilas(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function fijar(clave: string, activo: boolean, edificio: string | null) {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("fijar_modulo", {
      p_org: orgId,
      p_clave: clave,
      p_activo: activo,
      p_edificio: edificio || undefined,
    });
    setOcupado(false);
    if (error) return fallo(error);
    notificar(activo ? "Módulo habilitado." : "Módulo deshabilitado.");
    cargar();
  }

  async function soltar(clave: string, edificio: string) {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("soltar_modulo", { p_org: orgId, p_clave: clave, p_edificio: edificio });
    setOcupado(false);
    if (error) return fallo(error);
    notificar("La excepción se quitó: vuelve a mandar la regla general.");
    cargar();
  }

  const base = (filas ?? []).filter((f) => !f.edificio_id);
  const exc = (filas ?? []).filter((f) => f.edificio_id);
  const apagables = base.filter((f) => !f.nucleo);

  return (
    <Card>
      <h3 style={{ margin: "0 0 4px", fontSize: 13, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tinta-2)" }}>
        Módulos
      </h3>
      <p style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 0, marginBottom: 12 }}>
        Lo que este cliente puede usar. Lo que se apaga acá deja de funcionar de verdad, no solo se esconde.
      </p>

      {filas === null && <div style={{ fontSize: 12.5, color: "var(--tenue)" }}>Cargando…</div>}

      <div style={{ display: "grid", gap: 1, background: "var(--linea)", borderRadius: 8, overflow: "hidden", border: "1px solid var(--linea)" }}>
        {base.map((f) => (
          <div
            key={f.clave}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "var(--lienzo)", padding: "10px 12px" }}
          >
            <div style={{ minWidth: 190, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.nombre}</div>
              <div style={{ fontSize: 11.5, color: "var(--tenue)" }}>{f.descripcion}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {f.fijado && !f.nucleo && <span style={{ fontSize: 10.5, color: "var(--tenue)" }}>fijado a mano</span>}
              {f.nucleo ? (
                <Badge tono="tenue">siempre incluido</Badge>
              ) : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => fijar(f.clave, !f.activo, null)}
                  title={f.activo ? "Quitarle este módulo al cliente" : "Darle este módulo al cliente"}
                  style={{
                    cursor: ocupado ? "wait" : "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 999,
                    padding: "5px 14px",
                    border: f.activo ? "1px solid transparent" : "1px solid var(--linea-fuerte)",
                    background: f.activo ? "var(--verde-bg)" : "transparent",
                    color: f.activo ? "var(--verde)" : "var(--tenue)",
                  }}
                >
                  {f.activo ? "Habilitado" : "Apagado"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {exc.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11.5, color: "var(--tenue)", marginBottom: 6 }}>Excepciones por edificio (mandan sobre la regla de arriba)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {exc.map((f) => (
              <div
                key={f.clave + f.edificio_id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: "var(--fondo)", borderRadius: 8, padding: "8px 12px" }}
              >
                <div style={{ fontSize: 12.5 }}>
                  <b>{f.edificio}</b> · {f.nombre} ·{" "}
                  <span style={{ color: f.activo ? "var(--verde)" : "var(--rojo)", fontWeight: 700 }}>{f.activo ? "habilitado" : "apagado"}</span>
                </div>
                <Button type="button" variante="secundario" mini onClick={() => soltar(f.clave, f.edificio_id)}>
                  Quitar la excepción
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(edificios?.length ?? 0) > 1 && apagables.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--linea)", paddingTop: 14 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
            <Campo etiqueta="Módulo">
              <Select value={nuevo.clave} onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })}>
                <option value="">Elegir…</option>
                {apagables.map((f) => (
                  <option key={f.clave} value={f.clave}>
                    {f.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Solo para el edificio">
              <Select value={nuevo.edificio} onChange={(e) => setNuevo({ ...nuevo, edificio: e.target.value })}>
                <option value="">Elegir…</option>
                {(edificios ?? []).map((e) => (
                  <option key={e.edificio_id} value={e.edificio_id}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <Button type="button" mini disabled={!nuevo.clave || !nuevo.edificio || ocupado} onClick={() => fijar(nuevo.clave, true, nuevo.edificio)}>
              Habilitar solo ahí
            </Button>
            <Button
              type="button"
              variante="secundario"
              mini
              style={{ color: "var(--rojo)" }}
              disabled={!nuevo.clave || !nuevo.edificio || ocupado}
              onClick={() => fijar(nuevo.clave, false, nuevo.edificio)}
            >
              Apagar solo ahí
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
