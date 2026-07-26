const CACHE_VERSION = 'v1.0.4';
const CACHE_NAME = `fiesta-escaner-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  '/assets/js/api.js',
  '/assets/js/app.js',
  '/assets/js/tarjetas.js',
  '/assets/js/offline.js',
  '/assets/views/overlay-cargando.html',
  '/assets/views/login.html',
  '/assets/views/layout-logueado-inicio.html',
  '/assets/views/navbar.html',
  '/assets/views/sidebar.html',
  '/assets/views/notificaciones-toast.html',
  '/assets/views/main-inicio.html',
  '/assets/views/vista-escaner-qr.html',
  '/assets/views/vista-asistencias.html',
  '/assets/views/vista-sorteos-rifas.html',
  '/assets/views/vista-departamentos.html',
  '/assets/views/vista-empleados.html',
  '/assets/views/vista-eventos.html',
  '/assets/views/vista-sorteos-admin.html',
  '/assets/views/vista-premios.html',
  '/assets/views/vista-configuracion.html',
  '/assets/views/vista-usuarios-roles.html',
  '/assets/views/vista-permisos.html',
  '/assets/views/vista-tarjetas.html',
  '/assets/views/layout-logueado-fin.html',
  '/assets/views/modal-logout.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('SW install: some assets failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network first, fallback to offline queue
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      return cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => {
      return caches.match('/index.html');
    })
  );
});

async function handleApiRequest(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // If offline, return a synthetic response for certain endpoints
    if (request.method === 'POST' && request.url.includes('/api/asistencias')) {
      return new Response(JSON.stringify({ ok: true, offline: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Listen for messages from main thread to skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Auto-update logic
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('fiesta-escaner-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      // Notify all clients to reload
      const clients = await self.clients.matchAll();
      clients.forEach((client) => client.postMessage({ type: 'NEW_VERSION_AVAILABLE' }));
    })()
  );
  self.clients.claim();
});
