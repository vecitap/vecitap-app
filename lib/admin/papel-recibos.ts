import { fechaCorta } from "@/lib/formato";
import { nombreDe, vigente } from "@/lib/admin/personas";
import { reciboEnPapel } from "@/lib/recibo-papel";
import type { ReciboAdmin, TasaViva, Unidad } from "@/lib/admin/tipos";
import type { CuentaPago } from "@/lib/datos-pago";

export type DatosRecibosAdmin = {
  edificio: { nombre: string; rif: string | null };
  organizacion: { nombre: string; logo_url: string | null };
  unidades: Unidad[];
  etiqueta: string | null | undefined;
  /** La tasa del BCV de hoy (la de arriba de la pantalla), no la congelada del período. */
  tasa: TasaViva | null;
  /** Las cuentas del edificio para pagar (`datos_pago`, ronda 7). */
  cuentas?: CuentaPago[];
  /** La organización cobra solo en dólares (ronda 7, bloque 4). */
  soloUsd?: boolean;
};

/**
 * Un recibo de Admin en papel. Salía de `armar()` dentro de Cortes.tsx; vive
 * acá desde la ronda 4 porque lo usan la vista previa de Cortes (en
 * pantalla) y la ruta para imprimir (`cortes/papel/route.ts`), y los dos
 * tienen que mostrar el mismo papel.
 */
export function reciboAdminEnPapel(r: ReciboAdmin, d: DatosRecibosAdmin): string {
  const u = d.unidades.find((x) => x.id === r.unidad_id);
  const p = vigente(u?.vinculos, "propietario");
  const q = vigente(u?.vinculos, "inquilino");
  return reciboEnPapel({
    edificio: d.edificio.nombre,
    organizacion: d.organizacion.nombre,
    rif: d.edificio.rif,
    logoOrg: d.organizacion.logo_url || "",
    unidad: u?.codigo,
    propietario: nombreDe(p) || nombreDe(q),
    vence: fechaCorta(r.vence_el),
    tasaHoy: d.tasa && d.tasa.valor > 0 ? { valor: d.tasa.valor, fecha: d.tasa.actualizada } : null,
    cuentas: d.cuentas,
    soloUsd: d.soloUsd,
    recibo: { ...r, etiqueta: d.etiqueta },
  });
}

/**
 * Todos los recibos en un solo documento, uno por página. Es lo que
 * permite mandarlos a imprimir o guardarlos como un PDF único mientras no
 * exista el servidor de envíos.
 */
export function recibosAdminEnPapel(recibos: ReciboAdmin[], d: DatosRecibosAdmin): string {
  if (recibos.length === 1) return reciboAdminEnPapel(recibos[0], d);
  const cuerpos = recibos
    .map((r) => {
      const dentro = reciboAdminEnPapel(r, d).split("<body>")[1].split("</body>")[0];
      return `<div style="page-break-after:always">${dentro}</div>`;
    })
    .join("");
  const cabeza = reciboAdminEnPapel(recibos[0], d).split("</head>")[0] + "</head>";
  return cabeza + "<body>" + cuerpos + "</body></html>";
}
