import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoAdmin } from "@/components/admin/EncabezadoAdmin";
import { crearClienteServidor } from "@/lib/supabase/server";

const ROLES_ADMIN = ["propietario_cuenta", "administrador", "contador", "junta"] as const;

/**
 * Defensa en profundidad, igual que /operador (ver proxy.ts): proxy.ts ya
 * gatea /admin/[orgId]/* con tiene_rol(), pero un Server Component no
 * debería depender solo del proxy para autorizar (misma nota que ya
 * dejó Fase 3 en proxy.ts sobre /admin y /mi).
 */
export default async function LayoutOrg({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/entrar?volver=/admin/${orgId}`);

  const { data: tieneAcceso, error: errorRol } = await supabase.rpc("tiene_rol", {
    p_org: orgId,
    p_roles: [...ROLES_ADMIN],
  });
  if (errorRol || tieneAcceso !== true) redirect("/");

  const { data: org, error } = await supabase
    .from("organizaciones")
    .select("id,nombre,rif,plan,acento,logo_url")
    .eq("id", orgId)
    .single();
  if (error || !org) notFound();

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 18px" }}>
      <EncabezadoAdmin organizacion={org} correo={user.email ?? ""} />
      {children}
    </div>
  );
}
