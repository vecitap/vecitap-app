// Script temporal de validación — ronda 9 del tramo 2, «Salir» del recetario
// del 28-sep: G19 (Salir borra la cookie), G11 (Atrás + F5 después de Salir) y
// K1 (Salir con 303 en Admin, /mi y /operador; la garita queda fuera: no hay
// clave de vigilante.prueba en .env.local).
//
// «Salir» cierra todas las sesiones de la cuenta: se corre DESPUÉS de
// scripts/validacion-ronda9-sesion.mjs, no a la vez.
//
// Contra `next start` (puerto 3123) conectado a vecitap-pruebas. No escribe en
// la base. Las claves salen de `.env.local`.
//
// Uso: node scripts/validacion-ronda9-salir.mjs

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const SALIDA = path.join(__dirname, "capturas-ronda9");
mkdirSync(SALIDA, { recursive: true });
const env = Object.fromEntries(
  readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
if (!/hdivffuorclzulijkyry/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error("`.env.local` no apunta a vecitap-pruebas: no se corre nada.");
  process.exit(1);
}
const CREDS = {
  admin: { email: "admin.prueba@vecitap.com", password: env.PRUEBA_ADMIN_CLAVE },
  residente: { email: "residente.prueba@vecitap.com", password: env.PRUEBA_RESIDENTE_CLAVE },
  operador: { email: "operador.prueba@vecitap.com", password: env.PRUEBA_OPERADOR_CLAVE },
};

const resultados = [];
function registrar(caso, ok, visto) {
  resultados.push({ caso, ok, visto });
  console.log(`${ok ? "PASA " : "FALLA"} [${caso}] ${visto}`);
}
async function login(page, cred) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}
const sesion = async (ctx) => (await ctx.cookies()).filter((c) => /-auth-token/.test(c.name)).map((c) => c.name);

/** Toca «Salir» y devuelve el status del POST y dónde aterriza. */
async function salir(page) {
  const post = page.waitForResponse((r) => r.url().endsWith("/api/auth/salir") && r.request().method() === "POST", { timeout: 15000 });
  await page.getByRole("button", { name: /^Salir$/ }).first().click();
  const r = await post;
  await page.waitForLoadState("networkidle").catch(() => {});
  return { status: r.status(), destino: new URL(page.url()).pathname, texto: (await page.locator("body").innerText()).slice(0, 200) };
}

const browser = await chromium.launch();
try {
  for (const [nombre, cred] of [["Admin", CREDS.admin], ["/mi", CREDS.residente], ["/operador", CREDS.operador]]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, cred);
    if (nombre === "/operador") await page.goto(`${BASE}/operador`, { waitUntil: "networkidle" });
    const antes = new URL(page.url()).pathname;
    const cookiesAntes = await sesion(ctx);
    const s = await salir(page);
    const sin405 = s.status === 303 && s.destino === "/" && !/405/.test(s.texto);
    registrar("K1", sin405, `${nombre} (${antes}): Salir → POST ${s.status}, aterriza en ${s.destino}${/405/.test(s.texto) ? " CON 405" : ""}`);
    if (nombre === "Admin") {
      const cookiesDespues = await sesion(ctx);
      registrar("G19", cookiesAntes.length > 0 && cookiesDespues.length === 0, `cookie de sesión antes: ${cookiesAntes.join(", ") || "ninguna"}; después: ${cookiesDespues.join(", ") || "ninguna"}`);
      await page.goBack({ waitUntil: "networkidle" }).catch(() => {});
      const trasAtras = new URL(page.url()).pathname;
      await page.reload({ waitUntil: "networkidle" });
      const trasF5 = new URL(page.url()).pathname;
      const datos = await page.locator("body").innerText();
      registrar("G11", trasF5.startsWith("/entrar") || trasF5 === "/", `Atrás → ${trasAtras}; F5 → ${trasF5}${/Propietarios|Cortes de cuenta/.test(datos) && !trasF5.startsWith("/entrar") ? " (MUESTRA DATOS)" : ""}`);
    }
    await ctx.close();
  }
} catch (e) {
  registrar("salir", false, `se cortó: ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await browser.close();
  writeFileSync(path.join(SALIDA, "salir.json"), JSON.stringify(resultados, null, 2));
}
