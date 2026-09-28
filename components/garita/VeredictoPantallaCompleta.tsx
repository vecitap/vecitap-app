"use client";

import { useEffect } from "react";
import { pitar } from "@/lib/garita/pitido";

export type DatosVeredicto = {
  nombre?: string | null;
  documento?: string | null;
  unidad?: string | null;
  placa?: string | null;
};

export type AccionVeredicto = {
  texto: string;
  fuerte?: boolean;
  onClick: () => void;
};

/**
 * El veredicto a pantalla completa de garita.html:307-325: tiene que verse
 * desde lejos y de reojo — signo enorme, un pitido (880Hz si pasa, 220Hz si
 * no) y vibración. `--veredicto-si`/`--veredicto-no` son los tokens de
 * `app/globals.css` agregados en el bloque 10 justo para esto (no pisan
 * `--verde`/`--rojo`, que en el resto de la app son color de texto, no
 * superficie).
 */
export function VeredictoPantallaCompleta({
  ok,
  titulo,
  datos,
  acciones,
}: {
  ok: boolean;
  titulo: string;
  datos?: DatosVeredicto;
  acciones: AccionVeredicto[];
}) {
  useEffect(() => {
    pitar(ok);
  }, [ok]);

  return (
    <div className={`garita-veredicto ${ok ? "si" : "no"}`} role="alert" aria-live="assertive">
      <div className="garita-veredicto-signo">{ok ? "✓" : "✕"}</div>
      <div className="garita-veredicto-titulo">{titulo}</div>
      {datos?.nombre && (
        <div className="garita-veredicto-datos">
          <b>{datos.nombre}</b>
          {datos.documento && <div>{datos.documento}</div>}
          <div>Unidad {datos.unidad || "—"}</div>
          {datos.placa && <div>Vehículo {datos.placa}</div>}
        </div>
      )}
      <div className="garita-veredicto-acciones">
        {acciones.map((a) => (
          <button key={a.texto} type="button" className={a.fuerte ? "fuerte" : undefined} onClick={a.onClick}>
            {a.texto}
          </button>
        ))}
      </div>
    </div>
  );
}
