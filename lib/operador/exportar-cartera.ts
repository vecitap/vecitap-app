import { nf } from "@/lib/formato";
import { PLANES } from "./planes";
import type { ClienteCartera } from "./tipos";

/** Portado de exportar() en operador.html:881-897 (solo la construcción del
 * CSV — el disparo de la descarga, por ser una API del navegador, vive en
 * el componente que llama a esta función). */
export function csvCartera(cartera: ClienteCartera[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    [
      "administradora",
      "rif",
      "estado",
      "plan",
      "cuota_mes",
      "edificios",
      "unidades",
      "proximo_cobro",
      "le_debe",
      "contacto",
      "telefono",
      "correo",
    ].join(","),
    ...cartera.map((c) =>
      [
        esc(c.nombre),
        esc(c.rif),
        esc(c.estado),
        esc(PLANES[c.plan] ?? c.plan),
        esc(nf(2).format(c.cuota_mes || 0)),
        esc(c.edificios),
        esc(c.unidades),
        esc(c.proximo_cobro),
        esc(nf(2).format(c.monto_pendiente || 0)),
        esc(c.contacto),
        esc(c.telefono),
        esc(c.correo),
      ].join(",")
    ),
  ].join("\n");
}
