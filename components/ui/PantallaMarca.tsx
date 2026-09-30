import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/**
 * El marco de las pantallas de entrada (/entrar, "Falta un paso"):
 * fondo oscuro de marca, el logotipo arriba y la tarjeta al centro.
 *
 * Es el mismo fondo del sitio de venta (public/inicio.html), así el paso
 * de vecitap.com → "Iniciar sesión" se siente como el mismo producto. Los
 * colores salen de los tokens `--marca-*` de app/globals.css; el logotipo,
 * de components/ui/Logo.tsx. Nada de valores sueltos acá.
 */
export function PantallaMarca({
  children,
  volverAlSitio = false,
}: {
  children: ReactNode;
  /** Muestra "← Volver a vecitap.com" debajo de la tarjeta. */
  volverAlSitio?: boolean;
}) {
  return (
    <main
      style={{
        flex: 1,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
        background:
          "radial-gradient(900px 520px at 70% -10%, var(--marca-brillo), transparent 60%), var(--marca-noche)",
      }}
    >
      <Link href="/" aria-label="Vecitap, inicio" style={{ marginBottom: 26 }}>
        <Logo alto={40} forzarTema="oscuro" />
      </Link>
      <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      {volverAlSitio && (
        <Link
          href="/"
          style={{
            marginTop: 20,
            fontSize: 13.5,
            color: "var(--marca-texto-sobre-noche)",
            textDecoration: "none",
          }}
        >
          ← Volver a vecitap.com
        </Link>
      )}
    </main>
  );
}
