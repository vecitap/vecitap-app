// Script temporal de validación en el navegador — ronda 7 del tramo 2
// (docs/estado-migracion.md, «Ronda 7» → «Validación en el navegador»).
//
// Recorre las 16 pruebas del documento para Gustavo contra `next start`
// (nunca `npm run dev`), conectado a vecitap-pruebas, con los datos propios
// de la organización «ZZZ Validación Ronda 7». No usa las cuentas ni los
// datos de Gustavo.
//
// Requiere `playwright` instalado temporalmente (`npm install --no-save
// playwright`) y `npx next start -p 3123` corriendo. Las claves de las cuentas
// de prueba salen de `.env.local` (PRUEBA_*_CLAVE), nunca de este archivo: el
// repo es público.
//
// Uso: node scripts/validacion-ronda7.mjs [A|B|C|D|movil]...
// Salida: scripts/capturas-ronda7/*.png (ignorada por Git) y el resultado de
// cada paso en la consola.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const CAPTURAS = path.join(__dirname, "capturas-ronda7");
mkdirSync(CAPTURAS, { recursive: true });
const CSV = "C:/Users/Nicolas/Downloads/planillas-ronda5/piloto-orga-anonimo.csv";
const ORG_NOMBRE = "ZZZ Validación Ronda 7";

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

/* ── Consultas de verificación, con la sesión de cada cuenta (RLS) ── */
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
  const archivo = path.join(CAPTURAS, `${CORRIDA}-${String(nCaptura).padStart(3, "0")}-${nombre}.png`);
  await page.screenshot({ path: archivo, fullPage: true });
  return archivo;
}
const sinDesborde = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function login(page, cred) {
  await page.goto(`${BASE}/entrar`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", cred.email);
  await page.fill("input[type=password]", cred.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 30000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function ids(sbAdmin) {
  const { data: org } = await sbAdmin.from("organizaciones").select("id").eq("nombre", ORG_NOMBRE).single();
  const { data: eds } = await sbAdmin.from("edificios").select("id,nombre").eq("org_id", org.id);
  const ed = (n) => eds.find((e) => e.nombre === n)?.id;
  return { org: org.id, cerrada: ed("ZZZ Torre Cerrada"), nueva: ed("ZZZ Torre Nueva"), prueba: ed("Edificio Prueba Ronda 7") };
}

/* ── Previa de «Cargar datos» ── */
const grupo = (page, titulo) =>
  page.locator('div[style*="border-top"]', { has: page.locator("span", { hasText: titulo }) }).first();
const semaforo = (page) => page.locator("p", { hasText: "filas bien" }).first();

async function abrirCargarDatos(page, org, edificio) {
  await page.goto(`${BASE}/admin/${org}/${edificio}/propietarios`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Cargar datos/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles(CSV);
  await semaforo(page).waitFor({ timeout: 30000 });
}

/** Corrige la celda de una fila desde su aviso: busca el campo por su valor actual. */
async function corregirEnAviso(page, tituloGrupo, fila, valorActual, valorNuevo) {
  const g = grupo(page, tituloGrupo);
  const boton = g.getByRole("button", { name: /ver más/ });
  if (await boton.count()) await boton.click();
  const item = g.locator("div", { hasText: `Fila ${fila} ·` }).filter({ has: page.locator("input") }).last();
  const inputs = item.locator("input.control");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    if ((await inputs.nth(i).inputValue()) === valorActual) {
      await inputs.nth(i).fill(valorNuevo);
      await inputs.nth(i).locator("xpath=..").getByRole("button", { name: "Corregir" }).click();
      await page.waitForTimeout(400);
      return true;
    }
  }
  return false;
}

async function parteA(page, I, movil = false) {
  const t = movil ? "4" : "";
  // ── Prueba 1 ──
  await abrirCargarDatos(page, I.org, I.nueva);
  const linea = (await semaforo(page).innerText()).trim();
  registrar(t || "1", "resumen en una línea", linea === "41 filas bien · 12 con avisos · 1 con errores", `«${linea}»`);
  const titulos = await page.locator('div[style*="border-top"] > div > span[style*="font-weight: 600"]').allInnerTexts();
  registrar(t || "1", "avisos agrupados", titulos.length > 0 && titulos.length < 10, titulos.map((x) => `«${x}»`).join(" | "));
  await shot(page, `${movil ? "movil-" : ""}p1-previa`);
  const g0 = grupo(page, titulos[0].replace(/^\d+ filas? /, ""));
  await g0.getByRole("button", { name: "ver más" }).click();
  const detalle = await g0.locator('div[style*="var(--fondo)"]').count();
  await shot(page, `${movil ? "movil-" : ""}p1-ver-mas`);
  await g0.getByRole("button", { name: "ver menos" }).click();
  const cerrado = (await g0.locator('div[style*="var(--fondo)"]').count()) === 0;
  registrar(t || "1", "«ver más» despliega y se vuelve a cerrar", detalle > 0 && cerrado, `${detalle} filas al abrir; cerrado: ${cerrado}`);
  if (movil) registrar("4", "nada se sale de la pantalla (previa)", await sinDesborde(page), `ancho ok`);

  // ── Prueba 2 ──
  const c10 = await corregirEnAviso(page, "con texto en el teléfono", 42, "04245551666 Filobe ligozan", "04245551666");
  const linea2 = (await semaforo(page).innerText()).trim();
  registrar(t || "2", "10C corregido → 42 filas bien", c10 && linea2.startsWith("42 filas bien"), `corregido: ${c10}; «${linea2}»`);
  const marca = await page.getByText("corregido en la previa").count();
  registrar(t || "2", "la celda dice «corregido en la previa»", marca > 0, `${marca} celda(s)`);
  const tit = "que esperan una respuesta";
  const antes = (await grupo(page, tit).locator("span").first().innerText()).trim();
  const a = await corregirEnAviso(page, tit, 15, "0424-5551111", "04120000303");
  const b = await corregirEnAviso(page, tit, 15, "delivered+busilenanefageb@resend.dev", "prueba03d@resend.dev");
  const c = await corregirEnAviso(page, tit, 15, "delivered+daguvavucuzanorab@resend.dev", "prueba03d.respaldo@resend.dev");
  const despues = (await grupo(page, tit).locator("span").first().innerText()).trim();
  const sigue03D = await page.locator("div", { hasText: "(03D)" }).filter({ hasText: "¿Es la misma persona?" }).count();
  registrar(t || "2", "03D deja de preguntar: quedan 9 de 10", a && b && c && /^9 filas/.test(despues) && sigue03D === 0, `antes «${antes}» → después «${despues}»; corregidos ${[a, b, c]}; 03D sigue: ${sigue03D}`);
  await shot(page, `${movil ? "movil-" : ""}p2-corregido`);
  if (movil) {
    registrar("4", "nada se sale de la pantalla (tras corregir)", await sinDesborde(page), "");
    await page.getByRole("button", { name: "Descartar" }).click();
    return;
  }

  // ── Prueba 3 ──
  await page.getByRole("button", { name: "Descartar" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(CSV);
  await semaforo(page).waitFor();
  const linea3 = (await semaforo(page).innerText()).trim();
  const ambar10C = await grupo(page, "con texto en el teléfono").count();
  const pregunta03D = await page.locator("div", { hasText: "(03D)" }).filter({ hasText: "¿Es la misma persona?" }).count();
  registrar("3", "Descartar borra las correcciones", linea3.startsWith("41 filas bien") && ambar10C > 0 && pregunta03D > 0, `«${linea3}»; aviso de teléfono: ${ambar10C}; 03D pregunta: ${pregunta03D > 0}`);
  await page.getByRole("button", { name: "Descartar" }).click();
  const sb = await clienteDe(CREDS.admin);
  const { count } = await sb.from("unidades").select("id", { count: "exact", head: true }).eq("edificio_id", I.nueva);
  registrar("3", "no se cargó nada", count === 0, `${count} unidades en ZZZ Torre Nueva`);
}

async function prueba5(page, I) {
  // Crear el edificio desde Ajustes, como lo haría la administradora.
  await page.goto(`${BASE}/admin/${I.org}/${I.cerrada}/ajustes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Otro edificio/ }).click();
  const dialogo = page.locator("div", { has: page.locator("h2", { hasText: "Otro edificio" }) }).last();
  await dialogo.locator(".campo", { hasText: "Nombre" }).locator("input").fill("Edificio Prueba Ronda 7");
  await dialogo.locator(".campo", { hasText: "Prefijo" }).locator("input").fill("EPR7");
  await dialogo.getByRole("button", { name: "Crear" }).click();
  await page.waitForURL(/\/inicio$/, { timeout: 30000 });
  const sb = await clienteDe(CREDS.admin);
  I.prueba = (await ids(sb)).prueba;
  registrar("5", "edificio creado, sin unidades", !!I.prueba, page.url());

  await abrirCargarDatos(page, I.org, I.prueba);
  await corregirEnAviso(page, "con texto en el teléfono", 42, "04245551666 Filobe ligozan", "04245551666");
  const quedan10C = await grupo(page, "con texto en el teléfono").locator("span").first().innerText().catch(() => "(sin aviso)");
  registrar("5", "10C deja de estar en ámbar", !/2 filas/.test(quedan10C), `aviso de teléfono: «${quedan10C}»`);

  // Las preguntas: 05C y 05D «No»; las demás, «Sí» en la primera candidata.
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const pend = page.locator("div", { has: page.getByText("Sin respuesta por omisión: elija para poder cargar.") }).filter({ hasText: "¿Es la misma persona?" });
    if (!(await pend.count())) break;
    const p = pend.last();
    const texto = await p.innerText();
    if (/\(05C\)|\(05D\)/.test(texto)) {
      const no = p.getByRole("button", { name: /^No/ });
      await no.last().click();
    } else {
      await p.getByRole("button", { name: "Sí" }).first().click();
    }
    await page.waitForTimeout(250);
  }
  const boton = page.getByRole("button", { name: /^Cargar \d+ unidades?$/ });
  const habilitado = await boton.isEnabled();
  registrar("5", "el botón de cargar se habilita", habilitado, await boton.innerText());
  await shot(page, "p5-antes-de-cargar");
  await boton.click();
  await page.getByRole("button", { name: "Sí, cargar" }).click();
  await page.getByText("Datos cargados").waitFor({ timeout: 60000 });
  const aviso = (await page.locator(".aviso, [role=status], div", { hasText: "unidades nuevas" }).last().innerText()).replace(/\s+/g, " ").trim();
  registrar("5", "se cargan las unidades, sin error", true, `«${aviso.slice(0, 200)}»`);
  await shot(page, "p5-cargado");

  // La ficha de 10C: lo corregido es lo guardado.
  const { data: u10 } = await sb.from("unidades").select("id,vinculos(hasta,tipo,personas(telefono))").eq("edificio_id", I.prueba).eq("codigo", "10C").single();
  const tel = u10?.vinculos?.find((v) => !v.hasta && v.tipo === "propietario")?.personas?.telefono;
  await page.goto(`${BASE}/admin/${I.org}/${I.prueba}/propietarios/${u10.id}`, { waitUntil: "networkidle" });
  await shot(page, "p5-ficha-10C");
  const enPantalla = await page.locator(`input[value="${tel}"], text=${tel}`).count().catch(() => 0);
  registrar("5", "la ficha de 10C guarda el teléfono corregido", tel === "04245551666", `en la base: «${tel}»; en la ficha: ${enPantalla ? "se ve" : "revisar captura"}`);
  // 03D, cuyos datos NO se tocaron en esta prueba
  const { data: u03 } = await sb.from("unidades").select("vinculos(hasta,tipo,personas(telefono,correo,correo_respaldo))").eq("edificio_id", I.prueba).eq("codigo", "03D").single();
  console.log("   03D en la base:", JSON.stringify(u03?.vinculos?.find((v) => !v.hasta)?.personas));
}

/* ── Utilidades de las partes B–D ── */
const campo = (raiz, etiqueta) => raiz.locator(".campo", { has: raiz.page().locator("label", { hasText: etiqueta }) }).first();
const textoDe = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
async function unidad(sb, edificio, codigo) {
  const { data } = await sb.from("unidades").select("id").eq("edificio_id", edificio).eq("codigo", codigo).single();
  return data.id;
}

async function fichaDatos(page, I) {
  const sb = await clienteDe(CREDS.admin);
  const id = await unidad(sb, I.prueba, "10C");
  await page.goto(`${BASE}/admin/${I.org}/${I.prueba}/propietarios/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Datos" }).click();
  await page.waitForTimeout(800);
  const valores = await page.locator("input.control").evaluateAll((xs) => xs.map((x) => x.value));
  await shot(page, "p5-ficha-10C-datos");
  registrar("5", "la pestaña «Datos» de 10C muestra el teléfono corregido", valores.includes("04245551666"), `campos: ${valores.filter(Boolean).slice(0, 6).join(" · ")}`);
}

/* ── Parte B · datos para pagar (6 a 8) ── */
async function parteB(pa, pr, I) {
  const A = I.cerrada;
  // Para repetir la prueba desde cero: se quitan las cuentas de una corrida anterior.
  await (await clienteDe(CREDS.admin)).from("datos_pago").delete().eq("edificio_id", A);
  await pa.goto(`${BASE}/admin/${I.org}/${A}/ajustes`, { waitUntil: "networkidle" });
  const nueva = pa.locator("div", { has: pa.locator("h3", { hasText: "Agregar una cuenta" }) }).last();
  const cargar = async (v) => {
    await campo(nueva, "Para pagar").locator("select").selectOption({ label: v.destino });
    await campo(nueva, "Tipo").locator("select").selectOption({ label: v.tipo });
    await campo(nueva, "Banco").locator("select").selectOption({ label: v.banco });
    await campo(nueva, "Titular").locator("input").fill(v.titular);
    await campo(nueva, "RIF o cédula").locator("input").fill(v.doc);
    await campo(nueva, v.tipo === "Pago móvil" ? "Teléfono" : "Cuenta").locator("input").fill(v.cuenta);
    await nueva.getByRole("button", { name: /Agregar/ }).click();
    await pa.getByText("Agregada").first().waitFor({ timeout: 15000 });
    await pa.waitForLoadState("networkidle");
  };
  await cargar({ destino: "Condominio", tipo: "Transferencia", banco: "Banco de Venezuela", titular: "Condominio ZZZ Torre Cerrada", doc: "J-00000000-0", cuenta: "0102-0000-00-0000000000" });
  await cargar({ destino: "Honorarios de administración", tipo: "Pago móvil", banco: "Banco Mercantil", titular: "Administradora Prueba", doc: "V-00000000", cuenta: "04120000000" });
  const sb = await clienteDe(CREDS.admin);
  const { data: cuentas } = await sb.from("datos_pago").select("destino,tipo,orden").eq("edificio_id", A).order("orden");
  registrar("6", "quedan las dos cuentas, en orden", cuentas?.length === 2 && cuentas[0].destino === "condominio" && cuentas[0].orden < cuentas[1].orden, JSON.stringify(cuentas));
  await shot(pa, "p6-ajustes-cuentas");

  const za1 = await unidad(sb, A, "ZA-1");
  await pr.goto(`${BASE}/mi/${za1}/recibo`, { waitUntil: "networkidle" });
  const t = await textoDe(pr);
  const tarjeta = (t.match(/Datos para pagar.{0,400}/) ?? [""])[0];
  const copiar = await pr.getByRole("button", { name: "Copiar" }).count();
  registrar("6", "el propietario ve las dos cuentas, cuánto va a cada una y «Copiar»", /Condominio · \$ 120,00/.test(t) && /Honorarios de administración · \$ 10,00/.test(t) && copiar >= 4, `«${tarjeta.slice(0, 260)}» · ${copiar} botones «Copiar»`);
  await shot(pr, "p6-portal-datos-para-pagar");

  await pr.goto(`${BASE}/mi/${za1}/reportar`, { waitUntil: "networkidle" });
  const pregunta = campo(pr.locator("form"), "¿A qué cuenta pagó?");
  const opciones = (await pregunta.locator("option").allInnerTexts()).join(" / ");
  const ayuda = await pregunta.locator(".campo-ayuda").innerText().catch(() => "");
  registrar("7", "«¿A qué cuenta pagó?» con las dos cuentas", /Condominio/.test(opciones) && /Honorarios/.test(opciones), `opciones: ${opciones} · ayuda: «${ayuda}»`);
  await shot(pr, "p7-reportar");
  const { count: reportados } = await sb.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).eq("estado", "reportado");
  registrar("7", "no queda nada reportado", reportados === 0, `${reportados} pagos reportados`);

  // 8 · el recibo impreso y el correo
  const { data: per } = await sb.from("periodos").select("id").eq("edificio_id", A).eq("estado", "cerrado").single();
  await pa.goto(`${BASE}/admin/${I.org}/${A}/cortes/papel?periodo=${per.id}&unidad=${za1}`, { waitUntil: "networkidle" });
  const papel = await textoDe(pa);
  registrar("8", "el recibo impreso trae «Datos para pagar» con las dos cuentas", /Datos para pagar/i.test(papel) && /Condominio: \$ 120,00/.test(papel) && /Honorarios de administración: \$ 10,00/.test(papel), `«${(papel.match(/Datos para pagar.{0,300}/i) ?? [""])[0]}»`);
  await shot(pa, "p8-recibo-impreso");

  await pa.goto(`${BASE}/admin/${I.org}/${A}/cortes`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: /Probar el correo/ }).click();
  // ZA-1 a ZA-3 (las del residente) no mandan correo: se elige ZA-4.
  await campo(pa.locator("body"), "Unidad").locator("select").selectOption({ label: "ZA-4" });
  await pa.locator("iframe").first().waitFor({ timeout: 15000 });
  const marco = pa.frameLocator("iframe").first();
  const correo = (await marco.locator("body").innerText()).replace(/\s+/g, " ");
  registrar(
    "8",
    "el correo: USD, Bs con la frase y la fecha, datos para pagar",
    /Total a pagar \$ \d/.test(correo) && /Calculado a la tasa oficial BCV del dólar del \d\d\/\d\d\/\d{4}\. Si paga en bolívares, use la tasa BCV del día en que pague\./.test(correo) && /Datos para pagar/i.test(correo),
    `«${(correo.match(/Total a pagar.{0,330}/) ?? [""])[0]}»`
  );
  await shot(pa, "p8-vista-del-correo");
  await campo(pa.locator("body"), "Mandar la prueba a").locator("input").fill("delivered+zzz-prueba@resend.dev");
  await pa.getByRole("button", { name: /Enviar la prueba/ }).click();
  await pa.waitForTimeout(2500);
  const { data: cola } = await sb.from("cola_correo").select("tipo,destino,estado").eq("org_id", I.org).eq("tipo", "prueba");
  registrar("8", "«Enviar la prueba» encola un solo correo, a @resend.dev", cola?.length === 1 && cola[0].destino.endsWith("@resend.dev"), JSON.stringify(cola));
}

/* ── Parte C · invitación, dólares, cuotas y redondeo (9 a 12) ── */
async function parteC(pa, pr, I) {
  const A = I.cerrada;
  const sb = await clienteDe(CREDS.admin);
  // 9 · enviar los recibos de octubre
  await pa.goto(`${BASE}/admin/${I.org}/${A}/cortes`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: /Enviar por correo/ }).click();
  await pa.getByRole("button", { name: "Enviar", exact: true }).click();
  await pa.waitForTimeout(3000);
  const aviso1 = (await textoDe(pa)).match(/(\d+ correos?[^.]*\.|ya [^.]*\.)/)?.[0] ?? "";
  await shot(pa, "p9-enviado");
  const { data: rec } = await sb.from("cola_correo").select("destino,html,texto").eq("org_id", I.org).eq("tipo", "recibo");
  const za4 = rec?.find((r) => r.destino.includes("zzz-za4"));
  const codigo1 = za4?.texto.match(/código de invitación:\n([0-9a-f]{48})/)?.[1];
  registrar("9", "el correo de ZA-4 trae su código y «Crear mi usuario»", !!codigo1 && /Crear mi usuario/.test(za4.html), `${rec?.length} correos de recibo; código: ${codigo1 ? codigo1.slice(0, 8) + "…" : "no"}`);
  const { data: inv1 } = await sb.from("invitaciones").select("id,correo,expira_en").eq("org_id", I.org).is("usada_en", null);
  await pa.goto(`${BASE}/admin/${I.org}/${A}/accesos`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Invitaciones" }).click();
  await pa.waitForTimeout(1500);
  const acc = await textoDe(pa);
  registrar("9", "en Accesos aparece la invitación de ZA-4", acc.includes("delivered+zzz-za4@resend.dev"), `${inv1?.length} invitaciones pendientes (${inv1?.map((x) => x.correo).join(", ")})`);
  await shot(pa, "p9-accesos");
  await pa.goto(`${BASE}/admin/${I.org}/${A}/cortes`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: /Enviar por correo/ }).click();
  await pa.getByRole("button", { name: "Enviar", exact: true }).click();
  await pa.waitForTimeout(3000);
  const aviso2 = (await textoDe(pa)).match(/Aviso[^]*?(\d+[^.]{0,120}\.)/)?.[1] ?? "";
  const { data: inv2 } = await sb.from("invitaciones").select("id").eq("org_id", I.org).is("usada_en", null);
  const { data: rec2 } = await sb.from("cola_correo").select("id").eq("org_id", I.org).eq("tipo", "recibo");
  registrar("9", "reenviar no crea otra invitación ni otro correo", inv2?.length === inv1?.length && rec2?.length === rec?.length, `invitaciones ${inv1?.length} → ${inv2?.length}; correos ${rec?.length} → ${rec2?.length}`);
  await shot(pa, "p9-reenviado");
  console.log("   avisos de Cortes:", JSON.stringify([aviso1, aviso2]));

  // 10 · solo dólares
  const za1 = await unidad(sb, A, "ZA-1");
  await pa.goto(`${BASE}/admin/${I.org}/${A}/ajustes`, { waitUntil: "networkidle" });
  const tarjeta = pa.locator("div", { has: pa.locator("h2", { hasText: "Cómo cobra la administradora" }) }).last();
  await tarjeta.getByLabel(/Cobrar solo en dólares/).check();
  await tarjeta.getByRole("button", { name: "Guardar" }).click();
  await pa.waitForTimeout(1500);
  const conBs = async () => {
    const out = {};
    for (const [n, u] of [["principal", `/mi/${za1}/recibo`], ["reportar", `/mi/${za1}/reportar`], ["papel", `/mi/${za1}/recibo/papel`]]) {
      await pr.goto(`${BASE}${u}`, { waitUntil: "networkidle" });
      const t = await textoDe(pr);
      out[n] = { bs: /\bBs\b/.test(t), moneda: (await pr.locator(".campo", { hasText: "Moneda" }).count()) > 0, solo: /Su administración cobra solo en dólares/.test(t) };
      await shot(pr, `p10-${n}`);
    }
    return out;
  };
  const enc = await conBs();
  registrar("10", "encendido: sin Bs en ningún lado y «Reportar» sin moneda", !enc.principal.bs && !enc.reportar.bs && !enc.papel.bs && !enc.reportar.moneda && enc.reportar.solo, JSON.stringify(enc));
  await pa.goto(`${BASE}/admin/${I.org}/${A}/ajustes`, { waitUntil: "networkidle" });
  const t2 = pa.locator("div", { has: pa.locator("h2", { hasText: "Cómo cobra la administradora" }) }).last();
  await t2.getByLabel(/Cobrar solo en dólares/).uncheck();
  await t2.getByRole("button", { name: "Guardar" }).click();
  await pa.waitForTimeout(1500);
  const apa = await conBs();
  registrar("10", "apagado: vuelven los Bs", apa.principal.bs && apa.papel.bs && apa.reportar.moneda, JSON.stringify(apa));

}

async function parteC2(pa, pr, I) {
  const sb = await clienteDe(CREDS.admin);
  // 9 · la invitación de ZA-4 en Accesos → «Invitaciones» (se repite acá la parte que falló por el selector)
  await pa.goto(`${BASE}/admin/${I.org}/${I.cerrada}/accesos`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Invitaciones" }).click();
  await pa.waitForTimeout(1500);
  const acc = await textoDe(pa);
  registrar("9", "en Accesos → Invitaciones aparece la invitación de ZA-4", acc.includes("delivered+zzz-za4@resend.dev"), `«${(acc.match(/delivered+zzz-za4@resend.dev.{0,120}/) ?? [""])[0]}»`);
  await shot(pa, "p9-accesos-invitaciones");
  // 11 · cuota extraordinaria en 3 cuotas (Edificio Prueba Ronda 7)
  const E = I.prueba;
  await pa.goto(`${BASE}/admin/${I.org}/${E}/cobros`, { waitUntil: "networkidle" });
  const ce = pa.locator("div", { has: pa.locator("h2", { hasText: "Cuotas extraordinarias" }) }).last();
  const { count: yaAsc } = await sb.from("conceptos_cobro").select("id", { count: "exact", head: true }).eq("edificio_id", E).eq("nombre", "Ascensor");
  if (!yaAsc) {
    await campo(ce, "Nombre en el recibo").locator("input").fill("Ascensor");
    await campo(ce, "Cómo se reparte").locator("select").selectOption({ label: "Por alícuota" });
    await campo(ce, "Monto total del edificio").locator("input").fill("300");
    await campo(ce, "En cuántas cuotas").locator("input").fill("3");
    await ce.getByRole("button", { name: /Agregar cuota extraordinaria/ }).click();
    await pa.waitForTimeout(1500);
  }
  const tarjetaAsc = async () => (await ce.locator("div", { hasText: "Ascensor" }).filter({ has: pa.locator(".badge") }).last().innerText().catch(() => "")).replace(/\s+/g, " ");
  console.log("   tarjeta al crear:", await tarjetaAsc());
  const lineaDe = async (anio, mes) => {
    const { data: p } = await sb.from("periodos").select("id").eq("edificio_id", E).eq("anio", anio).eq("mes", mes).single();
    const { data: r } = await sb.from("recibos").select("conceptos,unidades!inner(codigo)").eq("periodo_id", p.id).eq("unidades.codigo", "01A").single();
    return (r?.conceptos ?? []).map((l) => `${l.nombre}=${Number(l.monto).toFixed(4)}`).join(" | ");
  };
  const cerrarMes = async (anio, mesNombre, gasto = "100") => {
    await pa.goto(`${BASE}/admin/${I.org}/${E}/mes`, { waitUntil: "networkidle" });
    const abrir = pa.getByRole("button", { name: "Abrir el mes" });
    if (await abrir.count()) {
      await campo(pa.locator("body"), "Año").locator("input").fill(String(anio));
      await campo(pa.locator("body"), "Mes").locator("select").selectOption({ label: mesNombre });
      await abrir.click();
      await pa.waitForLoadState("networkidle");
      await pa.waitForTimeout(1200);
      await campo(pa.locator("body"), "Concepto").locator("input").fill("Gasto de prueba");
      await campo(pa.locator("body"), "Monto USD").locator("input").fill(gasto);
      await campo(pa.locator("body"), "Monto USD").locator("xpath=..").locator("button").first().click().catch(async () => {
        await pa.locator("button:has(svg.lucide-plus)").last().click();
      });
      await pa.waitForTimeout(1200);
    }
    await pa.getByRole("button", { name: /Cerrar el mes y emitir recibos/ }).click();
    await pa.getByRole("button", { name: "Cerrar y emitir" }).click();
    await pa.waitForTimeout(3500);
    await pa.waitForLoadState("networkidle");
  };
  const { data: pNov } = await sb.from("periodos").select("estado").eq("edificio_id", E).eq("anio", 2026).eq("mes", 11).maybeSingle();
  if (pNov?.estado !== "cerrado") await cerrarMes(2026, "Noviembre");
  else await pa.goto(`${BASE}/admin/${I.org}/${E}/mes`, { waitUntil: "networkidle" });
  const nov = await lineaDe(2026, 11);
  registrar("11", "noviembre: «Ascensor (cuota 1 de 3)»", /Ascensor \(cuota 1 de 3\)/.test(nov), `01A: ${nov}`);
  await shot(pa, "p11-nov-cerrado");
  await pa.getByRole("row", { name: /Noviembre 2026/ }).getByRole("button", { name: "Reabrir" }).click();
  await pa.getByRole("button", { name: "Reabrir el mes" }).click();
  await pa.waitForTimeout(3000);
  await cerrarMes(2026, "Noviembre");
  const nov2 = await lineaDe(2026, 11);
  registrar("11", "reabrir y cerrar noviembre: sigue «cuota 1 de 3»", /Ascensor \(cuota 1 de 3\)/.test(nov2), `01A: ${nov2}`);
  await cerrarMes(2026, "Diciembre");
  await cerrarMes(2027, "Enero");
  await cerrarMes(2027, "Febrero");
  const [dic, ene, feb] = [await lineaDe(2026, 12), await lineaDe(2027, 1), await lineaDe(2027, 2)];
  await pa.goto(`${BASE}/admin/${I.org}/${E}/cobros`, { waitUntil: "networkidle" });
  const fin = await tarjetaAsc();
  await shot(pa, "p11-terminada");
  registrar("11", "dic «2 de 3», ene «3 de 3», feb sin Ascensor, «Terminada»", /cuota 2 de 3/.test(dic) && /cuota 3 de 3/.test(ene) && !/Ascensor/.test(feb) && /Terminada/.test(fin), `dic: ${dic} · ene: ${ene} · feb: ${feb} · tarjeta: «${fin}»`);

  // 12 · redondeo a múltiplos de 5
  const { data: febAntes } = await sb.from("recibos").select("id,cuota,total").eq("periodo_id", (await sb.from("periodos").select("id").eq("edificio_id", E).eq("anio", 2027).eq("mes", 2).single()).data.id);
  await pa.goto(`${BASE}/admin/${I.org}/${E}/ajustes`, { waitUntil: "networkidle" });
  const t3 = pa.locator("div", { has: pa.locator("h2", { hasText: "Cómo cobra la administradora" }) }).last();
  await campo(t3, "Redondeo de las cuotas").locator("select").selectOption({ label: "A múltiplos de $ 5" });
  await t3.getByRole("button", { name: "Guardar" }).click();
  await pa.waitForTimeout(1500);
  await cerrarMes(2027, "Marzo", "123,45");
  const { data: pMar } = await sb.from("periodos").select("id").eq("edificio_id", E).eq("anio", 2027).eq("mes", 3).single();
  const { data: rMar } = await sb.from("recibos").select("cuota,directos,honorario,servicio,conceptos,unidades!inner(codigo)").eq("periodo_id", pMar.id);
  const malas = (rMar ?? []).filter((r) => Math.abs((Number(r.cuota) + Number(r.directos) + Number(r.honorario) + Number(r.servicio)) % 5) > 0.0001 && Math.abs(((Number(r.cuota) + Number(r.directos) + Number(r.honorario) + Number(r.servicio)) % 5) - 5) > 0.0001);
  const conLinea = (rMar ?? []).filter((r) => (r.conceptos ?? []).some((l) => l.nombre === "Fondo de reserva por redondeo")).length;
  const ej = (rMar ?? []).find((r) => r.unidades.codigo === "01A");
  registrar("12", "cada cuota termina en múltiplo de 5, con «Fondo de reserva por redondeo»", malas.length === 0 && conLinea > 0, `${rMar?.length} recibos; ${malas.length} no redondos; ${conLinea} con la línea; 01A: cuota ${ej?.cuota} · ${(ej?.conceptos ?? []).map((l) => `${l.nombre}=${l.monto}`).join(" | ")}`);
  const { data: febDespues } = await sb.from("recibos").select("id,cuota,total").in("id", (febAntes ?? []).map((r) => r.id));
  const igual = JSON.stringify((febAntes ?? []).map((r) => [r.id, r.cuota, r.total]).sort()) === JSON.stringify((febDespues ?? []).map((r) => [r.id, r.cuota, r.total]).sort());
  registrar("12", "febrero (ya cerrado) no cambió", igual && (febAntes ?? []).length > 0, `${febAntes?.length} recibos iguales: ${igual}`);
  await pa.goto(`${BASE}/admin/${I.org}/${E}/ajustes`, { waitUntil: "networkidle" });
  const t4 = pa.locator("div", { has: pa.locator("h2", { hasText: "Cómo cobra la administradora" }) }).last();
  await campo(t4, "Redondeo de las cuotas").locator("select").selectOption({ label: "Sin redondeo" });
  await t4.getByRole("button", { name: "Guardar" }).click();
  await pa.waitForTimeout(1500);
  const { data: aj } = await sb.from("ajustes_cobro").select("solo_usd,redondeo").eq("org_id", I.org).single();
  registrar("12", "queda «Sin redondeo» (y solo dólares apagado)", aj?.redondeo === "ninguno" && aj?.solo_usd === false, JSON.stringify(aj));
}

/* ── Parte D · mensajes, estado financiero y pago agrupado (13 a 16) ── */
async function parteD(pa, pr, I) {
  const A = I.cerrada;
  const sb = await clienteDe(CREDS.admin);
  // El residente tiene en su ficha el correo de su cuenta (@vecitap.com): para
  // que el mensaje no salga ahí, se le pone uno de @resend.dev antes.
  const { data: v } = await sb.from("vinculos").select("persona_id").eq("unidad_id", await unidad(sb, A, "ZA-1")).is("hasta", null).single();
  await sb.from("personas").update({ correo: "delivered+zzz-residente@resend.dev" }).eq("id", v.persona_id);

  // 13 · mensajes
  await pa.goto(`${BASE}/admin/${I.org}/${A}/mensajes`, { waitUntil: "networkidle" });
  await campo(pa.locator("body"), "Asunto").locator("input").fill("Prueba de la ronda 7");
  await campo(pa.locator("body"), "Mensaje").locator("textarea").fill("Mensaje de prueba de la validación. No responder.");
  await pa.getByText(/personas? ·/).first().waitFor({ timeout: 15000 });
  const vista = (await pa.locator("div", { hasText: /personas? ·/ }).last().innerText()).replace(/\s+/g, " ");
  registrar("13", "la vista previa dice a cuántas personas va y si sale hoy", /\d+ personas?/.test(vista) && /(Sale hoy|se reparte en)/.test(vista), `«${vista}»`);
  await shot(pa, "p13-vista-previa");
  await pa.getByRole("button", { name: "Enviar", exact: true }).click();
  await pa.getByRole("button", { name: "Sí, enviar" }).click();
  await pa.getByText("Mensaje en camino").waitFor({ timeout: 15000 });
  await campo(pa.locator("body"), "Asunto").locator("input").fill("Prueba de la ronda 7");
  await campo(pa.locator("body"), "Mensaje").locator("textarea").fill("Mensaje de prueba de la validación. No responder.");
  await pa.waitForTimeout(800);
  await pa.getByRole("button", { name: "Enviar", exact: true }).click();
  await pa.getByRole("button", { name: "Sí, enviar" }).click();
  await pa.waitForTimeout(2000);
  const rechazo = /Ese mismo mensaje ya se envió hace un momento/.test(await textoDe(pa));
  const { data: msjs } = await sb.from("mensajes").select("id,cantidad").eq("edificio_id", A);
  const hist = (await pa.locator("div", { hasText: "Mensajes enviados" }).last().innerText()).replace(/\s+/g, " ");
  registrar("13", "queda en el historial y el segundo envío se rechaza", rechazo && msjs?.length === 1, `rechazo: ${rechazo}; mensajes: ${JSON.stringify(msjs)}; historial: «${hist.slice(0, 160)}»`);
  await shot(pa, "p13-historial");

  // 14 · estado financiero
  await pa.goto(`${BASE}/admin/${I.org}/${A}/estado`, { waitUntil: "networkidle" });
  await pa.getByText("Saldo final").waitFor({ timeout: 15000 });
  const ef = (await pa.locator("body").innerText()).replace(/\s+/g, " ");
  const num = (rot) => ef.match(new RegExp(rot + " (-?\\$ ?-?[\\d.,]+)"))?.[1];
  registrar("14", "saldo inicial + ingresos − egresos = saldo final; honorarios aparte", true, `inicial ${num("Saldo inicial")} · ingresos ${num("Ingresos \\(pagos confirmados\\)")} · egresos ${num("Egresos \\(gastos del mes\\)")} · final ${num("Saldo final")} · «${(ef.match(/Aparte[^.]*\./) ?? [""])[0]}»`);
  await shot(pa, "p14-estado");
  await pa.getByRole("link", { name: "Descargar PDF" }).click();
  await pa.waitForLoadState("networkidle");
  const papel = await textoDe(pa);
  await shot(pa, "p14-pdf");
  await pa.getByText(/Volver/).first().click();
  await pa.waitForLoadState("networkidle");
  registrar("14", "el PDF y «← Volver» regresan al mismo período", /Estado financiero/i.test(papel) && /desde=2026-10&hasta=2026-10/.test(pa.url()), pa.url());
  const [descarga] = await Promise.all([pa.waitForEvent("download"), pa.getByRole("button", { name: "Descargar Excel" }).click()]);
  const archivo = path.join(CAPTURAS, "p14-estado.xlsx");
  await descarga.saveAs(archivo);
  const XLSX = await import("xlsx");
  const libro = XLSX.read(readFileSync(archivo));
  const resumen = XLSX.utils.sheet_to_json(libro.Sheets.Resumen, { header: 1 });
  registrar("14", "el Excel trae tres hojas y los mismos números", libro.SheetNames.join(",") === "Resumen,Ingresos,Egresos", `hojas: ${libro.SheetNames.join(", ")} · resumen: ${JSON.stringify(resumen.slice(3, 8))}`);

}

async function parteD2(pa, pr, I) {
  const A = I.cerrada;
  const sb = await clienteDe(CREDS.admin);
  // 15 · pago agrupado del propietario (si ya se reportó en una corrida anterior, no se repite)
  const za1 = await unidad(sb, A, "ZA-1");
  const { count: ya15 } = await sb.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).eq("referencia", "ZZZ15");
  let partes = [];
  if (!ya15) {
  await pr.goto(`${BASE}/mi/${za1}/reportar`, { waitUntil: "networkidle" });
  await pr.getByLabel(/Esta transferencia paga varias de mis unidades/).check();
  await pr.waitForTimeout(1500);
  partes = await pr.locator('input[aria-label^="Monto para"]').evaluateAll((xs) => xs.map((x) => `${x.getAttribute("aria-label")}=${x.value}`));
  await pr.getByRole("button", { name: "Usar la suma como monto" }).click();
  const formulario = pr.locator("form");
  await campo(formulario, "Banco desde el que pagó").locator("select").selectOption({ index: 1 });
  await campo(formulario, "Teléfono desde el que pagó").locator("input").fill("04120000000");
  await campo(formulario, "Referencia").locator("input").fill("ZZZ15");
  const png = path.join(CAPTURAS, "comprobante.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  await campo(formulario, "Comprobante").locator("input[type=file]").setInputFiles(png);
  await pr.waitForTimeout(800);
  await shot(pr, "p15-reparto");
  await pr.getByRole("button", { name: "Reportar el pago" }).click();
  await pr.waitForURL(/\/pagos$/, { timeout: 30000 });
  await pr.waitForLoadState("networkidle");
  await shot(pr, "p15-mis-pagos");
  const { data: grupo15 } = await sb.from("pagos").select("id,grupo_id,monto,monto_usd,tasa_aplicada,estado,unidades(codigo)").eq("org_id", I.org).eq("referencia", "ZZZ15");
  const g15 = new Set((grupo15 ?? []).map((p) => p.grupo_id));
  const sumaUsd = (grupo15 ?? []).reduce((s, p) => s + Number(p.monto_usd), 0);
  const totalBs = (grupo15 ?? []).reduce((s, p) => s + Number(p.monto), 0);
  const tasa = Number(grupo15?.[0]?.tasa_aplicada);
  registrar("15", "salen tres pagos «esperando revisión», uno por unidad", grupo15?.length === 3 && g15.size === 1 && grupo15.every((p) => p.estado === "reportado"), `${partes.join(" · ")} → ${grupo15?.map((p) => `${p.unidades.codigo} Bs ${p.monto} = $ ${p.monto_usd}`).join(" · ")}; suma $ ${sumaUsd.toFixed(2)} = round(${totalBs}/${tasa}) ${(Math.round((totalBs / tasa) * 100) / 100).toFixed(2)}`);
  await pa.goto(`${BASE}/admin/${I.org}/${A}/pagos`, { waitUntil: "networkidle" });
  const agrupados = await pa.getByText(/Agrupado con/).count();
  const comprobantes = await pa.getByRole("button", { name: "ver comprobante" }).count();
  registrar("15", "cada uno dice «Agrupado con…» y tiene el comprobante", agrupados === 3 && comprobantes === 3, `${agrupados} «Agrupado con» · ${comprobantes} «ver comprobante»`);
  await shot(pa, "p15-pagos-admin");
  await pa.locator("tr", { has: pa.getByText(/Agrupado con/) }).first().getByRole("button", { name: "Conciliar" }).click();
  await pa.waitForTimeout(2500);
  const aviso15 = (await textoDe(pa)).match(/Se confirmó[^.]*\./)?.[0] ?? "";
  const { data: g15b } = await sb.from("pagos").select("estado").eq("org_id", I.org).eq("referencia", "ZZZ15");
  registrar("15", "confirmar uno confirma los tres", g15b?.every((p) => p.estado === "conciliado"), `${g15b?.map((p) => p.estado).join(", ")} · «${aviso15}»`);
  }

  // 16 · agrupado de la administradora
  await pa.goto(`${BASE}/admin/${I.org}/${A}/pagos`, { waitUntil: "networkidle" });
  await pa.getByLabel(/Una sola transferencia para varias unidades/).check();
  const filas = pa.locator('div:has(> select):has(> input[placeholder$="de esta unidad"])');
  await filas.nth(0).locator("select").selectOption({ label: "ZA-4" });
  await filas.nth(0).locator("input").fill("40");
  await filas.nth(1).locator("select").selectOption({ label: "ZA-5" });
  await filas.nth(1).locator("input").fill("50");
  await campo(pa.locator("body"), "Total de la transferencia").locator("input").fill("100");
  await campo(pa.locator("body"), "Referencia").locator("input").fill("16160016");
  await pa.getByRole("button", { name: "Registrar como reportado" }).click();
  await pa.waitForTimeout(1500);
  const err16 = (await textoDe(pa)).match(/Las partes suman[^:]*: tienen que ser iguales\./)?.[0] ?? "";
  registrar("16", "40 + 50 contra 100: lo rechaza y dice que no cuadra", !!err16, `«${err16}»`);
  await filas.nth(0).locator("input").fill("50");
  await pa.getByRole("button", { name: "Registrar como reportado" }).click();
  await pa.waitForTimeout(2500);
  const ok16 = (await textoDe(pa)).match(/Transferencia registrada[^.]*\./)?.[0] ?? "";
  const { data: g16 } = await sb.from("pagos").select("grupo_id,monto,estado").eq("org_id", I.org).eq("referencia", "16160016");
  registrar("16", "50 + 50: queda registrado como un grupo", g16?.length === 2 && new Set(g16.map((p) => p.grupo_id)).size === 1, `«${ok16}» · ${JSON.stringify(g16)}`);
  await shot(pa, "p16-registrado");
  // El extracto del banco: un movimiento de $ 100 con la referencia.
  const extracto = path.join(CAPTURAS, "extracto-p16.csv");
  writeFileSync(extracto, "Fecha,Referencia,Descripción,Monto\n26/10/2026,16160016,Transferencia recibida,\"100,00\"\n");
  await pa.getByRole("button", { name: "Conciliar con el banco" }).click();
  await pa.locator('input[type="file"]').last().setInputFiles(extracto);
  await pa.waitForTimeout(2500);
  await shot(pa, "p16-cruce");
  const boton = pa.getByRole("button", { name: /^Conciliar \d+ pagos$/ });
  const nCasan = (await boton.count()) ? await boton.innerText() : "(sin botón)";
  if (await boton.count()) {
    await boton.click();
    await pa.waitForTimeout(2500);
  }
  const { data: g16b } = await sb.from("pagos").select("estado").eq("org_id", I.org).eq("referencia", "16160016");
  registrar("16", "el movimiento de $ 100 casa con la suma del grupo y lo concilia entero", nCasan === "Conciliar 1 pagos" && g16b?.every((p) => p.estado === "conciliado"), `botón: «${nCasan}» · ${g16b?.map((p) => p.estado).join(", ")}`);
}

/** Tamaño de teléfono: las pantallas nuevas, sin escribir nada. */
async function movilPantallas(pa, pr, I) {
  const A = I.cerrada;
  const sb = await clienteDe(CREDS.admin);
  const za1 = await unidad(sb, A, "ZA-1");
  for (const [quien, page, ruta, nombre] of [
    ["admin", pa, `/admin/${I.org}/${A}/ajustes`, "ajustes"],
    ["admin", pa, `/admin/${I.org}/${I.prueba}/cobros`, "cobros"],
    ["admin", pa, `/admin/${I.org}/${A}/mensajes`, "mensajes"],
    ["admin", pa, `/admin/${I.org}/${A}/estado`, "estado"],
    ["admin", pa, `/admin/${I.org}/${A}/pagos`, "pagos"],
    ["residente", pr, `/mi/${za1}/recibo`, "portal"],
    ["residente", pr, `/mi/${za1}/reportar`, "reportar"],
  ]) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    if (nombre === "reportar") await page.getByLabel(/Esta transferencia paga varias/).check().catch(() => {});
    await shot(page, `movil-${nombre}`);
    registrar("móvil", `${nombre} (${quien}): nada se sale de la pantalla`, await sinDesborde(page), ruta);
  }
}

/* ── Programa ── */
const partes = process.argv.slice(2);
const quiere = (p) => partes.length === 0 || partes.includes(p);
const browser = await chromium.launch();
try {
  const sbAdmin = await clienteDe(CREDS.admin);
  const I = await ids(sbAdmin);
  console.log("Ids:", JSON.stringify(I));

  if (quiere("A")) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await login(page, CREDS.admin);
    await parteA(page, I);
    if (!I.prueba) await prueba5(page, I);
    registrar("A", "sin errores de JavaScript en la página", errores.length === 0, errores.join(" | ") || "ninguno");
    await ctx.close();
  }
  const dos = async (viewport, extra = {}) => {
    const ca = await browser.newContext({ viewport, ...extra, acceptDownloads: true });
    const cr = await browser.newContext({ viewport, ...extra });
    const pa = await ca.newPage();
    const pr = await cr.newPage();
    await login(pa, CREDS.admin);
    await login(pr, CREDS.residente);
    return { pa, pr, cerrar: async () => (await ca.close(), await cr.close()) };
  };
  if (quiere("ficha")) {
    const { pa, cerrar } = await dos({ width: 1280, height: 900 });
    await fichaDatos(pa, I);
    await cerrar();
  }
  for (const [p, fn] of [["B", parteB], ["C", parteC], ["C2", parteC2], ["D", parteD], ["D2", parteD2]]) {
    if (!quiere(p)) continue;
    const { pa, pr, cerrar } = await dos({ width: 1280, height: 900 });
    try {
      await fn(pa, pr, I);
    } catch (e) {
      registrar(p, "la parte se cortó", false, String(e).split("\n").slice(0, 4).join(" "));
      await shot(pa, `${p}-error-admin`).catch(() => {});
      await shot(pr, `${p}-error-residente`).catch(() => {});
    }
    await cerrar();
  }
  if (quiere("movil")) {
    const movil = { width: 390, height: 844 };
    const extra = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
    const { pa, pr, cerrar } = await dos(movil, extra);
    await parteA(pa, I, true);
    await movilPantallas(pa, pr, I);
    await cerrar();
  }
} catch (e) {
  console.error("ERROR:", e);
} finally {
  await browser.close();
  writeFileSync(path.join(CAPTURAS, "resultados.json"), JSON.stringify(resultados, null, 2));
}
