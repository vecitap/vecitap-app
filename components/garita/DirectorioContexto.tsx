"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DirectorioItem } from "@/lib/garita/tipos";

const DirectorioContexto = createContext<DirectorioItem[]>([]);

/**
 * `garita.html` trae el directorio una sola vez por edificio
 * (`cargarEdificio()`, garita.html:995-1002) y lo reusa en Entrada (select
 * de unidad) y Consultar (búsqueda) sin volver a pedirlo. Acá cada vista es
 * su propia ruta, así que el layout de `[edificioId]` lo trae una sola vez
 * del lado del servidor y lo reparte por contexto — cambiar de pestaña no
 * dispara un nuevo `garita_directorio()`.
 */
export function DirectorioProvider({
  directorio,
  children,
}: {
  directorio: DirectorioItem[];
  children: ReactNode;
}) {
  return <DirectorioContexto.Provider value={directorio}>{children}</DirectorioContexto.Provider>;
}

export function useDirectorioGarita() {
  return useContext(DirectorioContexto);
}
