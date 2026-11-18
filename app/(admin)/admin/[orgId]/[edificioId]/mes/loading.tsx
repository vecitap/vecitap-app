import { VistaPrevia } from "@/components/sin-conexion/VistaPrevia";

/**
 * Cambio 3, parte E («primero la copia», docs/plan-sin-conexion.md sección
 * 7): mientras el servidor arma Gastos del mes, se muestra la copia de este equipo
 * al instante, inerte y con «Actualizando…». Sin copia, el «Cargando…» de
 * siempre.
 */
export default function Cargando() {
  return <VistaPrevia />;
}
