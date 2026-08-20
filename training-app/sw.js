// Service worker — précache de l'app shell + cache runtime pour usage hors-ligne
// sur le terrain (Partie III §6). Pas de dépendance Workbox (pas d'accès au
// registre npm dans l'environnement de build) — implémentation manuelle minimale.

const CACHE_VERSION = "v2";
const CACHE_NAME = `voyafe-training-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./icons/icon.svg",
  "./js/app.js",
  "./js/router.js",
  "./js/store.js",
  "./js/catalog/protocols.js",
  "./js/catalog/renfo.js",
  "./js/catalog/sessionsRoute.js",
  "./js/catalog/sessionsTrail.js",
  "./js/data/db.js",
  "./js/data/exportImport.js",
  "./js/data/githubSync.js",
  "./js/data/stravaSync.js",
  "./js/engines/adaptiveLoop.js",
  "./js/engines/gap.js",
  "./js/engines/load.js",
  "./js/engines/nutrition.js",
  "./js/engines/pacing.js",
  "./js/engines/performance.js",
  "./js/engines/planGenerator.js",
  "./js/engines/vdot.js",
  "./js/ui/components.js",
  "./js/ui/screens/dashboard.js",
  "./js/ui/screens/historique.js",
  "./js/ui/screens/jourCourse.js",
  "./js/ui/screens/journal.js",
  "./js/ui/screens/menu.js",
  "./js/ui/screens/nutrition.js",
  "./js/ui/screens/plan.js",
  "./js/ui/screens/profil.js",
  "./js/ui/screens/reglages.js",
  "./js/ui/screens/renfo.js",
  "./js/ui/screens/seanceDetail.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // App shell : réseau d'abord, cache en secours hors-ligne. Un "cache d'abord"
  // servirait indéfiniment une version figée dès la première visite (l'appli
  // est une SPA en hash-routing, qui ne redéclenche jamais de vérification de
  // mise à jour du service worker via une navigation classique) — inacceptable
  // pendant le développement actif du plan. Le hors-ligne "sur le terrain"
  // (Partie III §6) reste couvert : le cache sert dès que le réseau échoue.
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Ressources externes (fonts, API) : réseau d'abord, pas de cache offline garanti.
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
