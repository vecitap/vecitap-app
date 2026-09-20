"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";

export function FormularioEntrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const volver = searchParams.get("volver") || "/";

  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    const supabase = crearClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password: clave,
    });

    setEnviando(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    router.push(volver);
    router.refresh();
  }

  return (
    <Card>
      <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)" }}>Entrar</h1>
      <form onSubmit={entrar}>
        <Campo etiqueta="Correo" obligatorio>
          <Input
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
        </Campo>
        <Campo etiqueta="Contraseña" obligatorio error={error ?? undefined}>
          <Input
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </Campo>
        <Button type="submit" disabled={enviando} style={{ marginTop: 8 }}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
