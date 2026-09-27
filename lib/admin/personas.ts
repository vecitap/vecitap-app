import type { Vinculo } from "./tipos";

/**
 * Tolera que la unidad no traiga vínculos — un recibo de una unidad sin
 * propietario tumbaba la pantalla entera en el original. Portado de
 * `vigente`/`nombreDe` en app.html:1444-1447.
 */
export function vigente(vinculos: Vinculo[] | undefined, tipo: "propietario" | "inquilino"): Vinculo | null {
  return (vinculos ?? []).find((v) => v.tipo === tipo && !v.hasta) ?? null;
}

export function nombreDe(v: Vinculo | null): string {
  if (!v?.personas) return "";
  return [v.personas.prefijo, v.personas.nombre].filter(Boolean).join(" ");
}

/** Portado de `normaliza` en app.html:409-410 — para cruzar códigos de unidad sin importar tildes/puntuación. */
export function normaliza(s: string | null | undefined): string {
  return String(s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

/** Portado de `normalizarTel` en app.html:167-173 — a formato internacional para wa.me. */
export function normalizarTel(t: string | null | undefined): string | null {
  if (!t) return null;
  const d = String(t).replace(/\D/g, "");
  if (d.startsWith("58") && d.length === 12) return d;
  if (d.startsWith("0") && d.length === 11) return "58" + d.slice(1);
  if (d.length === 10) return "58" + d;
  return null;
}

/** Portado de `correoValido` en app.html:165. */
export function correoValido(c: string | null | undefined): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || "").trim());
}
