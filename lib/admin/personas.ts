import type { Vinculo } from "./tipos";

/**
 * Tolera que la unidad no traiga vínculos — un recibo de una unidad sin
 * propietario tumbaba la pantalla entera en el original. Portado de
 * `vigente`/`nombreDe` en app.html:1444-1447.
 */
export function vigente(vinculos: Vinculo[] | undefined, tipo: "propietario" | "inquilino"): Vinculo | null {
  return (vinculos ?? []).find((v) => v.tipo === tipo && !v.hasta) ?? null;
}

/**
 * Un tratamiento al principio de un nombre ("Sr. Pérez", "Sra Rosa",
 * "Dra. Gil"). La planilla de Gustavo trae el nombre así, y la base le pone
 * `prefijo = 'Sr.'` por omisión a toda persona nueva: sin esto se leía
 * "Sr. Sr. Pérez" (ronda 2, caso 39).
 */
export const TRATAMIENTO_INICIAL = /^(sr|sra|srta|sres|sras|dr|dra|ing|lic|abg)(?:\.\s*|\s+)(?=\S)/i;

export function nombreDe(v: Vinculo | null): string {
  if (!v?.personas) return "";
  const nombre = v.personas.nombre ?? "";
  // Si el nombre ya trae su tratamiento, manda ese: no se le suma el prefijo.
  if (TRATAMIENTO_INICIAL.test(nombre)) return nombre;
  return [v.personas.prefijo, nombre].filter(Boolean).join(" ");
}

/**
 * Separa el tratamiento de un nombre pegado de la planilla: "Sr. Pérez" →
 * { prefijo: "Sr.", nombre: "Pérez" }. Sin tratamiento, `prefijo` es
 * `undefined` y la base pone el suyo por omisión, como siempre.
 */
export function separarTratamiento(texto: string): { prefijo?: string; nombre: string } {
  const t = texto.trim();
  const m = t.match(TRATAMIENTO_INICIAL);
  if (!m) return { nombre: t };
  const base = m[1].toLowerCase();
  const prefijo = base.charAt(0).toUpperCase() + base.slice(1) + ".";
  return { prefijo, nombre: t.slice(m[0].length).trim() };
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
