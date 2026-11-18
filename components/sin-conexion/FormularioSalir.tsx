"use client";

import { useState, type ReactNode } from "react";
import { Confirmar } from "@/components/ui";
import { SIN_CONEXION_ACTIVO } from "@/lib/local/config";
import { usuarioLocal } from "@/lib/local/sesion-local";
import { borrarBaseDelUsuario } from "@/lib/local/almacen";
import { contarPendientes } from "@/lib/local/bandeja";

/**
 * El «Salir» de la app: un <form> que postea a /api/auth/salir (sigue
 * funcionando sin JavaScript). Con JavaScript, y con el modo sin conexión
 * encendido, antes de salir borra la copia y los borradores de este usuario
 * en este navegador (cambio 3, plan 1.1 j). Si el borrado fallara, se sale
 * igual: no se deja a nadie adentro por eso.
 *
 * Con cosas por enviar, **no deja salir** (decidido el 17-nov): salir las
 * borraría, y son pagos o gastos que todavía no están en la base.
 */
export function FormularioSalir({ children }: { children: ReactNode }) {
  const [bloqueado, setBloqueado] = useState<number | null>(null);
  return (
    <>
      <form
        action="/api/auth/salir"
        method="post"
        onSubmit={(e) => {
          if (!SIN_CONEXION_ACTIVO) return;
          e.preventDefault();
          const form = e.currentTarget;
          contarPendientes()
            .catch(() => 0)
            .then((n) => {
              if (n > 0) {
                setBloqueado(n);
                return;
              }
              return usuarioLocal()
                .then((id) => (id ? borrarBaseDelUsuario(id) : undefined))
                .catch(() => undefined)
                .finally(() => form.submit());
            });
        }}
      >
        {children}
      </form>
      {bloqueado !== null && (
        <Confirmar
          soloAviso
          titulo="Todavía no puede salir"
          texto={`Tiene ${bloqueado === 1 ? "1 cosa" : `${bloqueado} cosas`} por enviar en este equipo. Conéctese y espere a que se envíen (o revíselas en «Por enviar»): si sale ahora, se perderían.`}
          boton="Entendido"
          onSi={() => setBloqueado(null)}
          onNo={() => setBloqueado(null)}
        />
      )}
    </>
  );
}
