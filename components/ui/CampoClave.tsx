"use client";

import { useState, type InputHTMLAttributes } from "react";

/**
 * Campo de clave con el ojo para verla. Portado de `Ojo`/`ClaveEntrada` en
 * admin.html:541-568, index.html:172-199, operador.html y garita.html:334-362
 * (los cuatro HTML de `main` lo agregaron a la vez).
 *
 * El motivo del original: "escribir a ciegas es la razón número uno por la
 * que la gente pone claves cortas" — y en la garita se escribe de pie, con
 * guantes o con lluvia.
 */

function Ojo({ abierto }: { abierto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3.2" />
      {!abierto && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

export function CampoClave({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false);
  const rotulo = ver ? "Ocultar la clave" : "Ver la clave";

  return (
    <div style={{ position: "relative" }}>
      <input
        {...props}
        type={ver ? "text" : "password"}
        className={`control ${className}`.trim()}
        style={{ paddingRight: 46, ...props.style }}
      />
      <button
        type="button"
        onClick={() => setVer(!ver)}
        aria-label={rotulo}
        title={rotulo}
        style={{
          position: "absolute",
          right: 3,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "8px 10px",
          color: ver ? "var(--acento-texto)" : "var(--tenue)",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Ojo abierto={ver} />
      </button>
    </div>
  );
}
