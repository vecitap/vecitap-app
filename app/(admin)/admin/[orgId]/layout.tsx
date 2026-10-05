import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MarcoAdmin } from "@/components/admin/MarcoAdmin";
import { tieneRolOrganizacion } from "@/lib/admin/acceso";
import { ROLES_ADMIN } from "@/lib/admin/constantes";
import { edificiosDeOrganizacion } from "@/lib/admin/edificios-organizacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cache";
import { AvisoCambioDeCuenta } from "@/components/AvisoCambioDeCuenta";
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

  // getUser() y tiene_rol() memoizados por petición (ver lib/supabase/cache.ts
  // y lib/admin/acceso.ts) — quedan como gate en serie, antes de pedir
  // cualquier dato de la organización: el orden de la comprobación de acceso
  // no cambió, solo de dónde sale getUser().
  const user = await usuarioActual();
  if (!user) redirect(`/entrar?volver=/admin/${orgId}`);

  const { data: tieneAcceso, error: errorRol } = await tieneRolOrganizacion(orgId, ROLES_ADMIN);
  if (errorRol || tieneAcceso !== true) redirect("/");

  // Ya autorizado: organizaciones, edificios (memoizado — lo reusan
  // [edificioId]/layout.tsx e inicio/page.tsx) y la tasa del día no dependen
  // entre sí, así que van en paralelo en vez de una detrás de otra.
  const supabase = await crearClienteServidor();
  const [{ data: org, error }, { data: edificios }, tasa] = await Promise.all([
    supabase
      .from("organizaciones")
      .select("id,nombre,rif,plan,acento,logo_url")
      .eq("id", orgId)
      .single(),
    edificiosDeOrganizacion(orgId),
    tasaDelDia(supabase),
  ]);
  if (error || !org) notFound();

  return (
    <MarcoAdmin organizacion={org} edificios={edificios ?? []} tasaInicial={tasa}>
      {children}
      <AvisoCambioDeCuenta usuarioId={user.id} />
    </MarcoAdmin>
  );
}
