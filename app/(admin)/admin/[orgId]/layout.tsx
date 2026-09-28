import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MarcoAdmin } from "@/components/admin/MarcoAdmin";
import { ROLES_ADMIN } from "@/lib/admin/constantes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tasaDelDia } from "@/lib/tasa";
import { esUuid } from "@/lib/validacion";

/**
 * Defensa en profundidad, igual que /operador (ver proxy.ts): proxy.ts ya
 * gatea /admin/[orgId]/* con tiene_rol(), pero un Server Component no
 * debería depender solo del proxy para autorizar (misma nota que ya dejó
 * Fase 3 en proxy.ts sobre /admin y /mi).
 *
 * Acá también se monta el armazón (columna lateral + encabezado con la
 * tasa), portado de App() en admin.html:1310-1470. El armazón en sí es un
 * Client Component porque necesita `usePathname` para saber en qué
 * edificio y en qué sección está; este layout le pasa los datos.
 */
export default async function LayoutOrg({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  // Formato inválido (typo, URL armada a mano): 404 directo, sin gastar
  // una consulta ni una llamada RPC en un id que no puede ser real.
  if (!esUuid(orgId)) notFound();

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

  const { data: edificios } = await supabase
    .from("edificios")
    .select("id,nombre,direccion")
    .eq("org_id", orgId)
    .order("nombre");

  const tasa = await tasaDelDia(supabase);

  return (
    <MarcoAdmin organizacion={org} edificios={edificios ?? []} tasaInicial={tasa}>
      {children}
    </MarcoAdmin>
  );
}
