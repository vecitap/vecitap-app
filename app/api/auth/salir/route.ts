import { NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  // 303, no el 307 que pone NextResponse.redirect() por omisión.
  //
  // Salir es un POST de formulario (los cuatro módulos tienen un
  // `<form action="/api/auth/salir" method="post">`, ver MarcoAdmin /
  // EncabezadoResidente / EncabezadoOperador / MarcoGarita). Con 307 el
  // navegador **repite el método**: volvía a hacer POST, ahora contra "/",
  // que es una página y solo atiende GET → HTTP 405 en pantalla (la sesión
  // sí quedaba cerrada, el error era posterior).
  //
  // 303 See Other es el status del patrón POST → redirect → GET: le dice al
  // navegador que siga el Location con GET. No 302: en la práctica los
  // navegadores también cambian a GET con 302, pero la especificación dice
  // que el método no debería cambiar; 303 lo declara sin ambigüedad.
  //
  // El borrado de cookies del signOut() de arriba viaja igual: Next mezcla
  // las cookies escritas vía cookies() en la respuesta que devuelve el
  // handler, conservando su status. Ver docs/estado-migracion.md.
  return NextResponse.redirect(new URL("/", request.url), 303);
}
