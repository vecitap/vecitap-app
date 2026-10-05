"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Campo, Card } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { mensajeDeError } from "@/lib/errores";

/**
 * Portado de LogoOrg() en admin.html:5619-5665.
 *
 * Los colores de Vecitap no se configuran: los fija el manual de marca. Lo
 * que sí es del cliente es su logo, que va en el recibo impreso y en el
 * estado de cuenta que recibe el propietario.
 *
 * El logo se guarda como **data-URL base64** dentro de
 * `organizaciones.logo_url`, no en Storage (así es en el original, y es lo
 * que espera el recibo en papel, que se abre en una ventana suelta sin
 * sesión y no podría pedir una URL firmada). Se reduce a 320 px de ancho
 * en el navegador con un `<canvas>` antes de guardarlo.
 */

/** admin.html:400-427 (`redimensionarLogo`). */
function redimensionarLogo(file: File, maxAncho = 320): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const esc = Math.min(1, maxAncho / img.width);
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * esc);
        cv.height = Math.round(img.height * esc);
        cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
        res(cv.toDataURL("image/png"));
      };
      img.onerror = () => rej(new Error("imagen inválida"));
      img.src = String(fr.result);
    };
    fr.onerror = () => rej(new Error("no se pudo leer"));
    fr.readAsDataURL(file);
  });
}

export function LogoOrg({
  orgId,
  nombre,
  logoUrl,
}: {
  orgId: string;
  nombre: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [logo, setLogo] = useState(logoUrl ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subirLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setLogo(await redimensionarLogo(file));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { error: e } = await supabase.from("organizaciones").update({ logo_url: logo || null }).eq("id", orgId);
    setOcupado(false);
    if (e) return setError(mensajeDeError(e));
    router.refresh();
  }

  return (
    <Card>
      <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Logo de la administradora</h2>
      <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
        Aparece en el recibo impreso y en el estado de cuenta que recibe el propietario.
      </p>
      {error && (
        <div style={{ marginBottom: 12 }}>
          <Aviso tono="rojo">{error}</Aviso>
        </div>
      )}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <Campo etiqueta="Archivo" ayuda="Se reduce a 320 px de ancho. PNG o JPG.">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => subirLogo(e.target.files?.[0])}
            className="control"
            style={{ padding: 9 }}
          />
        </Campo>
        <Campo etiqueta="Vista previa">
          <div
            style={{
              padding: 12,
              borderRadius: "var(--radio-chico)",
              background: "var(--fondo)",
              border: "1px solid var(--linea)",
              minHeight: 58,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" style={{ maxHeight: 34, maxWidth: 150 }} />
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--tenue)" }}>Sin logo cargado</span>
            )}
            <span style={{ fontFamily: "var(--font-titulos)", fontWeight: 600, fontSize: 13 }}>{nombre}</span>
          </div>
        </Campo>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Button type="button" disabled={ocupado} onClick={guardar}>
          Guardar logo
        </Button>
        {logo && (
          <Button type="button" variante="secundario" disabled={ocupado} onClick={() => setLogo("")}>
            Quitar
          </Button>
        )}
      </div>
    </Card>
  );
}
