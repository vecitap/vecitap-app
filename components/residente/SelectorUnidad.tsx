"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Database } from "@/types/supabase";

type Unidad = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

const PESTANAS = ["recibo", "reportar", "pagos"];

/** Portado del selector de unidades de App() en residente.html:271-279.
 * A diferencia del original (estado de React, sin URL), acá cada unidad
 * es una ruta propia — conserva la pestaña activa al cambiar de unidad. */
export function SelectorUnidad({
  unidades,
  unidadIdActual,
}: {
  unidades: Unidad[];
  unidadIdActual: string;
}) {
  const pathname = usePathname();
  const segmentos = pathname.split("/").filter(Boolean);
  const pestanaActual = PESTANAS.includes(segmentos[2]) ? segmentos[2] : "recibo";

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {unidades.map((u) => (
        <Link
          key={u.unidad_id}
          href={`/mi/${u.unidad_id}/${pestanaActual}`}
          className={`btn btn-mini ${u.unidad_id === unidadIdActual ? "" : "btn-secundario"}`.trim()}
          style={{ textDecoration: "none" }}
        >
          {u.edificio} · {u.codigo}
        </Link>
      ))}
    </div>
  );
}
