"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { seg: "recibo", etiqueta: "Mi recibo" },
  { seg: "reportar", etiqueta: "Reportar un pago" },
  { seg: "pagos", etiqueta: "Mis pagos" },
];

/** Portado de las 3 pestañas de App() en residente.html:493-498 — antes
 * estado de React (`pest`), ahora rutas reales bajo /mi/[unidadId]/. */
export function PestanasResidente({ unidadId }: { unidadId: string }) {
  const pathname = usePathname();
  const activa = pathname.split("/").filter(Boolean)[2];

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {PESTANAS.map((t) => (
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
