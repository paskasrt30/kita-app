const CACHE_NAME = 'kita-app-v2';
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

// Fetch: network-first untuk API maupun aset statis (cache cuma fallback offline)
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
        // Network-first untuk aset statis, supaya update kode langsung terpakai
        // begitu online, cache cuma jadi fallback saat offline (bukan sumber utama).
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    const resClone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
                    return res;
                })
                .catch(() => caches.match(event.request))
        );
    }
});
