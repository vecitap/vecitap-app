import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { Invitacion } from "@/components/residente/Invitacion";
import { misUnidadesSesion } from "@/lib/residente/datos";
import { usuarioActual } from "@/lib/supabase/cache";

/**
 * "Agregar otra unidad" (05-oct): el formulario del código de invitación
 * para una cuenta que YA tiene unidades. Antes solo existía para una cuenta
 * sin ninguna (/mi → "Falta un paso"), así que una segunda invitación no
 * tenía dónde pegarse. Sirve también para una cuenta sin unidades: es el
 * destino del enlace que arma "Copiar el mensaje completo" en Accesos, con
 * `?codigo=` para dejar el campo lleno.
 *
 * Ruta estática: gana sobre `/mi/[unidadId]`, así que no pasa por ese
 * layout (no hace falta: acá no hay una unidad elegida).
 */
export default async function AgregarUnidad({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const codigoParam = Array.isArray(parametros.codigo) ? parametros.codigo[0] : parametros.codigo;
  // Un código es hexadecimal (crear_invitacion: 24 bytes → 48 caracteres).
  // Cualquier otra cosa en la URL no se pone en el campo.
  const codigo = codigoParam && /^[0-9a-f]{16,128}$/i.test(codigoParam.trim()) ? codigoParam.trim() : "";

  const user = await usuarioActual();
  if (!user) {
    const volver = codigo ? `/mi/agregar?codigo=${codigo}` : "/mi/agregar";
    redirect(`/entrar?volver=${encodeURIComponent(volver)}`);
  }

  const { data: unidades, error } = await misUnidadesSesion();
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

  return (
    <Invitacion
      correo={user.email ?? ""}
      unidadesPrevias={(unidades ?? []).map((u) => u.unidad_id)}
      codigoInicial={codigo}
    />
  );
}
