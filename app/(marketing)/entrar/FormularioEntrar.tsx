"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Modo = "entrar" | "crear";

/**
 * El modo "crear" (signUp) quedó sin punto de entrada durante la Sesión 1
 * (registro de residentes fuera del alcance de la Fase 4, ver
 * docs/estado-migracion.md bajo Fase 5). Se reactiva hoy (27-sep,
 * adelantado de Fase 5 para el piloto, ver
 * docs/casos-de-uso-mejorados.md): sin esto, un residente recién invitado
 * no tiene forma de crear la cuenta antes de aceptar su invitación
 * (`components/residente/Invitacion.tsx`) — main (`app.html`, `index.html`,
 * `garita.html`) expone este mismo botón en las tres pantallas de Entrar,
 * sin distinción por rol, así que reactivarlo acá (compartido entre los
 * tres) es fiel al original. El registro propio (rate limiting, captcha)
 * sigue pendiente de Fase 5 — Supabase Auth ya limita intentos por su
 * cuenta, pero no hay nada adicional de este lado.
 */
export function FormularioEntrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sin `volver`, /destino resuelve el rol del lado del servidor. Antes
  // caía en `/` (la página en construcción), que no lleva a ningún lado
  // para ninguno de los tres roles.
  const volver = searchParams.get("volver") || "/destino";

  const [modo, setModo] = useState<Modo>("entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);

    const supabase = crearClienteNavegador();
    const credenciales = { email: correo.trim().toLowerCase(), password: clave };
    const { data, error } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword(credenciales)
        : await supabase.auth.signUp(credenciales);

    setEnviando(false);
    if (error) {
      setError(modo === "entrar" ? "Correo o contraseña incorrectos." : error.message);
      return;
    }

    // Con "Confirm email" apagado, signUp ya devuelve sesión abierta: hay
    // que seguir de largo igual que al entrar, o la persona se queda
    // mirando esta pantalla con la sesión hecha y sin botón que la lleve a
    // ningún lado. Con la confirmación encendida no hay sesión todavía, y
    // ahí sí corresponde el aviso de "revise su bandeja".
    if (modo === "crear" && !data.session) {
      setAviso("Cuenta creada. Confirme su correo y vuelva a entrar.");
      return;
    }

    router.push(volver);
    router.refresh();
  }

  return (
    <Card>
      <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)" }}>
        {modo === "entrar" ? "Entrar" : "Crear mi cuenta"}
      </h1>
      <form onSubmit={enviar}>
        {aviso && (
          <p style={{ color: "var(--verde)", fontSize: 13.5, lineHeight: 1.5, marginTop: 0 }}>
            {aviso}
          </p>
        )}
        <Campo etiqueta="Correo" obligatorio>
          <Input
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
        </Campo>
        <Campo
          etiqueta="Contraseña"
          obligatorio
          error={error ?? undefined}
        >
          <Input
            type="password"
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={modo === "crear" ? 8 : undefined}
            required
          />
        </Campo>
        <Button type="submit" disabled={enviando} style={{ marginTop: 8 }}>
          {enviando ? "Un momento…" : modo === "entrar" ? "Entrar" : "Crear la cuenta"}
        </Button>
      </form>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setAviso(null);
            setModo(modo === "entrar" ? "crear" : "entrar");
          }}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--tenue)",
            fontSize: 13.5,
            padding: "6px 8px",
          }}
        >
          {modo === "entrar" ? "No tengo cuenta todavía" : "Ya tengo cuenta"}
        </button>
      </div>
    </Card>
  );
}
