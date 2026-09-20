"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";

/** Cuenta existe pero `mis_unidades()` devolvió vacío — portado de
 * Invitacion() en residente.html:373-413. */
export function Invitacion({ correo }: { correo: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aceptar(evento: FormEvent) {
    evento.preventDefault();
    if (!codigo.trim()) {
      setError("Pegue el código de la invitación.");
      return;
    }
    setError(null);
    setEnviando(true);

    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("aceptar_invitacion", { p_token: codigo.trim() });

    setEnviando(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push("/mi");
    router.refresh();
  }

  async function salir() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
      <Card>
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>
          Falta un paso
        </h1>
        <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Su cuenta existe pero todavía no está asociada a ninguna unidad. Pegue el código
          que le envió su administración. Si no lo tiene, pídaselo: la invitación va a{" "}
          <b>{correo}</b> y no sirve para otro correo.
        </p>
        <form onSubmit={aceptar}>
          <Campo etiqueta="Código de invitación" obligatorio error={error ?? undefined}>
            <Input
              className="mono"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoCapitalize="off"
              placeholder="a1b2c3…"
            />
          </Campo>
          <Button type="submit" disabled={enviando} style={{ width: "100%" }}>
            {enviando ? "Comprobando…" : "Usar la invitación"}
          </Button>
        </form>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Button type="button" variante="secundario" mini onClick={salir}>
            Salir
          </Button>
        </div>
      </Card>
    </main>
  );
}
