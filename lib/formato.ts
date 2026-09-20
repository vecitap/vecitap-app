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
