import { Cargando } from "@/components/ui";

/**
 * Frontera de carga para todo el edificio: cubre el gate de
 * `[edificioId]/layout.tsx` (`edificios_visibles()` + la comprobación del
 * edificio) y la sección que se esté pidiendo, mientras sus datos llegan.
 *
 * El lateral y el encabezado (`MarcoAdmin`, montado en `[orgId]/layout.tsx`,
 * un segmento más arriba) **no** se remontan: siguen visibles, con la tasa
 * ya cargada, y solo el área de contenido (`.admin-relleno`) muestra este
 * estado — ese padding ya lo da `.admin-relleno`, no hace falta repetirlo
 * acá. Es también lo que habilita el prefetch parcial de `<Link>` en rutas
 * dinámicas (ver docs/estado-migracion.md, "Lentitud de la interfaz").
 */
export default function CargandoEdificio() {
  return <Cargando />;
}
