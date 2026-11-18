/**
 * Hora de una copia, en la zona de Venezuela («10:42»), y con el día si no es
 * de hoy («lun 17, 10:42»). Un administrador vuelve el lunes y tiene que ver
 * de un vistazo que la copia es del viernes.
 */
const ZONA = "America/Caracas";

export function formatoHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const hora = new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA }).format(fecha);
  const dia = (d: Date) => new Intl.DateTimeFormat("es-VE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONA }).format(d);
  if (dia(fecha) === dia(new Date())) return hora;
  const corto = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", timeZone: ZONA }).format(fecha);
  return `${corto}, ${hora}`;
}
