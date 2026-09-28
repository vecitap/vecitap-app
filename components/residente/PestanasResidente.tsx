"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { crearClienteNavegador } from "@/lib/supabase/client";

const PESTANAS = [
  { seg: "recibo", etiqueta: "Mi recibo" },
  { seg: "reportar", etiqueta: "Reportar un pago" },
  { seg: "pagos", etiqueta: "Mis pagos" },
] as const;

/**
 * Portado de las pestañas de App() en index.html:678-683 — antes estado de
 * React (`pest`), ahora rutas reales bajo /mi/[unidadId]/. La cuarta
 * pestaña, "Mis visitas", solo aparece si el edificio tiene el módulo
 * `garita` activo (index.html:634-641, `verVisitas`) — mismo patrón que
 * `hayModulo` en MarcoAdmin.tsx: si la consulta falla no se muestra la
 * pestaña, es preferible faltante a una pantalla mutilada.
 */
export function PestanasResidente({ unidadId, edificioId }: { unidadId: string; edificioId: string }) {
  const pathname = usePathname();
  const activa = pathname.split("/").filter(Boolean)[2];

  const [verVisitas, setVerVisitas] = useState(false);
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("mis_modulos", { p_edificio: edificioId }).then(({ data, error }) => {
      if (!vivo || error) return;
      const g = (data ?? []).find((m) => m.clave === "garita");
      setVerVisitas(!!(g && g.activo));
    });
    return () => {
      vivo = false;
    };
  }, [edificioId]);

  const pestanas = verVisitas ? [...PESTANAS, { seg: "visitas", etiqueta: "Mis visitas" } as const] : PESTANAS;

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {pestanas.map((t) => (
        <Link
          key={t.seg}
          href={`/mi/${unidadId}/${t.seg}`}
          className={`btn ${activa === t.seg ? "" : "btn-secundario"}`.trim()}
          style={{ flex: 1, textAlign: "center", padding: "10px 8px", fontSize: 13.5, textDecoration: "none" }}
        >
          {t.etiqueta}
        </Link>
      ))}
    </div>
  );
}
