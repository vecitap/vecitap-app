"use client";

import { useRef, useState } from "react";
import { useDirectorioGarita } from "@/components/garita/DirectorioContexto";
import type { VehiculoAutorizado } from "@/lib/garita/tipos";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Vista 3 · Consultar — garita.html:776-833. Lista blanca de vehículos
 * (`garita_vehiculos`, debounce 280ms, mínimo 2 caracteres) y directorio
 * del edificio (filtrado en memoria sobre el directorio que ya trajo el
 * layout, máximo 60 filas). Las dos son de lectura — vista completa, sin
 * pendientes de escritura.
 */
export function VistaConsultar({ edificioId }: { edificioId: string }) {
  const directorio = useDirectorioGarita();

  const [textoVehiculo, setTextoVehiculo] = useState("");
  const [vehiculos, setVehiculos] = useState<VehiculoAutorizado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [textoDirectorio, setTextoDirectorio] = useState("");

  const buscarVehiculos = (texto: string) => {
    setTextoVehiculo(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    const t = texto.trim();
    if (t.length < 2) {
      setVehiculos([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    temporizador.current = setTimeout(async () => {
      const supabase = crearClienteNavegador();
      const { data } = await supabase.rpc("garita_vehiculos", { p_edificio: edificioId, p_texto: t });
      setBuscando(false);
      setVehiculos(data ?? []);
    }, 280);
  };

  const t = textoDirectorio.trim().toLowerCase();
  const directorioFiltrado = directorio
    .filter((u) => !t || (u.codigo || "").toLowerCase().includes(t) || (u.residente || "").toLowerCase().includes(t))
    .slice(0, 60);

  return (
    <div className="garita">
      <div className="garita-tarjeta">
        <h2>Vehículos autorizados</h2>
        <label className="garita-label" htmlFor="q">
          Placa o unidad
        </label>
        <input
          id="q"
          className="garita-campo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="AB123CD  ·  01A"
          value={textoVehiculo}
          onChange={(e) => buscarVehiculos(e.target.value)}
        />
        <div className="garita-lista" style={{ marginTop: 12 }}>
          {buscando ? (
            <div className="garita-vacio">Buscando…</div>
          ) : textoVehiculo.trim().length < 2 ? null : vehiculos.length ? (
            vehiculos.map((v) => (
              <div className="garita-item" key={v.placa}>
                <div>
                  <div className="garita-item-principal" style={{ fontFamily: "var(--font-mono)" }}>
                    {v.placa}
                  </div>
                  <div className="garita-item-secundario">{[v.marca, v.modelo, v.color].filter(Boolean).join(" ")}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="garita-item-principal">{v.unidad}</div>
                  <div className="garita-item-secundario">
                    {v.residente || ""}
                    {v.puesto ? ` · puesto ${v.puesto}` : ""}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="garita-vacio">Ese vehículo no está en la lista del edificio.</div>
          )}
        </div>
      </div>

      <div className="garita-tarjeta">
        <h2>Directorio del edificio</h2>
        <label className="garita-label" htmlFor="qd">
          Unidad o residente
        </label>
        <input
          id="qd"
          className="garita-campo"
          autoComplete="off"
          placeholder="01A  ·  apellido"
          value={textoDirectorio}
          onChange={(e) => setTextoDirectorio(e.target.value)}
        />
        <div className="garita-lista" style={{ marginTop: 12 }}>
          {directorioFiltrado.length ? (
            directorioFiltrado.map((u) => (
              <div className="garita-item" key={u.unidad_id}>
                <div className="garita-item-principal">{u.codigo}</div>
                <div className="garita-item-secundario">{u.residente || "sin registrar"}</div>
              </div>
            ))
          ) : (
            <div className="garita-vacio">Sin resultados.</div>
          )}
        </div>
      </div>
    </div>
  );
}
