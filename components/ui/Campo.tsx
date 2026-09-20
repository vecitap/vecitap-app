import type { ReactNode } from "react";

type Props = {
  etiqueta: string;
  obligatorio?: boolean;
  ayuda?: string;
  error?: string;
  children: ReactNode;
};

/** Envuelve un control (Input/Select/Textarea) con su etiqueta, su ayuda y su error. */
export function Campo({ etiqueta, obligatorio = false, ayuda, error, children }: Props) {
  return (
    <div className="campo">
      <label className="campo-etiqueta">
        {etiqueta}
        {obligatorio && (
          <span className="campo-obligatorio" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {ayuda && !error && <p className="campo-ayuda">{ayuda}</p>}
      {error && <p className="campo-error">{error}</p>}
    </div>
  );
}
