/**
 * `jsqr` no publica tipos (ni un paquete `@types/jsqr`) — jsQR() en
 * garita.html:584 lo usa como respaldo de `BarcodeDetector` (ver
 * barcode-detector.d.ts), con esta misma forma.
 */
declare module "jsqr" {
  interface Punto {
    x: number;
    y: number;
  }

  interface CodigoQR {
    binaryData: number[];
    data: string;
    chunks: unknown[];
    version: number;
    location: {
      topRightCorner: Punto;
      topLeftCorner: Punto;
      bottomRightCorner: Punto;
      bottomLeftCorner: Punto;
      topRightFinderPattern: Punto;
      topLeftFinderPattern: Punto;
      bottomLeftFinderPattern: Punto;
      bottomRightAlignmentPattern?: Punto;
    };
  }

  interface OpcionesJsQR {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
  }

  function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    opciones?: OpcionesJsQR
  ): CodigoQR | null;

  export default jsQR;
}
