<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vecitap — Contexto del proyecto

## Qué es esto
Sistema de administración de condominios. Fue construido originalmente por un socio
comercial no técnico vía "vibe coding" (con ayuda de Claude, sin supervisión de
ingeniería formal). Este proyecto es una auditoría técnica + migración para corregir
deuda técnica acumulada y validar la arquitectura: de 4 archivos HTML monolíticos
(React 18 + Babel standalone vía CDN, sin build step) a un proyecto Next.js real.

**El estado del plan de migración (qué fase está en curso, qué falta, pendientes
concretos de cada fase) vive en [`docs/estado-migracion.md`](docs/estado-migracion.md)
— se actualiza al cerrar cada fase. Este archivo (`AGENTS.md`) se toca rara vez: solo
stack, convenciones de arquitectura y reglas de gobierno que no cambian de una fase a
otra.**

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Hosting: Vercel — plan Hobby durante desarrollo, Pro obligatorio antes del
  lanzamiento comercial (el plan gratuito prohíbe uso comercial y Vecitap
  gestiona pagos)
- Backend/DB: Supabase — Free durante desarrollo, Pro antes del lanzamiento
  (el plan gratuito pausa el proyecto tras una semana sin actividad)
- Repo: github.com/vecitap/vecitap-app — rama de trabajo `optimization`
- Dominio vecitap.com vía Cloudflare (DNS apuntando a Vercel)

## Gobierno del proyecto
- **No avanzar de fase sin aprobación explícita de Nicolás.**
- **Fases 5 y 9 requieren revisión cruzada obligatoria** (con el chat estratégico de
  Claude.ai, no solo Claude Code).
- Flujo dual: Claude Code (esta herramienta) crea/edita archivos con aprobación de
  Nicolás; el chat de Claude.ai sirve de segunda opinión estratégica para
  arquitectura, análisis de seguridad y documentación.
- Cada cambio se revisa antes de aplicarse — no autoaprobar.
- Al cerrar cada fase: resumen breve antes de avanzar, y actualizar
  `docs/estado-migracion.md` (no este archivo).

## Convenciones de arquitectura
- Una sola app, rutas por rol (no monorepo): `app/(marketing)`, `app/(admin)/admin`,
  `app/(residente)/mi`, `app/(interno)/operador`, `app/api`
- Cliente Supabase tipado (`supabase gen types typescript`), no queries sueltas
- Lógica de negocio (cálculo de deuda, estados de suscripción, formateo) vive en
  `lib/` y `hooks/`, no en componentes
- `proxy.ts` (se llamaba `middleware.ts` hasta Next.js 15 — Next 16 renombró el
  archivo) refresca la sesión de Supabase en cada request y protege navegación/UX:
  por sesión para `/admin`, `/mi`, `/operador`, y además por rol (`es_operador()`)
  para `/operador/*` específicamente — **no reemplaza RLS de la base de datos**, son
  capas complementarias
- Fase 4 (Admin, ~5.318 líneas) es el módulo de mayor riesgo de cronograma —
  tratarlo con buffer extra de planificación

## Sistema de diseño
- Tokens de tema en `app/globals.css` (`:root` y `:root[data-theme="oscuro"]`) —
  **esa es la única fuente de verdad de la paleta**. No duplicar valores hex en
  este archivo ni en otros documentos; leerlos de ahí.
- Clave de `localStorage`: `vecitap-tema` — **no cambiarla**, es la misma de los
  HTML originales y romperla descartaría la preferencia de usuarios actuales.
- Componentes base en `components/ui/` — leen solo variables CSS, sin color
  hardcodeado.
- `/design-system` es vitrina interna de referencia, **no producto**: excluir del
  build de producción o proteger por rol antes del lanzamiento (Fase 7/9).
- Lección de testing (viene de un bug real de hidratación): probar también
  **recargando con la preferencia ya guardada**, no solo con carga limpia.

## Seguridad
- Todas las tablas tienen RLS activo; diseño evaluado como sólido (auditoría previa
  al desarrollo)
- Funciones de seguridad (`puede_operar`, `tiene_rol`, `es_operador`,
  `unidades_visibles`, `unidades_historico`, `edificios_visibles`,
  `periodos_corrientes`) usan `SECURITY DEFINER` con `search_path` fijo
  correctamente. Cualquier edición futura a estas funciones merece revisión
  cuidadosa: son el punto único de falla del aislamiento multi-tenant.
- Tablas bloqueadas intencionalmente al cliente (RLS activo, 0 políticas):
  `operadores`, `secretos`, `tasa_pendiente`. Llamarlas desde el frontend no da
  error — devuelve vacío en silencio.
- El rol (residente/administrador) es **por organización**, vía la tabla
  `membresias` — no hay un rol global del usuario ni claims de rol en el JWT.
  `es_operador()` (staff interno de Vecitap) sí es global.
- Solo la clave anon/publishable estuvo hardcodeada en el historial de commits;
  verificado sobre los 24 commits originales. No se requiere rotación.
- Pendientes de seguridad puntuales (por fase): ver `docs/estado-migracion.md`.

## Flujo de trabajo
- El proyecto vive en una carpeta sincronizada con OneDrive; `node_modules/` y
  `.next/` generan avisos de borrado masivo al recompilar (comportamiento normal)

## Comunicación con el socio comercial
No es técnico: requiere formatos visuales (gráficos, colores, lenguaje simple) en
vez de resúmenes técnicos escritos. Para deliverables usar el navy `--tinta` como
primario y `--acento` (naranja) para destacar — valores exactos en `globals.css`.

## Mantenimiento de este archivo
Este archivo cambia rara vez: solo cuando cambia el stack, una convención de
arquitectura, o una regla de gobierno del proyecto. El estado del plan (qué fase
está en curso, qué falta, pendientes concretos de cada fase) vive en
`docs/estado-migracion.md` y se actualiza al cerrar cada fase — no acá. Si
`CLAUDE.md` también existe, este archivo (`AGENTS.md`) es el principal; `CLAUDE.md`
solo debe referenciarlo, no duplicar su contenido.