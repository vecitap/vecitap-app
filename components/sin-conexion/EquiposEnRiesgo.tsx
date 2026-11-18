"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop } from "lucide-react";
import { Aviso, Button, Confirmar } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { formatoFechaHora } from "@/lib/formato";
import { mensajeDeError } from "@/lib/errores";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { equipoId } from "@/lib/local/almacen";

/**
 * «Equipos sin conexión» (cambio 3, parte B, plan 2.7), en Gastos del mes,
 * arriba de «Cerrar el mes».
 *
 * La base no deja cerrar el mes de un edificio si algún equipo puede tener
 * cosas por enviar de él: los que avisaron que tienen pendientes, y los que
 * se quedaron sin conexión (más de 3 minutos sin avisar) con la app abierta.
 * Acá se ven, y cualquier administrador puede liberar uno cuando quien lo
 * usa confirma que no tiene nada por enviar. Queda en la auditoría.
 */
type Equipo = {
  equipo_id: string;
  quien: string;
  descripcion: string | null;
  pendientes: number;
  estado: string;
  ultimo_contacto: string;
  es_mio: boolean;
};

const MIRAR_CADA_MS = 60 * 1000;

export function EquiposEnRiesgo({ edificioId }: { edificioId: string }) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [liberar, setLiberar] = useState<Equipo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Este navegador: sus cosas por enviar ya las avisa Gastos del mes.
  const [este, setEste] = useState<string | null>(null);
  useEffect(() => {
    usuarioLocal()
      .then((u) => (u ? equipoId(u) : null))
      .then(setEste)
      .catch(() => undefined);
  }, []);

  const leer = useCallback(async () => {
    const { data, error: e } = await crearClienteNavegador().rpc("equipos_en_riesgo", { p_edificio: edificioId });
    // Sin la migración aplicada (o sin conexión) no se muestra nada: el
    // bloqueo lo hace la base igual.
    if (e) return [] as Equipo[];
    return (data ?? []) as Equipo[];
  }, [edificioId]);

  useEffect(() => {
    let vivo = true;
    const ciclo = () =>
      leer().then((l) => {
        if (vivo) setEquipos(l);
      });
    void ciclo();
    const reloj = window.setInterval(ciclo, MIRAR_CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [leer]);

  const otros = equipos.filter((e) => e.equipo_id !== este);
  if (!otros.length && !error) return null;

  const texto = (e: Equipo) =>
    `${e.es_mio ? "Otro equipo suyo" : `El equipo de ${e.quien}`}${e.descripcion ? ` (${e.descripcion})` : ""}: ${
      e.pendientes > 0
        ? `tiene ${e.pendientes === 1 ? "1 cosa" : `${e.pendientes} cosas`} sin enviar`
        : `sin conexión desde el ${formatoFechaHora(e.ultimo_contacto)}; puede tener cosas por enviar`
    }.`;

  return (
    <Aviso tono="ambar" titulo="Equipos sin conexión">
      <p style={{ margin: "0 0 8px" }}>Mientras estén en esta lista, el mes no se puede cerrar.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {otros.map((e) => (
          <div key={e.equipo_id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Laptop size={15} />
            <span style={{ flex: 1, minWidth: 200 }}>{texto(e)}</span>
            <Button type="button" mini variante="secundario" onClick={() => setLiberar(e)}>
              {e.es_mio ? "Ese equipo no tiene nada por enviar" : "Confirma que no tiene nada por enviar"}
            </Button>
          </div>
        ))}
      </div>
      {error && <p style={{ margin: "8px 0 0", color: "var(--rojo)" }}>{error}</p>}
      {liberar && (
        <Confirmar
          titulo="¿Liberar ese equipo?"
          texto={`Hágalo solo si ${liberar.es_mio ? "está seguro de que ese otro equipo suyo" : `${liberar.quien} confirma que su equipo`} no tiene nada por enviar de este edificio. Si después aparece algo de este mes, va a quedar para revisar. Queda registrado quién lo liberó.`}
          boton="Liberar"
          onNo={() => setLiberar(null)}
          onSi={async () => {
            const e = liberar;
            setLiberar(null);
            setError(null);
            const { error: err } = await crearClienteNavegador().rpc("liberar_equipo", { p_equipo: e.equipo_id, p_edificio: edificioId });
            if (err) return setError(mensajeDeError(err));
            setEquipos(await leer());
          }}
        />
      )}
    </Aviso>
  );
}
