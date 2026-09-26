/** Portado de Kpi() en operador.html:173-182. */
export function Kpi({
  etiqueta,
  valor,
  pie,
  destaque,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  destaque?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        background: destaque ? "var(--acento-suave)" : "var(--lienzo)",
        border: `1px solid ${destaque ? "var(--acento)" : "var(--linea)"}`,
        borderRadius: "var(--radio)",
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)", marginBottom: 8 }}>
        {etiqueta}
      </div>
      <div className="mono" style={{ fontSize: 25, fontWeight: 700, color: destaque ? "var(--acento)" : "var(--tinta)" }}>
        {valor}
      </div>
      {pie && <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>{pie}</div>}
    </div>
  );
}
