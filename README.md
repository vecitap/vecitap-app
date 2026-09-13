# Vecitap

Sistema de administración de condominios. En migración de HTML+React vía CDN
(`app.html`, `residente.html`, `operador.html`, `vecitap.html` — se mantienen
en la raíz sin tocar mientras dura la migración) a un proyecto Next.js real,
en fases:

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

- `app/(marketing)` — sitio público
- `app/(admin)/admin` — módulo del administrador de condominio
- `app/(residente)/mi` — módulo del residente
- `app/(interno)/operador` — back-office interno de Vecitap (acceso restringido)
- `components/ui` — componentes de interfaz compartidos
- `components/{admin,residente,operador}` — componentes específicos por módulo
- `lib/supabase`, `lib/theme`, `lib/auth` — cliente de datos, tokens de tema, helpers de sesión
- `hooks`, `types`, `tests`

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de Supabase
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).
