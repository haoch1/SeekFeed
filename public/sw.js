// Only static assets are cached. Sessions and configuration never enter CacheStorage.
const STATIC_CACHE = 'seekfeed-static-v1';
const STATIC_ASSETS = [
    '/css/skeleton.css', '/css/charts.css', '/css/workspace.css',
    '/js/home.js', '/js/init.js', '/js/pwa-register.js', '/js/pwa-check.js', '/manifest.json',
    '/icons/seekfeed.svg', '/icons/ui.svg', '/icons/seekfeed-192.png', '/icons/seekfeed-512.png',
];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('seekfeed-') && key !== STATIC_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname)) return;
    event.respondWith(fetch(request).then(response => {
        if (response.ok) event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone())));
        return response;
    }).catch(() => caches.match(request)));
});
