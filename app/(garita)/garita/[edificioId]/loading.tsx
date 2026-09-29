import { Cargando } from "@/components/ui";

/**
 * Frontera de carga de la garita: cubre `[edificioId]/layout.tsx` (el gate
 * con `garita_edificios()` y la carga del directorio con `garita_directorio()`,
 * que también arman el encabezado y el `<nav>` de las cuatro vistas) y la
 * vista que se esté pidiendo.
 *
 * Igual que en Residente, acá no hay chrome por encima que se sostenga solo:
 * el nombre del edificio y el directorio dependen de a qué garita se entra,
 * así que esta frontera es de pantalla completa (dentro del grupo `garita`,
 * que ya le da el tamaño de letra propio del módulo vía `app/(garita)/garita.css`).
 * Cambiar de vista dentro de la misma garita no remonta el layout, así que
 * no dispara este estado; cambiar de garita con el selector, sí.
 */
export default function CargandoGarita() {
  return <Cargando />;
}
