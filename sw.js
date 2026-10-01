const CACHE_NAME = "sman-saku-v1.1.7";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data-seed.js",
  "./manifest.json",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Install Event - Pre-cache core shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Caching App Shell v1.0.5");
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[ServiceWorker] Some assets failed to pre-cache:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[ServiceWorker] Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Do not cache Supabase API calls or non-GET requests in SW cache
  if (req.method !== "GET" || url.hostname.includes("supabase.co")) {
    return;
  }

  // Network-First for scripts, styles, and HTML navigation so code updates apply immediately
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(req).then(cached => cached || (req.mode === "navigate" ? caches.match("./index.html") : null));
      })
    );
    return;
  }

  // Cache-first for images and static assets
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
