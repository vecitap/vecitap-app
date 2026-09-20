import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoResidente } from "@/components/residente/EncabezadoResidente";
import { SelectorUnidad } from "@/components/residente/SelectorUnidad";
import { TarjetaSaldo } from "@/components/residente/TarjetaSaldo";
import { PestanasResidente } from "@/components/residente/PestanasResidente";
import { crearClienteServidor } from "@/lib/supabase/server";

export default async function LayoutUnidad({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/entrar?volver=/mi/${unidadId}`);

  const { data: unidades, error } = await supabase.rpc("mis_unidades");
  if (error || !unidades || unidades.length === 0) redirect("/mi");

  const unidad = unidades.find((u) => u.unidad_id === unidadId);
  // mis_unidades() ya viene filtrada por sesión (RLS) — si el id no está
  // en la lista, o es un typo o alguien probó la unidad de otra persona.
  if (!unidad) notFound();

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px 60px" }}>
      <EncabezadoResidente correo={user.email ?? ""} />

      {unidades.length > 1 && (
        <SelectorUnidad unidades={unidades} unidadIdActual={unidadId} />
      )}

      <TarjetaSaldo unidad={unidad} />

      <PestanasResidente unidadId={unidadId} />

      {children}
    </div>
  );
}
