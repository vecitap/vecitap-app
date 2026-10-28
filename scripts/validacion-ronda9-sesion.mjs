// Script temporal de validación — ronda 9 del tramo 2, pruebas de sesión del
// recetario del 28-sep (docs/estado-migracion.md, «Ronda 9» → «Validación»):
// la sección J completa (9, 10, 16, 17 y 18: «la sesión que vence a la hora»).
//
// Sin atajos (el recetario lo pide): no se toca la configuración de Auth ni se
// borran cookies. Se abren dos sesiones —residente.prueba en /mi y
// admin.prueba en Admin—, se dejan quietas y se espera a que venza el token de
// verdad, dos veces (≈ 2 h 10 min en total).
//
//   · Primer vencimiento (+62 min): 16 (residente pide /operador: el 307 trae
//     set-cookie y sigue en /mi sin pedir clave), 9 (admin navega a otra
//     sección sin pasar por /entrar) y 17 (admin pide una organización
//     ajena: rebota con set-cookie y la sesión sigue viva).
//   · Segundo vencimiento (+124 min): 18 (el 16 otra vez en la misma pestaña)
//     y 10 (F5 en la de admin).
//
// Contra `next start` (puerto 3123) conectado a vecitap-pruebas. Solo lee: no
// escribe nada en la base. Las claves salen de `.env.local`.
//
// Uso: node scripts/validacion-ronda9-sesion.mjs
// Salida: scripts/capturas-ronda9/sesion.json (ignorada por Git) y la consola.

import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const SALIDA = path.join(__dirname, "capturas-ronda9");
mkdirSync(SALIDA, { recursive: true });
const ESPERA_MIN = Number(process.env.VALIDACION_ESPERA_MIN || 62);
// Una organización que no es de admin.prueba (la del recetario, caso 17).
const ORG_AJENA = "6e44e227-d1e0-47a8-a3d2-120876b83c85";

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
};

const resultados = [];
const guardar = () => writeFileSync(path.join(SALIDA, "sesion.json"), JSON.stringify(resultados, null, 2));
function registrar(caso, ok, visto) {
  resultados.push({ caso, ok, visto, en: new Date().toISOString() });
  console.log(`${ok ? "PASA " : "FALLA"} [${caso}] ${visto}`);
  guardar();
}
const esperar = (min) => new Promise((r) => setTimeout(r, min * 60 * 1000));

async function login(page, cred) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Huella de la cookie de sesión (para ver que se renovó sin mostrar el token). */
async function huella(ctx) {
  const c = (await ctx.cookies()).filter((x) => /-auth-token/.test(x.name)).map((x) => x.value).join("");
  return c ? createHash("sha256").update(c).digest("hex").slice(0, 10) : "sin cookie";
}

/** Pide una ruta que rebota y devuelve el status del primer salto y si trae set-cookie. */
async function rebote(page, url) {
  const final = await page.goto(url, { waitUntil: "networkidle" });
  let req = final?.request();
  while (req?.redirectedFrom()) req = req.redirectedFrom();
  const primera = req ? await req.response() : null;
  const setCookie = primera ? await primera.headerValue("set-cookie") : null;
  return { status: primera?.status(), conCookie: !!setCookie && /-auth-token/.test(setCookie), destino: new URL(page.url()).pathname };
}

const browser = await chromium.launch();
try {
  const cr = await browser.newContext();
  const ca = await browser.newContext();
  const pr = await cr.newPage();
  const pa = await ca.newPage();
  await login(pr, CREDS.residente);
  await login(pa, CREDS.admin);
  // Con más de una administradora, el login deja a admin.prueba en la lista
  // /admin: la prueba necesita una sección (VALIDACION_ADMIN_INICIO, la ruta
  // de Inicio de un edificio suyo).
  if (process.env.VALIDACION_ADMIN_INICIO) await pa.goto(`${BASE}/${process.env.VALIDACION_ADMIN_INICIO.replace(/^\/+/, "")}`, { waitUntil: "networkidle" });
  const inicioMi = pr.url();
  const inicioAdmin = pa.url();
  console.log(`Sesiones abiertas (${new Date().toLocaleTimeString()}): residente en ${new URL(inicioMi).pathname}, admin en ${new URL(inicioAdmin).pathname}`);
  const h0 = { r: await huella(cr), a: await huella(ca) };

  for (const vuelta of [1, 2]) {
    console.log(`Esperando ${ESPERA_MIN} min a que venza el token (vuelta ${vuelta})…`);
    await esperar(ESPERA_MIN);

    // 16 (vuelta 1) / 18 (vuelta 2): el residente pide /operador.
    const antes = await huella(cr);
    const r = await rebote(pr, `${BASE}/operador`);
    await pr.goto(inicioMi, { waitUntil: "networkidle" });
    const sigue = !new URL(pr.url()).pathname.startsWith("/entrar");
    const caso = vuelta === 1 ? "J16" : "J18";
    registrar(
      caso,
      r.status === 307 && r.conCookie && sigue,
      `/operador → ${r.status} con set-cookie: ${r.conCookie ? "sí" : "no"}, aterriza en ${r.destino}; después /mi: ${sigue ? "sigue adentro" : "pidió clave"} · cookie ${antes} → ${await huella(cr)}`
    );

    if (vuelta === 1) {
      // 9: admin navega a otra sección.
      const antesA = await huella(ca);
      const otra = inicioAdmin.replace(/\/[^/]+$/, "/propietarios");
      await pa.goto(otra, { waitUntil: "networkidle" });
      const ok9 = new URL(pa.url()).pathname.endsWith("/propietarios");
      registrar("J9", ok9, `navega a ${new URL(pa.url()).pathname} sin pasar por /entrar: ${ok9 ? "sí" : "no"} · cookie ${antesA} → ${await huella(ca)}`);
      // 17: organización ajena.
      const r17 = await rebote(pa, `${BASE}/admin/${ORG_AJENA}`);
      await pa.goto(inicioAdmin, { waitUntil: "networkidle" });
      const vivo = !new URL(pa.url()).pathname.startsWith("/entrar");
      registrar("J17", r17.status === 307 && vivo, `org ajena → ${r17.status}, set-cookie: ${r17.conCookie ? "sí" : "no (el token ya estaba renovado)"}, aterriza en ${r17.destino}; sesión ${vivo ? "viva" : "cerrada"}`);
    } else {
      // 10: F5 en la de admin.
      const antesA = await huella(ca);
      await pa.reload({ waitUntil: "networkidle" });
      const ok10 = !new URL(pa.url()).pathname.startsWith("/entrar");
      registrar("J10", ok10, `F5 en ${new URL(pa.url()).pathname}: ${ok10 ? "carga sin pedir clave" : "pidió clave"} · cookie ${antesA} → ${await huella(ca)}`);
    }
  }
  console.log("Huellas iniciales:", JSON.stringify(h0));
} catch (e) {
  registrar("J", false, `se cortó: ${String(e).slice(0, 300)}`);
} finally {
  await browser.close();
  guardar();
}
