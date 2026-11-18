"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SIN_CONEXION_ACTIVO } from "./config";
import { usuarioLocal } from "./sesion-local";
import { borrarBorrador, guardarBorrador, leerBorrador } from "./almacen";
import { useModoCopia } from "./contexto";

/**
 * Formularios que no se pierden (cambio 3, plan sección 3).
 *
 * `useBorrador(clave, valor, aplicar, vacio)` mira el estado que el
 * formulario ya tiene (`valor`) y lo guarda en el equipo medio segundo
 * después de cada cambio (IndexedDB confirma en el disco al terminar cada
 * escritura: en un apagón se pierde, como mucho, el último medio segundo).
 * No reemplaza los `useState` del formulario: para restaurar, llama a
 * `aplicar(valorGuardado)`.
 *
 * Al volver a abrir el formulario, si había un borrador, **no lo pone solo**:
 * lo ofrece («Recuperamos lo que estaba escribiendo · Seguir · Descartar»),
 * para no llenar un formulario con algo que ya no se quería.
 *
 * - `vacio(valor)`: el formulario no tiene nada que valga guardar (por
 *   ejemplo, sin monto ni referencia). Vacío → se borra el borrador.
 * - `limpiar()`: llamarlo al guardar con éxito.
 * - Vence a los 7 días. Se borra al cerrar sesión con todo lo demás.
 * - Solo texto y selecciones: los archivos no se guardan.
 *
 * Con el interruptor del modo sin conexión apagado no hace nada.
 */
const ESPERA_MS = 500;
const VENCE_MS = 7 * 24 * 60 * 60 * 1000;

export type Recuperable<T> = { valor: T; guardadoEn: string } | null;

export function useBorrador<T>(claveForm: string | null, valor: T, aplicar: (v: T) => void, vacio: (v: T) => boolean) {
  // En la vista previa de la copia (parte E) el formulario es de mentira: ni
  // ofrece ni guarda borradores; lo hace la página de verdad cuando llega.
  const clave = useModoCopia() === "vista-previa" ? null : claveForm;
  const [recuperable, setRecuperable] = useState<Recuperable<T>>(null);
  // No se guarda nada hasta haber leído el borrador anterior: si no, el
  // formulario vacío lo pisaría antes de poder ofrecerlo.
  const [leido, setLeido] = useState(false);
  const usuario = useRef<string | null>(null);
  const funciones = useRef({ aplicar, vacio });
  useEffect(() => {
    funciones.current = { aplicar, vacio };
  });

  useEffect(() => {
    if (!SIN_CONEXION_ACTIVO || !clave) return;
    let vivo = true;
    (async () => {
      try {
        const id = await usuarioLocal();
        usuario.current = id;
        if (!id) return;
        const b = await leerBorrador(id, clave);
        if (!vivo || !b) return;
        const viejo = Date.now() - new Date(b.guardadoEn).getTime() > VENCE_MS;
        if (viejo || funciones.current.vacio(b.valor as T)) {
          await borrarBorrador(id, clave);
          return;
        }
        setRecuperable({ valor: b.valor as T, guardadoEn: b.guardadoEn });
      } catch {
        // Sin IndexedDB el formulario funciona igual, sin borrador.
      } finally {
        if (vivo) setLeido(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  useEffect(() => {
    // Mientras se ofrece un borrador, no se lo pisa con el formulario vacío.
    if (!SIN_CONEXION_ACTIVO || !clave || !leido || recuperable) return;
    const reloj = window.setTimeout(() => {
      const id = usuario.current;
      if (!id) return;
      const accion = funciones.current.vacio(valor)
        ? borrarBorrador(id, clave)
        : guardarBorrador(id, { clave, valor, guardadoEn: new Date().toISOString() });
      accion.catch(() => undefined);
    }, ESPERA_MS);
    return () => window.clearTimeout(reloj);
  }, [valor, clave, leido, recuperable]);

  const seguir = useCallback(() => {
    if (recuperable) funciones.current.aplicar(recuperable.valor);
    setRecuperable(null);
  }, [recuperable]);

  const olvidar = useCallback(() => {
    setRecuperable(null);
    if (usuario.current && clave) borrarBorrador(usuario.current, clave).catch(() => undefined);
  }, [clave]);

  return { recuperable, seguir, descartar: olvidar, limpiar: olvidar };
}
