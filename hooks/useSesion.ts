"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { crearClienteNavegador } from "@/lib/supabase/client";

type EstadoSesion = {
  sesion: Session | null;
  cargando: boolean;
};

/**
 * Mismo patrón que se repetía en app.html/residente.html/operador.html
 * (`sb.auth.getSession()` + `sb.auth.onAuthStateChange()`), ahora en un
 * solo hook. La sesión real de servidor la maneja proxy.ts; esto es solo
 * para que los Client Components sepan quién está logueado y reaccionen
 * a cambios (login/logout) sin recargar la página.
 */
export function useSesion(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>({ sesion: null, cargando: true });

  useEffect(() => {
    const supabase = crearClienteNavegador();

    supabase.auth.getSession().then(({ data }) => {
      setEstado({ sesion: data.session, cargando: false });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setEstado({ sesion, cargando: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  return estado;
}
