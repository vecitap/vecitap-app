"use client";

import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { Vacio } from "@/components/ui";
import { Propietarios } from "@/components/admin/Propietarios";
import { PantallaInicio } from "@/components/admin/PantallaInicio";
import { Ficha } from "@/components/admin/Ficha";
import { Pagos } from "@/components/admin/Pagos";
import { CierreMes } from "@/components/admin/CierreMes";
import { Cortes } from "@/components/admin/Cortes";
import { armarPropsPropietarios } from "@/lib/admin/pantallas/propietarios";
import { armarPropsInicio } from "@/lib/admin/pantallas/inicio";
import { fichaDesdeCopia } from "@/lib/admin/pantallas/ficha";
import { armarPropsPagos } from "@/lib/admin/pantallas/pagos";
import { armarPropsMes } from "@/lib/admin/pantallas/mes";
import type { CopiaEdificio } from "@/lib/local/almacen";
import { esUuid } from "@/lib/validacion";

/**
 * Una sección del edificio dibujada desde la copia (cambio 3): la usan la
 * pantalla sin internet (parte A) y la vista previa de «primero la copia»
 * (parte E). Los mismos componentes que en línea, con props armadas por las
 * mismas funciones (lib/admin/pantallas). Devuelve `null` si esa sección no
 * está en la copia.
 */

/** Las secciones que se pueden dibujar desde la copia. */
export const SECCIONES_EN_COPIA = ["inicio", "propietarios", "pagos", "mes", "cortes"] as const;

export type RutaCopia = { orgId: string; edificioId: string; seccion: string; unidadId: string | null };

/** /admin/<org>/<edificio>/<sección>[/<unidad>] → sus partes, o null. */
export function leerRutaAdmin(ruta: string | null): RutaCopia | null {
  if (!ruta || !ruta.startsWith("/admin/")) return null;
  const [, , orgId, edificioId, seccion = "inicio", unidadId] = ruta.split("?")[0].split("/");
  if (!esUuid(orgId ?? "") || !esUuid(edificioId ?? "")) return null;
  return { orgId, edificioId, seccion, unidadId: unidadId && esUuid(unidadId) ? unidadId : null };
}

export function contenidoDeCopia({ copia, seccion, unidadId }: { copia: CopiaEdificio; seccion: string; unidadId: string | null }): ReactNode {
  const { orgId, edificioId } = copia;
  switch (seccion) {
    case "inicio":
      return (
        <PantallaInicio
          orgId={orgId}
          edificioId={edificioId}
          tolerancia={copia.marco.edificios.find((e) => e.id === edificioId)?.tolerancia_alicuota}
          props={armarPropsInicio(copia.inicio)}
        />
      );
    case "propietarios": {
      if (!unidadId) return <Propietarios orgId={orgId} edificioId={edificioId} {...armarPropsPropietarios(copia.propietarios)} />;
      const ficha = fichaDesdeCopia(copia.propietarios, copia.fichas, unidadId);
      return ficha ? (
        <Ficha orgId={orgId} edificioId={edificioId} {...ficha} />
      ) : (
        <Vacio titulo="Esa unidad no está en la copia" texto="Puede que se haya agregado después de la última copia." icono={<WifiOff size={28} />} />
      );
    }
    case "pagos":
      return <Pagos orgId={orgId} edificioId={edificioId} {...armarPropsPagos(copia.pagos)} />;
    case "mes":
      return <CierreMes orgId={orgId} edificioId={edificioId} {...armarPropsMes(copia.mes)} />;
    case "cortes":
      return <Cortes orgId={orgId} edificioId={edificioId} {...copia.cortes} puedeOperar={false} />;
    default:
      return null;
  }
}
