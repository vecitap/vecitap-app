// Script temporal de validación automatizada — Bloque 0 de
// docs/estado-migracion.md ("Casos de validación en escritura", sección
// "Revalidación de lo que ya estaba validado y se tocó hoy").
//
// Requiere `playwright` instalado temporalmente (`npm install --no-save
// playwright`, ver docs/estado-migracion.md) y `npm run dev` corriendo
// contra vecitap-pruebas (.env.local) en http://localhost:3000.
//
// SOLO LECTURA: no envía ningún formulario que escriba en la base (no
// AltaUnidad, no ImportarUnidades/Saldos, no CierreMes, no Accesos->invitar,
// no CrearOrganizacion/NuevoEdificio). Los únicos POST que dispara son los
// de auth (signInWithPassword vía Supabase), que no tocan tablas de negocio.
//
// Uso: node scripts/validacion-bloque0.mjs
// Salida: scripts/capturas-bloque0/*.png + tabla de resultados en stdout.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const CAPTURAS = path.join(__dirname, "capturas-bloque0");
mkdirSync(CAPTURAS, { recursive: true });

const CREDS = {
  admin: { email: "admin.prueba@vecitap.com", password: "temporal.1234" },
  residente: { email: "residente.prueba@vecitap.com", password: "12345678" },
  operador: { email: "operador.prueba@vecitap.com", password: "temporal.1234" },
};

// Hashes conocidos de los logos ya sincronizados (raíz -> public/, sesión
// anterior) — si estos no coinciden, public/ no está sirviendo lo mismo que
// la raíz del repo.
const HASH_LOGO_CLARO = "4cbdbf9df235f85a2ac3d1d5f7998d0be170b7f763fd7a414e943c9b46e01e0b";
const HASH_LOGO_OSCURO = "8243090df555148b15b9f45bf219de0db3b576cee3d8cfb9c59835baaee2766c";

const resultados = [];
let n = 0;

function registrar(caso, esperado, resultado, ok, notas = "") {
  n += 1;
  resultados.push({ n, caso, esperado, resultado, ok, notas });
  console.log(`${ok ? "PASA" : "FALLA"} [${n}] ${caso} — ${resultado}${notas ? " (" + notas + ")" : ""}`);
}

async function shot(page, nombre) {
  const archivo = path.join(CAPTURAS, `${String(n).padStart(2, "0")}-${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: true });
  return archivo;
}

/**
 * `/destino` encadena varios `redirect()` de servidor (`/destino` ->
 * `/admin` -> `/admin/<org>` -> `/admin/<org>/<ed>/inicio`, con una
 * llamada RPC a Supabase por cada organización candidata en el camino).
 * Cada hop es una petición GET propia (200, no 3xx — confirmado mirando
 * el log de `npm run dev`).
 *
 * Ojo con el marcador de "ya llegamos": `/admin/[orgId]/layout.tsx` (con
 * "Salir" en `EncabezadoAdmin`) renderiza ANTES de que su página hija
 * (`/admin/[orgId]/page.tsx`, que decide a qué edificio redirigir)
 * termine — el App Router de Next hace streaming del layout mientras la
 * página sigue pendiente (el indicador "Rendering…" de Next dev lo
 * confirma). Esperar solo "Salir" corta ahí, un nivel antes de lo que
 * hace falta. Por eso `marcadores` es explícito por rol: para Admin hay
 * que esperar algo del NIVEL DE EDIFICIO (`NavAdmin`, "Inicio") o de una
 * pantalla que YA SABEMOS que no redirige más ("Nueva administradora" /
 * "Su administradora"), no el encabezado de la organización.
 */
async function login(page, cred, volver, marcadores = ['text="Salir"']) {
  const url = volver ? `${BASE}/entrar?volver=${encodeURIComponent(volver)}` : `${BASE}/entrar`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await Promise.race([
    ...marcadores.map((m) => page.waitForSelector(m, { timeout: 30000 })),
    page.waitForSelector(".campo-error", { timeout: 30000 }),
  ]).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

const MARCADORES_ADMIN = ['a:has-text("Inicio")', "text=Nueva administradora", "text=Su administradora"];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const erroresConsola = [];
  page.on("pageerror", (e) => erroresConsola.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") erroresConsola.push(msg.text());
  });

  // ── 1. Clave incorrecta ──────────────────────────────────────────
  try {
    await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
    await page.fill("input[type=email]", CREDS.admin.email);
    await page.fill("input[type=password]", "clave-mala-a-proposito");
    await page.click("button[type=submit]");
    await page.waitForSelector(".campo-error", { timeout: 8000 });
    const texto = (await page.locator(".campo-error").innerText()).trim();
    const archivo = await shot(page, "clave-incorrecta");
    registrar(
      "Clave incorrecta",
      'Aviso visible "Correo o contraseña incorrectos."',
      texto,
      /incorrect/i.test(texto),
      archivo
    );
  } catch (e) {
    await shot(page, "clave-incorrecta-error");
    registrar("Clave incorrecta", "Aviso visible", "ERROR: " + e.message, false);
  }

  // ── 2. Login admin SIN volver -> /destino -> /admin/... ─────────
  let orgId = null;
  let edificioId = null;
  try {
    await login(page, CREDS.admin, undefined, MARCADORES_ADMIN);
    const url = page.url();
    const archivo = await shot(page, "destino-admin");
    const m = url.match(/\/admin\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/inicio/i);
    if (m) {
      orgId = m[1];
      edificioId = m[2];
    }
    registrar(
      "Login admin sin `volver` (por /destino)",
      "Termina bajo /admin/<org>/<edificio>/inicio",
      url,
      url.includes("/admin/") && !!orgId,
      archivo
    );
  } catch (e) {
    registrar("Login admin sin `volver`", "/admin/...", "ERROR: " + e.message, false);
  }

  // ── 3. Recorrido de secciones de Admin ───────────────────────────
  if (orgId && edificioId) {
    for (const seccion of ["inicio", "propietarios", "cobros", "mes", "accesos"]) {
      try {
        const resp = await page.goto(`${BASE}/admin/${orgId}/${edificioId}/${seccion}`, {
          waitUntil: "networkidle",
        });
        const archivo = await shot(page, `admin-${seccion}`);
        registrar(
          `Admin → ${seccion}`,
          "Carga sin error (status 200)",
          `status=${resp.status()}`,
          resp.status() === 200,
          archivo
        );
      } catch (e) {
        registrar(`Admin → ${seccion}`, "Carga sin error", "ERROR: " + e.message, false);
      }
    }
  } else {
    registrar("Recorrido de secciones de Admin", "—", "OMITIDO: no se resolvió orgId/edificioId", false);
  }

  // ── 4. orgId / edificioId con formato inválido ───────────────────
  // `/admin/no-es-uuid` lo intercepta proxy.ts ANTES de llegar al layout
  // (matchea `/admin/([^/]+)`, ve que no es un uuid, tiene_rol() nunca se
  // llama, falla cerrado a `/`) — no llega a ser un 404 de Next, es un
  // redirect a la home. El 404 real (`esUuid()` en el layout) se ejerce en
  // el caso siguiente, con un orgId válido y un edificioId inválido, que sí
  // pasa el filtro de proxy.ts y llega al layout.
  try {
    const resp = await page.goto(`${BASE}/admin/no-es-uuid`, { waitUntil: "networkidle" });
    const archivo = await shot(page, "admin-orgid-invalido");
    const urlFinal = page.url();
    registrar(
      "`/admin/no-es-uuid`",
      "proxy.ts rebota a `/` antes de llegar al layout (fail-closed)",
      `status=${resp.status()}, url final=${urlFinal}`,
      resp.status() === 200 && urlFinal === `${BASE}/`,
      archivo
    );
  } catch (e) {
    registrar("`/admin/no-es-uuid`", "Rebota a /", "ERROR: " + e.message, false);
  }

  if (orgId) {
    try {
      const resp = await page.goto(`${BASE}/admin/${orgId}/no-es-uuid`, { waitUntil: "networkidle" });
      const archivo = await shot(page, "admin-edificioid-invalido");
      registrar(
        "`/admin/<org>/no-es-uuid`",
        "404 limpio",
        `status=${resp.status()}`,
        resp.status() === 404,
        archivo
      );
    } catch (e) {
      registrar("`/admin/<org>/no-es-uuid`", "404 limpio", "ERROR: " + e.message, false);
    }
  }

  // ── 5. Tema oscuro, recargando con la preferencia ya guardada ────
  if (orgId && edificioId) {
    try {
      await page.goto(`${BASE}/admin/${orgId}/${edificioId}/inicio`, { waitUntil: "networkidle" });
      await page.click("text=Modo oscuro");
      await page.waitForTimeout(300);
      await shot(page, "tema-oscuro-antes-de-recargar");
      await page.reload({ waitUntil: "networkidle" });
      const archivo = await shot(page, "tema-oscuro-tras-recargar");
      const temaLS = await page.evaluate(() => {
        try {
          return localStorage.getItem("vecitap-tema");
        } catch {
          return null;
        }
      });
      const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      registrar(
        "Tema oscuro persiste al recargar",
        "localStorage=oscuro, sin flash del tema claro",
        `localStorage=${temaLS}, fondo=${fondo}`,
        temaLS === "oscuro" && fondo === "rgb(7, 12, 28)",
        archivo
      );
      // Volver a claro para no afectar el resto de las capturas.
      await page.click("text=Modo claro");
      await page.waitForTimeout(200);
    } catch (e) {
      registrar("Tema oscuro persiste al recargar", "—", "ERROR: " + e.message, false);
    }
  }

  // ── 6. Logos nuevos servidos por Next (hash, no solo visual) ─────
  try {
    const [rc, ro] = await Promise.all([
      page.request.get(`${BASE}/logo-claro.png`),
      page.request.get(`${BASE}/logo-oscuro.png`),
    ]);
    const hc = createHash("sha256").update(await rc.body()).digest("hex");
    const ho = createHash("sha256").update(await ro.body()).digest("hex");
    registrar(
      "logo-claro.png servido == raíz del repo",
      HASH_LOGO_CLARO,
      hc,
      hc === HASH_LOGO_CLARO
    );
    registrar(
      "logo-oscuro.png servido == raíz del repo",
      HASH_LOGO_OSCURO,
      ho,
      ho === HASH_LOGO_OSCURO
    );
  } catch (e) {
    registrar("Logos nuevos servidos", "—", "ERROR: " + e.message, false);
  }

  // ── 7. Estado de cuenta imprimible con la paleta nueva ───────────
  if (orgId && edificioId) {
    try {
      await page.goto(`${BASE}/admin/${orgId}/${edificioId}/propietarios`, { waitUntil: "networkidle" });
      const primerEnlace = page.locator("table.tabla tbody tr td.mono a").first();
      await primerEnlace.waitFor({ timeout: 8000 });
      await primerEnlace.click();
      await page.waitForLoadState("networkidle");
      await shot(page, "ficha-unidad");

      const [popup] = await Promise.all([
        context.waitForEvent("page", { timeout: 8000 }),
        page.click("text=Imprimir o guardar en PDF"),
      ]);
      await popup.waitForLoadState("domcontentloaded");
      const html = await popup.content();
      const archivo = path.join(CAPTURAS, `${String(n + 1).padStart(2, "0")}-estado-cuenta-imprimible.png`);
      await popup.screenshot({ path: archivo, fullPage: true });
      registrar(
        "Estado de cuenta imprimible con paleta nueva",
        'contiene "#0A1128" (tinta nueva), no "#111144" (vieja)',
        html.includes("#0A1128") ? "tiene #0A1128" : "NO tiene #0A1128",
        html.includes("#0A1128") && !html.includes("#111144"),
        archivo
      );
      await popup.close();
    } catch (e) {
      registrar("Estado de cuenta imprimible", "—", "ERROR: " + e.message, false);
    }
  }

  // ── 8. residente.prueba escribiendo /admin a mano -> debe rebotar ─
  // (se hace ANTES de cerrar sesión de admin, con una pestaña nueva, para
  // no perder el contexto de sesión de admin a mitad del script)
  await context.clearCookies();
  try {
    await login(page, CREDS.residente);
    const urlDestino = page.url();
    const archivoDestino = await shot(page, "destino-residente");
    registrar(
      "Login residente sin `volver` (por /destino)",
      "Termina bajo /mi/...",
      urlDestino,
      urlDestino.includes("/mi/"),
      archivoDestino
    );

    const resp = await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const archivo = await shot(page, "residente-en-admin-a-mano");
    const veCrearOrg = await page.locator("text=Nueva administradora").count();
    // "Su administradora" (con ese título exacto) solo se renderiza en la
    // rama de 2+ organizaciones administradas de verdad — a diferencia de
    // buscar el nombre de la org en todo el texto de la página, esto no
    // matchea el placeholder del formulario ("Administradora Unión, c.a."
    // es solo un ejemplo de ayuda, no un dato real).
    const veListaDeOrgs = await page.locator("text=Su administradora").count();
    const enlacesAOrg = await page.locator('a[href^="/admin/"]').count();
    registrar(
      "residente.prueba escribe /admin a mano",
      'Rebota: NO lista organizaciones reales, muestra "Nueva administradora" sola',
      `status=${resp.status()}, ve "Nueva administradora"=${veCrearOrg > 0}, ve lista de orgs=${veListaDeOrgs > 0}, enlaces a /admin/<org>=${enlacesAOrg}`,
      veCrearOrg > 0 && veListaDeOrgs === 0 && enlacesAOrg === 0,
      archivo
    );
  } catch (e) {
    registrar("residente.prueba en /admin", "Rebota", "ERROR: " + e.message, false);
  }

  // ── 9. Recorrido de Residente + uuid inválido ────────────────────
  try {
    await page.goto(`${BASE}/mi`, { waitUntil: "networkidle" });
    const url = page.url();
    const m = url.match(/\/mi\/([0-9a-f-]{36})\/recibo/i);
    const archivo = await shot(page, "residente-recibo");
    registrar("Residente entra a /mi", "Termina en /mi/<unidad>/recibo", url, !!m, archivo);

    if (m) {
      const unidadId = m[1];
      for (const seccion of ["recibo", "reportar", "pagos"]) {
        const resp = await page.goto(`${BASE}/mi/${unidadId}/${seccion}`, { waitUntil: "networkidle" });
        const a = await shot(page, `residente-${seccion}`);
        registrar(`Residente → ${seccion}`, "Carga sin error", `status=${resp.status()}`, resp.status() === 200, a);
      }
    }

    const respInvalido = await page.goto(`${BASE}/mi/no-es-uuid`, { waitUntil: "networkidle" });
    const archivoInvalido = await shot(page, "mi-uuid-invalido");
    registrar(
      "`/mi/no-es-uuid`",
      "404 limpio",
      `status=${respInvalido.status()}`,
      respInvalido.status() === 404,
      archivoInvalido
    );
  } catch (e) {
    registrar("Recorrido de Residente", "—", "ERROR: " + e.message, false);
  }

  // ── 10. Login operador SIN volver -> /destino -> /operador ───────
  await context.clearCookies();
  try {
    await login(page, CREDS.operador);
    const url = page.url();
    const archivo = await shot(page, "destino-operador");
    registrar(
      "Login operador sin `volver` (por /destino)",
      "Termina en /operador",
      url,
      url.endsWith("/operador") || url.includes("/operador?") || url.includes("/operador#"),
      archivo
    );
  } catch (e) {
    registrar("Login operador sin `volver`", "/operador", "ERROR: " + e.message, false);
  }

  await browser.close();

  // ── Reporte ───────────────────────────────────────────────────────
  const filas = resultados
    .map(
      (r) =>
        `| ${r.n} | ${r.caso} | ${r.esperado} | ${r.resultado} | ${r.ok ? "✅ PASA" : "❌ FALLA"} |`
    )
    .join("\n");
  const tabla =
    "| # | Caso | Esperado | Resultado | Estado |\n|---|---|---|---|---|\n" + filas;

  const fallidos = resultados.filter((r) => !r.ok);
  console.log("\n" + tabla + "\n");
  console.log(`Total: ${resultados.length} casos — ${resultados.length - fallidos.length} pasan, ${fallidos.length} fallan.`);

  if (erroresConsola.length > 0) {
    console.log("\n⚠️ Errores de consola del navegador durante la corrida:");
    erroresConsola.forEach((e) => console.log("  - " + e));
  }

  writeFileSync(
    path.join(CAPTURAS, "reporte.md"),
    `# Reporte de validación — Bloque 0 (27-sep)\n\n${tabla}\n\n` +
      `Total: ${resultados.length} casos — ${resultados.length - fallidos.length} pasan, ${fallidos.length} fallan.\n` +
      (erroresConsola.length > 0
        ? `\n## Errores de consola del navegador\n\n` + erroresConsola.map((e) => `- ${e}`).join("\n") + "\n"
        : "")
  );

  process.exit(fallidos.length > 0 ? 1 : 0);
})();
