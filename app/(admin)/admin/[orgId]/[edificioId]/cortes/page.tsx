import { notFound } from "next/navigation";
import { Cortes } from "@/components/admin/Cortes";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ajustesCobroDe } from "@/lib/cobro";
import { tieneRolOrganizacion } from "@/lib/admin/acceso";
import { ROLES_OPERAR } from "@/lib/admin/constantes";
import { consultarCortes } from "@/lib/admin/pantallas/cortes";

/**
 * Portado de Cortes() en admin.html:4918-5617 (Server Component: carga
 * unidades, períodos, organización, edificio y la tasa viva del BCV — la
 * misma que el encabezado de Admin y la que va al recibo en papel). Los
 * recibos del período elegido los carga el Client Component, porque
 * cambian al cambiar de mes sin recargar la página. La consulta vive en
 * lib/admin/pantallas/cortes.ts, que comparte con la copia sin conexión.
 */
export default async function PaginaCortes({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { orgId, edificioId } = await params;
  const { periodo: periodoInicial } = await searchParams;
  const supabase = await crearClienteServidor();

  const [filas, cobro, { data: puedeOperar }] = await Promise.all([
    consultarCortes(supabase, { orgId, edificioId }),
    ajustesCobroDe(orgId),
    // Ronda 12: contador y junta no ven «Probar el correo» (correo_recibo() se lo niega).
    tieneRolOrganizacion(orgId, ROLES_OPERAR),
  ]);
  if (!filas) notFound();

  return (
    <Cortes
      orgId={orgId}
      edificioId={edificioId}
      {...filas}
      soloUsd={cobro.soloUsd}
      puedeOperar={puedeOperar === true}
      periodoInicial={typeof periodoInicial === "string" ? periodoInicial : undefined}
    />
  );
}
