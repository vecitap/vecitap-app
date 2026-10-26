import { NextResponse, type NextRequest } from "next/server";
import { tieneRolOrganizacion } from "@/lib/admin/acceso";
import { ROLES_ADMIN } from "@/lib/admin/constantes";
import { estadoFinancieroEnPapel, rangoDeMeses, tituloRango, type EstadoFinanciero } from "@/lib/admin/estado-financiero";
import { paraPantalla } from "@/lib/recibo-papel";
import { usuarioActual } from "@/lib/supabase/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { esUuid } from "@/lib/validacion";

/**
 * El estado financiero para imprimir o guardar en PDF (ronda 7, bloque 8):
 * la misma hoja y la misma barra «← Volver» que el recibo. Solo GET (es un
 * enlace). `?desde=2026-09&hasta=2026-10`.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string; edificioId: string }> }) {
  const { orgId, edificioId } = await params;
  if (!esUuid(orgId) || !esUuid(edificioId)) return new NextResponse("No encontrado", { status: 404 });
  const desde = req.nextUrl.searchParams.get("desde") ?? "";
  const hasta = req.nextUrl.searchParams.get("hasta") ?? "";
  const volver = `/admin/${orgId}/${edificioId}/estado?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
  const rango = rangoDeMeses(desde, hasta);
  if (!rango) return NextResponse.redirect(new URL(`/admin/${orgId}/${edificioId}/estado`, req.url));

  const user = await usuarioActual();
  if (!user) return NextResponse.redirect(new URL(`/entrar?volver=${encodeURIComponent(volver)}`, req.url));
  const { data: tieneAcceso } = await tieneRolOrganizacion(orgId, ROLES_ADMIN);
  if (tieneAcceso !== true) return NextResponse.redirect(new URL("/sin-acceso", req.url));

  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: edificio }, { data: estado, error }] = await Promise.all([
    supabase.from("organizaciones").select("nombre").eq("id", orgId).maybeSingle(),
    supabase.from("edificios").select("nombre,rif").eq("id", edificioId).eq("org_id", orgId).maybeSingle(),
    supabase.rpc("estado_financiero", { p_edificio: edificioId, p_desde: rango.desde, p_hasta: rango.hasta }),
  ]);
  if (!org || !edificio || error || !estado) return NextResponse.redirect(new URL(volver, req.url));

  const html = estadoFinancieroEnPapel({
    estado: estado as unknown as EstadoFinanciero,
    edificio,
    organizacion: org,
    titulo: tituloRango(desde, hasta),
  });
  return new NextResponse(paraPantalla(html, volver), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
