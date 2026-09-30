import { notFound } from "next/navigation";

/**
 * `/design-system` es vitrina interna de referencia, **no producto**
 * (AGENTS.md, sistema de diseño). Acá se cierra en producción, que era el
 * pendiente anotado para la Fase 7/9.
 *
 * **Falla cerrado:** se ve solo si el build NO es de producción (`npm run
 * dev`) o si Vercel dice explícitamente que este deploy es un Preview. Todo
 * lo demás —`next start` local, producción de Vercel, cualquier otro
 * hosting— responde 404. Un 404 de verdad (`notFound()`), no un redirect ni
 * una pantalla de "no autorizado": desde afuera la ruta no existe.
 *
 * Se gatea en el layout y no en la página para que cubra de una vez
 * cualquier subruta que se agregue después.
 */
const VISIBLE = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";

export default function LayoutDesignSystem({ children }: { children: React.ReactNode }) {
  if (!VISIBLE) notFound();
  return <>{children}</>;
}
