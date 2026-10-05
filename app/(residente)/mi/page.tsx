import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { Invitacion } from "@/components/residente/Invitacion";
import { crearClienteServidor } from "@/lib/supabase/server";
import { usuarioActual } from "@/lib/supabase/cache";

/**
 * proxy.ts solo garantiza sesión para /mi/* (ver su comentario) — el
 * "rol" del residente acá no es un rol en sí, es tener al menos una
 * unidad asociada, y eso solo lo sabe `mis_unidades()` (RLS-scoped a la
 * sesión), así que se revalida acá como corresponde.
 *
 * El caso de "cuenta sin unidades" muestra `<Invitacion>` (27-sep,
 * adelantado de Fase 5 para el piloto — ver docs/casos-de-uso-mejorados.md
 * y el comentario en FormularioEntrar.tsx): sin esto, un residente que
 * acaba de crear su cuenta desde /entrar quedaba en un callejón sin
 * salida, sin forma de pegar el código de su invitación.
 */
export default async function ResidenteHome() {
  const supabase = await crearClienteServidor();
  // Sin conexión con Auth lanza ErrorSinConexion (lo muestra app/error.tsx);
  // null es solo "no hay sesión". Ver lib/supabase/cache.ts.
  const user = await usuarioActual();

  if (!user) redirect("/entrar?volver=/mi");

  const { data: unidades, error } = await supabase.rpc("mis_unidades");

  if (error) {
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
        <Card>
          <p style={{ color: "var(--rojo)", fontSize: 14, lineHeight: 1.6 }}>
            No se pudieron cargar sus unidades. Intente recargar la página.
          </p>
        </Card>
      </main>
    );
  }

  if (!unidades || unidades.length === 0) {
    return <Invitacion correo={user.email ?? ""} />;
  }

  redirect(`/mi/${unidades[0].unidad_id}/recibo`);
}
