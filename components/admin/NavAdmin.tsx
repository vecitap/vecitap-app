"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Portado del menú de App() en app.html:1005-1015 — solo las 4 secciones
 * de la Sesión 1 (Inicio, Propietarios, Cobros, Cierre del mes). Pagos,
 * Cortes de cuenta, Accesos y Ajustes se agregan en la Sesión 2: no se
 * listan acá a propósito para no dejar enlaces que todavía no existen
 * (ver docs/estado-migracion.md).
 */
const SECCIONES = [
  { seg: "inicio", etiqueta: "Inicio" },
  { seg: "propietarios", etiqueta: "Propietarios" },
  { seg: "cobros", etiqueta: "Cobros" },
  { seg: "mes", etiqueta: "Cierre del mes" },
];

export function NavAdmin({ orgId, edificioId }: { orgId: string; edificioId: string }) {
  const pathname = usePathname();
  const activa = pathname.split("/").filter(Boolean)[3];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
      {SECCIONES.map((s) => (
        <Link
          key={s.seg}
          href={`/admin/${orgId}/${edificioId}/${s.seg}`}
          className={`btn btn-mini ${activa === s.seg ? "" : "btn-secundario"}`.trim()}
          style={{ textDecoration: "none" }}
        >
          {s.etiqueta}
        </Link>
      ))}
    </div>
  );
}
