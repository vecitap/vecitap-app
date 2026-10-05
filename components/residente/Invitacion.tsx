"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input, PantallaMarca } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Cuenta existe pero `mis_unidades()` devolvió vacío — portado de
 * Invitacion() en residente.html:373-413, con un agregado: el enlace a
 * "¿Viene a registrar su administradora?" (27-sep, decisión de Nicolás,
 * ver docs/casos-de-uso-mejorados.md). No existe en `main` — ahí cada rol
 * entraba por su propio archivo, así que esta ambigüedad no se daba nunca.
 * Con un solo `/entrar` compartido, alguien que se acaba de registrar para
 * ADMINISTRAR un condominio (no para vivir en uno) también cae acá, porque
 * tampoco tiene unidades — sin este enlace quedaría atascado pegando un
 * código que no tiene.
 */
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
    <PantallaMarca>
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
        <div style={{ textAlign: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--linea)" }}>
          <Link href="/admin" style={{ fontSize: 13, color: "var(--tenue)" }}>
            ¿Viene a registrar su administradora?
          </Link>
        </div>
      </Card>
    </PantallaMarca>
  );
}
