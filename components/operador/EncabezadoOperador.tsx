"use client";

import { useRouter } from "next/navigation";
import { Button, Logo, ThemeToggle } from "@/components/ui";

/** Portado del <header> de App() en operador.html:332-350, sin el
 * selector de tema local (ya lo resuelve ThemeProvider desde la Fase 2)
 * ni el signOut a mano (el botón Salir postea a /api/auth/salir, igual
 * que en EncabezadoResidente). "Actualizar" vuelve a pedir los datos al
 * servidor en vez de repetir la carga a mano del original. */
export function EncabezadoOperador({ correo }: { correo: string }) {
  const router = useRouter();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 24,
      }}
    >
      <div>
        <Logo alto={22} />
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".14em",
            color: "var(--acento)",
            margin: "8px 0 3px",
          }}
        >
          Consola del operador
        </div>
        <h1 style={{ fontSize: 23, fontWeight: 700, margin: 0, fontFamily: "var(--font-titulos)" }}>Cartera</h1>
        <p style={{ fontSize: 12, color: "var(--tenue)", margin: "3px 0 0" }}>
          {correo} · esta pantalla no la ve ningún cliente
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <ThemeToggle />
        <Button type="button" variante="secundario" mini onClick={() => router.refresh()}>
          Actualizar
        </Button>
        <form action="/api/auth/salir" method="post">
          <Button type="submit" variante="secundario" mini>
            Salir
          </Button>
        </form>
      </div>
    </header>
  );
}
