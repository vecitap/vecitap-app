/**
 * `BarcodeDetector` (Shape Detection API) todavía no está en lib.dom.d.ts de
 * TypeScript 5.9 — verificado, no hay match en node_modules/typescript/lib.
 * garita.html:548-550 la usa como lector nativo de QR, con jsQR (ver
 * jsqr.d.ts) solo como respaldo cuando el navegador no la trae. Soporte real
 * hoy: Chrome/Edge/Opera en Android y desktop; no Safari/Firefox — por eso el
 * código siempre comprueba `"BarcodeDetector" in window` antes de usarla.
 */
interface DeteccionCodigoBarras {
  readonly rawValue: string;
  readonly format: string;
}

declare class BarcodeDetector {
  constructor(opciones?: { formats: string[] });
  static getSupportedFormats(): Promise<string[]>;
  detect(fuente: CanvasImageSource): Promise<DeteccionCodigoBarras[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
