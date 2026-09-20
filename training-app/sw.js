// Service worker minimal — cache l'app shell pour un fonctionnement hors ligne basique.
const CACHE_NAME = "voyafe-training-v1";
const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./js/app.js",
  "./js/router.js",
  "./js/data/db.js",
  "./js/data/repo.js",
  "./js/data/stravaSync.js",
  "./js/engines/vdot.js",
  "./js/engines/load.js",
  "./js/engines/gap.js",
  "./js/engines/planGenerator.js",
  "./js/catalog/sessionsRoute.js",
  "./js/catalog/sessionsTrail.js",
  "./js/catalog/renfo.js",
  "./js/ui/components.js",
  "./js/ui/dashboard.js",
  "./js/ui/saison.js",
  "./js/ui/plan.js",
  "./js/ui/seanceDetail.js",
  "./js/ui/profil.js",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
