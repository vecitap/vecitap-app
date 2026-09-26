import { redirect } from "next/navigation";
import { ConsolaOperador } from "@/components/operador/ConsolaOperador";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Portado de App() en operador.html:201-537. proxy.ts ya redirige a quien
 * no tiene sesión o no es operador (único módulo donde el proxy chequea
 * rol, ver proxy.ts) — el chequeo de acá es la misma defensa en
 * profundidad que ya usa /mi con mis_unidades(), no una repetición inútil:
 * un Server Component no debería depender solo del proxy para autorizar.
 * La pantalla de configuración manual de Supabase (CONFIG) del original
 * tampoco se porta: en Next.js la URL y la clave anon vienen de variables
 * de entorno, no de un formulario en pantalla.
 */
export default async function OperadorHome() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar?volver=/operador");

  const { data: esOperador } = await supabase.rpc("es_operador");
  if (!esOperador) redirect("/");

  const [{ data: cartera, error }, { data: tareaLog }, { data: tasa }, { data: tasaLog }] = await Promise.all([
    supabase.rpc("cartera_operador"),
    supabase
      .from("tareas_log")
      .select("corrida_en,detalle")
      .eq("tarea", "cobros_suscripcion")
      .order("corrida_en", { ascending: false })
      .limit(1),
    supabase.rpc("tasa_atrasada"),
    supabase
      .from("tareas_log")
      .select("corrida_en,detalle")
      .eq("tarea", "tasa_bcv")
      .order("corrida_en", { ascending: false })
      .limit(1),
  ]);
  if (error) throw error;

  return (
    <ConsolaOperador
      cartera={cartera ?? []}
      tarea={tareaLog?.[0] ?? null}
      tasa={(Array.isArray(tasa) ? tasa[0] : tasa) ?? null}
      tasaTarea={tasaLog?.[0] ?? null}
      correo={user.email ?? ""}
    />
  );
}
