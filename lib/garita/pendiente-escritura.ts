/**
 * Mensaje único para las acciones de escritura de Garita que todavía no
 * llaman a la base (bloques 11/12) — falta confirmar con
 * `pg_get_functiondef` el SQL real de `garita_entrada`/`garita_avisar`/
 * `garita_salida`/`garita_nota` (ver docs/estado-migracion.md). Mismo
 * criterio que `ImportarSaldos` en Admin: un aviso claro en vez de fingir
 * que la acción funciona — no se llama a ciegas a una función de escritura
 * sin haber visto antes su SQL.
 */
export function mensajePendienteEscritura(accion: string): string {
  return `"${accion}" todavía no está conectado a la base — falta confirmar el SQL de la función antes de escribir.`;
}
