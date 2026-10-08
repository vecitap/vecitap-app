"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeDeError } from "@/lib/errores";

export type EstadoAccion = "inactivo" | "enviando" | "guardado" | "error";

/**
 * El estado de una acción de guardar (bloque E, 08-oct). Junto con
 * `<Button cargando>` y `<EstadoGuardado>` es el patrón único de la app:
 *
 *   const guardar = useAccion(async () => { …; if (error) throw error; });
 *   <Button cargando={guardar.enviando} onClick={() => guardar.ejecutar()}>Guardar</Button>
 *   <EstadoGuardado estado={guardar.estado} error={guardar.error} />
 *
 * - "enviando" mientras corre `fn`;
 * - "guardado" si terminó bien, y vuelve solo a "inactivo" a los 3 s;
 * - "error" si `fn` lanzó, con el mensaje ya legible (`mensajeDeError`);
 * - si `fn` devuelve `false` (una validación que ya avisó por su cuenta),
 *   vuelve a "inactivo" sin decir "Guardado".
 *
 * `ejecutar` devuelve `true` si guardó, para encadenar (cerrar un diálogo,
 * refrescar). No usa `useTransition`: las acciones de la app son llamadas
 * directas a Supabase desde el cliente, no Server Actions, y un estado
 * propio alcanza.
 */
export function useAccion<A extends unknown[]>(fn: (...args: A) => Promise<void | boolean>, duracionMs = 3000) {
  const [estado, setEstado] = useState<EstadoAccion>("inactivo");
  const [error, setError] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // La última versión de `fn` (cierra sobre el estado del formulario).
  const ultima = useRef(fn);
  useEffect(() => {
    ultima.current = fn;
  });
  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  const ejecutar = useCallback(
    async (...args: A): Promise<boolean> => {
      if (temporizador.current) clearTimeout(temporizador.current);
      setEstado("enviando");
      setError(null);
      try {
        const r = await ultima.current(...args);
        if (r === false) {
          setEstado("inactivo");
          return false;
        }
        setEstado("guardado");
        temporizador.current = setTimeout(() => setEstado((s) => (s === "guardado" ? "inactivo" : s)), duracionMs);
        return true;
      } catch (e) {
        setError(mensajeDeError(e));
        setEstado("error");
        return false;
      }
    },
    [duracionMs]
  );

  return { ejecutar, estado, error, enviando: estado === "enviando" };
}
