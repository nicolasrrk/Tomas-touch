// ── Configuración Supabase ──────────────────────────────────────
// La "publishable key" está diseñada para ser pública (va en el HTML/JS
// del sitio). La seguridad real la dan las políticas RLS en la base de
// datos: solo usuarios autenticados (el admin) pueden leer/escribir.
// No pongas acá la "service_role key" — esa nunca debe salir del backend.
export const SUPABASE_URL = 'https://hoftaznrwtazeaheafji.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_d6qyoWDZu373HlSbKYW9Dw_Na81Rqwh';

// Buckets de Storage
export const BUCKET_ORDERS = 'order-photos';
export const BUCKET_PRODUCTS = 'product-photos';
