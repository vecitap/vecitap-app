import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { CONTACTO_VECITAP, enlaceCorreoVecitap, enlaceWhatsappVecitap } from "@/lib/contacto-vecitap";

/**
 * Lo que ve en /admin una cuenta sin ninguna administradora (ronda 9, D1,
 * caso 102). Antes le ofrecía «Nueva administradora» y cualquiera podía
 * crearse una y quedar de dueña; desde el 28-oct (decisión de Gustavo) solo
 * Vecitap crea administradoras —la base lo exige en crear_organizacion()—.
 *
 * Ronda 10 (A3, caso 107): WhatsApp primero, con el mensaje ya escrito, y el
 * correo debajo, como respaldo. El número y el correo viven en
 * `lib/contacto-vecitap.ts`.
 */
export function SinAdministradora() {
  return (
    <Card style={{ maxWidth: 480, width: "100%" }}>
      <h2 style={{ marginTop: 0, fontFamily: "var(--font-titulos)", fontSize: 18 }}>Esta cuenta no administra ningún edificio</h2>
      <p style={{ fontSize: 14, color: "var(--tinta-2)", lineHeight: 1.6 }}>
        Para usar Vecitap como administradora, hay que escribirle a Vecitap.
      </p>
      <a
        href={enlaceWhatsappVecitap()}
        target="_blank"
        rel="noreferrer"
        className="btn"
        style={{ textDecoration: "none", width: "100%", justifyContent: "center" }}
      >
        <MessageCircle size={17} /> Escribir por WhatsApp
      </a>
      <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 8, textAlign: "center" }}>
        <span className="mono">{CONTACTO_VECITAP.whatsappVisible}</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--tinta-2)", marginTop: 10, textAlign: "center" }}>
        o por correo: <a href={enlaceCorreoVecitap()}>{CONTACTO_VECITAP.correo}</a>
      </div>
      <p style={{ fontSize: 13, color: "var(--tenue)", lineHeight: 1.6, marginBottom: 0 }}>
        Si es propietario o inquilino, su recibo está en <Link href="/mi">el portal de su unidad</Link>, con el código de
        invitación que le mandó su administración.
      </p>
    </Card>
  );
}
