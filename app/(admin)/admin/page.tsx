import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { CrearOrganizacion } from "@/components/admin/CrearOrganizacion";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Portado de la resolución de organización en App() (app.html:900-906):
 * si `organizaciones` trae una sola fila, se elige sola; si trae más de
 * una (o ninguna), se pide elegir/crear — antes Organizaciones()
 * (app.html:782-840). La alta de organización quedó fuera de la Sesión 1
 * (ver docs/estado-migracion.md); se agrega hoy porque sin ella una cuenta
 * nueva sin membresías no tiene forma de arrancar (ver
 * docs/casos-de-uso-mejorados.md).
 *
 * proxy.ts solo garantiza sesión acá (el gate por rol es por organización,
 * a partir de /admin/[orgId]/*), así que se revalida como corresponde.
 */
export default async function AdminHome() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?volver=/admin");

  const { data: orgs, error } = await supabase
    .from("organizaciones")
    .select("id,nombre,rif")
    .order("nombre");

  if (error) {
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
        <Card>
          <p style={{ color: "var(--rojo)", fontSize: 14, lineHeight: 1.6 }}>
            No se pudieron cargar sus administradoras. Intente recargar la página.
          </p>
        </Card>
      </main>
    );
  }

  if (!orgs || orgs.length === 0) {
    return (
      <main style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
        <CrearOrganizacion />
      </main>
    );
  }

  if (orgs.length === 1) redirect(`/admin/${orgs[0].id}`);

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, display: "grid", gap: 18 }}>
      <Card>
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Su administradora</h1>
        <div style={{ display: "grid", gap: 8 }}>
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/admin/${o.id}`}
              className="btn btn-secundario"
              style={{ textDecoration: "none", justifyContent: "space-between" }}
            >
              <span>{o.nombre}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--tenue)" }}>
                {o.rif || ""}
              </span>
            </Link>
          ))}
        </div>
      </Card>
      <CrearOrganizacion />
    </main>
  );
}
