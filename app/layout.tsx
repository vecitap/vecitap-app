import type { Metadata } from "next";
import { Inter, Poppins, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ScriptTemaInicial, ThemeProvider } from "@/lib/theme/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
      className={`${inter.variable} ${poppins.variable} ${plexMono.variable}`}
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
