import { Button, Logo, ThemeToggle } from "@/components/ui";

/** Portado del <header> de App() en residente.html:245-261. El botón de
 * salir es un <form> que postea a /api/auth/salir (ya existe desde la
 * Fase 3) — funciona sin JavaScript en el cliente. */
export function EncabezadoResidente({ correo }: { correo: string }) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <Logo alto={22} />
        <h1 style={{ fontSize: 21, margin: "6px 0 0", fontWeight: 700, fontFamily: "var(--font-titulos)" }}>
          Mi condominio
        </h1>
        <div style={{ fontSize: 12.5, color: "var(--tenue)", marginTop: 3 }}>{correo}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <ThemeToggle />
        <form action="/api/auth/salir" method="post">
          <Button type="submit" variante="secundario" mini>
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
