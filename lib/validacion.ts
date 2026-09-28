/**
 * Formato de UUID (v1–v5, el que usa Postgres con `gen_random_uuid()`).
 *
 * orgId/edificioId/unidadId llegan crudos desde el segmento dinámico de la
 * URL — nunca tipados por Next.js — y antes de este helper se mandaban tal
 * cual a la primera consulta o RPC que los usara. Un id mal formado (typo,
 * URL armada a mano, un bot probando rutas) no producía un 404 limpio: caía
 * en el mensaje de error de sintaxis de Postgres ("invalid input syntax for
 * type uuid"), que en proxy.ts ya se trata como fail-closed pero es un error
 * genérico, no una validación explícita. Se valida ACÁ, en el primer punto
 * donde el id llega del URL (proxy.ts y cada layout/page que lo recibe
 * directo de `params`), antes de la primera consulta — no en cada página
 * hija de un layout que ya lo validó.
 */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function esUuid(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && RE_UUID.test(valor);
}
