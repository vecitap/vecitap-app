"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/**
 * garita.html:931-970 — la cuenta existe pero todavía no está asignada a
 * ninguna garita. El vigilante pega el código que le dio la
 * administración y `aceptar_invitacion` crea la membresía.
 *
 * La invitación va atada al correo y se gasta una sola vez: quien la
 * acepta es la sesión actual, por eso el texto dice a qué correo va.
 *
 * `errorCarga` viene de `garita_edificios()` cuando falló: un error de la
 * base nunca se traga en silencio — en una puerta, "no pasó nada" es peor
 * que un mensaje feo. Sin él, una caída de red se vería igual que "no
 * tiene garita asignada", que es un diagnóstico distinto.
 */
export function FaltaUnPaso({ correo, errorCarga }: { correo: string; errorCarga?: string }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function usar(evento: FormEvent) {
    evento.preventDefault();
    const token = codigo.trim();
    if (!token) return setError("Pegue el código de la invitación.");

    setError(null);
    setEnviando(true);
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.rpc("aceptar_invitacion", { p_token: token });
    setEnviando(false);

    if (e) return setError(mensajeDeError(e));
    // La página de arriba vuelve a pedir garita_edificios(); ahora sí hay
    // una y redirige sola a la garita.
    router.refresh();
  }

  return (
    <div className="garita-entrar">
      <div className="garita-tarjeta">
        <h2>Falta un paso</h2>

        {errorCarga && (
          <div style={{ marginBottom: 12 }}>
            <Aviso tono="rojo" titulo="No se pudo consultar sus garitas">
              {errorCarga}
            </Aviso>
          </div>
        )}

        <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--tinta-2)", marginTop: 0 }}>
          Su cuenta existe pero todavía no está asignada a ninguna garita. Pegue el código que le dio
          la administración. La invitación va a <b>{correo}</b> y no sirve para otro correo.
        </p>

        <form onSubmit={usar}>
          <label className="garita-label" htmlFor="codInv">
            Código de invitación
          </label>
          <input
            id="codInv"
            className="garita-campo"
            style={{ fontFamily: "var(--font-mono)" }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="a1b2c3…"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />

          {error && (
            <div style={{ marginTop: 12 }}>
              <Aviso tono="rojo">{error}</Aviso>
            </div>
          )}

          <div className="garita-fila">
            <button type="submit" className="garita-boton ancho" disabled={enviando}>
              {enviando ? "Comprobando…" : "Usar la invitación"}
            </button>
          </div>
        </form>

        <p className="garita-pie">
          Si no tiene código, pídaselo a la administración. Si ya lo usó y sigue viendo esto, puede
          que el edificio todavía no tenga contratado el panel de seguridad.
        </p>
      </div>
    </div>
  );
}
