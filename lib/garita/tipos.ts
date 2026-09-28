import type { Database } from "@/types/supabase";

/**
 * Fila devuelta por `garita_edificios()` — una garita asignada a la sesión.
 *
 * Ojo con `org`: es el **nombre** de la organización, no su id. Por eso la
 * ruta de la garita no lleva segmento de organización (ver
 * docs/estado-migracion.md, "Ruta de la garita").
 */
export type GaritaAsignada = Database["public"]["Functions"]["garita_edificios"]["Returns"][number];
