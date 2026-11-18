/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

/**
 * Service worker de EMERGENCIA (cambio 3, plan 5.1): se desinstala solo.
 *
 * Si el service worker de Administración (app/sw.ts) llegara a romper algo
 * en producción, un service worker ya instalado se queda en cada navegador
 * aunque se arregle el código. Para sacarlo:
 *
 *   1. En Vercel, variable de entorno `SIN_CONEXION_APAGAR=1` (Production).
 *   2. Volver a desplegar.
 *
 * Con esa variable, /serwist/sw.js pasa a ser este archivo
 * (app/serwist/[path]/route.ts). Cada navegador lo baja en su próxima visita
 * (el archivo va sin caché), lo instala, borra los cachés del modo sin
 * conexión, se da de baja y recarga las pestañas de /admin, que vuelven a
 * funcionar como antes del cambio 3. La copia de datos (IndexedDB) no la
 * toca: se borra al salir, como siempre.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Serwist exige el punto donde inyectar la lista de archivos; acá no se usa.
void self.__SW_MANIFEST;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.map((n) => caches.delete(n)));
      await self.registration.unregister();
      const ventanas = await self.clients.matchAll({ type: "window" });
      await Promise.all(ventanas.map((v) => v.navigate(v.url).catch(() => undefined)));
    })()
  );
});
