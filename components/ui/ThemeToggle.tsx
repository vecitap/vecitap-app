"use client";

import { useTema } from "@/lib/theme/ThemeProvider";
import { Button } from "./Button";

export function ThemeToggle() {
  const { tema, ponerTema } = useTema();
  return (
    <Button
      type="button"
      variante="secundario"
      mini
      onClick={() => ponerTema(tema === "oscuro" ? "claro" : "oscuro")}
    >
      {tema === "oscuro" ? "Modo claro" : "Modo oscuro"}
    </Button>
  );
}
