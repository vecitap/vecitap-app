import { NextResponse, type NextRequest } from "next/server";
import { tieneRolOrganizacion } from "@/lib/admin/acceso";
import { ROLES_ADMIN } from "@/lib/admin/constantes";
import { recibosAdminEnPapel } from "@/lib/admin/papel-recibos";
import type { ReciboAdmin, Unidad } from "@/lib/admin/tipos";
import { paraPantalla } from "@/lib/recibo-papel";
import { usuarioActual } from "@/lib/supabase/cache";
import { crearClienteServidor } from "@/lib/supabase/server";
import { tasaDelDia } from "@/lib/tasa";
import { esUuid } from "@/lib/validacion";

const noEncontrado = () => new NextResponse("No encontrado", { status: 404 });

/**
 * Los recibos de un mes en papel, para Admin (ronda 4, caso 53):
 * `?periodo=<id>` todos los del mes, uno por hoja; `&unidad=<id>` solo el de
 * esa unidad. Se abre en la misma pestaña, con «Volver» a Cortes (no sale
 * impreso). Antes, una ventana en blanco (about:blank).
 *
 * Comparte la plantilla con el portal del residente
 * (`/mi/[unidad]/recibo/papel`), no la ruta: cada una vive en su módulo con
 * su propio control. Un Route Handler no pasa por `[orgId]/layout.tsx`, así
 * que el rol se vuelve a comprobar acá, igual que ahí (`tiene_rol` con
 * `ROLES_ADMIN`); además `proxy.ts` ya gatea /admin/[orgId]/* y RLS decide
 * cada consulta. El edificio tiene que ser de la organización de la URL.
 *
 * Solo GET: es un enlace.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string; edificioId: string }> }) {
  const { orgId, edificioId } = await params;
  const periodoId = req.nextUrl.searchParams.get("periodo") ?? "";
  const unidadId = req.nextUrl.searchParams.get("unidad");
  if (!esUuid(orgId) || !esUuid(edificioId)) return noEncontrado();
  // Sin un mes válido, a Cortes. Pasa de verdad: si la sesión venció, el
  // proxy manda a Entrar y el `?periodo=` no viaja dentro de `volver`.
  if (!esUuid(periodoId) || (unidadId !== null && !esUuid(unidadId))) {
    return NextResponse.redirect(new URL(`/admin/${orgId}/${edificioId}/cortes`, req.url));
  }
  const volver = `/admin/${orgId}/${edificioId}/cortes?periodo=${periodoId}`;

  const user = await usuarioActual();
  if (!user) return NextResponse.redirect(new URL(`/entrar?volver=${encodeURIComponent(volver)}`, req.url));

  const { data: tieneAcceso, error: errorRol } = await tieneRolOrganizacion(orgId, ROLES_ADMIN);
  if (errorRol || tieneAcceso !== true) return NextResponse.redirect(new URL("/sin-acceso", req.url));

  const supabase = await crearClienteServidor();
  let consultaRecibos = supabase
    .from("recibos")
    .select(
      "id,unidad_id,numero,cuota,directos,anterior,a_favor,mora,honorario,servicio,anterior_hon,anterior_serv,total,conceptos,detalle,tasa_bcv,vence_el,alicuota"
    )
    .eq("periodo_id", periodoId);
  if (unidadId) consultaRecibos = consultaRecibos.eq("unidad_id", unidadId);

  const [{ data: org }, { data: edificio }, { data: periodo }, { data: unidades }, { data: recibos }, tasa] = await Promise.all([
    supabase.from("organizaciones").select("nombre,logo_url").eq("id", orgId).maybeSingle(),
    supabase.from("edificios").select("nombre,rif").eq("id", edificioId).eq("org_id", orgId).maybeSingle(),
    supabase.from("periodos").select("etiqueta,estado").eq("id", periodoId).eq("edificio_id", edificioId).maybeSingle(),
    supabase
      .from("unidades")
      .select(
        "id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))"
      )
      .eq("edificio_id", edificioId)
      .order("codigo"),
    consultaRecibos,
    tasaDelDia(supabase),
  ]);
  if (!org || !edificio || !periodo || periodo.estado !== "cerrado") return noEncontrado();

  const lista: Unidad[] = unidades ?? [];
  // Mismo orden que el listado: por código de unidad.
  const orden = new Map(lista.map((u, i) => [u.id, i]));
  const filas: ReciboAdmin[] = (recibos ?? []).slice().sort((a, b) => (orden.get(a.unidad_id) ?? 0) - (orden.get(b.unidad_id) ?? 0));
  if (!filas.length) return NextResponse.redirect(new URL(volver, req.url));

  const html = recibosAdminEnPapel(filas, { edificio, organizacion: org, unidades: lista, etiqueta: periodo.etiqueta, tasa });
  return new NextResponse(paraPantalla(html, volver), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
