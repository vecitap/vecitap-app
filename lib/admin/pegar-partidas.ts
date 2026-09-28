import { num } from "@/lib/formato";

/**
 * "Pegar categorías y partidas": interpreta lo que sale de una hoja de
 * cálculo. Portado de `partir`/`leido` en admin.html:5734-5760.
 *
 * Se acepta lo que sale de Excel o Google Sheets tal cual: columnas
 * separadas por tabulación. También punto y coma, barra vertical, o dos
 * espacios seguidos, que es lo que queda al copiar de un PDF.
 *
 * El monto es la última columna que sea un número. Lo que queda delante se
 * reparte según cuántas columnas haya, y lo entendido se muestra antes de
 * guardar nada: nadie carga a ciegas 40 partidas.
 */

export type FilaPegada =
  | { tipo: "categoria"; categoria: string; concepto?: undefined; referencia?: undefined; monto: null }
  | { tipo: "partida"; categoria: string; concepto: string; referencia: string; monto: number };

function partir(l: string): string[] {
  if (l.includes("\t")) return l.split("\t");
  if (l.includes(";")) return l.split(";");
  if (l.includes("|")) return l.split("|");
  return l.split(/\s{2,}/);
}

export function interpretarPegado(pegado: string): FilaPegada[] {
  return String(pegado || "")
    .split(/\r?\n/)
    .map((linea): FilaPegada | null => {
      const l = linea.trim();
      if (!l) return null;
      const cols = partir(l).map((c) => c.trim());
      const ultimo = cols[cols.length - 1] || "";
      const monto = num(ultimo.replace(/[^0-9.,-]/g, ""));
      const campos = monto === null ? cols.slice() : cols.slice(0, -1);
      while (campos.length && campos[campos.length - 1] === "") campos.pop();

      // Una sola columna sin monto es el nombre de una categoría
      if (monto === null && campos.length <= 1) {
        return { tipo: "categoria", categoria: campos[0] || "", monto: null };
      }
      let categoria = "";
      let concepto = "";
      let referencia = "";
      if (campos.length >= 3) [categoria, concepto, referencia] = campos;
      else if (campos.length === 2) [categoria, concepto] = campos;
      else concepto = campos[0] || "";
      return { tipo: "partida", categoria, concepto, referencia, monto: monto ?? 0 };
    })
    .filter((x): x is FilaPegada => x !== null);
}
