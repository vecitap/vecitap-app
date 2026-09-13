import type { ReactNode } from "react";

type Props = {
  etiqueta: string;
  obligatorio?: boolean;
  error?: string;
  children: ReactNode;
};

/** Envuelve un control (Input/Select/Textarea) con su etiqueta y su error. */
export function Campo({ etiqueta, obligatorio = false, error, children }: Props) {
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
      {error && <p className="campo-error">{error}</p>}
    </div>
  );
}
