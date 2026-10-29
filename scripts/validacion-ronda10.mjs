// Script temporal de validación en el navegador — ronda 10 del tramo 2
// (docs/estado-migracion.md, «Ronda 10» → «Validación»).
//
// Contra `next start` (nunca `npm run dev`), conectado a vecitap-pruebas, con
// la organización propia «ZZZ Validación Ronda 10» (ZZZ Torre R10, 4 unidades,
// armada con SQL) y, para B3, los datos que ya existen del residente de prueba.
//
// Requiere `playwright` (instalado con `--no-save`) y `npx next start -p 3123`.
// Las claves de las cuentas de prueba salen de `.env.local` (PRUEBA_*_CLAVE),
// nunca de este archivo: el repo es público.
//
// Uso: node scripts/validacion-ronda10.mjs <A3|C1|C2|B3|B1|B2|B1b|B2b>...
// Salida: scripts/capturas-ronda10/ (ignorada por Git) y el resultado de cada
// paso en la consola.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const CAPTURAS = path.join(__dirname, "capturas-ronda10");
mkdirSync(CAPTURAS, { recursive: true });
const ESTADO = path.join(CAPTURAS, "estado.json");

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

// La organización de la prueba (creada con SQL al empezar, borrada al terminar).
const I = {
  org: "31071751-c515-463b-97ef-74d9410f4322",
  ed: "c7e27255-923a-4f2a-b3c4-23447ba48bc3",
  oct: "58607229-c47d-40e5-b718-3de31a98e53d",
  u: {
    "01A": "8620d301-df87-40a7-b934-bab78216e501",
    "01B": "b36f7dd0-1443-4dc8-966a-7b2f4c95d923",
    "02A": "2c5a7dd2-2c45-4a79-bf09-e701e4a2f667",
    "02B": "30e9958e-4fa1-4624-90bb-b4bb4bee91e5",
  },
};
// Datos que ya existen (no son de la prueba): las unidades del residente de prueba.
const EXISTENTES = {
  union01A: "e694504e-8559-4052-8e5f-22081958add6", // Administradora Union, a favor
  ida01A: "eec485ed-ee71-439a-b476-3165dc8a8ba4", // Torre Ida, debe
  idaOrg: "a91054da-5afa-47e1-98b7-028fb26b9f7a",
  idaEd: "f51676d7-80ff-4812-8830-6307267baecf",
  idaAgosto: "a565ab95-40dc-4df5-bc05-8eaf855a7c47",
};

const anonimo = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
async function clienteDe(cred) {
  const sb = anonimo();
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
const leerEstado = () => (existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : {});
const guardarEstado = (o) => writeFileSync(ESTADO, JSON.stringify({ ...leerEstado(), ...o }, null, 2));
const usdTxt = (n) => "$ " + Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function login(page, cred) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
}

/** La tarjeta «Cargo a una sola unidad» de Cobros. */
const tarjeta = (page) => page.locator("div", { has: page.getByRole("heading", { name: "Cargo a una sola unidad" }) }).last();

// ─── A3: la cuenta sin administradora ─────────────────────────────────────
async function parteA3(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await login(page, CREDS.residente);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const t = await textoDe(page);
  const wa = await page.getByRole("link", { name: /Escribir por WhatsApp/ }).getAttribute("href").catch(() => null);
  const mail = await page.locator('a[href^="mailto:"]').first().getAttribute("href").catch(() => null);
  await shot(page, "a3-sin-administradora");
  registrar("A3", "título", t.includes("Esta cuenta no administra ningún edificio"), t.slice(0, 160));
  registrar("A3", "WhatsApp", wa === "https://wa.me/584122348595?text=Hola%2C%20quiero%20usar%20Vecitap%20para%20mi%20administradora", String(wa));
  registrar("A3", "número visible", t.includes("+58 412-234-8595"), "+58 412-234-8595 " + (t.includes("+58 412-234-8595") ? "a la vista" : "no está"));
  registrar("A3", "correo", !!mail && mail.startsWith("mailto:info@vecitap.com") && t.includes("info@vecitap.com"), String(mail));
  const orden = t.indexOf("+58 412-234-8595") < t.indexOf("info@vecitap.com");
  registrar("A3", "WhatsApp antes que el correo", orden, orden ? "sí" : "no");
  await ctx.close();
}

// ─── C1: el cargo a una sola unidad en Cobros ─────────────────────────────
async function parteC1(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await login(page, CREDS.admin);
  // Cada corrida empieza sin cargos (solo los de esta organización y de su mes abierto).
  const sb0 = await clienteDe(CREDS.admin);
  await sb0.from("cargos_unidad").delete().eq("periodo_id", I.oct);
  await sb0.from("gastos").delete().eq("periodo_id", I.oct);
  const url = `${BASE}/admin/${I.org}/${I.ed}/cobros`;
  await page.goto(url, { waitUntil: "networkidle" });
  let t = await textoDe(page);
  registrar("C", "tarjeta en Cobros", t.includes("Cargo a una sola unidad") && t.includes("Cargos del recibo de Octubre 2026"), "«Cargo a una sola unidad» · «Cargos del recibo de Octubre 2026»");

  const card = tarjeta(page);
  async function agregar(unidad, motivo, ref, monto, lopago) {
    await card.locator("select").first().selectOption({ label: unidad });
    await card.getByPlaceholder("Multa por ruido").fill(motivo);
    await card.getByPlaceholder("Acta del 12/10").fill(ref);
    await card.locator("input[inputmode=decimal]").fill(monto);
    const chk = card.locator("input[type=checkbox]");
    if (lopago !== (await chk.isChecked())) await chk.click();
    await card.getByRole("button", { name: /Agregar cargo/ }).click();
    // El formulario se vacía al guardar y la lista llega con el refresco de la página.
    await card.getByText(motivo, { exact: false }).first().waitFor({ timeout: 15000 });
    await page.waitForLoadState("networkidle");
  }
  // Sin motivo: avisa.
  await card.locator("select").first().selectOption({ label: "01A" });
  await card.locator("input[inputmode=decimal]").fill("5");
  await card.getByRole("button", { name: /Agregar cargo/ }).click();
  await page.waitForTimeout(500);
  t = await textoDe(page);
  registrar("C", "sin motivo", t.includes("Falta el motivo: es lo que se lee en el recibo."), "«Falta el motivo: es lo que se lee en el recibo.»");

  await agregar("01A", "Multa por ruido", "Acta 12/10", "12,34", false);
  await agregar("01A", "Reparación de tubería", "Fact. 556", "40", true);
  await agregar("02B", "Consumo de gas", "", "7", false);
  t = await textoDe(page);
  registrar(
    "C",
    "tres cargos",
    t.includes("Multa por ruido") && t.includes("Multa o cobro · no es un egreso") && t.includes("Reparación de tubería") && t.includes("Lo pagó el edificio · es un egreso") && t.includes("Consumo de gas"),
    "Multa por ruido (no es un egreso), Reparación de tubería (es un egreso), Consumo de gas"
  );
  await shot(page, "c-tres-cargos");

  // Editar la multa: 12,34 → 15.
  const filaMulta = card.locator("div", { hasText: "Multa por ruido" }).filter({ has: page.getByTitle("Corregir") }).last();
  await filaMulta.getByTitle("Corregir").click();
  const chkDis = await card.locator("input[type=checkbox]").isDisabled();
  await card.locator("input[inputmode=decimal]").fill("15");
  await card.getByRole("button", { name: "Guardar cambios" }).click();
  await card.getByText("$ 15,00").first().waitFor({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  t = await textoDe(page);
  registrar("C", "editar", t.includes("Multa por ruido · Acta 12/10") && t.includes("$ 15,00") && !t.includes("$ 12,34") && chkDis, `queda $ 15,00; «El edificio pagó esto» bloqueado al editar: ${chkDis}`);

  // Quitar el consumo.
  const filaGas = card.locator("div", { hasText: "Consumo de gas" }).filter({ has: page.getByTitle("Quitar") }).last();
  await filaGas.getByTitle("Quitar").click();
  const conf = await textoDe(page);
  await page.getByRole("dialog").getByRole("button", { name: "Quitar" }).click();
  await card.getByText("Consumo de gas", { exact: true }).waitFor({ state: "detached", timeout: 15000 });
  await page.waitForLoadState("networkidle");
  t = await textoDe(page);
  registrar("C", "quitar", conf.includes("no se cobra en el recibo de Octubre 2026") && !t.includes("Consumo de gas"), "confirmación «…no se cobra en el recibo de Octubre 2026.» y desaparece");
  await shot(page, "c-editado-y-quitado");

  // La previa de Gastos del mes, con la cuota extraordinaria y el redondeo.
  await page.goto(`${BASE}/admin/${I.org}/${I.ed}/mes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  t = await textoDe(page);
  await shot(page, "c-gastos-del-mes-previa");
  const valores = (await page.locator("input").evaluateAll((xs) => xs.map((x) => x.value))).join(" | ");
  registrar("C", "Gastos del mes", valores.includes("Reparación de tubería") && !valores.includes("Multa por ruido") && t.includes("Cargos a una sola unidad"), "la reparación está como gasto «Solo a una unidad»; la multa no es un gasto");
  const sb = await clienteDe(CREDS.admin);
  const { data: previa, error } = await sb.rpc("simular_cierre", { p_periodo: I.oct });
  if (error) throw error;
  guardarEstado({ previa });
  registrar("C", "previa", !!previa?.length, previa.map((r) => `${r.codigo} ${r.total} (redondeo ${r.redondeo})`).join(", "));
  const p01A = previa.find((r) => r.codigo === "01A");
  registrar("C", "previa en pantalla", t.includes(usdTxt(p01A.total)), `01A ${usdTxt(p01A.total)} en la tabla de la previa`);
  await ctx.close();
}

// ─── C2: cerrar, comparar, y lo que no se puede tocar ─────────────────────
async function parteC2() {
  const sb = await clienteDe(CREDS.admin);
  const { previa } = leerEstado();
  const { error: eC } = await sb.rpc("cerrar_periodo", { p_periodo: I.oct });
  if (eC) throw eC;
  const { data: recibos } = await sb.from("recibos").select("unidad_id,total,directos,cargos,conceptos").eq("periodo_id", I.oct);
  const cod = Object.fromEntries(Object.entries(I.u).map(([k, v]) => [v, k]));
  let iguales = true;
  const lineas = [];
  for (const r of recibos) {
    const p = previa.find((x) => x.codigo === cod[r.unidad_id]);
    const ok = Math.abs(Number(p.total) - Number(r.total)) < 0.005;
    iguales &&= ok;
    lineas.push(`${cod[r.unidad_id]} previa ${Number(p.total).toFixed(2)} = recibo ${Number(r.total).toFixed(2)}`);
  }
  registrar("C", "previa = recibo", iguales, lineas.join("; "));
  const r01A = recibos.find((r) => r.unidad_id === I.u["01A"]);
  const cargos = r01A.cargos || [];
  registrar(
    "C",
    "recibo 01A",
    Number(r01A.directos) === 55 && cargos.length === 2 && cargos.some((c) => c.concepto === "Multa por ruido" && Number(c.monto) === 15) && cargos.some((c) => c.concepto === "Reparación de tubería"),
    `directos ${r01A.directos}; cargos ${JSON.stringify(cargos)}; conceptos ${JSON.stringify(r01A.conceptos.map((c) => c.nombre + " " + c.monto))}`
  );
  const otros = recibos.filter((r) => r.unidad_id !== I.u["01A"]).every((r) => (r.cargos || []).length === 0 && Number(r.directos) === 0);
  registrar("C", "las demás sin cargos", otros, "01B, 02A, 02B: cargos [] y directos 0 (el consumo de gas se quitó)");

  const { data: fila } = await sb.from("cargos_unidad").select("id").eq("periodo_id", I.oct).single();
  const { error: eU } = await sb.from("cargos_unidad").update({ monto: 99 }).eq("id", fila.id);
  const { error: eD } = await sb.from("cargos_unidad").delete().eq("id", fila.id);
  registrar("C", "cerrado: no se toca", !!eU && !!eD && /ya está cerrado/.test(eU.message), `${eU?.message} / ${eD?.message}`);
  const { error: eI } = await sb.from("cargos_unidad").insert({ org_id: I.org, periodo_id: I.oct, unidad_id: I.u["01B"], concepto: "x", monto: 1 });
  registrar("C", "cerrado: no se agrega", !!eI, String(eI?.message));

  const { data: ef } = await sb.rpc("estado_financiero", { p_edificio: I.ed, p_desde: "2026-10-01", p_hasta: "2026-10-31" });
  const conc = (ef.detalle_egresos || []).map((g) => `${g.categoria}: ${g.concepto} ${g.monto}`);
  registrar("C", "estado financiero", Number(ef.egresos) === 40 && !conc.some((c) => c.includes("Multa")), `egresos ${ef.egresos} — ${conc.join("; ")}`);

  // La mora del mes siguiente cuenta el cargo: noviembre abierto, solo para la previa.
  const { data: nov, error: eN } = await sb.from("periodos").insert({ org_id: I.org, edificio_id: I.ed, anio: 2026, mes: 11, etiqueta: "Noviembre 2026", estado: "abierto", presupuesto: 410, tasa_bcv: 200 }).select("id").single();
  if (eN) throw eN;
  const { data: pn } = await sb.rpc("simular_cierre", { p_periodo: nov.id });
  const n01A = pn.find((r) => r.codigo === "01A");
  const esperada = Math.round(Number(r01A.total) * 0.01 * 10000) / 10000;
  registrar("C", "mora", Math.abs(Number(n01A.mora) - esperada) < 0.0001, `noviembre, 01A: mora ${n01A.mora} = 1 % de ${r01A.total} (el total de octubre, con los $ 55 de cargos)`);
  await sb.from("periodos").delete().eq("id", nov.id);
  guardarEstado({ totales: Object.fromEntries(recibos.map((r) => [cod[r.unidad_id], Number(r.total)])) });
}

// ─── B3: el recibo sin deuda, en el portal, el impreso y el PDF ───────────
async function parteB3(browser) {
  const sb = await clienteDe(CREDS.admin);
  const { totales } = leerEstado();
  // 01B paga justo su recibo (al día); 02A paga $ 50 de más (a favor); 01A no paga (debe).
  const { count } = await sb.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).like("referencia", "R10B3%");
  if (!count) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    const fila = (c, monto, ref) => ({ org_id: I.org, unidad_id: I.u[c], fecha: hoy, monto, monto_usd: monto, moneda: "USD", metodo: "Zelle", destino: "condominio", referencia: ref, estado: "conciliado" });
    const { error } = await sb.from("pagos").insert([fila("01B", totales["01B"], "R10B3-01B"), fila("02A", totales["02A"] + 50, "R10B3-02A")]);
    if (error) throw error;
  }

  for (const movil of [false, true]) {
    const ctx = await browser.newContext(movil ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await login(page, CREDS.residente);
    const casos = [
      ["01A", (t) => t.includes("Total del recibo") && t.includes("Si paga hoy") && t.includes("Multa por ruido · Acta 12/10") && t.includes("Reparación de tubería · Fact. 556"), "debe: «Si paga hoy», «Total del recibo», las dos líneas de cargos"],
      ["01B", (t) => t.includes("Está al día") && t.includes("no tiene que pagar") && t.includes("Total del recibo"), "«Hoy · Está al día · no tiene que pagar»"],
      ["02A", (t) => t.includes("A favor $ 50,00") && t.includes("no tiene que pagar"), "«Hoy · A favor $ 50,00 · no tiene que pagar»"],
    ];
    for (const [c, ok, que] of casos) {
      await page.goto(`${BASE}/mi/${I.u[c]}/recibo`, { waitUntil: "networkidle" });
      const t = await textoDe(page);
      await shot(page, `b3-portal-${c}${movil ? "-movil" : ""}`);
      registrar("B3", `portal ${c}${movil ? " (teléfono)" : ""}`, ok(t) && (!movil || (await sinDesborde(page))), que + (movil ? `; sin desborde: ${await sinDesborde(page)}` : ""));
    }
    if (movil) {
      await ctx.close();
      continue;
    }
    // El impreso del portal, y su PDF.
    const papel = [
      ["01A", (h) => h.includes("Total del recibo") && h.includes("Vence") && h.includes("Multa por ruido · Acta 12/10") && !h.includes("Total a pagar"), "«Total del recibo» arriba, «Vence», la multa en su línea"],
      ["01B", (h) => h.includes(">Hoy<") && h.includes("Está al día") && h.includes("no tiene que pagar") && h.includes("Total del recibo") && !h.includes(">Vence<"), "«Hoy · Está al día · no tiene que pagar» y al lado «Total del recibo»; sin «Vence»"],
      ["02A", (h) => h.includes(">Hoy<") && h.includes("A favor $ 50,00") && h.includes("Total del recibo"), "«Hoy · A favor $ 50,00» y «Total del recibo»"],
    ];
    for (const [c, ok, que] of papel) {
      await page.goto(`${BASE}/mi/${I.u[c]}/recibo/papel`, { waitUntil: "networkidle" });
      await page.evaluate(() => (window.print = () => {}));
      const h = await page.content();
      await shot(page, `b3-papel-portal-${c}`);
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: path.join(CAPTURAS, `${CORRIDA}-papel-portal-${c}.pdf`), format: "Letter" });
      await page.emulateMedia({ media: "screen" });
      registrar("B3", `impreso y PDF del portal ${c}`, ok(h), que);
    }
    // Datos que ya existen: Administradora Union 01A (a favor) y Torre Ida 01A (debe).
    for (const [id, ok, que] of [
      [EXISTENTES.union01A, (t) => /A favor \$ 186,35|Saldo a favor/.test(t), "Administradora Union 01A: a favor"],
      [EXISTENTES.ida01A, (t) => t.includes("Total del recibo") && t.includes("$ 100,00"), "Torre Ida 01A: debe $ 100,00"],
    ]) {
      await page.goto(`${BASE}/mi/${id}/recibo`, { waitUntil: "networkidle" });
      const t = await textoDe(page);
      await page.goto(`${BASE}/mi/${id}/recibo/papel`, { waitUntil: "networkidle" });
      await page.evaluate(() => (window.print = () => {}));
      const h = (await page.content()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      await shot(page, `b3-existente-${id.slice(0, 6)}`);
      registrar("B3", `existente: ${que}`, ok(t) && ok(h), `portal: ${ok(t)}, papel: ${ok(h)}`);
    }
    await ctx.close();
  }

  // El impreso desde Cortes (Admin), el último mes cerrado.
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await login(page, CREDS.admin);
  for (const [c, ok, que] of [
    ["01A", (h) => h.includes("Total del recibo") && h.includes("Vence") && h.includes("Reparación de tubería · Fact. 556"), "debe: «Total del recibo», «Vence», las líneas de cargos"],
    ["01B", (h) => h.includes(">Hoy<") && h.includes("Está al día") && h.includes("Total del recibo"), "«Hoy · Está al día»"],
    ["02A", (h) => h.includes(">Hoy<") && h.includes("A favor $ 50,00"), "«Hoy · A favor $ 50,00»"],
  ]) {
    await page.goto(`${BASE}/admin/${I.org}/${I.ed}/cortes/papel?periodo=${I.oct}&unidad=${I.u[c]}`, { waitUntil: "networkidle" });
    await page.evaluate(() => (window.print = () => {}));
    const h = await page.content();
    await shot(page, `b3-papel-cortes-${c}`);
    await page.emulateMedia({ media: "print" });
    await page.pdf({ path: path.join(CAPTURAS, `${CORRIDA}-papel-cortes-${c}.pdf`), format: "Letter" });
    await page.emulateMedia({ media: "screen" });
    registrar("B3", `impreso y PDF de Cortes ${c}`, ok(h), que);
  }
  // Un mes que ya no es el último (Torre Ida, agosto, de los datos que existen): sin «Hoy».
  await page.goto(`${BASE}/admin/${EXISTENTES.idaOrg}/${EXISTENTES.idaEd}/cortes/papel?periodo=${EXISTENTES.idaAgosto}&unidad=${EXISTENTES.ida01A}`, { waitUntil: "networkidle" });
  await page.evaluate(() => (window.print = () => {}));
  const h = await page.content();
  await shot(page, "b3-papel-cortes-existente");
  registrar("B3", "Cortes, datos existentes (Torre Ida 01A, agosto)", h.includes("Total del recibo") && !h.includes("Total a pagar"), "«Total del recibo»; el papel de agosto");
  // La vista previa dentro de Cortes.
  await page.goto(`${BASE}/admin/${I.org}/${I.ed}/cortes?periodo=${I.oct}`, { waitUntil: "networkidle" });
  const fila = page.locator("tr", { hasText: "01B" }).first();
  await fila.getByRole("button", { name: /Vista previa/ }).click();
  await page.waitForTimeout(1200);
  const src = await page.locator("iframe").first().getAttribute("srcdoc");
  await shot(page, "b3-vista-previa-cortes");
  registrar("B3", "vista previa de Cortes 01B", !!src && src.includes("Está al día") && src.includes("Total del recibo"), "«Hoy · Está al día» también en la vista previa");
  await ctx.close();
}

// ─── B1/B2: el envío del mes ──────────────────────────────────────────────
async function abrirCortes(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  await login(page, CREDS.admin);
  await page.goto(`${BASE}/admin/${I.org}/${I.ed}/cortes?periodo=${I.oct}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return { ctx, page };
}
async function pedirEnvio(page) {
  await page.getByRole("button", { name: /Enviar por correo/ }).click();
  await page.waitForTimeout(1500);
  return textoDe(page);
}

async function parteB1(browser) {
  const { ctx, page } = await abrirCortes(browser);
  const t = await pedirEnvio(page);
  await shot(page, "b1-primer-envio");
  registrar("B1", "primer envío", t.includes("Enviar los recibos de Octubre 2026") && !t.includes("ya se envió"), "«Enviar los recibos de Octubre 2026», sin aviso de reenvío");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.waitForTimeout(3000);
  const t2 = await textoDe(page);
  await shot(page, "b1-encolado");
  registrar("B1", "encolado", /en la cola|esperan|cupo/.test(t2), t2.match(/[^.]*(cola|cupo)[^.]*\./)?.[0] ?? t2.slice(0, 200));
  await ctx.close();
}

async function parteB2(browser) {
  const { ctx, page } = await abrirCortes(browser);
  let t = await textoDe(page);
  registrar(
    "B2",
    "resumen",
    // El que rebotó cuenta en «rebotó», no en «enviados»: no llegó.
    t.includes("Este mes:") && /0 enviados/.test(t) && /1 en cola/.test(t) && /1 no salió/.test(t) && /1 rebotó/.test(t) && /1 unidad sin correo/.test(t),
    t.match(/Este mes:.{0,160}/)?.[0] ?? "no está"
  );
  await page.getByRole("button", { name: /Ver cuáles/ }).click();
  await page.waitForTimeout(400);
  t = await textoDe(page);
  await shot(page, "b2-lista");
  registrar("B2", "inválido", t.includes("r10-invalido@resend") && t.includes("Dirección inválida: Resend no la aceptó"), "01B · r10-invalido@resend · «Dirección inválida: Resend no la aceptó»");
  registrar("B2", "rebotó", t.includes("bounced@resend.dev") && t.includes("Rebotó: la dirección no existe o no recibe correos"), "02A · bounced@resend.dev · «Rebotó: la dirección no existe o no recibe correos»");
  registrar("B2", "sin correo", t.includes("Sin correo: nadie de la unidad tiene correo cargado"), "02B · «Sin correo: nadie de la unidad tiene correo cargado con «recibe corte»»");
  const href = await page.getByRole("link", { name: "Corregir en la ficha" }).first().getAttribute("href");
  registrar("B2", "acceso a la ficha", !!href && href.includes(`/propietarios/`), String(href));

  // B1: volver a enviar con todo ya enviado o en la cola → 0 correos nuevos.
  t = await pedirEnvio(page);
  await shot(page, "b1-reenvio-0");
  registrar(
    "B1",
    "volver a enviar (0 nuevos, 1 en cola)",
    /Este mes ya se envió el \d{2}\/\d{2}\/\d{4}, \d{1,2}:\d{2} [ap]\. m\. Todavía hay 1 correo de este mes en la cola/.test(t) &&
      t.includes("No hay ningún correo nuevo para mandar") && !t.includes("manda 0") && !/m\.\./.test(t),
    t.match(/Este mes ya se envió.*?en su fila\./)?.[0] ?? t.slice(0, 300)
  );
  await page.getByRole("button", { name: "Entendido" }).click();
  await ctx.close();
}

// Después de cargarle un correo a 02B y corregir el de 01B (por SQL, como en la ficha).
async function parteB1b(browser) {
  const { ctx, page } = await abrirCortes(browser);
  let t = await pedirEnvio(page);
  await shot(page, "b1-reenvio-1");
  // Dos nuevos de verdad: el que se le cargó a 02B y el corregido de 01B.
  registrar("B1", "volver a enviar (2 nuevos)", /volver a enviar manda 2 correos más\. ¿Seguro\?/.test(t), t.match(/Este mes ya se envió[^?]*\?/)?.[0] ?? t.slice(0, 300));
  await page.getByRole("button", { name: "Sí, volver a enviar" }).click();
  await page.waitForTimeout(3000);
  const sb = await clienteDe(CREDS.admin);
  const { data: cola } = await sb.from("cola_correo").select("destino,estado").eq("unidad_id", I.u["02B"]);
  registrar("B1", "solo el nuevo", (cola || []).length === 1 && cola[0].destino === "delivered+r10-02b@resend.dev", JSON.stringify(cola));

  // B2: «Reenviar recibo» de 01B, ya corregido.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Ver cuáles/ }).click();
  const fila = page.locator("tr", { hasText: "r10-invalido@resend" }).first();
  await fila.getByRole("button", { name: /Reenviar recibo/ }).click();
  await page.waitForTimeout(2500);
  t = await textoDe(page);
  await shot(page, "b2-reenviado");
  const { data: c01B } = await sb.from("cola_correo").select("destino,estado").eq("unidad_id", I.u["01B"]).order("encolado_en");
  registrar("B2", "reenviar después de corregir", (c01B || []).some((c) => c.destino === "delivered+r10-01b@resend.dev" && c.estado === "pendiente"), `${t.match(/Recibo de 01B[^.]*\./)?.[0] ?? ""} ${JSON.stringify(c01B)}`);
  await ctx.close();
}

// R10-6: «Reenviar recibo» con el correo de ese recibo todavía esperando en la cola.
async function parteB2c(browser) {
  const { ctx, page } = await abrirCortes(browser);
  await page.getByRole("button", { name: /Ver cuáles/ }).click();
  const fila = page.locator("tr", { hasText: "r10-invalido@resend" }).first();
  await fila.getByRole("button", { name: /Reenviar recibo/ }).click();
  await page.waitForTimeout(2500);
  const t = await textoDe(page);
  await shot(page, "b2-no-duplica");
  const sb = await clienteDe(CREDS.admin);
  const { data: c01B } = await sb.from("cola_correo").select("destino,estado,tipo").eq("unidad_id", I.u["01B"]).eq("estado", "pendiente");
  registrar(
    "B2",
    "no duplica (R10-6)",
    t.includes("Ese recibo ya está en la cola, esperando para salir: no hace falta reenviarlo.") && (c01B || []).length === 1,
    `«${t.match(/Ese recibo ya está en la cola[^.]*\./)?.[0] ?? "sin aviso"}» · pendientes de 01B: ${JSON.stringify(c01B)}`
  );
  await ctx.close();
}

const partes = { A3: parteA3, C1: parteC1, C2: parteC2, B3: parteB3, B1: parteB1, B2: parteB2, B1b: parteB1b, B2c: parteB2c };
const pedidas = process.argv.slice(2);
const browser = await chromium.launch();
try {
  for (const p of pedidas) {
    if (!partes[p]) throw new Error(`Parte desconocida: ${p}`);
    console.log(`\n── ${p}`);
    await partes[p](browser);
  }
} finally {
  await browser.close();
}
const fallas = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallas} pasan, ${fallas} fallan.`);
writeFileSync(path.join(CAPTURAS, `resultado-${CORRIDA}.json`), JSON.stringify(resultados, null, 2));
