/**
 * El orden de las unidades en todas las listas de la app (ronda 9, B3, caso
 * 100): natural por código, piso y letra —01A, 01B, 01C, 01D, 02A…, y 2A
 * antes que 10A—. Antes cada lista salía en el orden en que llegaba: en
 * Cortes, el de los recibos en la base (01A, 01B, 01D, 05C, 04A…), y las que
 * venían ordenadas lo estaban como texto.
 *
 * Sin distinguir mayúsculas ni acentos, con los números como números.
 */
const colador = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function compararCodigos(a: string | null | undefined, b: string | null | undefined): number {
  return colador.compare(a ?? "", b ?? "");
}

/** Una copia ordenada por el código que devuelve `codigo`. */
export function ordenarPorCodigo<T>(filas: readonly T[], codigo: (f: T) => string | null | undefined): T[] {
  return filas.slice().sort((x, y) => compararCodigos(codigo(x), codigo(y)));
}
