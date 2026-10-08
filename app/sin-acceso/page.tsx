import Link from "next/link";
import { Card, PantallaMarca } from "@/components/ui";
import { usuarioActual } from "@/lib/supabase/cache";

/**
 * A dónde va quien tiene sesión pero no el rol de la sección que pidió
 * (otra administradora, /operador sin ser operador, una garita que no es
 * suya). Lo usan las tres ramas de rechazo de `proxy.ts`,
 * `admin/[orgId]/layout.tsx` y `operador/page.tsx`.
 *
 * **Por qué una página y no un salto a /destino** (revisión cruzada de la
 * ronda 2, 08-oct): /destino y las rutas protegidas deciden con criterios
 * distintos — `administra_algo()` no filtra `membresias.activo` y
 * `tiene_rol()` sí, y el operador se resuelve aparte—. Hoy no hay bucle
 * porque /admin y /garita a secas no saltan solos a una sección, pero el día
 * que alguien agregue ese salto, "sin permiso → /destino → /admin → salto →
 * sin permiso" daría vueltas sin fin. Esta página corta en seco: no
 * redirige a ningún lado, solo ofrece los dos caminos.
 *
 * Antes del 08-oct estos rechazos iban a `/`, la portada de venta (prueba 7
 * del tramo 1).
 */
export default async function SinAcceso() {
  let correo: string | null = null;
  try {
    correo = (await usuarioActual())?.email ?? null;
  } catch {
    // Sin conexión con Auth: la página igual se muestra, sin el correo.
    correo = null;
  }

  return (
    <PantallaMarca>
      <Card>
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 20 }}>Sin acceso a esta sección</h1>
        <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.6 }}>
          {correo ? (
            <>
              La cuenta <strong>{correo}</strong> no tiene acceso a la sección que abrió.
            </>
          ) : (
            "Esta cuenta no tiene acceso a la sección que abrió."
          )}{" "}
          Si cree que debería tenerlo, pídaselo a su administración.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          <Link href="/destino" className="btn" style={{ textDecoration: "none" }}>
            Ir a mi inicio
          </Link>
          {/* Mismo patrón que los encabezados de los módulos: un <form> que
              postea a /api/auth/salir, sin JavaScript. */}
          <form action="/api/auth/salir" method="post">
            <button type="submit" className="btn btn-secundario">
              Salir
            </button>
          </form>
        </div>
      </Card>
    </PantallaMarca>
  );
}
