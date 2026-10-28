import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * Lo que ve en /admin una cuenta sin ninguna administradora (ronda 9, D1,
 * caso 102). Antes le ofrecía «Nueva administradora» y cualquiera podía
 * crearse una y quedar de dueña; desde el 28-oct (decisión de Gustavo) solo
 * Vecitap crea administradoras —la base lo exige en crear_organizacion()—.
 *
 * `CONTACTO_VECITAP`: cómo escribirle a Vecitap. **Lo completa Nicolás**; no
 * se inventan datos de contacto. Mientras sea null, la pantalla dice solo la
 * frase de abajo.
 */
const CONTACTO_VECITAP: string | null = null;

export function SinAdministradora() {
  return (
    <Card style={{ maxWidth: 480, width: "100%" }}>
      <h2 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Esta cuenta no administra ningún edificio</h2>
      <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.6, marginBottom: 0 }}>
        Para usar Vecitap como administradora, hay que escribirle a Vecitap.
        {CONTACTO_VECITAP && <> {CONTACTO_VECITAP}</>}
      </p>
      <p style={{ fontSize: 13, color: "var(--tenue)", lineHeight: 1.6, marginBottom: 0 }}>
        Si es propietario o inquilino, su recibo está en <Link href="/mi">el portal de su unidad</Link>, con el código de
        invitación que le mandó su administración.
      </p>
    </Card>
  );
}
