"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = ["inicio", "propietarios", "cobros", "mes"];

/**
 * Portado del selector de edificios de App() en app.html:1213-1226 — antes
 * estado de React sin URL, ahora un segmento de ruta propio (decisión de
 * ruteo del inventario, sección 2): conserva la sección activa al cambiar
 * de edificio, mismo patrón que SelectorUnidad.tsx en Residente.
 */
export function SelectorEdificio({
  orgId,
  edificios,
  edificioIdActual,
}: {
  orgId: string;
  edificios: { id: string; nombre: string }[];
  edificioIdActual: string;
}) {
  const pathname = usePathname();
  const segmentos = pathname.split("/").filter(Boolean);
  const seccionActual = SECCIONES.includes(segmentos[3]) ? segmentos[3] : "inicio";

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {edificios.map((e) => (
        <Link
          key={e.id}
          href={`/admin/${orgId}/${e.id}/${seccionActual}`}
          className={`btn btn-mini ${e.id === edificioIdActual ? "" : "btn-secundario"}`.trim()}
          style={{ textDecoration: "none" }}
        >
          {e.nombre}
        </Link>
      ))}
    </div>
  );
}
