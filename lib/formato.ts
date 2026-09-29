/**
 * Antes duplicado byte a byte en app.html, residente.html y operador.html,
 * y redeclarado una vez más dentro de htmlRecibo() en app.html/residente.html
 * (generan el HTML del recibo fuera del árbol de React, por eso no podían
 * cerrar sobre el de arriba).
 *
 * Esas copias en los HTML son intencionales y NO deben eliminarse: los
 * HTML originales quedan intactos como línea base de validación de la
 * Fase 4 (decisión de la Fase 1). Esta es la versión nueva para el
 * código de Next.js, no un reemplazo de las copias viejas.
 */
export const nf = (decimales = 2) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });

export const usd = (valor: number | string | null | undefined) => "$ " + nf(2).format(Number(valor) || 0);

export const usd0 = (valor: number | string | null | undefined) => "$ " + nf(0).format(Number(valor) || 0);

export const bs = (valor: number | string | null | undefined) => "Bs " + nf(2).format(Number(valor) || 0);

/**
 * Formato de alícuota (4 decimales), igual en app.html y residente.html
 * (`pct()`, y `nf(4).format(...)` en los tres puntos donde residente.html
 * la muestra) — decisión tomada al auditar Admin: se mantiene, no se
 * redondea (ver docs/inventario-admin.md, sección 5e).
 */
export const pct = (valor: number | string | null | undefined) => nf(4).format(Number(valor) || 0) + " %";

/**
 * **La zona horaria del producto vive acá y en ningún otro lugar del
 * cliente.** Del lado de la base, su par son `hoy_local()` /
 * `inicio_dia_local()` (ver
 * `supabase/migrations/20260928140000_garita_bitacora_dia_local.sql`): las dos
 * puntas tienen que decidir el mismo día o una pantalla pide un día y la base
 * le contesta otro.
 *
 * Se usa el **nombre** de zona, no el desplazamiento `-04:00`, aunque hoy
 * sean lo mismo: Venezuela ya cambió de offset una vez (−04:30 entre 2007 y
 * 2016), así que el nombre sobrevive a un cambio de política y el número no.
 *
 * Asume que todos los clientes están en Venezuela. Es cierto hoy y está
 * registrado como decisión a revisar (ver docs/estado-migracion.md): el
 * modelo correcto a largo plazo es una zona por organización o edificio.
 */
const ZONA_VECITAP = "America/Caracas";

/** Se construye una sola vez: instanciar `Intl.DateTimeFormat` es costoso. */
const partesDiaVecitap = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_VECITAP,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * En Venezuela se escribe 5.630,15. Un input numérico descarta la coma y
 * devuelve vacío, así que los montos de los formularios son de texto y se
 * interpretan con esta función (idéntica a la de los HTML originales).
 */
export function num(valor: string | number | null | undefined): number | null {
  const texto = String(valor ?? "").trim();
  if (texto === "") return null;
  const n = Number(texto.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function num0(valor: string | number | null | undefined): number {
  return num(valor) ?? 0;
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
}

/**
 * Día/mes y hora:minuto, igual que `fechaHora()` en index.html:942-945
 * (Visitas). A diferencia de `fechaCorta`/`fechaLarga`, esta sí necesita la
 * hora local del navegador — `toLocaleString`, no el recorte de un ISO — y
 * por eso solo tiene sentido llamarla desde un Client Component.
 */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Solo hora:minuto — `hora()` de garita.html:240-241 (Adentro y Bitácora). */
export function horaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * El día de hoy en Venezuela (`America/Caracas`), como `YYYY-MM-DD`.
 *
 * **Es la única forma correcta de preguntar "qué día es hoy" en esta app.**
 * `new Date().toISOString().slice(0,10)` da el día de Greenwich: después de
 * las 20:00 hora de Venezuela ya devuelve el día siguiente. Eso causó dos
 * bugs reales (la Bitácora de Garita y la fecha de los pagos, ver
 * docs/estado-migracion.md), así que la versión en UTC —la vieja `hoyISO()`—
 * se eliminó en vez de dejarla al lado invitando a elegir la equivocada.
 *
 * **Fijada a la zona, no a la del navegador** (decisión del 28-sep): la
 * versión anterior usaba `getTimezoneOffset()`, o sea la zona del equipo. En
 * una tableta de garita con la zona mal configurada —cosa que pasa— el
 * cliente le pedía a la base un día distinto del que la base entiende por
 * "hoy". Con la zona fija, las dos puntas coinciden siempre.
 *
 * Efecto secundario bueno: al no depender de dónde corre, ahora también es
 * segura en un Server Component (antes no: servidor y navegador podían
 * calcular días distintos y romper la hidratación).
 *
 * Se arma con `formatToParts` y no con `format()` para no depender del patrón
 * de fecha de ningún locale — el orden y los separadores los pone este
 * código, no ICU.
 */
export function hoyLocalISO(): string {
  const partes = partesDiaVecitap.formatToParts(new Date());
  const buscar = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? "";
  return `${buscar("year")}-${buscar("month")}-${buscar("day")}`;
}
