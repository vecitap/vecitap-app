/**
 * Las cuatro vistas de la garita, en el orden del <nav> de
 * garita.html:198-203.
 *
 * El original llama "buscar" a la tercera en el código y "Consultar" en la
 * pantalla; acá el segmento de URL usa la palabra que ve el vigilante.
 */
export const SECCIONES_GARITA = [
  { slug: "entrada", titulo: "Entrada" },
  { slug: "adentro", titulo: "Adentro" },
  { slug: "consultar", titulo: "Consultar" },
  { slug: "bitacora", titulo: "Bitácora" },
] as const;

export type SeccionGarita = (typeof SECCIONES_GARITA)[number]["slug"];

export const SECCION_INICIAL: SeccionGarita = "entrada";
