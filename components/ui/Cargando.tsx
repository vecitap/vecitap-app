/** Portado de Cargando() en app.html:608-618. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div style={{ padding: 28, textAlign: "center", color: "var(--tenue)", fontSize: 13.5 }}>{texto}</div>
  );
}
