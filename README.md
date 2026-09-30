# Vecitap

Sistema de administración de condominios. En migración de HTML+React vía CDN
a un proyecto Next.js real, en fases.

> **Los HTML originales no están en esta rama.** Viven en `main`, que está
> congelada y es la referencia de paridad. Se leen sin cambiar de rama:
> `git show main:admin.html`, `git show main:index.html`,
> `git show main:operador.html`, `git show main:garita.html`. Cuando un
> comentario del código dice `admin.html:3899`, se refiere a ese archivo en
> `main`. Ver [`AGENTS.md`](AGENTS.md).

Las fases:

1. Fundaciones (este scaffold)
2. Sistema de diseño compartido
3. Autenticación y capa de datos
4. Migración vertical por módulo — orden: Residente → Operador → Admin
5. Endurecimiento multi-tenant y de escala
6. Observabilidad y operación
7. CI/CD
8. Pruebas
9. Seguridad y lanzamiento

## Estructura

- `app/(marketing)` — sitio público y `/entrar` (compartido por los 4 roles)
- `app/(admin)/admin` — módulo del administrador de condominio
- `app/(residente)/mi` — módulo del residente
- `app/(interno)/operador` — back-office interno de Vecitap (acceso restringido)
- `app/(garita)/garita` — módulo de la garita (vigilantes)
- `app/auth/confirmar` — aterrizaje de los enlaces de correo de Supabase Auth
- `components/ui` — componentes de interfaz compartidos
- `components/{admin,residente,operador,garita}` — componentes por módulo
- `lib/` — cliente de datos, tokens de tema y toda la lógica de negocio
- `proxy.ts` — sesión y gates de rol (se llamaba `middleware.ts` hasta Next 15)
- `public/` — los únicos estáticos que sirve la app (logos)
- `hooks`, `types`, `tests`
- `docs/` — estado del plan, inventarios, consultas de producción, respaldo
- `supabase/migrations` y `supabase/rollbacks` — cambios de base, como archivo

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de Supabase
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).
