// Script temporal de validación en el navegador — ronda 8 del tramo 2
// (docs/estado-migracion.md, «Ronda 8» → «Validación»).
//
// Contra `next start` (nunca `npm run dev`), conectado a vecitap-pruebas, con
// los datos propios de la organización «ZZZ Validación Ronda 8» (ZZZ Torre A,
// B y C). No usa las cuentas ni los datos de Gustavo.
//
// Requiere `playwright` instalado temporalmente (`npm install --no-save
// playwright`) y `npx next start -p 3123` corriendo. Las claves de las cuentas
// de prueba salen de `.env.local` (PRUEBA_*_CLAVE), nunca de este archivo: el
// repo es público.
//
// Uso: node scripts/validacion-ronda8.mjs [A1|A2|A3|A4|C|R|movil]...
// Salida: scripts/capturas-ronda8/*.png (ignorada por Git) y el resultado de
// cada paso en la consola.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const CAPTURAS = path.join(__dirname, "capturas-ronda8");
mkdirSync(CAPTURAS, { recursive: true });
const CSV = "C:/Users/Nicolas/Downloads/planillas-ronda5/piloto-orga-anonimo.csv";
const ORG_NOMBRE = "ZZZ Validación Ronda 8";

const env = Object.fromEntries(
  readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const CREDS = {
  admin: { email: "admin.prueba@vecitap.com", password: env.PRUEBA_ADMIN_CLAVE },
  residente: { email: "residente.prueba@vecitap.com", password: env.PRUEBA_RESIDENTE_CLAVE },
};
if (!env.PRUEBA_ADMIN_CLAVE || !env.PRUEBA_RESIDENTE_CLAVE) {
  console.error("Faltan PRUEBA_ADMIN_CLAVE o PRUEBA_RESIDENTE_CLAVE en .env.local");
  process.exit(1);
}
if (!/hdivffuorclzulijkyry/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error("`.env.local` no apunta a vecitap-pruebas: no se corre nada.");
  process.exit(1);
}

async function clienteDe(cred) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(cred);
  if (error) throw error;
  return sb;
}

const resultados = [];
function registrar(prueba, paso, ok, visto) {
  resultados.push({ prueba, paso, ok, visto });
  console.log(`${ok ? "PASA " : "FALLA"} [${prueba}] ${paso} — ${visto}`);
}
let nCaptura = 0;
const CORRIDA = (process.argv.slice(2).join("") || "todo") + "-" + new Date().toISOString().slice(11, 19).replace(/:/g, "");
async function shot(page, nombre) {
  nCaptura += 1;
  await page.screenshot({ path: path.join(CAPTURAS, `${CORRIDA}-${String(nCaptura).padStart(3, "0")}-${nombre}.png`), fullPage: true });
}
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const textoDe = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function login(page, cred) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function ids(sb) {
  const { data: org } = await sb.from("organizaciones").select("id").eq("nombre", ORG_NOMBRE).single();
  const { data: eds } = await sb.from("edificios").select("id,nombre").eq("org_id", org.id);
  const ed = (n) => eds.find((e) => e.nombre === n)?.id;
  return { org: org.id, A: ed("ZZZ Torre A"), B: ed("ZZZ Torre B"), C: ed("ZZZ Torre C") };
}
async function unidad(sb, edificio, codigo) {
  const { data } = await sb.from("unidades").select("id").eq("edificio_id", edificio).eq("codigo", codigo).single();
  return data.id;
}
async function telefonoDe(sb, edificio, codigo) {
  const { data } = await sb.from("unidades").select("vinculos(hasta,tipo,personas(id,telefono,correo))").eq("edificio_id", edificio).eq("codigo", codigo).maybeSingle();
  return data?.vinculos?.find((v) => !v.hasta && v.tipo === "propietario")?.personas ?? null;
}

/* ── Previa de «Cargar datos» ── */
const grupo = (page, titulo) => page.locator('div[style*="border-top"]', { has: page.locator("span", { hasText: titulo }) }).first();
const semaforo = (page) => page.locator("p", { hasText: "filas bien" }).first();
const filaTabla = (page, fila) => page.locator("tbody tr", { has: page.locator("td:first-child", { hasText: new RegExp(`^${fila}$`) }) }).first();

async function abrirCargarDatos(page, org, edificio) {
  await page.goto(`${BASE}/admin/${org}/${edificio}/propietarios`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Cargar datos/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles(CSV);
  await semaforo(page).waitFor({ timeout: 30000 });
}

async function corregirEn(raiz, fila, valorActual, valorNuevo) {
  const page = raiz.page ? raiz.page() : raiz;
  const item = raiz.locator("div", { hasText: `Fila ${fila} ·` }).filter({ has: page.locator("input") }).last();
  const inputs = item.locator("input.control");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    if ((await inputs.nth(i).inputValue()) === valorActual) {
      await inputs.nth(i).fill(valorNuevo);
      await inputs.nth(i).locator("xpath=..").getByRole("button", { name: "Corregir" }).click();
      await page.waitForTimeout(500);
      return true;
    }
  }
  return false;
}
async function corregirEnAviso(page, tituloGrupo, fila, valorActual, valorNuevo) {
  const g = grupo(page, tituloGrupo);
  const boton = g.getByRole("button", { name: /ver más/ });
  if (await boton.count()) await boton.click();
  return corregirEn(g, fila, valorActual, valorNuevo);
}

/** Contesta lo que espera: 05C/05D «No»; lo demás, «Sí» en la primera candidata. */
async function contestarTodo(page) {
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const pend = page.locator("div", { has: page.getByText("Sin respuesta por omisión: elija para poder cargar.") }).filter({ hasText: "¿Es la misma persona?" });
    if (!(await pend.count())) return;
    const p = pend.last();
    const texto = await p.innerText();
    if (/\(05C|05C\)|\(05D|05D\)|05C, 05D/.test(texto)) await p.getByRole("button", { name: /^No/ }).last().click();
    else await p.getByRole("button", { name: "Sí" }).first().click();
    await page.waitForTimeout(300);
  }
}
async function cargar(page) {
  const boton = page.getByRole("button", { name: /^Cargar \d+ unidades?$/ });
  const ok = await boton.isEnabled();
  await boton.click();
  await page.getByRole("button", { name: "Sí, cargar" }).click();
  await page.getByText("Datos cargados").waitFor({ timeout: 90000 });
  return { ok, aviso: (await textoDe(page)).match(/Datos cargados[^]*?\./)?.[0] ?? "" };
}

/* ── A1 + A2: la corrección se guarda en una ficha que ya existe ── */
async function parteA1(page, I) {
  const sb = await clienteDe(CREDS.admin);
  // Torre A: la primera carga (las personas todavía no existen).
  const ya = await sb.from("unidades").select("id", { count: "exact", head: true }).eq("edificio_id", I.A);
  if (!ya.count) {
    await abrirCargarDatos(page, I.org, I.A);
    const c = await corregirEnAviso(page, "con texto en el teléfono", 42, "04245551666 Filobe ligozan", "04245551666");
    await contestarTodo(page);
    const r = await cargar(page);
    const p = await telefonoDe(sb, I.A, "10C");
    registrar("A1", "Torre A (personas nuevas): 10C guarda el teléfono corregido", c && r.ok && p?.telefono === "04245551666", `corregido ${c}; «${r.aviso.slice(0, 120)}»; en la base «${p?.telefono}»`);
  }
  const antes = await telefonoDe(sb, I.A, "10C");

  // Torre B: la misma planilla; ahora las personas YA existen (lo que vio Gustavo).
  await abrirCargarDatos(page, I.org, I.B);
  const c2 = await corregirEnAviso(page, "con texto en el teléfono", 42, "04245551666 Filobe ligozan", "0414-5551234");
  await page.waitForTimeout(500);
  const fila10 = (await filaTabla(page, 42).innerText()).replace(/\s+/g, " ");
  const dice = /Cambia el teléfono de la ficha de/.test(fila10);
  const celda = /corregido en la previa: cambia en la ficha de/.test(fila10);
  registrar("A1", "Torre B: la fila 10C dice «Cambia el teléfono de la ficha de …»", c2 && dice, fila10.match(/Cambia el teléfono[^→]*→ [^ ]+/)?.[0] ?? fila10.slice(0, 220));
  registrar("A1", "la celda dice «corregido en la previa: cambia en la ficha de …», no solo «corregido»", celda, fila10.match(/corregido en la previa[^.]*?(?= el | Se |$)/)?.[0] ?? "(no)");
  await shot(page, "a1-torreB-10C");

  // A2: las filas que esperan «¿misma persona?» se corrigen (en Avisos y en la pregunta).
  const tit = "que esperan una respuesta";
  const g = grupo(page, tit);
  const hay = await g.count();
  const antesG = hay ? (await g.locator("span").first().innerText()).trim() : "(no está)";
  const enPregunta = await page.getByRole("button", { name: /Corregir los datos de (esta|estas) filas?/ }).count();
  registrar("A2", "Avisos trae «… filas que esperan una respuesta» y la pregunta ofrece corregir la fila", hay > 0 && enPregunta > 0, `«${antesG}»; ${enPregunta} preguntas con «Corregir los datos de esta fila»`);
  const a = await corregirEnAviso(page, tit, 15, "0424-5551111", "04120000303");
  const b = await corregirEnAviso(page, tit, 15, "delivered+busilenanefageb@resend.dev", "delivered+zzz8-03d@resend.dev");
  const despuesG = (await grupo(page, tit).count()) ? (await grupo(page, tit).locator("span").first().innerText()).trim() : "(ya no está)";
  const sigue03D = await page.locator("div", { hasText: "(03D)" }).filter({ hasText: "¿Es la misma persona?" }).filter({ has: page.getByText("Sin respuesta por omisión") }).count();
  registrar("A2", "03D se corrige y su pregunta se vuelve a evaluar", a && b && sigue03D === 0, `«${antesG}» → «${despuesG}»; corregidos ${[a, b]}; 03D sigue preguntando: ${sigue03D}`);
  await shot(page, "a2-torreB-03D");

  await contestarTodo(page);
  const r2 = await cargar(page);
  const p2 = await telefonoDe(sb, I.B, "10C");
  const pA = await telefonoDe(sb, I.A, "10C");
  registrar("A1", "al cargar, la ficha que ya existía queda con 0414-5551234 (la misma ficha en Torre A y B)", r2.ok && p2?.telefono === "0414-5551234" && p2?.id === antes?.id && pA?.telefono === "0414-5551234",
    `«${r2.aviso.slice(0, 160)}»; ficha ${p2?.id === antes?.id ? "la misma" : "OTRA"}: Torre B «${p2?.telefono}», Torre A «${pA?.telefono}»`);
  await shot(page, "a1-torreB-cargado");

  // A2 en un edificio con las unidades ya cargadas (las filas se omiten).
  await abrirCargarDatos(page, I.org, I.A);
  const gOm = grupo(page, "con una pregunta en «Personas para revisar»");
  const nOm = await gOm.count();
  let campos = 0;
  if (nOm) {
    await gOm.getByRole("button", { name: /ver más/ }).click();
    campos = await gOm.locator("input.control").count();
  }
  registrar("A2", "con las unidades ya cargadas, las filas con pregunta igual salen en Avisos y se pueden corregir", nOm > 0 && campos > 0, nOm ? `«${(await gOm.locator("span").first().innerText()).trim()}», ${campos} campos` : "(no aparece)");
  await shot(page, "a2-torreA-omitidas");
  await page.getByRole("button", { name: "Descartar" }).click();
}

/* ── A2 otra vez: corregir los tres datos de 03D y que la pregunta se vuelva a evaluar ── */
async function parteA2(page, I) {
  await abrirCargarDatos(page, I.org, I.A);
  // La de «dato en común con otro nombre» (sin respuesta por omisión); la de homónimo (mismo nombre, sin datos en común) es informativa.
  // Las preguntas DE la fila 03D (no las de otras filas que la nombran); la
  // de homónimo (mismo nombre, sin datos en común) es informativa y queda.
  const preguntas03D = () =>
    page.locator('div[style*="display: grid; gap: 6px"]', { hasText: "Archivo: «Beganu, s.a.» (03D)" }).filter({ hasNotText: "sin datos en común" }).count();
  const antes = await preguntas03D();
  const tit = "con una pregunta en «Personas para revisar»";
  const a = await corregirEnAviso(page, tit, 15, "0424-5551111", "04120000303");
  const b = await corregirEnAviso(page, tit, 15, "delivered+busilenanefageb@resend.dev", "delivered+zzz8-03d@resend.dev");
  const c = await corregirEnAviso(page, tit, 15, "delivered+daguvavucuzanorab@resend.dev", "delivered+zzz8-03d.respaldo@resend.dev");
  const despues = await preguntas03D();
  if (despues)
    console.log(
      "   queda:",
      (await page.locator('div[style*="display: grid; gap: 6px"]', { hasText: "Archivo: «Beganu, s.a.» (03D)" }).first().innerText()).replace(/\s+/g, " ")
    );
  const fila = (await filaTabla(page, 15).innerText()).replace(/\s+/g, " ");
  registrar("A2", "03D: corregir teléfono y los dos correos vuelve a evaluar la pregunta", a && b && c && antes > 0 && despues === 0, `preguntas de 03D: ${antes} → ${despues}; corregidos ${[a, b, c]}`);
  registrar("A2", "con la unidad omitida, la celda dice que no se guarda (no «corregido» a secas)", /no se guarda: la unidad ya existe y se omite/.test(fila), fila.match(/corregido en la previa[^)]*[)]/)?.[0] ?? fila.slice(0, 200));
  await shot(page, "a2-torreA-03D");
  await page.getByRole("button", { name: "Descartar" }).click();
}

/* ── A3: «Personas para revisar» ── */
async function parteA3(page, I) {
  // Un edificio sin unidades del archivo: Torre C no tiene 05C. Se usa lo pegado en Torre B.
  await page.goto(`${BASE}/admin/${I.org}/${I.B}/propietarios`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Cargar datos/ }).click();
  await page.getByRole("button", { name: /O pegue las filas desde Excel/ }).click();
  const filas = [
    "CODIGO\tALICUOTA\tSALDO INICIAL\tPROPIETARIO\tTELEFONO\tCORREO\tCorreo 2",
    "ZB-1A\t0\t0\tBumagi Tovavade/Camebogig Zazufuni\t0412-5551037\tdelivered+nabisipodalena98@resend.dev\t",
    "ZB-5C\t0\t0\tLivofesupi Sonopu\t0412-5551037\tdelivered+risafarag64@resend.dev\tdelivered+niduculolubovo@resend.dev",
    "ZB-D1\t0\t0\tPruebo Doble Ficha\t0412-5559001\tdelivered+zzz8-doble1@resend.dev\t",
  ].join("\n");
  await page.locator("textarea").first().fill(filas);
  await page.getByRole("button", { name: "Leer lo pegado" }).click();
  await semaforo(page).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);

  const fila5C = () => filaTabla(page, 3);
  const t0 = (await fila5C().innerText()).replace(/\s+/g, " ");
  registrar("A3", "ZB-5C no usa sin preguntar la ficha de «Bumagi…»", !/se usa la de Sr\. Bumagi|se usa la de Ing\. Bumagi/.test(t0), t0.slice(0, 260));
  const pregunta = page.locator('div[style*="display: grid; gap: 6px"]', { hasText: "Archivo: «Livofesupi Sonopu» (ZB-5C)" }).filter({ hasText: "Bumagi" }).first();
  const nPreg = await pregunta.count();
  if (nPreg) {
    await pregunta.getByRole("button", { name: "Sí" }).first().click();
    await page.waitForTimeout(600);
  }
  const t1 = (await fila5C().innerText()).replace(/\s+/g, " ");
  registrar("A3", "con «Sí», la tabla muestra al momento a dónde van los recibos (y lo que decía el archivo)", nPreg > 0 && /nabisipodalena98/.test(t1) && /el archivo dice delivered\+risafarag64/.test(t1), t1.slice(0, 300));
  // La pregunta nueva se ve como sus líneas «Archivo: … · Ficha: …», sin respuesta por omisión.
  const preg = page.locator('div[style*="display: grid; gap: 6px"]', { hasText: "(ZB-1A, ZB-5C)" }).filter({ hasText: "Ficha:" });
  const nueva = await preg.count();
  const lineas = nueva ? (await preg.first().innerText()).replace(/\s+/g, " ") : "";
  registrar("A3", "juntar filas de dos nombres no elige ficha solo: pregunta cuál", nueva > 0 && /Bumagi/.test(lineas) && /Livofesupi/.test(lineas) && /Sin respuesta por omisión/.test(lineas), lineas.slice(0, 300) || "(no está)");
  await shot(page, "a3-si");
  if (nPreg) {
    const p2 = page.locator('div[style*="display: grid; gap: 6px"]', { hasText: "Archivo: «Livofesupi Sonopu» (ZB-5C)" }).filter({ hasText: "Bumagi" }).first();
    await p2.getByRole("button", { name: /^No/ }).first().click();
    await page.waitForTimeout(600);
  }
  const t2 = (await fila5C().innerText()).replace(/\s+/g, " ");
  registrar("A3", "con «No», vuelve a su correo", /risafarag64/.test(t2) && !/el archivo dice delivered\+risafarag64/.test(t2), t2.slice(0, 200));

  // Fichas que se llaman igual + otra de otro nombre que comparte el correo.
  const tD = (await filaTabla(page, 4).innerText()).replace(/\s+/g, " ");
  const todo = await textoDe(page);
  registrar("A3", "sin «son otras personas (otro nombre u otra cédula)» sobre fichas del mismo nombre", !/otro nombre u otra cédula/.test(todo) && /Otra Persona Distinta/.test(tD) && !/Pruebo Doble Ficha[^.]*: (es otra persona|son otras personas)/.test(tD.replace(/hay \d+ fichas[^:]*:[^.]*/, "")), tD.slice(0, 320));
  registrar("A3", "sin unidades repetidas en las fichas («01B, 01A, 01B…»)", !/(\b[0-9A-Z]{2,4}\b), (\b[0-9A-Z]{2,4}\b), \1, \2/.test(todo), "revisado en toda la previa");
  const verMas = await page.locator("tbody").getByRole("button", { name: "ver más" }).count();
  registrar("A3", "las notas largas van en una línea con «ver más»", verMas > 0, `${verMas} «ver más» en la tabla`);
  await shot(page, "a3-fichas");
  await page.getByRole("button", { name: "Descartar" }).click();
}

/* ── A4: Mensajes ── */
async function parteA4(page, I) {
  await page.goto(`${BASE}/admin/${I.org}/${I.A}/mensajes`, { waitUntil: "networkidle" });
  const linea = async () => {
    await page.waitForTimeout(1200);
    return (await page.locator("b", { hasText: /^Va a \d+/ }).first().innerText()).trim();
  };
  const personas = async () => (await page.locator("b", { hasText: /\d+ personas?$/ }).first().innerText()).trim();
  const todos = await linea();
  const pTodos = await personas();
  await page.locator("select", { has: page.locator("option", { hasText: "Solo quienes deben" }) }).selectOption("deudores");
  const deud = await linea();
  const pDeud = await personas();
  registrar("A4", "«Solo quienes deben» no va a todos", todos !== deud && pTodos !== pDeud, `Todos: «${todos}» · ${pTodos}  |  Deben: «${deud}» · ${pDeud}`);
  await page.getByRole("button", { name: "Ver y cambiar" }).click();
  await page.getByRole("button", { name: "Ninguna" }).click();
  await page.locator("label", { hasText: /^01A/ }).locator("input").check();
  const una = await linea();
  await page.waitForTimeout(1200);
  const pUna = await personas();
  registrar("A4", "se agregan o quitan unidades a mano", /^Va a 1 unidad/.test(una) && /^1 persona/.test(pUna), `«${una}» · ${pUna}`);
  await shot(page, "a4-unidades");
  // Enviar a esa sola unidad: con el cupo de pruebas lleno, tiene que decir que espera y cuándo sale.
  await page.locator(".campo", { hasText: "Asunto" }).locator("input").fill("ZZZ prueba ronda 8");
  await page.locator(".campo", { hasText: "Mensaje" }).locator("textarea").fill("Mensaje de prueba de la ronda 8 (a una sola unidad).");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, enviar" }).click();
  await page.getByText("Mensaje en camino").waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const hecho = (await textoDe(page)).match(/Mensaje en camino[^]*?Mensajes enviados», ve cuántos salieron\./)?.[0] ?? "";
  const hist = (await textoDe(page)).match(/ZZZ prueba ronda 8[^]*?(lo último, [^.]*\.)/)?.[0] ?? "";
  registrar("A4", "con el cupo lleno dice cuántos salieron, cuántos esperan y cuándo salen", /espera el cupo diario/.test(hecho) && /esperan el cupo diario/.test(hist) && /lo último, (hoy|mañana|el )/.test(hist), `«${hecho.slice(0, 200)}» · historial «${hist.slice(-220)}»`);
  await shot(page, "a4-enviado");
  // F: el error del doble envío está arriba; la página sube sola hasta él.
  await page.locator(".campo", { hasText: "Asunto" }).locator("input").fill("ZZZ prueba ronda 8");
  await page.locator(".campo", { hasText: "Mensaje" }).locator("textarea").fill("Mensaje de prueba de la ronda 8 (a una sola unidad).");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("button", { name: "Sí, enviar" }).click();
  await page.getByText("Ese mismo mensaje ya se envió hace un momento.").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1500);
  const y1 = await page.evaluate(() => window.scrollY);
  const visible = await page.getByText("Ese mismo mensaje ya se envió hace un momento.").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  registrar("F", "un error que sale arriba sube la página hasta él", visible && y1 < y0, `scroll ${y0} → ${y1}; se ve: ${visible}`);
}

/* ── A5, A6, C1, C2, F: cierre y Cortes en Torre C ── */
async function parteC(pa, I) {
  const sb = await clienteDe(CREDS.admin);
  await pa.goto(`${BASE}/admin/${I.org}/${I.C}/mes`, { waitUntil: "networkidle" });
  await pa.waitForTimeout(2000);
  const { count: cerrado } = await sb.from("periodos").select("id", { count: "exact", head: true }).eq("edificio_id", I.C).eq("estado", "cerrado");
  if (!cerrado) {
    const aviso = (await textoDe(pa)).match(/\d unidad(es)? quedan? con la cuota de condominio en \$ 0,00[^.]*\./)?.[0] ?? "";
    registrar("A5", "con gastos y una unidad en $ 0,00, el cierre avisa y dice cuál", /ZC-3/.test(await textoDe(pa)) && !!aviso, `«${aviso}»`);
    await pa.getByRole("button", { name: /Cerrar el mes y emitir recibos/ }).click();
    const conf = (await textoDe(pa)).match(/Atención:[^]*?anulados\./)?.[0] ?? "";
    const boton = pa.getByRole("button", { name: "Sí, cerrar igual" });
    const color = await boton.evaluate((el) => getComputedStyle(el).color);
    registrar("A5", "pide confirmar («Sí, cerrar igual»)", (await boton.count()) > 0 && /ZC-3/.test(conf), `«${conf.slice(0, 160)}»`);
    registrar("A6", "el botón de peligro tiene el texto en blanco", color === "rgb(255, 255, 255)", color);
    await shot(pa, "a5-confirmar");
    await boton.click();
    await pa.waitForTimeout(4000);
  }
  await pa.goto(`${BASE}/admin/${I.org}/${I.C}/mes`, { waitUntil: "networkidle" });
  const mesProp = await pa.locator("select", { has: pa.locator("option", { hasText: /^Noviembre$/ }) }).first().evaluate((s) => s.options[s.selectedIndex]?.text);
  registrar("F", "«Abrir un mes» propone el siguiente al cerrado", /noviembre/i.test(mesProp ?? ""), `propone «${mesProp}»`);
  const { data: recs } = await sb.from("recibos").select("total,conceptos,unidades(codigo)").eq("org_id", I.org).order("numero");
  const deC = (recs ?? []).filter((r) => r.unidades?.codigo?.startsWith("ZC-"));
  const texto = deC.map((r) => `${r.unidades.codigo} $${Number(r.total).toFixed(2)} fondo ${(r.conceptos ?? []).find((l) => l.redondeo)?.monto ?? "—"}`).join(" · ");
  registrar("C4", "el total a pagar (con la deuda anterior) termina en múltiplo de 5; en 0 no se redondea", deC.length === 3 && deC.every((r) => Math.abs(Number(r.total) % 5) < 0.001 || Math.abs((Number(r.total) % 5) - 5) < 0.001), texto);

  // Cortes: estado por unidad, reenviar, el cupo y el papel sin Bs.
  await pa.goto(`${BASE}/admin/${I.org}/${I.C}/cortes`, { waitUntil: "networkidle" });
  await pa.waitForTimeout(1500);
  const encab = (await textoDe(pa)).match(/\d+ recibos emitidos en [^·]*·[^·]*·[^.]*correos del plan/)?.[0] ?? "";
  registrar("C2", "dice cuántos correos lleva el mes y cuántos quedan hoy", !!encab, `«${encab}»`);
  const { count: yaEnviado } = await sb.from("cola_correo").select("id", { count: "exact", head: true }).eq("org_id", I.org).eq("tipo", "recibo");
  if (!yaEnviado) {
    await pa.getByRole("button", { name: /^Enviar/ }).first().click();
    const conf = (await textoDe(pa)).match(/Son \d+ correos y hoy quedan[^.]*\./)?.[0] ?? "";
    registrar("C2", "la confirmación dice si el mes sale de una vez", !!conf, `«${conf}»`);
    await pa.getByRole("button", { name: "Enviar", exact: true }).last().click();
    await pa.waitForTimeout(5000);
  }
  await pa.reload({ waitUntil: "networkidle" });
  await pa.waitForTimeout(2500);
  const badges = await pa.locator("tbody td").filter({ has: pa.locator("span", { hasText: /Espera el cupo|Saliendo|Enviado|Rebotó|Entregado|No salió/ }) }).allInnerTexts();
  registrar("C2", "cada unidad dice cómo va su correo (con el cupo lleno: espera y cuándo sale)", badges.some((b) => /Espera el cupo: sale (hoy|mañana|el )/.test(b)), badges.map((b) => b.replace(/\s+/g, " ")).join(" | ").slice(0, 400));
  const { data: colaC } = await sb.from("cola_correo").select("destino,tipo").eq("org_id", I.org).in("tipo", ["recibo", "reenvio"]);
  registrar("B2", "el recibo va también al correo de respaldo (en un correo aparte)", (colaC ?? []).some((c) => c.destino === "delivered+zzz8-respaldo@resend.dev"), (colaC ?? []).map((c) => c.destino).join(", "));
  await pa.locator("tr", { hasText: "ZC-1" }).getByRole("button", { name: /Reenviar recibo/ }).click();
  await pa.waitForTimeout(3000);
  const reenv = (await textoDe(pa)).match(/Recibo de ZC-1 reenviado[^.]*\./)?.[0] ?? "";
  registrar("C2", "«Reenviar recibo» por unidad", !!reenv, `«${reenv}»`);
  await shot(pa, "c2-cortes");
  await pa.locator("tr", { hasText: "ZC-1" }).getByRole("button", { name: /Reenviar recibo/ }).click();
  await pa.waitForTimeout(2500);
  const dos = (await textoDe(pa)).match(/Ese recibo ya se reenvió hace un momento\./)?.[0] ?? "";
  registrar("C2", "un doble toque no lo reenvía dos veces", !!dos, `«${dos}»`);

  // El correo (vista previa) y el papel, sin bolívares.
  const { data: rec1 } = await sb.from("recibos").select("id").eq("unidad_id", await unidad(sb, I.C, "ZC-1")).single();
  const { data: correo } = await sb.rpc("correo_recibo", { p_recibo: rec1.id });
  const filas = correo ?? [];
  registrar("C1", "el correo no trae ningún monto en Bs y trae la frase y el enlace", filas.length > 0 && filas.every((c) => !/Bs /.test(c.html) && /Se paga en bolívares a la tasa oficial BCV del día del pago/.test(c.html) && /monto en bolívares de hoy/.test(c.html)), `${filas.length} correos: ${filas.map((c) => c.destino).join(", ")}`);
  registrar("B2", "el correo del respaldo no trae código de invitación", filas.filter((c) => /respaldo/.test(c.destino)).every((c) => !/Todavía no tiene usuario/.test(c.html)), filas.map((c) => `${c.destino}: ${/Todavía no tiene usuario/.test(c.html) ? "con código" : "sin código"}`).join(" · "));
}

/* ── Portal: pago agrupado, papel sin Bs, teléfono ── */
async function parteR(pr, I, movil) {
  const sb = await clienteDe(CREDS.residente);
  const { data: us } = await sb.from("unidades").select("id,codigo").in("codigo", ["ZC-1", "ZC-2"]);
  const zc1 = us.find((u) => u.codigo === "ZC-1").id;
  await pr.goto(`${BASE}/mi/${zc1}/recibo`, { waitUntil: "networkidle" });
  const portal = await textoDe(pr);
  registrar(movil ? "móvil" : "C1", "el portal sigue con el «Monto exacto en Bs»", /Monto exacto en Bs/i.test(portal) || /Bs /.test(portal), portal.match(/Monto exacto[^$]{0,60}/i)?.[0] ?? "(revisar captura)");
  if (movil) registrar("móvil", "Mi recibo: nada se sale de la pantalla", await sinDesborde(pr), "");
  await shot(pr, `${movil ? "movil-" : ""}r-recibo`);
  const papel = await pr.request.get(`${BASE}/mi/${zc1}/recibo/papel`);
  const html = await papel.text();
  registrar("C1", "el recibo impreso/PDF no trae montos en Bs", papel.ok() && !/Bs [0-9]/.test(html) && /Se paga en bolívares a la tasa oficial BCV del día del pago/.test(html), `HTTP ${papel.status()}; «Bs <número>»: ${/Bs [0-9]/.test(html)}`);
  await pr.goto(`${BASE}/mi/${zc1}/reportar`, { waitUntil: "networkidle" });
  if (movil) {
    await pr.getByLabel(/Esta transferencia paga varias/).check().catch(() => {});
    await shot(pr, "movil-r-reportar");
    registrar("móvil", "Reportar un pago (agrupado): nada se sale de la pantalla", await sinDesborde(pr), "");
    return;
  }
  const sbA = await clienteDe(CREDS.admin);
  const { count: ya } = await sbA.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).eq("referencia", "88880001");
  if (ya) return;
  await pr.getByLabel(/Esta transferencia paga varias de mis unidades/).check();
  await pr.waitForTimeout(1500);
  await pr.getByRole("button", { name: "Usar la suma como monto" }).click();
  const f = pr.locator("form");
  const campo = (et) => f.locator(".campo", { has: pr.locator("label", { hasText: et }) }).first();
  await campo("Banco desde el que pagó").locator("select").selectOption({ index: 1 }).catch(() => {});
  await campo("Teléfono desde el que pagó").locator("input").fill("04120000000").catch(() => {});
  await campo("Referencia").locator("input").fill("88880001");
  const png = path.join(CAPTURAS, "comprobante.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  await campo("Comprobante").locator("input[type=file]").setInputFiles(png);
  await pr.waitForTimeout(800);
  await pr.getByRole("button", { name: "Reportar el pago" }).click();
  await pr.waitForURL(/\/pagos$/, { timeout: 30000 }).catch(() => {});
  const { data: g } = await sbA.from("pagos").select("grupo_id,monto,monto_usd,unidades(codigo)").eq("org_id", I.org).eq("referencia", "88880001");
  registrar("B1", "el residente crea un pago agrupado (un grupo, dos unidades)", g?.length === 2 && new Set(g.map((p) => p.grupo_id)).size === 1, (g ?? []).map((p) => `${p.unidades.codigo} ${p.monto}`).join(" · "));
  await shot(pr, "b1-mis-pagos");
}

/* ── Programa ── */
const partes = process.argv.slice(2);
const quiere = (p) => partes.length === 0 || partes.includes(p);
const browser = await chromium.launch();
try {
  const sbAdmin = await clienteDe(CREDS.admin);
  const I = await ids(sbAdmin);
  console.log("Ids:", JSON.stringify(I));
  const nueva = async (cred, viewport = { width: 1280, height: 900 }, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra, acceptDownloads: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await login(page, cred);
    return { page, errores, cerrar: () => ctx.close() };
  };
  for (const [p, fn, cred] of [
    ["A1", parteA1, CREDS.admin],
    ["A2", parteA2, CREDS.admin],
    ["A3", parteA3, CREDS.admin],
    ["A4", parteA4, CREDS.admin],
    ["C", parteC, CREDS.admin],
    ["R", (pg, i) => parteR(pg, i, false), CREDS.residente],
  ]) {
    if (!quiere(p)) continue;
    const { page, errores, cerrar } = await nueva(cred);
    try {
      await fn(page, I);
    } catch (e) {
      registrar(p, "la parte se cortó", false, String(e).split("\n").slice(0, 4).join(" "));
      await shot(page, `${p}-error`).catch(() => {});
    }
    registrar(p, "sin errores de JavaScript en la página", errores.length === 0, errores.join(" | ") || "ninguno");
    await cerrar();
  }
  if (quiere("movil")) {
    const { page, cerrar } = await nueva(CREDS.residente, { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await parteR(page, I, true).catch((e) => registrar("móvil", "la parte se cortó", false, String(e).slice(0, 300)));
    await cerrar();
  }
} catch (e) {
  console.error("ERROR:", e);
} finally {
  await browser.close();
  writeFileSync(path.join(CAPTURAS, "resultados.json"), JSON.stringify(resultados, null, 2));
}
