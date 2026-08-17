# Touch Servis

App interna de gestión para el taller: **órdenes de reparación**, **presupuestos**, **equipos nuevos/usados** y **caja**, con filtro por mes en cada sección y reporte mensual en PDF. 100% estática (HTML + CSS + JS con módulos ES, sin build step) con **Supabase** como backend (base de datos, autenticación y almacenamiento de fotos). Pensada para hostear gratis en **GitHub Pages**.

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
  orders.js            → módulo Órdenes: trabajos, abono/saldo, agrupado y filtrado por mes, PDF
  quotes.js             → módulo Presupuestos: ítems, PDF, "Convertir a Orden", filtrado por mes
  products.js          → módulo Nuevos/Usados: repuestos/gastos, abono/saldo, desglose de rentabilidad, filtrado por mes
  caja.js               → módulo Caja: movimientos filtrables por mes, saldo histórico, reporte mensual en PDF
  icons.js              → set de íconos SVG (sin emojis en toda la app)
  main.js                → router, wiring de eventos, arranque
legacy/
  touch-servis-localstorage.html → versión anterior (localStorage, sin login, un solo archivo). Se deja como referencia, no se usa más.
```

## Backend (Supabase)

Proyecto: **touch-servis** (org "Touch Servis", plan Free, región sa-east-1).

- **Tablas**: `orders` (con `deposit`/`delivered_at`), `order_works`, `quotes` + `quote_items` (presupuestos), `products` (columna `kind`: `nuevo`/`usado`, con `deposit`/`sold_at`), `product_costs` (repuestos/gastos aplicados a un equipo), `caja_movimientos` (con `source`/`source_id` para enlazar movimientos con su origen), `settings` (vacía, para configuración futura).
- **Triggers**: el total de `orders` y `quotes` se recalcula solo en la base (suma de `order_works`/`quote_items`) — no hay que pedirlo ni recalcularlo desde el cliente.
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
python scripts/dev-server.py 8080
```

Y abrís `http://localhost:8080`. (Es un `http.server` normal pero sin caché — evita ver una versión vieja de los archivos mientras estás probando cambios. También podés usar `python -m http.server 8080` si no te importa la caché.)

## Deploy a GitHub Pages

1. Subí este repo a GitHub
2. Settings → Pages → Deploy from branch → rama `main`, carpeta `/ (root)`
3. Listo, `index.html` es el entry point que GitHub Pages ya reconoce automáticamente

No hace falta ningún paso de build: es HTML/CSS/JS plano.

## Roadmap / próximos pasos sugeridos

Estructura pensada para crecer sin reescribir nada:

- **Roles**: hoy cualquier usuario autenticado tiene acceso total (pensado para un solo admin). Si sumás empleados con permisos distintos, se puede agregar una tabla `profiles` con `role` y ajustar las políticas RLS por rol.
- **Notificaciones al cliente**: la tabla `orders` ya tiene `phone` — se podría integrar WhatsApp/SMS cuando cambia el `status` o cuando se genera un presupuesto (vía una Supabase Edge Function).
- **Enviar presupuesto por WhatsApp**: hoy "Generar PDF" descarga el archivo; se podría agregar un botón que abra `wa.me` con el PDF adjunto o un link.
- **Catálogo público**: si en algún momento querés que los clientes vean los equipos `disponible` sin login, se puede agregar una policy de `SELECT` pública solo para `products` con `status = 'disponible'`, sin tocar el resto del esquema.
- **Búsqueda en Caja**: Órdenes, Presupuestos y Nuevos/Usados ya tienen buscador; Caja todavía no — el patrón ya está armado para copiarlo.
- **Cobro automático al entregar**: hoy el abono de una orden se actualiza a mano; se podría ofrecer "completar el saldo" con un solo botón al marcar `entregado`, igual que ya hace "Marcar vendido" en Nuevos/Usados.
- **Tabla `settings`**: ya existe vacía en la base — pensada para una futura pantalla de configuración (nombre del negocio, teléfono de contacto, logo, etc.) sin tener que migrar el esquema.
- **PWA**: agregar un `manifest.json` + service worker para poder "instalar" la app en el celular y tener soporte offline básico.
