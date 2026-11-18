import { crearClienteNavegador } from "@/lib/supabase/client";
import { consultarPropietarios } from "@/lib/admin/pantallas/propietarios";
import { guardarCopia, type CopiaEdificio } from "./almacen";
import { VERSION_COPIA } from "./config";

/**
 * Baja la copia de un edificio desde el navegador, con la sesión del usuario
 * y la RLS de siempre (cambio 3, 1.1 e). Usa las mismas consultas que las
 * páginas: el usuario baja exactamente lo que ya puede ver.
 *
 * Prueba de concepto: Propietarios. La parte A completa la reemplaza por
 * `copia_edificio`, una sola llamada (plan, 1.1 g).
 */
export async function bajarCopia(params: {
  usuarioId: string;
  orgId: string;
  edificioId: string;
  edificioNombre: string;
}): Promise<CopiaEdificio> {
  const supabase = crearClienteNavegador();
  const propietarios = await consultarPropietarios(supabase, params.edificioId);
  const copia: CopiaEdificio = {
    edificioId: params.edificioId,
    orgId: params.orgId,
    edificioNombre: params.edificioNombre,
    version: VERSION_COPIA,
    sincronizadoEn: new Date().toISOString(),
    propietarios,
  };
  await guardarCopia(params.usuarioId, copia);
  return copia;
}
