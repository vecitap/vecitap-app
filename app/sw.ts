/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

/**
 * Service worker de Administración (cambio 3, docs/plan-sin-conexion.md,
 * 1.1 b). Lo arma Serwist en el build (app/serwist/[path]/route.ts) y se
 * registra con alcance `/admin/`: no toca la portada, /mi, /garita ni
 * /operador.
 *
 * Hace tres cosas, nada más:
 * 1. Guarda la cáscara (/admin/sin-internet) y los archivos JS/CSS/fuentes
 *    del build (precache). **Ningún dato de condominio** va a este caché.
 * 2. Las páginas de /admin/* van siempre a la red primero. Nunca se guarda
 *    el HTML de una página de Administración: lleva datos personales y es
 *    por sesión.
 * 3. Si la red falla, o tarda más de ESPERA_MAXIMA_MS (internet muy lento,
 *    plan sección 6), redirige a la cáscara con la dirección pedida en
 *    `?ir=`, y la cáscara muestra la copia local.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Repetidas de lib/local/config.ts a propósito: el service worker se arma
// aparte con esbuild y conviene que no arrastre nada de la app.
const RUTA_CASCARA = "/admin/sin-internet";
// Parte D: la garita tiene su propia pantalla sin internet. El mismo service
// worker se registra también con alcance /garita/.
const RUTA_CASCARA_GARITA = "/garita/sin-internet";
const cascaraDe = (ruta: string) => (ruta.startsWith("/garita") ? RUTA_CASCARA_GARITA : RUTA_CASCARA);
const ESPERA_MAXIMA_MS = 8000;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  disableDevLogs: true,
});

async function servirCascara(request: Request): Promise<Response> {
  // La cáscara no tiene datos: se sirve primero la guardada (instantánea).
  const guardada = await serwist.matchPrecache(cascaraDe(new URL(request.url).pathname));
  if (guardada) return guardada;
  return fetch(request);
}

async function redOCascara(request: Request, url: URL): Promise<Response> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
  try {
    // `request` es una navegación: si el servidor redirige (por ejemplo a
    // /entrar), la respuesta llega como redirección opaca y el navegador la
    // sigue igual que sin service worker.
    return await fetch(request, { signal: control.signal });
  } catch {
    const motivo = control.signal.aborted ? "lenta" : "sin-red";
    const destino = new URL(cascaraDe(url.pathname), url.origin);
    destino.searchParams.set("ir", url.pathname + url.search);
    destino.searchParams.set("motivo", motivo);
    return Response.redirect(destino.toString(), 302);
  } finally {
    clearTimeout(reloj);
  }
}

// Va antes que los de Serwist: el primero que llama a respondWith gana.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !(url.pathname.startsWith("/admin") || url.pathname.startsWith("/garita"))) return;
  if (url.pathname === RUTA_CASCARA || url.pathname === RUTA_CASCARA_GARITA) {
    event.respondWith(servirCascara(request));
    return;
  }
  event.respondWith(redOCascara(request, url));
});

serwist.addEventListeners();
