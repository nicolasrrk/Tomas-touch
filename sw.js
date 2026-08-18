// ── Service Worker: app shell offline básico ────────────────────
// Cachea el "app shell" (HTML/CSS/JS propios) con estrategia network-first
// para que se pueda seguir usando la app sin conexión, pero se actualice
// solo apenas haya red. Los pedidos a Supabase (datos del taller) NUNCA se
// interceptan: siempre van directo a la red, para no mostrar info vieja.
const CACHE_NAME = 'touch-servis-v1';

const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/ui.js',
  './js/storage.js',
  './js/orders.js',
  './js/quotes.js',
  './js/products.js',
  './js/caja.js',
  './js/icons.js',
  './js/main.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Dejar pasar todo lo que no sea un GET del propio sitio: Supabase
  // (API/Auth/Storage), el CDN de jsPDF, etc. — nunca se cachea ni intercepta.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.hostname.includes('supabase.co')) return;

  event.respondWith(networkFirst(req));
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Solo se cachean respuestas realmente OK: un 404/500 pasajero (deploy
    // en curso, hiccup del servidor) no debe quedar guardado como si fuera
    // válido — si no, una sesión offline posterior serviría ese error en
    // vez del app shell real.
    if (fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw e;
  }
}
