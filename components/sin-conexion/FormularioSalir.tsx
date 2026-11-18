"use client";

import type { ReactNode } from "react";
import { SIN_CONEXION_ACTIVO } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { borrarBaseDelUsuario } from "@/lib/local/almacen";

/**
 * El «Salir» de la app: un <form> que postea a /api/auth/salir (sigue
 * funcionando sin JavaScript). Con JavaScript, y con el modo sin conexión
 * encendido, antes de salir borra la copia y los borradores de este usuario
 * en este navegador (cambio 3, plan 1.1 j). Si el borrado fallara, se sale
 * igual: no se deja a nadie adentro por eso.
 *
 * La parte B le suma el bloqueo cuando hay cosas por enviar (decidido el
 * 17-nov).
 */
export function FormularioSalir({ children }: { children: ReactNode }) {
  return (
    <form
      action="/api/auth/salir"
      method="post"
      onSubmit={(e) => {
        if (!SIN_CONEXION_ACTIVO) return;
        e.preventDefault();
        const form = e.currentTarget;
        usuarioLocal()
          .then((id) => (id ? borrarBaseDelUsuario(id) : undefined))
          .catch(() => undefined)
          .finally(() => form.submit());
      }}
    >
      {children}
    </form>
  );
}
