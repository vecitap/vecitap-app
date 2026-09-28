"use client";

import { useState } from "react";
import Image from "next/image";
import { useTema } from "@/lib/theme/ThemeProvider";

/**
 * Igual que LogoVecitap en los HTML originales: si el archivo no está, cae
 * al nombre escrito en vez de romper la página.
 *
 * `forzarTema` es para las superficies que son oscuras en los dos temas
 * (la columna lateral de Admin, la banda del residente): ahí va siempre el
 * logotipo en crema, no el de fondo claro — admin.html:1403-1405.
 */
export function Logo({ alto = 22, forzarTema }: { alto?: number; forzarTema?: "claro" | "oscuro" }) {
  const { tema: temaActual } = useTema();
  const tema = forzarTema ?? temaActual;
  const [falla, setFalla] = useState(false);

  if (falla) {
    return (
      <span style={{ fontWeight: 700, fontSize: alto * 0.72, letterSpacing: "-.01em" }}>
        vecitap
      </span>
    );
  }

  return (
    <Image
      src={tema === "oscuro" ? "/logo-oscuro.png" : "/logo-claro.png"}
      alt="Vecitap"
      height={alto}
      width={Math.round(alto * (420 / 121))}
      onError={() => setFalla(true)}
      style={{ height: alto, width: "auto", display: "block" }}
      priority
    />
  );
}
