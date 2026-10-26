import { NextResponse, type NextRequest } from "next/server";
import { fechaCorta } from "@/lib/formato";
import { paraPantalla, reciboEnPapel } from "@/lib/recibo-papel";
import { ultimoReciboDe } from "@/lib/residente/recibo";
import { usuarioActual } from "@/lib/supabase/cache";
import { esUuid } from "@/lib/validacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { ajustesCobroDe } from "@/lib/cobro";

/**
 * "Descargar o imprimir mi recibo" (ronda 4, caso 53). Antes el botón abría
 * una ventana en blanco (`window.open("")`, about:blank) sin forma de
 * volver: con la app instalada en el teléfono, la persona quedaba atrapada
 * ahí. Ahora es una dirección propia que se abre en la misma pestaña, con
 * «Volver» arriba (no sale impreso) y la hoja a ancho carta en computadora.
 *
 * Es un Route Handler y no una página porque el documento es HTML completo
 * (la misma plantilla que imprime Admin) y no puede ir dentro del layout del
 * portal. Por eso no pasa por `[unidadId]/layout.tsx`: la sesión la comprueba
 * acá, y la unidad, `mis_unidades()` dentro de `ultimoReciboDe` (más RLS en
 * la consulta del recibo). `proxy.ts` ya exige sesión para todo /mi.
 *
 * Solo GET: es un enlace. No depende de ningún POST.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ unidadId: string }> }) {
  const { unidadId } = await params;
  const volver = `/mi/${unidadId}/recibo`;
  if (!esUuid(unidadId)) return new NextResponse("No encontrado", { status: 404 });

  const user = await usuarioActual();
  if (!user) return NextResponse.redirect(new URL(`/entrar?volver=${encodeURIComponent(volver)}`, _req.url));

  const supabase = await crearClienteServidor();
  const [r, { data: cuentas }] = await Promise.all([
    ultimoReciboDe(unidadId),
    // Ronda 7: los datos para pagar de su edificio (la función solo responde por sus unidades).
    supabase.rpc("datos_pago_de", { p_unidad: unidadId }),
  ]);
  if (!r.unidad) return new NextResponse("No encontrado", { status: 404 });
  // Sin recibo (o sin poder traerlo): "Mi recibo" ya explica qué pasó.
  if (!r.recibo) return NextResponse.redirect(new URL(volver, _req.url));

  const html = reciboEnPapel({
    edificio: r.recibo.edificio || r.unidad.edificio,
    organizacion: r.unidad.organizacion,
    unidad: r.unidad.codigo,
    vence: fechaCorta(r.recibo.vence_el),
    // La tasa viva viaja al papel: el documento se genera ahora, no el día
    // en que se emitió el recibo (index.html:1453-1455).
    tasaHoy: r.recibo.tasaHoy,
    cuentas: cuentas ?? [],
    soloUsd: (await ajustesCobroDe(r.unidad.org_id)).soloUsd,
    recibo: r.recibo,
  });

  return new NextResponse(paraPantalla(html, volver), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Datos personales: que no los guarde ningún intermediario.
      "Cache-Control": "private, no-store",
    },
  });
}
