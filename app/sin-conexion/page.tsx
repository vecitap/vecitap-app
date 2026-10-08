import { Card, PantallaMarca } from "@/components/ui";
import { BotonReintentar } from "./BotonReintentar";

/**
 * "No pudimos conectar. Reintente", cuando el que no puede hablar con
 * Supabase es `proxy.ts` (ronda 3, punto 5).
 *
 * El caso que quedaba abierto desde el 05-oct: con el access token vencido,
 * el proxy tiene que renovarlo antes de saber si hay sesión. Si en ese
 * momento Auth no contesta, `getClaims()` vuelve con un error de conexión y
 * el proxy lo trataba como "sin sesión": mandaba a /entrar. Los layouts ya
 * distinguían los dos casos (`usuarioActual()` → `app/error.tsx`); el proxy,
 * que corre antes, no.
 *
 * El proxy no redirige acá: **reescribe** (la URL del navegador no cambia),
 * así "Reintentar" vuelve a pedir la misma página que se quería ver. La
 * sesión no se toca: auth-js no borra nada ante un error reintentable.
 *
 * Se puede abrir a mano (es una ruta pública), y no muestra nada sensible.
 */
export default function SinConexion() {
  return (
    <PantallaMarca>
      <Card>
        <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>No pudimos conectar. Reintente</h1>
        <p style={{ color: "var(--tinta-2)", fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          El servidor tardó demasiado en responder. Su sesión sigue abierta: no hace falta volver a entrar.
        </p>
        <BotonReintentar />
      </Card>
    </PantallaMarca>
  );
}
