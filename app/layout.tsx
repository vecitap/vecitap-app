import type { Metadata } from "next";
import "./globals.css";
import { ScriptTemaInicial, ThemeProvider } from "@/lib/theme/ThemeProvider";
import { clasesFuentes } from "@/lib/marca/fuentes";

export const metadata: Metadata = {
  title: "Vecitap",
  description: "Administración de condominios",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="claro"
      suppressHydrationWarning
      className={clasesFuentes}
    >
      <head>
        <ScriptTemaInicial />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
