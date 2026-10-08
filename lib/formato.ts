/**
 * Ésta es **la única** copia de `nf`/`usd` del proyecto.
 *
 * En los HTML originales estaba duplicada byte a byte en los tres módulos, y
 * redeclarada una vez más dentro de `htmlRecibo()` (que arma el HTML del
 * recibo fuera del árbol de React, así que no podía cerrar sobre la de
 * arriba). Esa duplicación era inevitable ahí: sin bundler, los HTML no
 * podían importar nada.
 *
 * Aquella nota decía que las copias de los HTML no se tocaban porque los
 * archivos quedaban en la raíz como línea base de la Fase 4. **Ya no están
 * en esta rama**: la referencia de paridad es `main`, congelada, y se lee
 * con `git show main:index.html`. Acá no queda nada que desduplicar.
 */
export const nf = (decimales = 2) => {
  const f = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return {
    /**
     * Sin "-0,00" (ronda 2, 08-oct): un saldo de -0,004 —un residuo de
     * redondeo— se redondea a cero pero Intl conserva el signo. Se le quita
     * acá, en el único formateador, y no con `signDisplay: "negative"`, que
     * en navegadores viejos de teléfono tira RangeError y rompería la
     * pantalla entera.
     */
    format: (valor: number) => {
      const t = f.format(valor);
      return /^-0(?:[.,]0+)?$/.test(t) ? t.slice(1) : t;
    },
  };
};

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
 * interpretan con esta función (la de los HTML originales, con los casos
 * ambiguos corregidos el 08-oct — ver el comentario de adentro).
 */
export function num(valor: string | number | null | undefined): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? "").replace(/\s/g, "");
  if (texto === "") return null;
  if (!/^-?[\d.,]+$/.test(texto)) return null;

  /* Ronda 2 (08-oct, caso 40). La versión de los HTML tomaba todo punto
     seguido de tres dígitos como separador de miles, así que "0.123" (una
     alícuota) se leía 123, y "1,234.56" daba NaN → 0 sin aviso. Ahora:
       · con coma y punto, el que va último es el decimal;
       · con coma sola, es el decimal (como se escribe en Venezuela);
       · con un punto solo: decimal si no lo siguen exactamente tres
         dígitos, o si la parte entera es 0 ("0.123"); si no, miles ("1.500");
       · varios puntos y ninguna coma: miles ("1.234.567").
     Lo que no encaja (dos comas, letras) da null, y la pantalla avisa. */
  const coma = texto.lastIndexOf(",");
  const punto = texto.lastIndexOf(".");
  let t: string;
  if (coma > -1 && punto > -1) {
    t = coma > punto ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  } else if (coma > -1) {
    if (texto.indexOf(",") !== coma) return null;
    t = texto.replace(",", ".");
  } else if (punto > -1 && texto.indexOf(".") !== punto) {
    t = texto.replace(/\./g, "");
  } else if (punto > -1) {
    const [entera, decimales] = texto.split(".");
    t = decimales.length !== 3 || /^-?0*$/.test(entera) ? texto : texto.replace(".", "");
  } else {
    t = texto;
  }
  const n = Number(t);
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
