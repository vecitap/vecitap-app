import type { ReactNode } from "react";

/** Tabla con scroll horizontal en pantallas angostas, como en operador.html. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="tabla-scroll">
      <table className="tabla">{children}</table>
    </div>
  );
}
