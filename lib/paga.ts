import { normaliza } from "@/lib/admin/personas";

/**
 * Quién paga el condominio de una unidad (`unidades.paga`). La fija la
 * administradora, nunca el residente. La base guarda `text` con un CHECK
 * contra estos dos valores (ver
 * supabase/migrations/20260930120000_unidades_paga.sql), así que el tipo
 * generado dice `string`: acá se estrecha a la unión.
 */
export type Paga = "propietario" | "inquilino";

export const PAGA_POR_OMISION: Paga = "propietario";

export const OPCIONES_PAGA: { valor: Paga; etiqueta: string }[] = [
  { valor: "propietario", etiqueta: "Propietario" },
  { valor: "inquilino", etiqueta: "Inquilino" },
];

export function esPaga(valor: unknown): valor is Paga {
  return valor === "propietario" || valor === "inquilino";
}

/**
 * Lo que venga de la base, estrechado. Cualquier otra cosa —incluido
 * `undefined`, que es lo que llega si la migración todavía no se aplicó—
 * se lee como el default de la base: paga el propietario, que es lo que
 * pasaba antes de que existiera la columna.
 */
export function pagaDe(valor: string | null | undefined): Paga {
  return esPaga(valor) ? valor : PAGA_POR_OMISION;
}

/**
 * La columna "quién paga" de un pegado (ImportarUnidades). Vacía = el
 * default. Acepta mayúsculas, tildes y espacios de más; cualquier otra
 * palabra devuelve `null` para que el importador marque la fila con error,
 * en vez de adivinar.
 */
export function leerPagaPegado(texto: string | null | undefined): Paga | null {
  const t = normaliza(texto);
  if (!t) return PAGA_POR_OMISION;
  if (t === "PROPIETARIO") return "propietario";
  if (t === "INQUILINO") return "inquilino";
  return null;
}
