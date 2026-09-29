import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type ArgsGaritaEntrada = Database["public"]["Functions"]["garita_entrada"]["Args"];

/**
 * Lo que hace falta para registrar una entrada, en los términos de la
 * pantalla y no en los de PostgREST. `unidadId` es `string | null` a
 * propósito: la garita registra entradas que no van a ninguna unidad
 * concreta (una visita sin anunciar que todavía no eligió a quién visita),
 * y eso se manda como `null` explícito, no omitiendo la clave.
 */
export type EntradaGarita = {
  edificioId: string;
  unidadId: string | null;
  nombre: string;
  documento?: string;
  placa?: string;
  invitacionId?: string;
  nota?: string;
};

/**
 * Llamada a `garita_entrada` con `p_unidad` nullable, que es el único punto
 * del módulo donde el tipo generado no alcanza.
 *
 * **Por qué hace falta el cast y por qué vive acá.** La firma real
 * (confirmada con `pg_get_functiondef` el 28-sep) es:
 *
 * ```
 * garita_entrada(p_edificio uuid, p_unidad uuid, p_nombre text,
 *                p_documento text DEFAULT NULL, p_placa text DEFAULT NULL,
 *                p_invitacion uuid DEFAULT NULL, p_nota text DEFAULT NULL)
 * ```
 *
 * `p_unidad` **no tiene `DEFAULT`**, a diferencia de los cuatro parámetros
 * de atrás. Por eso `types/supabase.ts` lo declara `p_unidad: string` sin
 * `| null`: el generador refleja bien que el parámetro es obligatorio
 * (sin `DEFAULT`, PostgREST no puede omitirlo). Lo que no expresa es que la
 * función **sí acepta `NULL` como valor** de ese parámetro obligatorio —
 * lo comprueba ella misma (`if p_unidad is not null and not exists (...)`).
 * Mandar `undefined` (que es como este cliente omite una clave) rompería la
 * llamada con "función no encontrada", porque Postgres no tendría con qué
 * completar un parámetro sin `DEFAULT`.
 *
 * El cast queda encerrado acá, en una sola línea de una función tipada, en
 * vez de repetirse en cada punto de `VistaEntrada.tsx` que registra una
 * entrada: si algún día se le pone `DEFAULT NULL` a `p_unidad` y se
 * regenera el tipo, hay un solo lugar que revisar.
 *
 * **No es idempotente:** cada llamada crea una visita nueva. Quien la llame
 * tiene que bloquear su propio botón mientras está en curso (ver
 * docs/estado-migracion.md, "Bloques 11 y 12").
 */
export function registrarEntradaGarita(
  supabase: SupabaseClient<Database>,
  entrada: EntradaGarita
) {
  const args: Omit<ArgsGaritaEntrada, "p_unidad"> & { p_unidad: string | null } = {
    p_edificio: entrada.edificioId,
    p_unidad: entrada.unidadId,
    p_nombre: entrada.nombre,
    p_documento: entrada.documento,
    p_placa: entrada.placa,
    p_invitacion: entrada.invitacionId,
    p_nota: entrada.nota,
  };

  return supabase.rpc("garita_entrada", args as ArgsGaritaEntrada);
}
