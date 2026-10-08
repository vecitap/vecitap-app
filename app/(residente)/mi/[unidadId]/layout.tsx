import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EncabezadoResidente } from "@/components/residente/EncabezadoResidente";
import { SelectorUnidad } from "@/components/residente/SelectorUnidad";
import { TarjetaSaldo } from "@/components/residente/TarjetaSaldo";
import { PestanasResidente } from "@/components/residente/PestanasResidente";
import { ResumenUnidades } from "@/components/residente/ResumenUnidades";
import { misUnidadesSesion } from "@/lib/residente/datos";
import { resumenUnidades } from "@/lib/residente/resumen";
import { estadoSinMonto, misCuotasSesion, soloEstado } from "@/lib/residente/cuotas";
import { usuarioActual } from "@/lib/supabase/cache";
import { AvisoCambioDeCuenta } from "@/components/AvisoCambioDeCuenta";
import { esUuid } from "@/lib/validacion";

export default async function LayoutUnidad({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ unidadId: string }>;
}) {
  const { unidadId } = await params;
  // Entra crudo del URL: formato inválido, 404 directo, antes de mis_unidades().
  if (!esUuid(unidadId)) notFound();

  // getUser() y mis_unidades() memoizados por petición (ver
  // lib/supabase/cache.ts y lib/residente/datos.ts): recibo/reportar/visitas
  // los vuelven a pedir más abajo y leen el resultado ya resuelto acá.
  const user = await usuarioActual();

  if (!user) redirect(`/entrar?volver=/mi/${unidadId}`);

  const { data: unidades, error } = await misUnidadesSesion();
  if (error || !unidades || unidades.length === 0) redirect("/mi");

  const unidad = unidades.find((u) => u.unidad_id === unidadId);
  // mis_unidades() ya viene filtrada por sesión (RLS) — si el id no está
  // en la lista, o es un typo o alguien probó la unidad de otra persona.
  if (!unidad) notFound();

  // mis_cuotas() solo hace falta si alguna unidad la paga el inquilino y
  // quien mira es el propietario (ronda 2, casos 35 y 37): las demás
  // muestran montos y no la usan.
  const cuotas = unidades.some(soloEstado) ? await misCuotasSesion() : new Map();
  const resumen = resumenUnidades(unidades, cuotas);
  const sinMonto = soloEstado(unidad);
  const saldoUnidad = unidad.saldo === null ? null : Number(unidad.saldo);

  return (
    <>
      {/* Banda de marca oscura, fuera del ancho máximo de 640px: igual que
          index.html:308-330, es una franja de ancho completo con su propio
          contenido centrado adentro (ver EncabezadoResidente.tsx). */}
      <EncabezadoResidente correo={user.email ?? ""} />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px 60px" }}>
        {/* Solo para quien tiene más de una unidad; si no, null
            y la pantalla queda igual que antes (caso 31). */}
        {resumen && <ResumenUnidades resumen={resumen} />}

        {unidades.length > 1 && (
          <SelectorUnidad unidades={unidades} unidadIdActual={unidadId} />
        )}

        {/* 05-oct: una segunda invitación (otra oficina, otro edificio)
            no tenía dónde pegarse. Visible siempre, también con una sola
            unidad: es justo el caso de quien recibe la segunda. */}
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 12px" }}>
          <Link href="/mi/agregar" className="btn btn-secundario btn-mini" style={{ textDecoration: "none" }}>
            + Agregar otra unidad
          </Link>
        </div>

        <TarjetaSaldo unidad={unidad} estado={sinMonto ? estadoSinMonto(saldoUnidad, cuotas.get(unidad.unidad_id)) : undefined} />

        <PestanasResidente unidadId={unidadId} edificioId={unidad.edificio_id} reportar={!sinMonto} />

        {children}
      </div>
      <AvisoCambioDeCuenta usuarioId={user.id} />
    </>
  );
}
