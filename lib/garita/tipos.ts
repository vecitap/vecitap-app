import type { Database } from "@/types/supabase";

/**
 * Fila devuelta por `garita_edificios()` — una garita asignada a la sesión.
 *
 * Ojo con `org`: es el **nombre** de la organización, no su id. Por eso la
 * ruta de la garita no lleva segmento de organización (ver
 * docs/estado-migracion.md, "Ruta de la garita").
 */
export type GaritaAsignada = Database["public"]["Functions"]["garita_edificios"]["Returns"][number];

/** Fila de `garita_directorio()` — se carga una vez por edificio (ver DirectorioContexto). */
export type DirectorioItem = Database["public"]["Functions"]["garita_directorio"]["Returns"][number];

/** Resultado de `garita_validar()` — el veredicto de un código de invitación. */
export type ValidacionCodigo = Database["public"]["Functions"]["garita_validar"]["Returns"][number];

/** Fila de `garita_visitante()` — autocompletado por cédula en "Visita sin anunciar". */
export type VisitanteConocido = Database["public"]["Functions"]["garita_visitante"]["Returns"][number];

/** Fila de `garita_dentro()` — quién está adentro ahora mismo. */
export type VisitaDentro = Database["public"]["Functions"]["garita_dentro"]["Returns"][number];

/** Fila de `garita_vehiculos()` — resultado de buscar en la lista blanca. */
export type VehiculoAutorizado = Database["public"]["Functions"]["garita_vehiculos"]["Returns"][number];

/** Fila de `garita_bitacora()` — una anotación del día. */
export type NotaBitacora = Database["public"]["Functions"]["garita_bitacora"]["Returns"][number];
