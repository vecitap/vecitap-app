"use client";

import { useEffect, useState } from "react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { EVENTO_REVISAR_CUENTA } from "@/lib/cuenta-navegador";

/**
 * Avisa cuando la sesión de ESTE navegador ya no es la de la cuenta con la
 * que se armó la página.
 *
 * **Por qué (validación del 04-oct, 23:02–23:07 de Venezuela):** la sesión
 * vive en cookies, y las cookies son una sola por navegador, no por
 * pestaña. Con Accesos abierto como administradora en una pestaña, entrar
 * como inquilino en otra cambió la sesión de las dos. La pestaña de Accesos
 * siguió mostrando lo de la administradora, pero sus botones ya llamaban a
 * la base como inquilino: "Sin permiso para invitar" y dos "Sin permiso" al
 * revocar (confirmado en los logs de pruebas). Después, el "Salir" del
 * inquilino cerró la única sesión del navegador, y al recargar Accesos la
 * app mandó a Entrar. Nada de eso fue un fallo de la base ni de Auth.
 *
 * No cambia nada de la sesión ni de los permisos (la base ya rechazaba bien
 * esas llamadas): solo lo hace visible, con un botón para recargar. Revisa
 * al volver a la pestaña (`visibilitychange`) y en cada evento de sesión
 * del cliente. `getSession()` lee las cookies del navegador, sin viaje al
 * servidor; acá no decide ningún acceso, solo si mostrar el aviso.
 *
 * También revisa cuando una pantalla se lo pide (`EVENTO_REVISAR_CUENTA`,
 * desde `otraCuentaEnNavegador()`): Accesos lo hace antes de cada acción y,
 * si la cuenta cambió, no la envía (08-oct, prueba 5).
 */
export function AvisoCambioDeCuenta({ usuarioId }: { usuarioId: string }) {
  const [otra, setOtra] = useState<"otra" | "ninguna" | null>(null);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    let vivo = true;

    async function revisar() {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      const actual = data.session?.user.id ?? null;
      setOtra(actual === usuarioId ? null : actual ? "otra" : "ninguna");
    }

    function alVolver() {
      if (document.visibilityState === "visible") revisar();
    }

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_REVISAR_CUENTA, revisar);
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      revisar();
    });
    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_REVISAR_CUENTA, revisar);
      sub.subscription.unsubscribe();
    };
  }, [usuarioId]);

  if (!otra) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 560,
        margin: "0 auto",
        padding: "14px 16px",
        borderRadius: "var(--radio)",
        background: "var(--lienzo)",
        border: "1px solid var(--rojo)",
        boxShadow: "0 8px 30px rgba(0,0,0,.18)",
        fontSize: 13.5,
        lineHeight: 1.5,
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: "1 1 260px" }}>
        {otra === "otra"
          ? "En este navegador se abrió otra cuenta. Lo que haga en esta pestaña se haría con esa otra cuenta."
          : "La sesión de este navegador se cerró (por ejemplo, desde otra pestaña)."}
      </span>
      <button type="button" className="btn btn-mini" onClick={() => window.location.reload()}>
        Recargar
      </button>
    </div>
  );
}
