import { IBM_Plex_Mono, Inter, League_Spartan } from "next/font/google";

/* ══════════════════════════════════════════════════════════════
   MARCA · TIPOGRAFÍAS
   El único lugar donde se eligen las letras de toda la app.

   - Títulos: League Spartan (la del logotipo, según el manual de marca).
   - Texto e interfaz: Inter.
   - Cifras (dinero, alícuotas, tasas, referencias): IBM Plex Mono.

   Para cambiar una, se reemplaza el import de arriba y la llamada de
   abajo, SIN tocar el nombre de la variable CSS (`--font-marca-*`):
   `app/globals.css` y todos los componentes leen esos nombres.
   Ver docs/MARCA-como-cambiar.md.
   ══════════════════════════════════════════════════════════════ */

export const fuenteTitulos = League_Spartan({
  variable: "--font-marca-titulos",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const fuenteTexto = Inter({
  variable: "--font-marca-texto",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const fuenteMono = IBM_Plex_Mono({
  variable: "--font-marca-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

/** Las clases que `app/layout.tsx` pone en <html>. */
export const clasesFuentes = [fuenteTitulos, fuenteTexto, fuenteMono]
  .map((f) => f.variable)
  .join(" ");
