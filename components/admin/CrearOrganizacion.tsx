"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/**
 * Portado del formulario de alta dentro de Organizaciones() en
 * app.html:782-820 — la lista de administradoras existentes la resuelve
 * `AdminHome` (app/(admin)/admin/page.tsx), este componente es solo el
 * alta. No se había portado en la Sesión 1: quien entraba sin ninguna
 * organización asociada quedaba en un callejón sin salida ("Sin
 * administradora asociada", sin ninguna acción posible) — ver
 * docs/casos-de-uso-mejorados.md.
 *
 * `crear_organizacion` devuelve el id de la organización nueva
 * (`types/supabase.ts`): a diferencia de app.html (que se queda en la
 * misma pantalla y recarga la lista para que el usuario la elija con un
 * clic más), acá se redirige directo — hay ruteo real, no tiene sentido
 * el paso intermedio.
 */
export function CrearOrganizacion() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [rif, setRif] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function crear() {
    if (!nombre.trim()) return setError("Falta el nombre.");
    setError(null);
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.rpc("crear_organizacion", {
      p_nombre: nombre.trim(),
      p_rif: rif.trim() || undefined,
    });
    setOcupado(false);
    if (e) return setError(mensajeDeError(e));
    router.push(`/admin/${data}`);
    router.refresh();
  }

  return (
    <Card style={{ maxWidth: 480, width: "100%" }}>
      <h2 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>
        Nueva administradora
      </h2>
      <p style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: -6 }}>
        Una administradora agrupa a todos sus edificios. Sus datos nunca se cruzan
        con los de otra.
      </p>
      {error && (
        <p style={{ color: "var(--rojo)", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo etiqueta="Nombre">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Administradora Ejemplo, C.A."
          />
        </Campo>
        <Campo etiqueta="RIF (opcional)">
          <Input
            className="mono"
            value={rif}
            onChange={(e) => setRif(e.target.value)}
            placeholder="J-00000000-0"
          />
        </Campo>
      </div>
      <div style={{ marginTop: 18 }}>
        <Button type="button" cargando={ocupado} onClick={crear}>
          Crear administradora
        </Button>
      </div>
    </Card>
  );
}
