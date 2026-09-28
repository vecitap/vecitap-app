"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type jsQRTipo from "jsqr";

/**
 * Cámara + lectura de QR de garita.html:523-591. Prueba primero
 * `BarcodeDetector` nativo (nada que bajar); si el navegador no lo trae,
 * baja `jsQR` — acá por `import()` dinámico de un paquete de npm, no por
 * CDN como en el original (ver docs/estado-migracion.md, bloque 11), pero
 * con el mismo efecto: el chunk de jsQR solo se baja si hace falta.
 * 4-5 lecturas por segundo alcanzan (un intento cada 220ms, igual que el
 * original) — más que eso solo gasta batería sin mejorar la lectura.
 *
 * Se apaga sola al desmontar (acá cambiar de vista es cambiar de ruta, a
 * diferencia del estado en memoria del original) y en `pagehide`.
 */
export function useLectorQR(onDetectado: (codigo: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const flujoRef = useRef<MediaStream | null>(null);
  const animacionRef = useRef<number | null>(null);
  const [activa, setActiva] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDetectadoRef = useRef(onDetectado);
  // Escribir un ref durante el render está prohibido (react-hooks/refs) —
  // se sincroniza en un efecto, no en el cuerpo de la función.
  useEffect(() => {
    onDetectadoRef.current = onDetectado;
  });

  const cerrar = useCallback(() => {
    if (animacionRef.current !== null) {
      cancelAnimationFrame(animacionRef.current);
      animacionRef.current = null;
    }
    if (flujoRef.current) {
      flujoRef.current.getTracks().forEach((t) => t.stop());
      flujoRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setActiva(false);
  }, []);

  const abrir = useCallback(async () => {
    setError(null);
    const video = videoRef.current;
    if (!video) return;

    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch {
      setError("No se pudo abrir la cámara. Escriba el código a mano.");
      return;
    }
    flujoRef.current = flujo;
    video.srcObject = flujo;
    setActiva(true);
    await video.play().catch(() => {});

    let detector: BarcodeDetector | null = null;
    try {
      if (typeof window !== "undefined" && window.BarcodeDetector) {
        const tipos = await window.BarcodeDetector.getSupportedFormats();
        if (tipos.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      }
    } catch {
      detector = null;
    }

    let jsQR: typeof jsQRTipo | null = null;
    if (!detector) {
      try {
        jsQR = (await import("jsqr")).default;
      } catch {
        setError("Este equipo no puede leer el QR. Escriba el código a mano.");
        cerrar();
        return;
      }
    }

    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    let ultimo = 0;

    const mirar = async () => {
      animacionRef.current = requestAnimationFrame(mirar);
      if (!video.videoWidth) return;
      const ahora = performance.now();
      if (ahora - ultimo < 220) return;
      ultimo = ahora;

      let codigo: string | null = null;
      try {
        if (detector) {
          const r = await detector.detect(video);
          if (r && r[0]) codigo = r[0].rawValue;
        } else if (ctx && jsQR) {
          lienzo.width = video.videoWidth;
          lienzo.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const d = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          const r = jsQR(d.data, d.width, d.height);
          if (r) codigo = r.data;
        }
      } catch {
        // un cuadro fallido no importa
      }
      if (codigo) {
        cerrar();
        onDetectadoRef.current(codigo);
      }
    };
    mirar();
  }, [cerrar]);

  useEffect(() => {
    window.addEventListener("pagehide", cerrar);
    return () => {
      window.removeEventListener("pagehide", cerrar);
      cerrar();
    };
  }, [cerrar]);

  return { videoRef, activa, error, abrir, cerrar };
}
