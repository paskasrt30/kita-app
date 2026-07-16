const CACHE_NAME = 'kita-app-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/manifest.json'
];

// Install: cache aset statis
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: bersihkan cache lama
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Fetch: network-first untuk API, cache-first untuk aset statis
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/api/')) {
        // Network-first: API selalu coba fetch terbaru, fallback jika offline
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(
                    JSON.stringify({ status: 'error', message: 'Kamu sedang offline. Data terbaru tidak bisa dimuat.' }),
                    { headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
    } else {
        // Cache-first untuk aset statis
        event.respondWith(
            caches.match(event.request).then((cached) => cached || fetch(event.request))
        );
    }
});
