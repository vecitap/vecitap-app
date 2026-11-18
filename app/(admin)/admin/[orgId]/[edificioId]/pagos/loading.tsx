import { VistaPrevia } from "@/components/sin-conexion/VistaPrevia";

/**
 * Elegida junto con `cortes/` como las dos secciones de Admin con una
 * frontera propia, además de la del edificio (`[edificioId]/loading.tsx`):
 * son las dos únicas que hacen un viaje de red **extra**, en serie, más
 * allá de la única tanda paralela que ya usa el resto de las secciones (ver
 * docs/estado-migracion.md, "Lentitud de la interfaz").
 *
 * Acá el extra es real y no un descuido: `pagos`/`comprobantes` se filtran
 * por `.in("unidad_id", ids)`, y `ids` sale de traer `unidades` primero —
 * es una dependencia de datos genuina, no algo que se pueda meter sin más
 * en el mismo `Promise.all`.
 *
 * Cambio 3, parte E («primero la copia»): si este equipo tiene la copia del
 * edificio, en vez del «Cargando…» se ve la copia al instante, inerte y con
 * «Actualizando…», hasta que llega la página fresca (VistaPrevia).
 */
export default function CargandoPagos() {
  return <VistaPrevia />;
}
