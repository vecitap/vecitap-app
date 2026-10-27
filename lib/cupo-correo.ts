/**
 * El cupo diario de correos (ronda 8): cómo decir cuándo sale lo que espera.
 * Lo calcula la base (`momento_cupo()`, en
 * supabase/migrations/20261027160000_correos_estado_y_cupo.sql); acá solo se
 * pone en palabras. El despachador corre cada 5 minutos: lo que cabe en el
 * cupo sale «en los próximos minutos».
 *
 * Solo desde un Client Component: usa la hora de ahora.
 */

/** Lo que devuelve `cupo_correo()`. */
export type CupoCorreo = {
  tope: number;
  usados: number;
  libre: number;
  en_cola: number;
  sale_todo_en: string | null;
  ultimo_aviso: string | null;
};

const CINCO_MIN = 6 * 60 * 1000;

const hora = (d: Date) => d.toLocaleTimeString("es-VE", { timeZone: "America/Caracas", hour: "numeric", minute: "2-digit" });

/** «hoy a las 11:45 p. m.», «mañana a las 7:10 a. m.» o «el 29 de octubre a las …». */
export function momento(iso: string): string {
  const d = new Date(iso);
  const dia = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  const hoy = new Date();
  const manana = new Date(hoy.getTime() + 24 * 3600 * 1000);
  if (dia(d) === dia(hoy)) return `hoy a las ${hora(d)}`;
  if (dia(d) === dia(manana)) return `mañana a las ${hora(d)}`;
  return `el ${d.toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "numeric", month: "long" })} a las ${hora(d)}`;
}

/** Para lo que espera en la cola: «en los próximos minutos» o «hoy a las …». null = más de un día. */
export function cuandoSale(iso: string | null | undefined): string {
  if (!iso) return "en más de un día (no cabe en el cupo de un día)";
  return new Date(iso).getTime() <= Date.now() + CINCO_MIN ? "en los próximos minutos" : momento(iso);
}

/** ¿Espera el cupo (y no solo la próxima vuelta del despachador)? */
export const esperaCupo = (iso: string | null | undefined) => !iso || new Date(iso).getTime() > Date.now() + CINCO_MIN;
