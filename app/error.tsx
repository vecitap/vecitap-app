"use client";

import { useState } from "react";
import { Button, Card, PantallaMarca } from "@/components/ui";
import { DIGEST_SIN_CONEXION } from "@/lib/sin-conexion";

/**
 * Pantalla de error de toda la app (envuelve todo lo que está debajo del
 * layout raíz: los cuatro módulos y sus layouts).
 *
 * El caso que la motivó (05-oct): `usuarioActual()` lanza `ErrorSinConexion`
 * cuando el servidor de Auth no contesta (ver lib/sin-conexion.ts). Antes
 * ese fallo terminaba en /entrar, como si la sesión se hubiera cerrado.
 * Ahora termina acá, con "No pudimos conectar" y un botón que vuelve a pedir
 * la página al servidor (`retry`, estable desde Next 16.3: re-pide y
 * re-renderiza, a diferencia de `reset`, que solo re-renderiza).
 *
 * Cualquier otro error también cae acá, con un texto genérico y el mismo
 * botón. En producción Next no deja ver el mensaje real de un error de
 * servidor (solo un identificador, `digest`), así que no se muestra.
 */
export default function ErrorDeLaApp({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [reintentando, setReintentando] = useState(false);
  const sinConexion = error.digest === DIGEST_SIN_CONEXION;

  return (
    <PantallaMarca>
      <Card>
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>
          {sinConexion ? "No pudimos conectar. Reintente" : "Algo falló al cargar esta página"}
        </h1>
        <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          {sinConexion
            ? "El servidor tardó demasiado en responder. Su sesión sigue abierta: no hace falta volver a entrar."
            : "Puede ser un problema de conexión. Si se repite, avísele a Vecitap."}
        </p>
        <Button
          type="button"
          cargando={reintentando}
          style={{ width: "100%" }}
          onClick={() => {
            setReintentando(true);
            retry();
            // Si el reintento vuelve a fallar, esta misma pantalla se monta
            // de nuevo; si sale bien, desaparece. En los dos casos el botón
            // tiene que volver a estar disponible.
            setTimeout(() => setReintentando(false), 4000);
          }}
        >
          Reintentar
        </Button>
        {error.digest && !sinConexion && (
          <p className="mono" style={{ color: "var(--tenue)", fontSize: 11.5, marginBottom: 0, textAlign: "center" }}>
            Referencia: {error.digest}
          </p>
        )}
      </Card>
    </PantallaMarca>
  );
}
