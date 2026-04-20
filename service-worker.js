const CACHE_NAME = "pwa-cache-vr7";
const urlsToCache = [/*"/", "/index.html", "/css/style.css", "/js/app.js"*/];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

self.addEventListener("activate", event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(name => !cacheWhitelist.includes(name))
                    .map(name => caches.delete(name))
            )
        )
    );
});
