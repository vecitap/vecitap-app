/**
 * Antes duplicado byte a byte en app.html, residente.html y operador.html,
 * y redeclarado una vez más dentro de htmlRecibo() en app.html/residente.html
 * (generan el HTML del recibo fuera del árbol de React, por eso no podían
 * cerrar sobre el de arriba).
 *
 * Esas copias en los HTML son intencionales y NO deben eliminarse: los
 * HTML originales quedan intactos como línea base de validación de la
 * Fase 4 (decisión de la Fase 1). Esta es la versión nueva para el
 * código de Next.js, no un reemplazo de las copias viejas.
 */
export const nf = (decimales = 2) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

export const usd = (valor: number | string | null | undefined) => "$ " + nf(2).format(Number(valor) || 0);

export const usd0 = (valor: number | string | null | undefined) => "$ " + nf(0).format(Number(valor) || 0);

export const bs = (valor: number | string | null | undefined) => "Bs " + nf(2).format(Number(valor) || 0);

export const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * En Venezuela se escribe 5.630,15. Un input numérico descarta la coma y
 * devuelve vacío, así que los montos de los formularios son de texto y se
 * interpretan con esta función (idéntica a la de los HTML originales).
 */
export function num(valor: string | number | null | undefined): number | null {
  const texto = String(valor ?? "").trim();
  if (texto === "") return null;
  const n = Number(texto.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function num0(valor: string | number | null | undefined): number {
  return num(valor) ?? 0;
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}
