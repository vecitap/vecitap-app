import { VistaPrevia } from "@/components/sin-conexion/VistaPrevia";

/**
 * Elegida junto con `pagos/` — ver el comentario de ese archivo. Acá el
 * viaje extra es `tasaDelDia(supabase)`, después del `Promise.all` de
 * `organizaciones`/`edificios`/`unidades`/`periodos` (`cortes/page.tsx:47`).
 *
 * A diferencia de `pagos/`, esta seriedad **no** es una dependencia de
 * datos: `tasaDelDia` no usa nada de lo que trae el `Promise.all` de
 * arriba, así que técnicamente podría entrar en la misma tanda. No se tocó
 * ahora — no estaba en el alcance aprobado de esta sesión (`[orgId]/layout`,
 * `[edificioId]/layout`, `recibo/page`) — pero queda anotado acá como el
 * candidato más claro para la próxima ronda de paralelización.
 *
 * Cambio 3, parte E («primero la copia»): si este equipo tiene la copia del
 * edificio, en vez del «Cargando…» se ve la copia al instante, inerte y con
 * «Actualizando…», hasta que llega la página fresca (VistaPrevia).
 */
export default function CargandoCortes() {
  return <VistaPrevia />;
}
