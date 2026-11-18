"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CopiaEdificio } from "./almacen";

/**
 * La copia del edificio, para los componentes que en línea piden datos por
 * su cuenta al montarse (cambio 3): DeudaPorMes (detalle por mes), CierreMes
 * (gastos del mes abierto, simulación del cierre) y Cortes (recibos del mes,
 * correo). Fuera de la pantalla sin conexión no hay copia en el contexto y
 * esos componentes se portan exactamente como antes.
 */
const ContextoCopia = createContext<CopiaEdificio | null>(null);

export function ProveedorCopia({ copia, children }: { copia: CopiaEdificio; children: ReactNode }) {
  return <ContextoCopia.Provider value={copia}>{children}</ContextoCopia.Provider>;
}

/** La copia si se está dibujando sin conexión; `null` en línea. */
export function useCopiaLocal(): CopiaEdificio | null {
  return useContext(ContextoCopia);
}
