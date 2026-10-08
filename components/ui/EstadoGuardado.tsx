import type { EstadoAccion } from "@/hooks/useAccion";

/**
 * "Guardado ✓" o el error, al lado del botón que guardó (bloque E, 08-oct).
 * Ver `useAccion`.
 *
 * El contenedor está siempre montado con `role="status"`: los lectores de
 * pantalla anuncian los cambios de una región viva que ya existía, no los de
 * una que aparece de golpe.
 */
export function EstadoGuardado({
  estado,
  error,
  texto = "Guardado",
}: {
  estado: EstadoAccion;
  error?: string | null;
  texto?: string;
}) {
  return (
    <span role="status" aria-live="polite" className="estado-guardado">
      {estado === "guardado" && <span className="estado-guardado-ok">{texto} ✓</span>}
      {estado === "error" && error && <span className="estado-guardado-error">{error}</span>}
    </span>
  );
}
