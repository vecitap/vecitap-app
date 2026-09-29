import { Cargando } from "@/components/ui";

/**
 * Frontera de carga de la unidad: cubre `[unidadId]/layout.tsx` (el gate de
 * `mis_unidades()` que también arma el encabezado, la tarjeta de saldo y
 * las pestañas) y la pestaña que se esté pidiendo.
 *
 * A diferencia de Admin, acá no hay un layout "de chrome" por encima que
 * quede montado — la banda oscura y la tarjeta de saldo son parte de lo que
 * está cargando, porque dependen de qué unidad es. Por eso esta frontera
 * cubre pantalla completa la primera vez que se entra a `/mi/<unidad>` o al
 * cambiar de unidad con el selector; cambiar de pestaña dentro de la misma
 * unidad no vuelve a montar el layout, así que no dispara este estado.
 */
export default function CargandoUnidad() {
  return <Cargando />;
}
