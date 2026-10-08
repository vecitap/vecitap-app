import { redirect } from "next/navigation";
import { Accesos, type CorreosFicha } from "@/components/admin/Accesos";
import { crearClienteServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cache";

/**
 * Portado de Accesos() en admin.html:3899-4252. Server Component: carga lo
 * que la pantalla necesita de arranque (unidades para el selector,
 * edificios para el selector de garita, y si el módulo `garita` está
 * contratado). Invitaciones, residentes y vigilantes son estado propio de
 * `<Accesos>` — ver el comentario en ese archivo.
 *
 * Las unidades van sin filtrar por `activa`, igual que el original: la
 * lista que recibe Accesos en `main` es la misma de App(), que no filtra.
 *
 * Ronda 2 (08-oct): las unidades traen además los correos de su ficha
 * (vínculos vigentes), para que "Invitar" los proponga y no haya que
 * escribirlos dos veces; y va el id de la cuenta, para no enviar nada si en
 * el navegador se abrió otra (`otraCuentaEnNavegador`).
 */
export default async function PaginaAccesos({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  // Memoizado por petición: el layout de la organización ya lo pidió.
  const user = await usuarioActual();
  if (!user) redirect(`/entrar?volver=/admin/${orgId}/${edificioId}/accesos`);

  const [{ data: unidades, error }, { data: edificios }, { data: modulos }] = await Promise.all([
    supabase
      .from("unidades")
      .select("id,codigo,vinculos(tipo,hasta,personas(correo))")
      .eq("edificio_id", edificioId)
      .order("codigo"),
    supabase.from("edificios").select("id,nombre").eq("org_id", orgId).order("nombre"),
    supabase.rpc("mis_modulos", { p_edificio: edificioId }),
  ]);
  if (error) throw error;

  const nombreEdificio = edificios?.find((e) => e.id === edificioId)?.nombre ?? "";
  // Si la consulta de módulos falla no se esconde nada, igual que el
  // original (admin.html:1071): es preferible un botón de más que una
  // pantalla mutilada sin causa visible.
  const garita = (modulos ?? []).find((m) => m.clave === "garita");
  const hayGarita = !modulos || !garita || garita.activo;

  const correosFicha: CorreosFicha = {};
  for (const u of unidades ?? []) {
    for (const v of u.vinculos ?? []) {
      const correo = v.personas?.correo?.trim().toLowerCase();
      if (v.hasta || !correo || (v.tipo !== "propietario" && v.tipo !== "inquilino")) continue;
      (correosFicha[u.id] ??= {})[v.tipo] = correo;
    }
  }

  return (
    <Accesos
      orgId={orgId}
      edificioId={edificioId}
      nombreEdificio={nombreEdificio}
      edificios={edificios ?? []}
      unidades={(unidades ?? []).map(({ id, codigo }) => ({ id, codigo }))}
      hayGarita={hayGarita}
      usuarioId={user.id}
      correosFicha={correosFicha}
    />
  );
}
