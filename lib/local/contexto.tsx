"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CopiaEdificio } from "./almacen";

/**
 * La copia del edificio, para los componentes que en línea piden datos por
 * su cuenta al montarse (cambio 3): DeudaPorMes (detalle por mes), CierreMes
 * (gastos del mes abierto, simulación del cierre) y Cortes (recibos del mes,
 * correo). Fuera de la copia no hay nada en el contexto y esos componentes se
 * portan exactamente como antes.
 *
 * `modo`:
 * - "sin-conexion": la pantalla sin internet (la cáscara). Lo que se guarde
 *   va a la bandeja.
 * - "vista-previa": parte E, «primero la copia». Se está dibujando la copia
 *   mientras llega la página fresca del servidor; la pantalla no se puede
 *   tocar (inert) y no se lee ni se guarda ningún borrador.
 */
export type ModoCopia = "sin-conexion" | "vista-previa";

const ContextoCopia = createContext<{ copia: CopiaEdificio; modo: ModoCopia } | null>(null);

export function ProveedorCopia({ copia, modo = "sin-conexion", children }: { copia: CopiaEdificio; modo?: ModoCopia; children: ReactNode }) {
  return <ContextoCopia.Provider value={{ copia, modo }}>{children}</ContextoCopia.Provider>;
}

/** La copia si se está dibujando desde el equipo; `null` en línea. */
export function useCopiaLocal(): CopiaEdificio | null {
  return useContext(ContextoCopia)?.copia ?? null;
}

/** Cómo se está usando la copia, o `null` si la pantalla es la del servidor. */
export function useModoCopia(): ModoCopia | null {
  return useContext(ContextoCopia)?.modo ?? null;
}
