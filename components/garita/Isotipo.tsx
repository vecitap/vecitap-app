/**
 * El isotipo solo (sin la palabra), como en el <header> de
 * garita.html:179-186. No usa `Logo` porque ese trae el logotipo completo
 * y acá el alto disponible es de 21 px: la marca está presente sin
 * robarle espacio al contenido.
 *
 * Va en línea y no como archivo: `currentColor` lo hace seguir al tema sin
 * dos imágenes, y la única parte fija es el acento naranja de la marca.
 */
export function Isotipo() {
  return (
    <svg className="garita-iso" viewBox="165 285 693 477" aria-hidden="true" focusable="false">
      <path
        d="M 197.9,304 L 279.3,304 L 390.2,523.9 L 355.8,578.3 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="38"
        strokeLinejoin="round"
      />
      <path
        d="M 612.8,304 L 825.6,304 L 772.6,399 L 647.5,399 L 450.5,727.6 L 400.7,659 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="38"
        strokeLinejoin="round"
      />
      <path
        d="M 385.7,304 L 511,304 L 441.8,416.8 Z"
        fill="var(--acento)"
        stroke="var(--acento)"
        strokeWidth="38"
        strokeLinejoin="round"
      />
    </svg>
  );
}
