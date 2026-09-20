"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";

type Modo = "entrar" | "crear";

/**
 * El modo "crear" (signUp) queda sin punto de entrada a propósito: registro
 * de residentes está fuera del alcance de la Fase 4 (decisión explícita,
 * ver docs/estado-migracion.md bajo Fase 5 — el modelo de registro todavía
 * se está definiendo). El código de este modo se deja tal cual, solo se
 * quitó el botón que lo activaba, para no perder el trabajo cuando la
 * Fase 5 lo retome.
 */
export function FormularioEntrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const volver = searchParams.get("volver") || "/";

  // setModo queda sin uso: es el gancho que la Fase 5 va a conectar de
  // nuevo a un botón cuando el modelo de registro esté definido.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    const { error } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword(credenciales)
        : await supabase.auth.signUp(credenciales);

    setEnviando(false);
    if (error) {
      setError(modo === "entrar" ? "Correo o contraseña incorrectos." : error.message);
      return;
    }

    if (modo === "crear") {
      setAviso("Cuenta creada. Si le pedimos confirmar el correo, revise su bandeja.");
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
            minLength={modo === "crear" ? 6 : undefined}
            required
          />
        </Campo>
        <Button type="submit" disabled={enviando} style={{ marginTop: 8 }}>
          {enviando ? "Un momento…" : modo === "entrar" ? "Entrar" : "Crear la cuenta"}
        </Button>
      </form>
    </Card>
  );
}
