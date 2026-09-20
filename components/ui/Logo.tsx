"use client";

import { useState } from "react";
import Image from "next/image";
import { useTema } from "@/lib/theme/ThemeProvider";

/** Igual que LogoVecitap en los HTML originales: si el archivo no está,
 * cae al nombre escrito en vez de romper la página. */
export function Logo({ alto = 22 }: { alto?: number }) {
  const { tema } = useTema();
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
