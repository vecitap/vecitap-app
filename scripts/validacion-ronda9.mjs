// Script temporal de validación en el navegador — ronda 9 del tramo 2
// (docs/estado-migracion.md, «Ronda 9» → «Validación»).
//
// Contra `next start` (nunca `npm run dev`), conectado a vecitap-pruebas, con
// los datos propios de la organización «ZZZ Validación Ronda 9» (ZZZ Torre A
// y B, armada con SQL: con la ronda 9 una cuenta común ya no puede crear una
// administradora). No usa las cuentas ni los datos de Gustavo.
//
// Requiere `playwright` instalado temporalmente (`npm install --no-save
// playwright`) y `npx next start -p 3123` corriendo con RESEND_WEBHOOK_SECRET
// (el secreto descartable de la prueba, en VALIDACION_WHSEC). Las claves de
// las cuentas de prueba salen de `.env.local` (PRUEBA_*_CLAVE), nunca de este
// archivo: el repo es público.
//
// Uso: node scripts/validacion-ronda9.mjs [A2|A1|R|movil|B|A5|A3|C3|D|U|P]...
// Salida: scripts/capturas-ronda9/*.png (ignorada por Git) y el resultado de
// cada paso en la consola.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const BASE = process.env.VALIDACION_BASE_URL || "http://localhost:3123";
const CAPTURAS = path.join(__dirname, "capturas-ronda9");
mkdirSync(CAPTURAS, { recursive: true });
const ORG_NOMBRE = "ZZZ Validación Ronda 9";

const env = Object.fromEntries(
  readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const CREDS = {
  admin: { email: "admin.prueba@vecitap.com", password: env.PRUEBA_ADMIN_CLAVE },
  residente: { email: "residente.prueba@vecitap.com", password: env.PRUEBA_RESIDENTE_CLAVE },
  operador: { email: "operador.prueba@vecitap.com", password: env.PRUEBA_OPERADOR_CLAVE },
};
if (!env.PRUEBA_ADMIN_CLAVE || !env.PRUEBA_RESIDENTE_CLAVE || !env.PRUEBA_OPERADOR_CLAVE) {
  console.error("Faltan PRUEBA_ADMIN_CLAVE, PRUEBA_RESIDENTE_CLAVE o PRUEBA_OPERADOR_CLAVE en .env.local");
  process.exit(1);
}
if (!/hdivffuorclzulijkyry/.test(env.NEXT_PUBLIC_SUPABASE_URL)) {
  console.error("`.env.local` no apunta a vecitap-pruebas: no se corre nada.");
  process.exit(1);
}

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
const dinero = (n) => Number(n).toFixed(2);

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
  const { data: us } = await sb.from("unidades").select("id,codigo,edificio_id").eq("org_id", org.id);
  const u = (edificio, codigo) => us.find((x) => x.edificio_id === edificio && x.codigo === codigo)?.id;
  const { data: ps } = await sb.from("periodos").select("id,edificio_id").eq("org_id", org.id).eq("anio", 2026).eq("mes", 10);
  return { org: org.id, A: ed("ZZZ Torre A"), B: ed("ZZZ Torre B"), u, periodo: (e) => ps.find((p) => p.edificio_id === e)?.id };
}

/* ── A2: el redondeo de Gustavo, en la previa y en el recibo ── */
const ESPERADO = {
  A: { "01A": 19, "01B": 20, "01D": 25, "02A": 125, "04A": 19, "05C": 125, "10A": 25 },
  B: { "01A": 19, "02A": 20, "03A": 25, "04A": 125 },
};
const DE = { "01A": "18,40 con saldo anterior", "01B": "20,00 con saldo anterior", "01D": "20,01 con saldo anterior", "02A": "122,99 con saldo anterior", "04A": "18,40 sin saldo anterior", "05C": "122,99 sin saldo anterior", "10A": "20,01 sin saldo anterior" };
async function parteA2(_page, I) {
  const sb = await clienteDe(CREDS.admin);
  for (const [torre, esperado] of Object.entries(ESPERADO)) {
    const ed = I[torre];
    const per = I.periodo(ed);
    const { data: estado } = await sb.from("periodos").select("estado").eq("id", per).single();
    let previa = null;
    if (estado.estado === "abierto") {
      const { data, error } = await sb.rpc("simular_cierre", { p_periodo: per });
      if (error) throw error;
      previa = Object.fromEntries(data.map((r) => [r.codigo, Number(r.total)]));
      const { error: e2 } = await sb.rpc("cerrar_periodo", { p_periodo: per });
      if (e2) throw e2;
    }
    const { data: recs } = await sb.from("recibos").select("total,conceptos,unidades(codigo)").eq("periodo_id", per);
    for (const r of recs) {
      const c = r.unidades.codigo;
      const fondo = (r.conceptos ?? []).find((l) => l.redondeo)?.monto;
      const ok = Math.abs(Number(r.total) - esperado[c]) < 0.0001 && (!previa || Math.abs(previa[c] - Number(r.total)) < 0.0001);
      registrar("A2", `${torre === "B" ? "Torre B (con cuota extraordinaria) " : ""}${c}: ${torre === "B" ? { "01A": "18,40", "02A": "20,00", "03A": "20,01", "04A": "122,99" }[c] + " con saldo anterior" : DE[c]} → ${esperado[c]}`, ok,
        `recibo $${dinero(r.total)}${previa ? ` · previa $${dinero(previa[c])}` : ""} · fondo ${fondo === undefined ? "sin línea" : dinero(fondo)}${torre === "B" ? ` · ${(r.conceptos ?? []).map((l) => l.nombre).join(" + ")}` : ""}`);
    }
  }
}

/* ── A1: pagos confirmados después del recibo ── */
async function parteA1(_page, I) {
  const sb = await clienteDe(CREDS.admin);
  const { count } = await sb.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).like("referencia", "R9A1%");
  if (!count) {
    const hoy = new Date().toISOString().slice(0, 10);
    const fila = (codigo, monto, ref) => ({ org_id: I.org, unidad_id: I.u(I.A, codigo), fecha: hoy, monto, moneda: "USD", metodo: "Zelle", destino: "condominio", referencia: ref, estado: "conciliado" });
    const { error } = await sb.from("pagos").insert([fila("01A", 19, "R9A1-01A"), fila("02A", 175, "R9A1-02A"), fila("01D", 10, "R9A1-01D")]);
    if (error) throw error;
  }
  const { data: s } = await sb.from("saldos_actuales").select("codigo,total").eq("edificio_id", I.A).in("codigo", ["01A", "02A", "01D"]);
  registrar("A1", "después de los pagos: 01A en 0, 02A a favor 50, 01D debe 15", s.length === 3, s.map((x) => `${x.codigo} ${dinero(x.total)}`).join(" · "));
}

/* ── El portal, con los pagos de A1 ── */
async function parteR(pr, I, movil) {
  const sufijo = movil ? "movil-" : "";
  const p = movil ? "móvil" : "A1";
  const leer = async (codigo, seg = "recibo") => {
    await pr.goto(`${BASE}/mi/${I.u(I.A, codigo)}/${seg}`, { waitUntil: "networkidle" });
    return textoDe(pr);
  };
  const t01A = await leer("01A");
  await shot(pr, `${sufijo}a1-01A`);
  registrar(p, "01A (recibo $ 19, pagó $ 19): Mi recibo no pide pagar; dice «Está al día»", !/Si paga hoy/.test(t01A) && /Está al día/.test(t01A) && /Hoy está al día: no tiene que pagar/.test(t01A),
    `«${t01A.match(/Hoy Está al día[^.]*|Si paga hoy[^a]{0,40}/)?.[0] ?? "—"}» · «${t01A.match(/Después de este recibo[^.]*\.[^.]*\./)?.[0] ?? "—"}»`);
  // La tarjeta de la unidad (la de 22 px), comparada con el gris de --tenue.
  const color = await pr.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find((d) => d.textContent === "Al día" && getComputedStyle(d).fontSize === "22px");
    if (!el) return null;
    const ref = document.createElement("span");
    ref.style.color = "var(--tenue)";
    document.body.appendChild(ref);
    const gris = getComputedStyle(ref).color;
    ref.remove();
    return { es: getComputedStyle(el).color, gris };
  });
  registrar(p, "B2 · la tarjeta dice «Al día» en gris, sin «$ 0,00»", !!color && color.es === color.gris && !/Debe \$ 0,00/.test(t01A), color ? `color ${color.es} (gris ${color.gris})` : "no está");
  if (movil) registrar(p, "Mi recibo: nada se sale de la pantalla", await sinDesborde(pr), "");
  registrar(p, "01A: «Datos para pagar» sin «$ 0,00»", /Datos para pagar/i.test(t01A) && !/Cuenta del condominio · \$ 0,00/i.test(t01A), (t01A.match(/Datos para pagar.{0,80}/i)?.[0] ?? "").slice(0, 80));

  const t02A = await leer("02A");
  await shot(pr, `${sufijo}a1-02A`);
  registrar(p, "02A (recibo $ 125, pagó $ 175): Mi recibo dice «A favor $ 50,00», no «Si paga hoy»", !/Si paga hoy/.test(t02A) && /A favor \$ 50,00/.test(t02A),
    `«${t02A.match(/Hoy A favor[^n]*|Si paga hoy.{0,30}/)?.[0] ?? "—"}» · total del recibo ${/Total \$ 125,00/.test(t02A) ? "$ 125,00 (el de la emisión)" : "?"}`);
  const r02A = await leer("02A", "reportar");
  registrar(p, "02A · Reportar un pago: «Hoy no tiene que pagar: tiene $ 50,00 a favor», sin monto exacto", /Hoy no tiene que pagar: tiene \$ 50,00 a favor/.test(r02A) && !/Para pagar su deuda/.test(r02A), (r02A.match(/Hoy no tiene que pagar[^.]*/)?.[0] ?? "—"));
  if (movil) {
    registrar(p, "Reportar un pago: nada se sale de la pantalla", await sinDesborde(pr), "");
    return;
  }
  const papel = await (await pr.request.get(`${BASE}/mi/${I.u(I.A, "02A")}/recibo/papel`)).text();
  registrar(p, "02A · el recibo impreso dice que no debe nada y no trae «Datos para pagar»", /no debe nada; tiene \$ 50,00 a favor/.test(papel) && !/<h2>Datos para pagar/.test(papel), papel.match(/con los pagos confirmados después de este recibo: [^<]*/)?.[0] ?? "—");

  const t01D = await leer("01D");
  await shot(pr, "a1-01D-inquilino-mes");
  const bs = t01D.match(/Si paga hoy Bs ([\d.,]+) debe hoy \$ ([\d,]+)/);
  registrar(p, "01D, inquilino con «solo el recibo» (recibo $ 25, pagó $ 10): «Si paga hoy» por $ 15 y no ve el saldo", !!bs && bs[2] === "15,00" && /no muestra el saldo acumulado/.test(t01D),
    `«${t01D.match(/Si paga hoy.{0,60}/)?.[0] ?? "—"}»`);
  const r01D = await leer("01D", "reportar");
  registrar(p, "01D · Reportar un pago: monto exacto por $ 15,00", /Para pagar su deuda de \$ 15,00 transfiera/.test(r01D), r01D.match(/Para pagar su deuda de [^ ]+ [^ ]+/)?.[0] ?? "—");
}

/* ── Cortes y las listas (B3, B4) ── */
async function parteB(pa, I) {
  await pa.goto(`${BASE}/admin/${I.org}/${I.A}/cortes`, { waitUntil: "networkidle" });
  await pa.waitForTimeout(2000);
  const codigos = await pa.locator("tbody tr td:first-child").allInnerTexts();
  registrar("B3", "Cortes: unidades en orden natural", codigos.join(",") === "01A,01B,01D,02A,04A,05C,10A", codigos.join(", "));
  const ws = await pa.locator("tbody tr").first().locator("td").nth(3).evaluate((el) => getComputedStyle(el).whiteSpace);
  registrar("B3", "el monto no se parte en dos líneas", ws === "nowrap", `white-space: ${ws}`);
  const fila01B = pa.locator("tbody tr", { has: pa.locator("td:first-child", { hasText: /^01B$/ }) });
  const botones = (await fila01B.locator("a.btn").allInnerTexts()).map((t) => t.trim());
  registrar("B3", "los dos botones del propietario se distinguen", botones.includes("WhatsApp prop.") && botones.includes("Correo prop."), botones.join(" | "));
  const vaA = (await fila01B.locator("td").nth(4).innerText()).replace(/\s+/g, " ");
  registrar("B3", "antes de enviar, «Correo» dice a quiénes va, con el respaldo", /Va a: delivered\+r9-01b@resend\.dev delivered\+r9-01b-respaldo@resend\.dev \(respaldo\)/.test(vaA), `«${vaA}»`);
  await shot(pa, "b3-cortes");
  for (const [seccion, sel] of [["propietarios", "tbody tr td:first-child"]]) {
    await pa.goto(`${BASE}/admin/${I.org}/${I.A}/${seccion}`, { waitUntil: "networkidle" });
    const lista = (await pa.locator(sel).allInnerTexts()).map((t) => t.trim().split(/\s/)[0]).filter((t) => /^\d/.test(t));
    registrar("B3", `${seccion}: el mismo orden`, lista.join(",") === "01A,01B,01D,02A,04A,05C,10A", lista.join(", "));
  }
  await pa.goto(`${BASE}/admin/${I.org}/${I.A}/ajustes`, { waitUntil: "networkidle" });
  const opciones = await pa.locator("select", { has: pa.locator("option", { hasText: "Sin redondeo" }) }).locator("option").allInnerTexts();
  registrar("A2", "Ajustes: el redondeo tiene dos opciones", opciones.join("|") === "Sin redondeo|Redondear", opciones.join(" | "));

  // B4: reenviar dos veces; la segunda vez el aviso cambia de texto y la página sube.
  await pa.goto(`${BASE}/admin/${I.org}/${I.A}/cortes`, { waitUntil: "networkidle" });
  await pa.waitForTimeout(1500);
  const boton = fila01B.getByRole("button", { name: /Reenviar recibo/ });
  await boton.click();
  await pa.waitForTimeout(3500);
  const uno = (await textoDe(pa)).match(/Recibo de 01B reenviado[^.]*\./)?.[0] ?? "";
  await boton.scrollIntoViewIfNeeded();
  await pa.mouse.wheel(0, 600);
  await pa.waitForTimeout(400);
  await boton.click();
  await pa.waitForTimeout(2500);
  const aviso = pa.getByText("Ese recibo ya se reenvió hace un momento.");
  const caja = await aviso.boundingBox();
  const alto = pa.viewportSize().height;
  registrar("B4", "«Reenviar recibo» dos veces: el aviso nuevo aparece y la página sube hasta él", !!uno && !!caja && caja.y >= 0 && caja.y + caja.height <= alto, `primero «${uno}»; el segundo aviso en y=${caja ? Math.round(caja.y) : "?"} de ${alto}`);
  await shot(pa, "b4-reenviar");
}

/* ── A5 y B1: «Cargar datos», sin alícuota y las correcciones ── */
async function parteA5(pa, I) {
  const csv = path.join(CAPTURAS, "carga-r9.csv");
  writeFileSync(csv, "Código;Alícuota;Propietario;Correo;Teléfono\nZB-90;;ZZZ Sin Alicuota;delivered+r9-zb90@resend.dev;04140000090\nZB-91;1,5;ZZZ Con Alicuota;delivered+r9-zb91@resend.dev;04140000091\n", "utf8");
  await pa.goto(`${BASE}/admin/${I.org}/${I.B}/propietarios`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: /Cargar datos/ }).click();
  await pa.locator('input[type="file"]').first().setInputFiles(csv);
  await pa.locator("p", { hasText: "filas bien" }).first().waitFor({ timeout: 30000 });
  await pa.getByRole("button", { name: /ver más/ }).first().click().catch(() => {});
  let t = await textoDe(pa);
  registrar("A5", "la fila sin alícuota no se carga y el aviso lo dice; no se ofrece «estacionamiento con alícuota 0»",
    /no se cargan: no tiene alícuota/.test(t) && /Sin alícuota, esta fila no se carga/.test(t) && !/estacionamiento con alícuota 0/.test(t), `«${t.match(/Sin alícuota, esta fila no se carga[^.]*\./)?.[0] ?? "—"}»`);
  await shot(pa, "a5-sin-alicuota");
  // B1: corregir, volver a editar, deshacer.
  const campo = pa.locator("div", { hasText: /^Alícuota:/ }).locator("input").first();
  const entrada = pa.locator("input.control").filter({ hasNot: pa.locator("xpath=self::*[@type='file']") });
  const n = await entrada.count();
  let input = null;
  for (let i = 0; i < n; i++) if ((await entrada.nth(i).inputValue()) === "" && (await entrada.nth(i).locator("xpath=..").innerText()).includes("Alícuota")) input = entrada.nth(i);
  if (!input) input = campo;
  await input.fill("1,5");
  await input.locator("xpath=..").getByRole("button", { name: "Corregir" }).click();
  await pa.waitForTimeout(600);
  t = await textoDe(pa);
  const tarjeta = pa.locator("div.card, section, div").filter({ has: pa.locator("h3", { hasText: "Correcciones hechas" }) }).last();
  registrar("B1", "corregida, la fila se carga y la corrección queda en «Correcciones hechas»", /Correcciones hechas/.test(t) && !/Sin alícuota, esta fila no se carga/.test(t), `«${t.match(/Correcciones hechas.{0,160}/)?.[0] ?? "—"}»`);
  const enTarjeta = pa.locator("h3", { hasText: "Correcciones hechas" }).locator("xpath=..").locator("input").first();
  await enTarjeta.fill("2");
  await enTarjeta.locator("xpath=..").getByRole("button", { name: "Corregir" }).click();
  await pa.waitForTimeout(600);
  const valor = await pa.locator("h3", { hasText: "Correcciones hechas" }).locator("xpath=..").locator("input").first().inputValue();
  registrar("B1", "se puede volver a editar la corrección", valor === "2", `queda «${valor}»; «${(await textoDe(pa)).match(/En el archivo: [^ ]+/)?.[0] ?? "—"}»`);
  await shot(pa, "b1-correcciones");
  await pa.locator("h3", { hasText: "Correcciones hechas" }).locator("xpath=..").getByRole("button", { name: "Deshacer" }).first().click();
  await pa.waitForTimeout(600);
  t = await textoDe(pa);
  registrar("B1", "«Deshacer» vuelve al valor del archivo (la fila vuelve a no cargarse)", !/Correcciones hechas/.test(t) && /no tiene alícuota/.test(t), /no tiene alícuota/.test(t) ? "vuelve el aviso «no tiene alícuota»" : "—");
  void tarjeta;
}

/* ── A3: los avisos de Resend ── */
function firmar(secreto, id, ts, cuerpo) {
  return createHmac("sha256", Buffer.from(secreto.slice(6), "base64")).update(`${id}.${ts}.${cuerpo}`).digest("base64");
}
async function parteA3(pa, I) {
  const secreto = process.env.VALIDACION_WHSEC;
  if (!secreto) return registrar("A3", "falta VALIDACION_WHSEC", false, "");
  const envio = async (tipo, emailId, firmaFalsa = false) => {
    const cuerpo = JSON.stringify({ type: tipo, created_at: new Date().toISOString(), data: { email_id: emailId, to: ["x@resend.dev"] } });
    const id = "msg_" + randomUUID();
    const ts = String(Math.floor(Date.now() / 1000));
    const firma = firmaFalsa ? Buffer.from("no es la firma").toString("base64") : firmar(secreto, id, ts, cuerpo);
    const r = await fetch(`${BASE}/api/resend`, { method: "POST", headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${firma}` }, body: cuerpo });
    return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
  };
  const PID = process.env.VALIDACION_PROVEEDOR_ID;
  const falsa = await envio("email.delivered", PID, true);
  registrar("A3", "firma falsa → 401 y no se guarda nada", falsa.status === 401, `HTTP ${falsa.status}`);
  const ajeno = await envio("email.delivered", "re_" + randomUUID());
  registrar("A3", "un correo que no es de esta base → 200 y se ignora", ajeno.status === 200 && ajeno.cuerpo.resultado === "no es de esta base", `HTTP ${ajeno.status} «${ajeno.cuerpo.resultado}»`);
  const enviado = await envio("email.sent", PID);
  registrar("A3", "«email.sent» se ignora", enviado.cuerpo.resultado === "ignorado", `«${enviado.cuerpo.resultado}»`);
  for (const [tipo, esperado, badge] of [["email.delivered", "delivered", "Entregado"], ["email.opened", "opened", "Abierto"], ["email.delivered", "sin cambio", "Abierto"], ["email.bounced", "bounced", "Rebotó"]]) {
    const r = await envio(tipo, PID);
    await pa.goto(`${BASE}/admin/${I.org}/${I.A}/cortes`, { waitUntil: "networkidle" });
    await pa.waitForTimeout(1500);
    const col = (await pa.locator("tbody tr", { has: pa.locator("td:first-child", { hasText: /^01A$/ }) }).locator("td").nth(4).innerText()).replace(/\s+/g, " ");
    registrar("A3", `firmado «${tipo}» → «${esperado}»; Cortes dice «${badge}»`, r.status === 200 && r.cuerpo.resultado === esperado && col.includes(badge), `HTTP ${r.status} «${r.cuerpo.resultado}» · columna «${col}»`);
  }
  await shot(pa, "a3-cortes-rebote");
}

/* ── C3: el cupo que ve la administradora ── */
async function parteC3() {
  const sbA = await clienteDe(CREDS.admin);
  const sbO = await clienteDe(CREDS.operador);
  const { data: a } = await sbA.rpc("cupo_correo");
  const { data: o } = await sbO.rpc("cupo_correo");
  registrar("C3", "la administradora ve lo suyo y el cupo libre; el operador, todo", a.ultimo_aviso === null && a.usados <= o.usados && a.libre <= o.libre, `administradora: usados ${a.usados}, en cola ${a.en_cola}, libre ${a.libre} · operador: usados ${o.usados}, en cola ${o.en_cola}, libre ${o.libre}`);
}

/* ── D: permisos ── */
async function parteD(pr, I) {
  const sbA = await clienteDe(CREDS.admin);
  const sbR = await clienteDe(CREDS.residente);
  const sbO = await clienteDe(CREDS.operador);
  const anon = anonimo();
  // D1
  const c1 = await sbA.rpc("crear_organizacion", { p_nombre: "ZZZ R9 no debería existir", p_rif: null });
  registrar("D1", "una cuenta común no puede crear una administradora (llamando a la función)", !!c1.error && /Solo Vecitap crea administradoras/.test(c1.error.message), c1.error?.message ?? `creó ${c1.data}`);
  const ya = readFileSync(path.join(CAPTURAS, "org-del-operador.txt"), "utf8").trim?.() ?? "";
  const c2 = ya ? { data: ya, error: null } : await sbO.rpc("crear_organizacion", { p_nombre: "ZZZ R9 creada por el operador", p_rif: null });
  if (c2.data) writeFileSync(path.join(CAPTURAS, "org-del-operador.txt"), String(c2.data));
  registrar("D1", "el operador sí puede", !c2.error && !!c2.data, c2.error?.message ?? `id ${c2.data}${ya ? " (de la corrida anterior)" : ""}`);
  await pr.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const t = await textoDe(pr);
  registrar("D1", "por pantalla (residente sin administradora en /admin): mensaje, sin formulario", /Para usar Vecitap como administradora, hay que escribirle a Vecitap/.test(t) && !/Crear administradora/.test(t), `«${t.match(/Esta cuenta no administra[^.]*\.[^.]*\./)?.[0] ?? "—"}»`);
  await shot(pr, "d1-sin-administradora");
  // D2
  const u01A = I.u(I.A, "01A");
  const u01D = I.u(I.A, "01D");
  const sa = await anon.rpc("saldo_unidad", { p_unidad: u01A });
  registrar("D2", "anon no puede ejecutar saldo_unidad", !!sa.error, sa.error?.message ?? "respondió");
  const sr = await sbR.rpc("saldo_unidad", { p_unidad: u01A });
  registrar("D2", "el propietario ve el saldo de su unidad", !sr.error, sr.error?.message ?? `total ${dinero(sr.data?.[0]?.total)}`);
  const si = await sbR.rpc("saldo_unidad", { p_unidad: u01D });
  registrar("D2", "el inquilino con «solo el recibo del mes» no ve el saldo acumulado", !!si.error && /Sin acceso/.test(si.error.message), si.error?.message ?? "lo vio");
  const sad = await sbA.rpc("saldo_unidad", { p_unidad: u01D });
  registrar("D2", "su administración sí", !sad.error, sad.error?.message ?? `total ${dinero(sad.data?.[0]?.total)}`);
  // 02A del Edificio Gustavo: una organización que admin.prueba no administra.
  const saj = await sbA.rpc("saldo_unidad", { p_unidad: "fc752d48-aaf7-4f57-8423-1073006beffa" });
  registrar("D2", "una administradora no ve una unidad de otra organización", !!saj.error, saj.error?.message ?? "la vio");
  const so = await sbO.rpc("saldo_unidad", { p_unidad: u01A });
  registrar("D2", "el operador sí", !so.error, so.error?.message ?? `total ${dinero(so.data?.[0]?.total)}`);
  const { data: vista, error: ev } = await sbA.from("saldos_actuales").select("codigo").eq("org_id", I.org);
  registrar("D2", "saldos_actuales (Inicio, Propietarios) sigue igual para la administradora", !ev && vista.length === 11, ev?.message ?? `${vista.length} unidades`);
  const { data: mu } = await sbR.rpc("mis_unidades");
  const d01D = (mu ?? []).find((x) => x.unidad_id === u01D);
  registrar("D2", "mis_unidades() del residente igual (01D sin saldo, 01A con saldo)", d01D && d01D.saldo === null && (mu ?? []).some((x) => x.unidad_id === u01A && x.saldo !== null), `01D saldo ${d01D?.saldo}`);
  // D4
  const { data: aa } = await sbA.rpc("administra_algo");
  registrar("D4", "administra_algo() con membresías activas: true", aa === true, String(aa));
  // D6 (admin.prueba es `administrador`, no dueña): «Dar de baja» en Accesos.
  const { data: memAdmin } = await sbA.from("membresias").select("id").eq("org_id", I.org).eq("rol", "administrador").single();
  const d6a = await sbA.rpc("dar_de_baja_acceso", { p_membresia: memAdmin.id });
  registrar("D6", "no da de baja a un administrador", !!d6a.error && /solo se da de baja el acceso de un propietario o un inquilino/.test(d6a.error.message), d6a.error?.message ?? "lo hizo");
  // Un acceso de residente de «Administradora Prueba Gustavo» (no se toca: tiene que fallar).
  const d6b = await sbA.rpc("dar_de_baja_acceso", { p_membresia: "56945c36-6f0f-4b9f-808a-f4cd6c5c73ed" });
  registrar("D6", "no da de baja un acceso de otra organización", !!d6b.error && /Sin permiso/.test(d6b.error.message), d6b.error?.message ?? "lo hizo");
  // D7
  const r7 = await sbO.rpc("correr_tasa_ahora");
  const r7b = await sbA.rpc("correr_tasa_ahora");
  registrar("D7", "«Traer ahora» del operador corre sin «DELETE requires a WHERE clause»", !r7.error && !JSON.stringify(r7.data).includes("WHERE"), JSON.stringify(r7.data ?? r7.error?.message));
  registrar("D7", "una administradora no puede", !!r7b.error, r7b.error?.message ?? "pudo");
  return c2.data;
}

/* ── D6 por pantalla (al final: le quita el acceso al residente en 01D) ── */
async function parteU(pa, I) {
  const sbA = await clienteDe(CREDS.admin);
  await pa.goto(`${BASE}/admin/${I.org}/${I.A}/accesos`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Quién tiene acceso" }).click();
  await pa.waitForTimeout(1500);
  const fila = pa.locator("tbody tr", { has: pa.locator("td", { hasText: /^01D$/ }) }).first();
  await fila.getByRole("button", { name: "Dar de baja" }).click();
  await pa.waitForTimeout(2000);
  const t = await textoDe(pa);
  const { data: m } = await sbA.from("membresias").select("activo").eq("unidad_id", I.u(I.A, "01D")).single();
  registrar("D6", "una `administrador` da de baja un acceso de residente desde Accesos", /Esa persona ya no entra a la unidad/.test(t) && m.activo === false, `aviso: ${/Esa persona ya no entra/.test(t) ? "sí" : "no"} · activo ${m.activo}`);
  await shot(pa, "d6-accesos");
}

/* ── Pendientes de las rondas 7 y 8: datos para pagar en el correo, solo dólares, conciliar ── */
async function parteP(pa, I, pr) {
  const sbA = await clienteDe(CREDS.admin);
  const { data: rec } = await sbA.from("recibos").select("id").eq("unidad_id", I.u(I.A, "01B")).single();
  const { data: correo } = await sbA.rpc("correo_recibo", { p_recibo: rec.id });
  const html = (correo ?? [])[0]?.html ?? "";
  registrar("R7", "el correo del recibo trae los datos para pagar (sin Bs)", /Datos para pagar/i.test(html) && /0102-0000-00-0000000009/.test(html) && !/Bs [0-9]/.test(html), `${(correo ?? []).length} correos; cuenta ${/0102-0000-00-0000000009/.test(html) ? "sí" : "no"}`);
  // Solo dólares + recibo sin bolívares.
  await sbA.from("ajustes_cobro").update({ solo_usd: true }).eq("org_id", I.org);
  await pr.goto(`${BASE}/mi/${I.u(I.A, "01D")}/recibo`, { waitUntil: "networkidle" });
  const t = await textoDe(pr);
  const papel = await (await pr.request.get(`${BASE}/mi/${I.u(I.A, "01D")}/recibo/papel`)).text();
  const { data: c2 } = await sbA.rpc("correo_recibo", { p_recibo: rec.id });
  registrar("R7", "«Cobrar solo en dólares»: portal, papel y correo sin bolívares; «Debe hoy $ 15,00»", !/Bs /.test(t) && /Debe hoy \$ 15,00/.test(t) && !/Bs [0-9]/.test(papel) && !/bolívares/.test(papel) && !(c2 ?? []).some((c) => /bolívares/.test(c.html)),
    `portal ${/Bs /.test(t) ? "con Bs" : "sin Bs"} · «${t.match(/Debe hoy \$ [\d,]+/)?.[0] ?? "—"}» · papel ${/bolívares/.test(papel) ? "menciona bolívares" : "sin bolívares"}`);
  await shot(pr, "r7-solo-usd");
  await sbA.from("ajustes_cobro").update({ solo_usd: false }).eq("org_id", I.org);

  // Conciliar: un pago suelto («Conciliar 1 pago») y uno agrupado.
  const sbR = await clienteDe(CREDS.residente);
  const hoy = new Date().toISOString().slice(0, 10);
  const { count } = await sbA.from("pagos").select("id", { count: "exact", head: true }).eq("org_id", I.org).in("referencia", ["99990001", "99990002"]);
  if (!count) {
    const base = { org_id: I.org, fecha: hoy, moneda: "USD", metodo: "Zelle", destino: "condominio", estado: "reportado" };
    const g = randomUUID();
    const e1 = await sbR.from("pagos").insert([{ ...base, unidad_id: I.u(I.A, "01A"), monto: 5, referencia: "99990001", grupo_id: g }, { ...base, unidad_id: I.u(I.A, "02A"), monto: 7, referencia: "99990001", grupo_id: g }]);
    const e2 = await sbR.from("pagos").insert([{ ...base, unidad_id: I.u(I.A, "02A"), monto: 3, referencia: "99990002" }]);
    if (e1.error || e2.error) throw e1.error ?? e2.error;
  }
  const extracto = (filas) => {
    const f = path.join(CAPTURAS, `extracto-${filas.length}.csv`);
    writeFileSync(f, "Fecha;Referencia;Descripción;Monto\n" + filas.map(([r, m]) => `${hoy};${r};Transferencia;${m}`).join("\n") + "\n", "utf8");
    return f;
  };
  await pa.goto(`${BASE}/admin/${I.org}/${I.A}/pagos`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Conciliar con el banco" }).click().catch(() => {});
  const archivo1 = extracto([["99990002", "3,00"]]);
  const input = pa.locator('input[type="file"][accept=".xlsx,.xls,.csv,.pdf"]');
  await input.setInputFiles(archivo1);
  await pa.waitForTimeout(1500);
  const b1 = pa.getByRole("button", { name: "Conciliar 1 pago" });
  registrar("R8", "un extracto con un pago: el botón dice «Conciliar 1 pago»", (await b1.count()) > 0, (await b1.count()) ? "sí" : (await textoDe(pa)).match(/Conciliar \d+ pagos?/)?.[0] ?? "no aparece");
  await input.setInputFiles(archivo1);
  await pa.waitForTimeout(1500);
  registrar("R8", "volver a elegir el mismo archivo lo lee otra vez", (await b1.count()) > 0, (await b1.count()) ? "se ve otra vez «Conciliar 1 pago»" : "no");
  await b1.click();
  await pa.getByRole("button", { name: /^Sí/ }).click({ timeout: 3000 }).catch(() => {});
  await pa.waitForTimeout(2500);
  const { data: p2 } = await sbA.from("pagos").select("estado").eq("org_id", I.org).eq("referencia", "99990002").single();
  registrar("R8", "«Conciliar 1 pago» lo concilia", p2.estado === "conciliado", p2.estado);
  await input.setInputFiles(extracto([["99990001", "12,00"]]));
  await pa.waitForTimeout(1500);
  await pa.getByRole("button", { name: /Conciliar 1 pago|Conciliar \d+ pagos/ }).click();
  await pa.getByRole("button", { name: /^Sí/ }).click({ timeout: 3000 }).catch(() => {});
  await pa.waitForTimeout(2500);
  const { data: pg } = await sbA.from("pagos").select("estado,monto").eq("org_id", I.org).eq("referencia", "99990001");
  registrar("R7", "un pago agrupado ($ 5 + $ 7 en una transferencia de $ 12) se concilia entero", pg.length === 2 && pg.every((x) => x.estado === "conciliado"), pg.map((x) => `${x.monto} ${x.estado}`).join(" · "));
  await shot(pa, "r7-conciliar");
  // Cargar saldos: el mismo archivo dos veces.
  const saldos = path.join(CAPTURAS, "saldos-r9.csv");
  writeFileSync(saldos, "Unidad;Saldo\n01A;1,00\n", "utf8");
  await pa.goto(`${BASE}/admin/${I.org}/${I.B}/propietarios`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: /Cargar saldos/ }).click().catch(() => {});
  const inS = pa.locator('input[type="file"]').first();
  await inS.setInputFiles(saldos);
  await pa.waitForTimeout(1200);
  const una = /01A/.test(await textoDe(pa));
  await pa.getByRole("button", { name: /Cancelar|Descartar|Otro archivo/ }).first().click().catch(() => {});
  await inS.setInputFiles(saldos);
  await pa.waitForTimeout(1200);
  registrar("R8", "Cargar saldos: volver a elegir el mismo archivo lo lee otra vez", una && /01A/.test(await textoDe(pa)), una ? "la previa vuelve a aparecer" : "no se leyó la primera vez");
  await shot(pa, "r8-cargar-saldos");
}

/* ── Programa ── */
const partes = process.argv.slice(2);
const quiere = (p) => partes.length === 0 || partes.includes(p);
const browser = await chromium.launch();
try {
  const I = await ids(await clienteDe(CREDS.admin));
  console.log("Org:", I.org, "Torre A:", I.A, "Torre B:", I.B);
  const nueva = async (cred, viewport = { width: 1280, height: 900 }, extra = {}) => {
    const ctx = await browser.newContext({ viewport, ...extra, acceptDownloads: true });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await login(page, cred);
    return { page, errores, cerrar: () => ctx.close() };
  };
  const correr = async (p, cred, fn, viewport, extra) => {
    if (!quiere(p)) return;
    const { page, errores, cerrar } = await nueva(cred, viewport, extra);
    try {
      await fn(page);
    } catch (e) {
      registrar(p, "la parte se cortó", false, String(e?.message ?? JSON.stringify(e)).split("\n").slice(0, 4).join(" "));
      await shot(page, `${p}-error`).catch(() => {});
    }
    registrar(p, "sin errores de JavaScript en la página", errores.length === 0, errores.join(" | ") || "ninguno");
    await cerrar();
  };
  await correr("A2", CREDS.admin, (pg) => parteA2(pg, I));
  await correr("A1", CREDS.admin, (pg) => parteA1(pg, I));
  await correr("R", CREDS.residente, (pg) => parteR(pg, I, false));
  await correr("movil", CREDS.residente, (pg) => parteR(pg, I, true), { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await correr("B", CREDS.admin, (pg) => parteB(pg, I));
  await correr("A5", CREDS.admin, (pg) => parteA5(pg, I));
  await correr("A3", CREDS.admin, (pg) => parteA3(pg, I));
  await correr("C3", CREDS.admin, () => parteC3());
  if (quiere("P")) {
    const r = await nueva(CREDS.residente);
    await correr("P", CREDS.admin, (pg) => parteP(pg, I, r.page));
    await r.cerrar();
  }
  await correr("D", CREDS.residente, async (pg) => {
    const creada = await parteD(pg, I);
    if (creada) writeFileSync(path.join(CAPTURAS, "org-del-operador.txt"), String(creada));
  });
  await correr("U", CREDS.admin, (pg) => parteU(pg, I));
} catch (e) {
  console.error("ERROR:", e);
} finally {
  await browser.close();
  writeFileSync(path.join(CAPTURAS, "resultados.json"), JSON.stringify(resultados, null, 2));
}
