/**
 * La URL pública del sitio, para armar los enlaces **absolutos** que salen de
 * la app: los que Supabase Auth mete dentro de un correo (`emailRedirectTo`,
 * `redirectTo`) y los que Admin copia al portapapeles para mandarle a un
 * residente o a un vigilante.
 *
 * Ninguna de las tres URLs del proyecto está escrita en el código. La
 * precedencia, y el motivo de cada escalón:
 *
 * 1. **`NEXT_PUBLIC_SITE_URL`**, si está definida. En Vercel se define **solo
 *    en Production**, con `https://vecitap.com`. Es lo que garantiza que un
 *    correo de confirmación caiga en el dominio de verdad y no en el alias
 *    `*.vercel.app` que Vercel también deja apuntando a producción, ni en
 *    `www.vecitap.com`.
 * 2. **El origen real del navegador.** Sin la variable —o sea en local y en
 *    cada Preview— es el único valor que acierta: la URL de un Preview cambia
 *    en cada deploy, así que no hay dónde escribirla.
 * 3. **`VERCEL_URL` / `NEXT_PUBLIC_VERCEL_URL`**, para ese mismo caso pero
 *    desde el servidor, donde no hay `window`. Las inyecta Vercel sola.
 * 4. `http://localhost:3000`, último recurso: `npm run dev`/`next start` sin
 *    ninguna variable puesta.
 *
 * Por eso **`NEXT_PUBLIC_SITE_URL` no se pone en Preview ni en `.env.local`**:
 * definirla ahí rompería justo el caso 2, mandando los correos de un Preview
 * al dominio de producción.
 */

const LOCAL = "http://localhost:3000";

/** Le pone esquema si no lo trae (Vercel da el host pelado) y saca la barra final. */
function normalizar(valor: string): string {
  const conEsquema = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
  return conEsquema.replace(/\/+$/, "");
}

export function baseDelSitio(): string {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicita) return normalizar(explicita);

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return normalizar(vercel);

  return LOCAL;
}

/**
 * `urlDelSitio("/entrar")` → `https://vecitap.com/entrar` en producción,
 * `http://localhost:3000/entrar` en local, y la URL del deploy en un Preview.
 */
export function urlDelSitio(ruta: string = "/"): string {
  return new URL(ruta, `${baseDelSitio()}/`).toString();
}

/**
 * Origen inventado contra el que se parsea la ruta para comprobar que no se
 * escapa del sitio. `.invalid` es un TLD reservado (RFC 2606): no resuelve y
 * no lo puede registrar nadie, así que si por un error esta URL terminara
 * usada de verdad, no lleva a ningún lado.
 */
const CENTINELA = "http://interno.invalid";

/**
 * Saneado de la ruta a la que se vuelve después de confirmar un correo o de
 * recuperar la clave. El valor **viaja dentro del enlace del correo** y
 * vuelve por la URL, así que se trata como entrada ajena: solo se acepta una
 * ruta relativa de este mismo sitio. Si no lo es, devuelve `porDefecto` en
 * vez de fallar — nunca propaga el valor dudoso.
 *
 * Lo que rechaza, y por qué cada uno (los cuatro se comprobaron contra el
 * parser de URL real, no de memoria):
 *
 * · `https://ajeno.com`, `javascript:…` — cualquier cosa con esquema.
 * · `//ajeno.com` — sin esquema pero con autoridad: hereda el del sitio y
 *   sale igual.
 * · `/\ajeno.com` y cualquier `\` — para el parser de URL la barra invertida
 *   **es** una barra normal en los esquemas http/https, así que `/\ajeno.com`
 *   equivale a `//ajeno.com`.
 * · `/⇥/ajeno.com` con tabulador, salto de línea o retorno de carro —
 *   **este es el que no es obvio**: el parser de URL (y los navegadores)
 *   **borran** esos tres caracteres antes de interpretar la dirección, así
 *   que `/⇥/ajeno.com` se convierte en `//ajeno.com` después de una
 *   comprobación ingenua de `startsWith("//")`. Por eso se limpian primero y
 *   se comprueba sobre el texto ya limpio.
 * · `/..//ajeno.com` — el `..` normaliza a un `pathname` que arranca con
 *   `//`, que si alguien lo volviera a parsear sería otra vez una autoridad.
 *
 * Y la red final, que es la que hace que la lista de arriba no tenga que ser
 * exhaustiva: se parsea contra un origen centinela y **se exige que el origen
 * resultante siga siendo ese**. Cualquier forma nueva de escaparse que no
 * esté en la lista cae igual acá.
 */
export function rutaInterna(valor: string | null | undefined, porDefecto = "/destino"): string {
  if (typeof valor !== "string" || valor === "") return porDefecto;

  // Tabuladores, saltos de línea y retornos: se borran ANTES de comprobar
  // nada, porque es lo que hace el parser (ver arriba).
  const limpio = valor.replace(/[\t\n\r]/g, "").trim();

  if (!limpio.startsWith("/")) return porDefecto; // esquemas y URLs absolutas
  if (limpio.startsWith("//")) return porDefecto; // autoridad sin esquema
  if (limpio.includes("\\")) return porDefecto; // `\` == `/` para el parser

  let parseada: URL;
  try {
    parseada = new URL(limpio, CENTINELA);
  } catch {
    return porDefecto;
  }
  if (parseada.origin !== CENTINELA) return porDefecto;

  // Tras normalizar (`/..//x` → `//x`) el camino tiene que seguir siendo una
  // ruta, no una autoridad.
  if (!parseada.pathname.startsWith("/") || parseada.pathname.startsWith("//")) {
    return porDefecto;
  }

  // La portada de venta no es un destino de quien acaba de entrar (prueba 7
  // del tramo 1, 07-oct): `/` sirve public/inicio.html por el rewrite de
  // next.config.ts, una página estática que no sabe nada de la sesión.
  if (parseada.pathname === "/" || parseada.pathname === "/inicio.html") {
    return porDefecto;
  }

  // Se devuelve la forma ya normalizada, no el texto crudo. El fragmento se
  // descarta a propósito: no le sirve a nadie en una cabecera Location y es
  // superficie de más.
  return parseada.pathname + parseada.search;
}
