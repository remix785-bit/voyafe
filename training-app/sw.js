// Service worker — précache de l'app shell + cache runtime pour usage hors-ligne
// sur le terrain (Partie III §6). Pas de dépendance Workbox (pas d'accès au
// registre npm dans l'environnement de build) — implémentation manuelle minimale.

const CACHE_VERSION = "v34";
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
  "./js/notifications.js",
  "./js/catalog/protocols.js",
  "./js/catalog/renfo.js",
  "./js/catalog/sessionsRoute.js",
  "./js/catalog/sessionsTrail.js",
  "./js/data/db.js",
  "./js/data/exportImport.js",
  "./js/data/githubSync.js",
  "./js/data/icsExport.js",
  "./js/data/stravaSync.js",
  "./js/engines/adaptiveLoop.js",
  "./js/engines/gap.js",
  "./js/engines/geoMap.js",
  "./js/engines/load.js",
  "./js/engines/nutrition.js",
  "./js/engines/pacing.js",
  "./js/engines/performance.js",
  "./js/engines/planGenerator.js",
  "./js/engines/reminder.js",
  "./js/engines/structureSeance.js",
  "./js/engines/vdot.js",
  "./js/ui/components.js",
  "./js/ui/icons.js",
  "./js/ui/screens/calculateur.js",
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
    // cache:"no-store" sur la requête réseau elle-même (pas seulement sur la
    // stratégie ci-dessus) : sans ça, ce fetch() peut être silencieusement
    // satisfait par le cache HTTP du navigateur (en-têtes de cache de GitHub
    // Pages, non configurables ici) SANS jamais toucher le réseau — un vrai
    // déploiement peut alors rester invisible indéfiniment côté client, même
    // avec skipWaiting()/clients.claim() actifs côté service worker (bug
    // réel constaté : appli figée sur une ancienne version malgré plusieurs
    // rechargements complets). new Request(request, {cache:"no-store"})
    // force systématiquement un aller-retour réseau réel ; caches.put/match
    // ci-dessous continuent d'utiliser la requête originale comme clé.
    const requeteReseau = new Request(request, { cache: "no-store" });
    event.respondWith(
      fetch(requeteReseau)
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

// Répond à la version active (CACHE_VERSION) demandée par ui/screens/reglages.js
// — permet de vérifier depuis l'appli quel service worker contrôle réellement
// la page, indépendamment du JS déjà chargé en mémoire (potentiellement périmé).
self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});

// Clic sur le rappel de séance du jour (js/notifications.js) : ramène au
// premier plan un onglet déjà ouvert plutôt que d'en ouvrir un nouveau.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("./#/dashboard");
    })
  );
});
