import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * La tasa del BCV viva, tal como la leen los tres módulos de `main`
 * (`admin.html:1151-1163`, `index.html:609-621`, `operador.html`):
 * `tasa_atrasada()` devuelve la última publicada con cuántos días de
 * atraso tiene.
 *
 * **La base es la fuente.** Es la misma tasa con la que se convierten los
 * pagos, así que la pantalla no puede mostrar una y el cálculo usar otra.
 * La trae sola una tarea diaria desde el BCV.
 */
export type TasaViva = {
  valor: number;
  fuente: string;
  actualizada: string | null;
  dias: number | null;
};

export async function tasaDelDia(
  supabase: SupabaseClient<Database>
): Promise<TasaViva | null> {
  const { data, error } = await supabase.rpc("tasa_atrasada");
  if (error) return null;
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || !(Number(fila.tasa) > 0)) return null;
  return {
    valor: Number(fila.tasa),
    fuente: "BCV",
    actualizada: fila.fecha ?? null,
    dias: fila.dias ?? null,
  };
}

/**
 * Respaldo de `admin.html:255-275` (`obtenerTasaOficial`): si la base
 * todavía no tiene ninguna tasa, se consulta DolarAPI **solo para
 * mostrarla**. No se usa para convertir nada. El BCV publica solo en su
 * web institucional, que se cae seguido.
 */
const DOLAR_API = "https://ve.dolarapi.com/v1";

type CotizacionApi = {
  promedio?: number;
  venta?: number;
  compra?: number;
  fuente?: string;
  nombre?: string;
  fechaActualizacion?: string;
};

export async function tasaDeReferencia(): Promise<TasaViva> {
  const intentos: { url: string; lista: boolean }[] = [
    { url: `${DOLAR_API}/dolares/oficial`, lista: false },
    { url: `${DOLAR_API}/dolares`, lista: true },
  ];
  let ultimo: unknown = null;
  for (const it of intentos) {
    try {
      const ctrl = new AbortController();
      const corte = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(it.url, { signal: ctrl.signal });
      clearTimeout(corte);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const d: CotizacionApi | null = it.lista
        ? Array.isArray(json)
          ? ((json as CotizacionApi[]).find((x) => /oficial/i.test(x.nombre || "")) ?? null)
          : null
        : (json as CotizacionApi);
      if (!d) throw new Error("sin cotización oficial");
      const valor = Number(d.promedio ?? d.venta ?? d.compra);
      if (!valor || !Number.isFinite(valor) || valor <= 0) throw new Error("tasa inválida");
      return {
        valor,
        fuente: (d.fuente || "BCV") + " (referencia)",
        actualizada: d.fechaActualizacion ?? null,
        dias: null,
      };
    } catch (e) {
      ultimo = e;
    }
  }
  const nombre = ultimo instanceof Error ? ultimo.name + ultimo.message : String(ultimo);
  throw new Error(/abort/i.test(nombre) ? "La consulta tardó demasiado" : "No se pudo obtener la tasa");
}
