"use client";

import { Logo } from "@/components/ui";
import { useTema } from "@/lib/theme/ThemeProvider";

/**
 * Portado del <header> de App() en index.html:307-333 — banda de marca
 * oscura, a propósito **en los dos temas** (mismos tokens `--lat-*` que ya
 * trae Admin en app/globals.css: index.html usa los suyos propios,
 * `banda*`, con los mismos valores — ver `docs/inventario-main.md`
 * sección 2). El logotipo va siempre en su versión crema porque la banda
 * nunca se aclara. Sin íconos a propósito: index.html no usa lucide en
 * ninguna parte (caso 13 es una brecha solo de Admin, ver
 * docs/inventario-main.md sección 6), así que estos dos botones se
 * quedan como texto, igual que main.
 *
 * El botón de tema es un Client Component (`useTema`) — igual que
 * `ThemeToggle`, pero con los colores propios de la banda oscura, que no
 * puede usar `btn-secundario` del tema claro sin quedar invisible. El
 * botón de salir sigue siendo un <form> que postea a /api/auth/salir:
 * funciona sin JavaScript en el cliente.
 */
export function EncabezadoResidente({ correo }: { correo: string }) {
  const { tema, ponerTema } = useTema();

  const botonBanda = {
    padding: "8px 11px",
    fontSize: 13,
    borderRadius: 9,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 600,
    background: "rgba(255,255,255,.07)",
    color: "var(--lat-texto-on)",
    border: "1px solid var(--lat-linea)",
  } as const;

  return (
    <header
      style={{
        background: "var(--lat-fondo)",
        color: "var(--lat-texto)",
        borderBottom: "1px solid var(--lat-linea)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          maxWidth: 640,
          margin: "0 auto",
          padding: "16px 16px 18px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* La banda es oscura siempre, así que el logotipo va siempre
              en su versión crema. */}
          <div style={{ marginBottom: 6 }}>
            <Logo alto={22} forzarTema="oscuro" />
          </div>
          <h1 style={{ fontSize: 21, margin: "6px 0 0", fontWeight: 700, fontFamily: "var(--font-titulos)", color: "var(--lat-texto-on)" }}>
            Mi condominio
          </h1>
          <div style={{ fontSize: 12.5, color: "var(--lat-texto)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {correo}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button type="button" style={botonBanda} title="Cambiar entre claro y oscuro" onClick={() => ponerTema(tema === "oscuro" ? "claro" : "oscuro")}>
            {tema === "oscuro" ? "Claro" : "Oscuro"}
          </button>
          <form action="/api/auth/salir" method="post">
            <button type="submit" style={botonBanda}>
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
