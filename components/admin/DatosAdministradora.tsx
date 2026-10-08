"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Campo, Card, EstadoGuardado, Input } from "@/components/ui";
import { useAccion } from "@/hooks/useAccion";
import { crearClienteNavegador } from "@/lib/supabase/client";

/**
 * Nombre y RIF de la administradora (bloque C, 08-oct). No existe en
 * `main`: ahí el nombre y el RIF se escribían una vez, al crear la
 * organización, y no había dónde corregirlos (caso 41 de
 * docs/casos-de-uso-mejorados.md). Salen en el recibo y en el estado de
 * cuenta, igual que el logo, así que la tarjeta va al lado de LogoOrg.
 *
 * La base solo deja editar la organización a `propietario_cuenta`
 * (política `org_editar`). Para los demás roles la tarjeta se muestra en
 * modo lectura, en vez de un botón que guardaría "0 filas" sin decir nada.
 */
export function DatosAdministradora({
  orgId,
  nombre,
  rif,
  puedeEditar,
}: {
  orgId: string;
  nombre: string;
  rif: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({ nombre, rif: rif ?? "" });

  const guardar = useAccion(async () => {
    if (!f.nombre.trim()) throw new Error("Falta el nombre de la administradora.");
    const supabase = crearClienteNavegador();
    // Con .select(): un UPDATE que RLS filtra no da error, devuelve 0 filas.
    const { data, error: e } = await supabase
      .from("organizaciones")
      .update({ nombre: f.nombre.trim(), rif: f.rif.trim() || null })
      .eq("id", orgId)
      .select("id");
    if (e) throw e;
    if (!data || data.length === 0) throw new Error("No se pudo guardar. Solo la cuenta dueña de la administradora puede cambiar estos datos.");
    router.refresh();
  });

  return (
    <Card>
      <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Datos de la administradora</h2>
      <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
        Salen en el recibo impreso y en el estado de cuenta que recibe el propietario.
        {!puedeEditar && " Solo la cuenta dueña de la administradora puede cambiarlos."}
      </p>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Campo etiqueta="Nombre">
          <Input value={f.nombre} disabled={!puedeEditar} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="RIF">
          <Input className="mono" value={f.rif} disabled={!puedeEditar} onChange={(e) => setF({ ...f, rif: e.target.value })} />
        </Campo>
      </div>
      {puedeEditar && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button type="button" cargando={guardar.enviando} onClick={() => guardar.ejecutar()}>
            Guardar datos
          </Button>
          <EstadoGuardado estado={guardar.estado} error={guardar.error} />
        </div>
      )}
    </Card>
  );
}
