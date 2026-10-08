"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input, PantallaMarca } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/**
 * Pegar el código de una invitación. Dos situaciones, la misma pantalla:
 *
 * · **Falta un paso** (`unidadesPrevias` vacío): la cuenta existe pero
 *   `mis_unidades()` devolvió vacío — portado de Invitacion() en
 *   residente.html:373-413, con un agregado: el enlace a "¿Viene a registrar
 *   su administradora?" (27-sep, decisión de Nicolás, ver
 *   docs/casos-de-uso-mejorados.md). No existe en `main` — ahí cada rol
 *   entraba por su propio archivo, así que esta ambigüedad no se daba nunca.
 *   Con un solo `/entrar` compartido, alguien que se acaba de registrar para
 *   ADMINISTRAR un condominio (no para vivir en uno) también cae acá, porque
 *   tampoco tiene unidades — sin este enlace quedaría atascado pegando un
 *   código que no tiene.
 * · **Agregar otra unidad** (05-oct, /mi/agregar): la cuenta ya tiene al
 *   menos una unidad y le llegó otra invitación (otra oficina, otro
 *   edificio, otra administradora). Antes no había dónde pegarla: /mi solo
 *   mostraba este formulario a una cuenta SIN unidades. Es lo que hace que
 *   un propietario con 6 oficinas pueda ver las 6.
 *
 * `codigoInicial` viene del enlace de "Copiar el mensaje completo" de
 * Accesos (`/mi/agregar?codigo=…`): el campo aparece ya lleno, pero no se
 * acepta solo — la persona toca el botón.
 *
 * Al aceptar, lleva a la unidad nueva: `aceptar_invitacion()` devuelve la
 * organización, no la unidad, así que se compara `mis_unidades()` con la
 * lista de antes. Si no se encuentra (no debería pasar), va a /mi.
 */
export function Invitacion({
  correo,
  unidadesPrevias = [],
  codigoInicial = "",
}: {
  correo: string;
  unidadesPrevias?: string[];
  codigoInicial?: string;
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(codigoInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const agregar = unidadesPrevias.length > 0;

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

    if (error) {
      setEnviando(false);
      setError(mensajeDeError(error));
      return;
    }

    const { data: unidades } = await supabase.rpc("mis_unidades");
    const nueva = (unidades ?? []).find((u) => !unidadesPrevias.includes(u.unidad_id));
    router.push(nueva ? `/mi/${nueva.unidad_id}/recibo` : "/mi");
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
          {agregar ? "Agregar otra unidad" : "Falta un paso"}
        </h1>
        <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          {agregar
            ? "Pegue el código de la invitación nueva que le envió la administración. "
            : "Su cuenta existe pero todavía no está asociada a ninguna unidad. Pegue el código que le envió su administración. "}
          Si no lo tiene, pídaselo: la invitación va a <b>{correo}</b> y no sirve para otro correo.
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
          <Button type="submit" cargando={enviando} style={{ width: "100%" }}>
            Usar la invitación
          </Button>
        </form>
        {agregar ? (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <Link href="/mi" style={{ fontSize: 13, color: "var(--tenue)" }}>
              ← Volver a mis unidades
            </Link>
          </div>
        ) : (
          <>
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
          </>
        )}
      </Card>
    </PantallaMarca>
  );
}
