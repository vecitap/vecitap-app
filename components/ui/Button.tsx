import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario";
  mini?: boolean;
  /**
   * La acción del botón está en curso (bloque E, 08-oct): el botón queda
   * desactivado, muestra un indicador girando en lugar del texto y lo
   * anuncia a los lectores de pantalla (`aria-busy`). El texto sigue en el
   * botón, invisible, así el ancho no cambia y nada de la fila "salta".
   *
   * Es la única forma de marcar "enviando" en la app: no se escribe
   * `disabled={ocupado}` a mano. `disabled` queda para "no se puede"
   * (faltan datos, no hay nada que cargar), que se ve distinto.
   */
  cargando?: boolean;
};

export function Button({ variante = "primario", mini = false, cargando = false, className = "", disabled, children, ...props }: Props) {
  const clases = [
    "btn",
    variante === "secundario" && "btn-secundario",
    mini && "btn-mini",
    cargando && "btn-cargando",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={clases} disabled={disabled || cargando} aria-busy={cargando || undefined} {...props}>
      <span className="btn-texto">{children}</span>
      {cargando && <span className="btn-giro" aria-hidden="true" />}
    </button>
  );
}
