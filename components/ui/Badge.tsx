import type { ReactNode } from "react";

export type TonoBadge = "verde" | "ambar" | "rojo" | "azul" | "tenue" | "neutro" | "marca";

export function Badge({ tono, children }: { tono: TonoBadge; children: ReactNode }) {
  return <span className={`badge badge-${tono}`}>{children}</span>;
}
