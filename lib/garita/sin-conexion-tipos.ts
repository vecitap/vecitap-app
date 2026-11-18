import type { Database } from "@/types/supabase";
import type { DirectorioItem, GaritaAsignada, VisitaDentro } from "./tipos";

/** Fila de `garita_lista_del_dia()`: una invitación de hoy, con el código resumido (sha256), nunca el código. */
export type InvitacionDelDia = Database["public"]["Functions"]["garita_lista_del_dia"]["Returns"][number];

/**
 * La copia de una garita en el equipo (cambio 3, parte D, plan 10.5). Se
 * guarda en la base local del usuario (lib/local/almacen.ts, almacén
 * `garita`), aparte de las copias de Administración.
 */
export type CopiaGarita = {
  edificioId: string;
  version: number;
  sincronizadoEn: string; // ISO
  correo: string;
  garitas: GaritaAsignada[];
  directorio: DirectorioItem[];
  lista: InvitacionDelDia[];
  dentro: VisitaDentro[];
};

export const VERSION_COPIA_GARITA = 1;
