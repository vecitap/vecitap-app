import { Button, Logo, ThemeToggle } from "@/components/ui";
import type { OrganizacionAdmin } from "@/lib/admin/tipos";

/**
 * Portado del <header> de App() en app.html:1204-1236 (logo de Vecitap +
 * nombre de la organización + correo + salir). El logo propio de la
 * organización (`organizacion.logo_url`, Ajustes/LogoOrg) es Sesión 2 —
 * acá solo se muestra el nombre.
 */
export function EncabezadoAdmin({
  organizacion,
  correo,
}: {
  organizacion: Pick<OrganizacionAdmin, "nombre" | "rif">;
  correo: string;
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 20,
      }}
    >
      <div>
        <Logo alto={22} />
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: "8px 0 0", fontFamily: "var(--font-titulos)" }}>
          {organizacion.nombre}
        </h1>
        <p style={{ fontSize: 12, color: "var(--tenue)", margin: "3px 0 0" }}>{correo}</p>
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
