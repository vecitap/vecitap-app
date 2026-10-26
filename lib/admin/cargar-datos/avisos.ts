import type { Campo } from "./columnas";
import type { FilaPrevia, Nivel } from "./analisis";

/**
 * Los avisos de la previa de «Cargar datos», agrupados (ronda 7, caso 79):
 * una línea por tipo de aviso («12 filas sin correo del propietario») y, al
 * tocar «ver más», las filas. No decide nada: lee lo que ya armó
 * `analizar()`.
 */

export type ItemAviso = {
  fila: number;
  codigo: string;
  texto: string;
  /** El campo que se corrige para resolverlo (si se puede corregir en la previa). */
  campo?: Campo;
  /** Fila sin alícuota: se ofrece cargarla como estacionamiento. */
  sinAlicuota?: boolean;
  /** Espera «¿es la misma persona?»: se ofrecen el teléfono, los correos y la cédula de la fila. */
  persona?: boolean;
};

export type GrupoAviso = {
  clave: string;
  nivel: Exclude<Nivel, "info">;
  /** «sin correo del propietario…»: lo que va después de «N filas». */
  titulo: string;
  items: ItemAviso[];
};

/** Sin lo que cambia de fila a fila: lo que va entre «» y la lista de filas. */
function generico(texto: string) {
  return texto
    .replace(/«[^»]*»/g, "«…»")
    .replace(/\s*\(filas [^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function agruparAvisos(filas: FilaPrevia[]): GrupoAviso[] {
  const grupos = new Map<string, GrupoAviso>();
  const sumar = (nivel: GrupoAviso["nivel"], titulo: string, item: ItemAviso) => {
    const clave = `${nivel}|${titulo}`;
    const g = grupos.get(clave) ?? { clave, nivel, titulo, items: [] };
    // Una fila aparece una sola vez por grupo (dos personas con el mismo aviso).
    if (!g.items.some((i) => i.fila === item.fila && i.campo === item.campo)) g.items.push(item);
    grupos.set(clave, g);
  };

  for (const f of filas) {
    if (f.estado === "no") {
      const motivo = f.motivo ?? "no se carga";
      sumar("rojo", `no se cargan: ${generico(motivo)}`, {
        fila: f.fila,
        codigo: f.codigo,
        texto: motivo,
        campo: f.motivoCampo,
        sinAlicuota: f.sinAlicuota,
      });
      continue;
    }
    for (const [campo, v] of Object.entries(f.campos)) {
      const n = v?.nota;
      if (n?.nivel !== "ambar") continue;
      sumar("ambar", n.grupo ?? generico(n.texto), { fila: f.fila, codigo: f.codigo, texto: n.texto, campo: (n.campo ?? campo) as Campo });
    }
    for (const n of f.notas) {
      if (n.nivel !== "ambar") continue;
      sumar("ambar", n.grupo ?? generico(n.texto), {
        fila: f.fila,
        codigo: f.codigo,
        texto: n.queda ? `${n.texto} (se queda: ${n.queda})` : n.texto,
        campo: n.campo,
        persona: n.persona,
      });
    }
  }
  // Primero lo rojo (no se carga), después lo más repetido.
  return [...grupos.values()].sort((a, b) => (a.nivel === b.nivel ? b.items.length - a.items.length : a.nivel === "rojo" ? -1 : 1));
}

/** El resumen de una línea: filas bien, con avisos (ámbar) y con errores (rojo). */
export function contarFilas(filas: FilaPrevia[]) {
  let bien = 0;
  let ambar = 0;
  let rojo = 0;
  for (const f of filas) {
    if (f.estado === "no") rojo++;
    else if (f.notas.some((n) => n.nivel === "ambar") || Object.values(f.campos).some((c) => c?.nota?.nivel === "ambar")) ambar++;
    else bien++;
  }
  return { bien, ambar, rojo };
}
