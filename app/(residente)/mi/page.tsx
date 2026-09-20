import { redirect } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * proxy.ts solo garantiza sesión para /mi/* (ver su comentario) — el
 * "rol" del residente acá no es un rol en sí, es tener al menos una
 * unidad asociada, y eso solo lo sabe `mis_unidades()` (RLS-scoped a la
 * sesión), así que se revalida acá como corresponde.
 *
 * El caso de "cuenta sin unidades" ya no ofrece aceptar una invitación acá
 * (componentes/residente/Invitacion.tsx existe pero quedó sin punto de
 * entrada a propósito) — registro/invitación de residentes está fuera del
 * alcance de la Fase 4, ver docs/estado-migracion.md bajo Fase 5.
 */
export default async function ResidenteHome() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
        <Card>
          <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>
            Sin unidades asociadas
          </h1>
          <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
            Su cuenta ({user.email}) todavía no está asociada a ninguna unidad. Contacte a su
            administración para que la vincule.
          </p>
          <form action="/api/auth/salir" method="post">
            <Button type="submit" variante="secundario" mini>
              Salir
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  redirect(`/mi/${unidades[0].unidad_id}/recibo`);
}
