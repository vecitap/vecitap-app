# Cómo cambiar la marca de la app

Cuando el diseñador entregue la versión final (logotipo, colores o letras), estos son los **únicos** lugares que hay que tocar. Ningún componente tiene colores, letras ni logotipos escritos por su cuenta.

| Qué cambia | Dónde | Cómo |
|---|---|---|
| **Logotipo** | `public/logo-claro.png` (para fondo claro) y `public/logo-oscuro.png` (para fondo oscuro) | Reemplazar los archivos **con el mismo nombre**. PNG con fondo transparente, unos 420 × 121 px. Si cambia la proporción, ajustar `420 / 121` en `components/ui/Logo.tsx`. |
| **Íconos del navegador** | `public/favicon-32.png` y `public/apple-touch-icon.png` | Reemplazar con el mismo nombre. |
| **Colores** | `app/globals.css`, bloque `:root` (tema claro) y `:root[data-theme="oscuro"]` | Cambiar el valor de cada variable (`--acento`, `--tinta`, `--fondo`…). Los `--marca-*` son el fondo oscuro de las pantallas de entrada, igual que el sitio de venta. |
| **Letras** | `lib/marca/fuentes.ts` | Cambiar el import y la llamada de la fuente. **No** cambiar el nombre de la variable (`--font-marca-titulos`, `--font-marca-texto`, `--font-marca-mono`). |
| **Sitio de venta** | `public/inicio.html` | Es HTML aparte, con sus propios colores al principio del archivo (`:root`). Hay que cambiarlos ahí también. |
| **Correos** | Plantillas de Supabase Auth (`docs/plantillas-correo/`) y las funciones de correo de la base | Van aparte: los correos no pueden leer los archivos de la app. |

**Regla:** si un cambio de marca obliga a tocar un componente, es que ese componente tiene un valor suelto. Se corrige moviéndolo a una variable, no parchando el componente.
