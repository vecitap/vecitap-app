/**
 * Portado de `armarTarjeta`/`componerTarjeta` en index.html:769-828 —
 * dibuja el QR de una invitación y lo compone en una tarjeta de 760×1060
 * con el edificio, la unidad, el nombre, el código en letras, el
 * vencimiento y el pie "powered by" con el logo de Vecitap.
 *
 * `qrcode` va instalado por npm (1.5.4, la misma versión que `main` baja
 * por CDN vía `import()`), no como script suelto: acá hay build step, así
 * que no hace falta el patrón de `main` de bajarlo en caliente. Igual se
 * importa de forma diferida (`await import("qrcode")`) para que el chunk
 * solo se baje en la pantalla de Mis visitas, no en el resto del portal.
 *
 * Solo tiene sentido llamar estas funciones desde el navegador (usan
 * `document`, `Image`, `canvas`) — quien las llama es siempre un Client
 * Component.
 */

export type DatosTarjeta = {
  edificio: string;
  unidadCodigo: string;
  nombre: string;
  codigo: string;
  hasta: string | null;
};

/** El QR solo, como data-URL — lo que se ve mientras se arma la tarjeta completa. */
export async function generarQR(codigo: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toDataURL(codigo, { margin: 1, width: 560, color: { dark: "#0A1128", light: "#FFFFFF" } });
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => mal(new Error(`No se pudo cargar la imagen: ${src}`));
    i.src = src;
  });
}

/** La tarjeta completa (QR + marca), lista para compartir/descargar/copiar. */
export async function componerTarjetaVisita(inv: DatosTarjeta, qrUrl: string): Promise<string> {
  const W = 760;
  const H = 1060;
  const P = 28;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  if (!x) throw new Error("Este navegador no puede dibujar en canvas.");

  x.fillStyle = "#F8FAFC";
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#FFFFFF";
  if (x.roundRect) {
    x.beginPath();
    x.roundRect(P, P, W - P * 2, H - P * 2, 26);
    x.fill();
  } else {
    x.fillRect(P, P, W - P * 2, H - P * 2);
  }

  const centro = (t: string, y: number, font: string, color: string) => {
    x.font = font;
    x.fillStyle = color;
    x.textAlign = "center";
    x.fillText(t, W / 2, y);
  };
  const F = "-apple-system, Segoe UI, Roboto, Arial, sans-serif";
  const M = "ui-monospace, Menlo, Consolas, monospace";

  centro((inv.edificio || "").toUpperCase(), 104, "600 21px " + F, "#64748B");
  centro("Unidad " + (inv.unidadCodigo || ""), 142, "700 30px " + F, "#0A1128");
  centro("Visita de", 200, "400 20px " + F, "#64748B");
  centro(inv.nombre || "", 240, "700 34px " + F, "#0A1128");

  const qr = await cargarImagen(qrUrl);
  const lado = 420;
  const qx = (W - lado) / 2;
  const qy = 286;
  x.fillStyle = "#FFFFFF";
  x.fillRect(qx - 14, qy - 14, lado + 28, lado + 28);
  x.drawImage(qr, qx, qy, lado, lado);

  centro(inv.codigo || "", qy + lado + 58, "700 27px " + M, "#0A1128");
  if (inv.hasta) {
    const d = new Date(inv.hasta).toLocaleString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    centro("Vence el " + d, qy + lado + 96, "400 21px " + F, "#92400E");
  }
  centro("Muéstrelo en la garita", qy + lado + 134, "400 20px " + F, "#64748B");

  // El pie de marca: "powered by" y el logo, como en el recibo en papel.
  const yPie = H - 96;
  x.strokeStyle = "#E4E9F0";
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(P + 40, yPie - 34);
  x.lineTo(W - P - 40, yPie - 34);
  x.stroke();
  centro("powered by", yPie, "400 17px " + F, "#64748B");
  try {
    const logo = await cargarImagen("/logo-claro.png");
    const alto = 30;
    const ancho = logo.width * (alto / logo.height);
    x.drawImage(logo, (W - ancho) / 2, yPie + 12, ancho, alto);
  } catch {
    centro("vecitap", yPie + 36, "700 27px " + F, "#0A1128");
  }
  return c.toDataURL("image/png");
}

export function nombreArchivoTarjeta(nombre: string): string {
  return (
    "visita-" +
    String(nombre || "invitado")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .toLowerCase()
      .replace(/^-|-$/g, "") +
    ".png"
  );
}
