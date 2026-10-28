import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { firmaValida } from "@/lib/resend-firma";

/**
 * Avisos de Resend (ronda 9, A3, caso 101): entregado, rebotado, demorado,
 * marcado como spam, abierto. Resend manda un POST por evento, firmado con
 * Svix; esta ruta verifica la firma y le pasa el evento a la base
 * (`registrar_evento_correo()`, supabase/migrations/20261028130000_avisos_resend.sql),
 * que lo guarda en el correo de la cola y anota los rebotes en `correos_malos`.
 *
 * El secreto del webhook («whsec_…», el que muestra Resend al crearlo) va en
 * la variable de entorno RESEND_WEBHOOK_SECRET de Vercel, nunca en el repo.
 * Cada base tiene su propio webhook y su propio secreto: Production →
 * vecitap-produccion, Preview → vecitap-pruebas.
 *
 * Sin sesión (lo llama Resend, no una persona): va con la clave anónima. La
 * base no confía en eso: exige el mismo secreto y lo compara con su huella
 * (`secretos.webhook_resend_sha256`).
 *
 * Respuestas: 401 firma mala o vieja (Resend no reintenta un evento falso
 * para siempre: lo da por fallido); 200 para todo evento bien firmado,
 * también si el correo es de la otra base o el evento no interesa —si no,
 * Resend lo reintentaría—; 500 si la base no responde (Resend reintenta).
 *
 * Solo POST. Lo que dependa del método o del status se prueba contra
 * `next start` o un Preview, no contra `npm run dev` (AGENTS.md).
 */

type EventoResend = { type?: string; created_at?: string; data?: { email_id?: string; created_at?: string } };

export async function POST(request: Request) {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;
  if (!secreto) return NextResponse.json({ error: "Sin configurar" }, { status: 500 });

  // El cuerpo tal cual llegó: la firma es sobre los bytes, no sobre el JSON reescrito.
  const cuerpo = await request.text();
  const h = request.headers;
  if (!firmaValida(secreto, h.get("svix-id") ?? "", h.get("svix-timestamp") ?? "", cuerpo, h.get("svix-signature") ?? "")) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let evento: EventoResend;
  try {
    evento = JSON.parse(cuerpo) as EventoResend;
  } catch {
    return NextResponse.json({ resultado: "ignorado" });
  }
  const emailId = evento.data?.email_id;
  if (!evento.type || !emailId) return NextResponse.json({ resultado: "ignorado" });

  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("registrar_evento_correo", {
    p_clave: secreto,
    p_tipo: evento.type,
    p_email_id: emailId,
    p_en: evento.created_at ?? evento.data?.created_at ?? new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ resultado: data });
}
