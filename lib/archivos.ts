/**
 * Validación, compresión y huella del comprobante de pago. Todo corre en
 * el navegador (canvas, crypto.subtle) — solo lo importan componentes
 * cliente.
 */

export const MAX_BYTES_COMPROBANTE = 5 * 1024 * 1024;
export const ACEPTA_COMPROBANTE = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";

type FirmaArchivo = { tipo: "image/jpeg" | "image/png" | "application/pdf"; bytes: number[] };

const FIRMAS: FirmaArchivo[] = [
  { tipo: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { tipo: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { tipo: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

/**
 * Fase 4 (fix 1): la extensión y el `type` que reporta el navegador se
 * falsean con solo renombrar el archivo — esto lee los primeros bytes y
 * los compara contra la firma real de jpg/png/pdf. Devuelve `null` si el
 * archivo no es ninguno de los tres formatos aceptados.
 */
export async function tipoRealComprobante(archivo: File): Promise<FirmaArchivo["tipo"] | null> {
  const cabecera = new Uint8Array(await archivo.slice(0, 4).arrayBuffer());
  const firma = FIRMAS.find((f) => f.bytes.every((b, i) => cabecera[i] === b));
  return firma?.tipo ?? null;
}

/** Igual que en residente.html: reduce el lado mayor a 1600px si la foto
 * pesa más de 900KB. Los PDF no pasan por acá. */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!/^image\//.test(archivo.type) || archivo.size < 900 * 1024) return archivo;
  try {
    const url = URL.createObjectURL(archivo);
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = mal;
      i.src = url;
    });
    const lado = Math.max(img.width, img.height);
    const escala = lado > 1600 ? 1600 / lado : 1;
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * escala);
    c.height = Math.round(img.height * escala);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

export async function huellaArchivo(archivo: File): Promise<string | null> {
  try {
    const buf = await archivo.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
