// =====================================================
// Service Worker — Portal de Clientes IM Servicios Contables
// =====================================================
// Estrategia: network-first para todo lo del propio portal.
// Siempre se intenta la red primero; el caché solo sirve como
// respaldo si no hay conexión. Las peticiones a Supabase NUNCA
// se interceptan ni se cachean, para no mostrar datos viejos
// como si fueran actuales.
//
// IMPORTANTE AL ACTUALIZAR EL PORTAL:
// Sube el número de CACHE_VERSION en cada despliegue importante.
// Eso borra automáticamente el caché anterior y evita que algún
// cliente se quede viendo una versión vieja del sitio.
// =====================================================

const CACHE_VERSION = 'v1';
const CACHE_NAME = `im-clientes-${CACHE_VERSION}`;

// Solo lo esencial para que la app abra ligero si no hay red.
// No se precachean páginas HTML: siempre deben pedirse frescas.
const PRECACHE_URLS = [
  'manifest.json',
  'assets/logo.png',
  'assets/icon-192.png',
  'assets/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar Supabase (ni datos ni autenticación ni Storage).
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Solo GET tiene sentido cachear/interceptar.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((respuestaRed) => {
        // Se guarda una copia en caché solo si la respuesta es válida,
        // como respaldo para cuando no haya conexión.
        const copia = respuestaRed.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuestaRed;
      })
      .catch(() => caches.match(event.request))
  );
});
