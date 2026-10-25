"use client";

import { forwardRef, type InputHTMLAttributes, type MouseEvent } from "react";
import { hoyLocalISO } from "@/lib/formato";
import { Input } from "./Input";

/**
 * Una fecha que se elige con el calendario del navegador (ronda 5, pedido de
 * Gustavo). Es el `<input type="date">` de siempre, con dos cosas más:
 *
 *  · Al tocarlo o hacer clic en cualquier parte se abre el calendario
 *    (`showPicker`). En computadora, el campo solo lo abría desde el iconito,
 *    y un clic en el texto editaba día/mes/año a mano.
 *  · Con `sinFuturo`, el calendario no deja elegir un día que todavía no
 *    pasó (`max` = hoy, en la hora de Venezuela). Igual hay que validar al
 *    guardar: escrita a mano, el navegador acepta cualquier fecha.
 *
 * El color del calendario y del iconito sigue al tema por `color-scheme`
 * (app/globals.css); antes, en el oscuro, el iconito no se veía.
 */
export const InputFecha = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { sinFuturo?: boolean }>(
  function InputFecha({ sinFuturo = false, max, onClick, ...props }, ref) {
    function abrir(e: MouseEvent<HTMLInputElement>) {
      onClick?.(e);
      try {
        e.currentTarget.showPicker?.();
      } catch {
        // Navegador viejo o sin gesto del usuario: queda el campo de siempre.
      }
    }
    return <Input ref={ref} {...props} type="date" max={max ?? (sinFuturo ? hoyLocalISO() : undefined)} onClick={abrir} />;
  }
);
