import { nf, usd } from "@/lib/formato";
import { bolivaresExactos } from "@/lib/residente/monto-exacto";

/**
 * Datos para pagar de un edificio (ronda 7, bloque 2, caso 80): las cuentas
 * de la tabla `datos_pago` y a cuál va cada parte de lo que se debe.
 *
 * La regla (decisión por defecto de Nicolás, 26-oct) es la misma que usa la
 * base en `correo_recibo()` y `datos_pago_de()`
 * (supabase/migrations/20261026120000_datos_pago.sql): el honorario y el
 * honorario anterior van a la cuenta de honorarios; todo lo demás, servicio
 * incluido, a la de condominio. Si el edificio no tiene cuenta de honorarios,
 * todo va a la de condominio.
 */

export type DestinoPago = "condominio" | "honorarios";
export type TipoPago = "transferencia" | "pago_movil" | "otro";

export type CuentaPago = {
  id?: string;
  destino: string;
  tipo: string;
  banco: string | null;
  titular: string | null;
  documento: string | null;
  cuenta: string | null;
  nota: string | null;
  orden: number;
};

export const TIPOS_PAGO: Record<TipoPago, string> = {
  transferencia: "Transferencia",
  pago_movil: "Pago móvil",
  otro: "Otro",
};

export const DESTINOS_PAGO: Record<DestinoPago, string> = {
  condominio: "Condominio",
  honorarios: "Honorarios de administración",
};

export const tipoPago = (t: string) => TIPOS_PAGO[t as TipoPago] ?? t;
/** «Cuenta» o «Teléfono» (pago móvil). */
export const etiquetaCuenta = (t: string) => (t === "pago_movil" ? "Teléfono" : "Cuenta");

export const tieneHonorarios = (cuentas: CuentaPago[]) => cuentas.some((c) => c.destino === "honorarios");

/** Cuánto va a cada cuenta, a partir de un recibo. */
export function repartoRecibo(
  r: { total: number | string; honorario?: number | string | null; anterior_hon?: number | string | null },
  cuentas: CuentaPago[]
): { condominio: number; honorarios: number } {
  const total = Math.max(Number(r.total) || 0, 0);
  const hon = tieneHonorarios(cuentas) ? Math.min(Math.max(Number(r.honorario || 0) + Number(r.anterior_hon || 0), 0), total) : 0;
  return { condominio: total - hon, honorarios: hon };
}

export type GrupoPago = { destino: DestinoPago; titulo: string; monto: number | null; cuentas: CuentaPago[] };

/**
 * Las cuentas agrupadas por destino, con el monto de cada grupo. Con una sola
 * clase de cuenta (sin honorarios) es un solo grupo, «Cuenta del condominio»,
 * por el total.
 */
export function gruposDePago(cuentas: CuentaPago[], reparto: { condominio: number; honorarios: number } | null): GrupoPago[] {
  const ordenadas = cuentas.slice().sort((a, b) => a.orden - b.orden);
  const hon = tieneHonorarios(cuentas);
  const grupos: GrupoPago[] = [];
  const cond = ordenadas.filter((c) => c.destino !== "honorarios");
  if (cond.length)
    grupos.push({
      destino: "condominio",
      titulo: hon ? "Condominio" : "Cuenta del condominio",
      monto: reparto ? (hon ? reparto.condominio : reparto.condominio + reparto.honorarios) : null,
      cuentas: cond,
    });
  if (hon)
    grupos.push({
      destino: "honorarios",
      titulo: DESTINOS_PAGO.honorarios,
      monto: reparto ? reparto.honorarios : null,
      cuentas: ordenadas.filter((c) => c.destino === "honorarios"),
    });
  return grupos;
}

const esc = (t: unknown) =>
  String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/**
 * El bloque «Datos para pagar» del recibo impreso (lib/recibo-papel.ts). HTML
 * con colores literales, como el resto del papel. `tasa`: Bs por dólar para
 * mostrar el monto en bolívares de cada grupo (null = sin bolívares).
 */
export function datosPagoEnPapel(cuentas: CuentaPago[], reparto: { condominio: number; honorarios: number }, tasa: number | null): string {
  const grupos = gruposDePago(cuentas, reparto);
  if (!grupos.length) return "";
  const cuerpo = grupos
    .map(
      (g) => `<div class="dp-g">
      <div class="dp-t">${esc(g.titulo)}${g.monto !== null ? `: ${usd(g.monto)}${tasa && tasa > 0 ? ` · Bs ${nf(2).format(bolivaresExactos(g.monto, tasa))}` : ""}` : ""}</div>
      ${g.cuentas
        .map(
          (c) => `<div class="dp-c"><b>${esc(tipoPago(c.tipo))}</b>${c.banco ? ` · ${esc(c.banco)}` : ""}${
            c.titular ? `<br>Titular: ${esc(c.titular)}` : ""
          }${c.documento ? ` · RIF/CI: ${esc(c.documento)}` : ""}${
            c.cuenta ? `<br>${etiquetaCuenta(c.tipo)}: <span class="dp-n">${esc(c.cuenta)}</span>` : ""
          }${c.nota ? `<br><span class="dp-o">${esc(c.nota)}</span>` : ""}</div>`
        )
        .join("")}
    </div>`
    )
    .join("");
  return `<div class="dp"><h2>Datos para pagar</h2><div class="dp-cols">${cuerpo}</div></div>`;
}
