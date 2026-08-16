# Touch Servis

App interna de gestión para el taller: **órdenes de reparación**, **equipos nuevos/usados** y **caja**. 100% estática (HTML + CSS + JS con módulos ES, sin build step) con **Supabase** como backend (base de datos, autenticación y almacenamiento de fotos). Pensada para hostear gratis en **GitHub Pages**.

## Estructura

```
index.html          → shell de la app + pantalla de login
css/styles.css       → todos los estilos
js/
  config.js          → URL y clave pública de Supabase (seguro exponerla, ver abajo)
  supabaseClient.js   → cliente Supabase compartido
  auth.js             → login/logout, sesión
  ui.js               → helpers: toasts, modal, formato de moneda/fecha, skeletons
  storage.js           → subir/listar/borrar fotos (URLs firmadas, buckets privados)
  orders.js            → módulo Órdenes (incluye generación de PDF)
  products.js          → módulo Nuevos/Usados (equipos)
  caja.js               → módulo Caja (movimientos de dinero)
  main.js                → router, wiring de eventos, arranque
legacy/
  touch-servis-localstorage.html → versión anterior (localStorage, sin login, un solo archivo). Se deja como referencia, no se usa más.
```

## Backend (Supabase)

Proyecto: **touch-servis** (org "Touch Servis", plan Free, región sa-east-1).

- **Tablas**: `orders`, `order_works`, `products` (columna `kind`: `nuevo`/`usado`), `product_costs` (repuestos/gastos aplicados a un equipo), `caja_movimientos`, `settings` (vacía, para configuración futura).
- **Storage**: buckets privados `order-photos` y `product-photos`, organizados en carpetas por `id` del registro. Las imágenes se muestran con **URLs firmadas** de 1 hora (se regeneran cada vez que se abre el detalle).
- **RLS (Row Level Security)**: todas las tablas y buckets solo permiten lectura/escritura a usuarios **autenticados**. No hay acceso público — toda la app queda detrás del login.
- La `publishable key` en `js/config.js` está pensada para ser pública (va en el código del sitio); la seguridad real la da RLS, no el secreto de esa clave. **Nunca** pongas ahí la `service_role key`.

### Crear el usuario admin

El login usa Supabase Auth (email + contraseña). Para crear el primer (y único) admin:

1. Entrá a [supabase.com/dashboard/project/hoftaznrwtazeaheafji/auth/users](https://supabase.com/dashboard/project/hoftaznrwtazeaheafji/auth/users)
2. **Add user** → **Create new user**
3. Cargá el email y una contraseña segura, marcá **Auto Confirm User**
4. Listo — con eso ya podés loguearte en la app

Para agregar más personas con acceso (a futuro), repetís el mismo paso.

## Correr en local

Como usa módulos ES (`<script type="module">`), **no podés abrir `index.html` directo con doble clic** (el navegador bloquea `import` sobre `file://`). Necesitás un servidor estático simple:

```bash
python -m http.server 8080
```

Y abrís `http://localhost:8080`.

## Deploy a GitHub Pages

1. Subí este repo a GitHub
2. Settings → Pages → Deploy from branch → rama `main`, carpeta `/ (root)`
3. Listo, `index.html` es el entry point que GitHub Pages ya reconoce automáticamente

No hace falta ningún paso de build: es HTML/CSS/JS plano.

## Roadmap / próximos pasos sugeridos

Estructura pensada para crecer sin reescribir nada:

- **Roles**: hoy cualquier usuario autenticado tiene acceso total (pensado para un solo admin). Si sumás empleados con permisos distintos, se puede agregar una tabla `profiles` con `role` y ajustar las políticas RLS por rol.
- **Notificaciones al cliente**: la tabla `orders` ya tiene `phone` — se podría integrar WhatsApp/SMS cuando cambia el `status` (vía una Supabase Edge Function).
- **Reportes**: `caja_movimientos` y `products` tienen todo lo necesario para armar un dashboard de rentabilidad mensual (Chart.js, por ejemplo).
- **Catálogo público**: si en algún momento querés que los clientes vean los equipos `disponible` sin login, se puede agregar una policy de `SELECT` pública solo para `products` con `status = 'disponible'`, sin tocar el resto del esquema.
- **Búsqueda en Caja/Nuevos-Usados**: hoy solo Órdenes tiene buscador; el patrón ya está armado en `orders.js` para copiarlo a los otros módulos.
- **Tabla `settings`**: ya existe vacía en la base — pensada para una futura pantalla de configuración (nombre del negocio, teléfono de contacto, logo, etc.) sin tener que migrar el esquema.
- **PWA**: agregar un `manifest.json` + service worker para poder "instalar" la app en el celular y tener soporte offline básico.
