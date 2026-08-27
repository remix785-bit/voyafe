import * as store from "./store.js";
import { initRouter, registerRoute } from "./router.js";
import { verifierEtNotifierSeanceDuJour } from "./notifications.js";

import * as dashboard from "./ui/screens/dashboard.js";
import * as plan from "./ui/screens/plan.js";
import * as seanceDetail from "./ui/screens/seanceDetail.js";
import * as profil from "./ui/screens/profil.js";
import * as renfo from "./ui/screens/renfo.js";
import * as nutrition from "./ui/screens/nutrition.js";
import * as jourCourse from "./ui/screens/jourCourse.js";
import * as historique from "./ui/screens/historique.js";
import * as journal from "./ui/screens/journal.js";
import * as reglages from "./ui/screens/reglages.js";
import * as menu from "./ui/screens/menu.js";
import * as calculateur from "./ui/screens/calculateur.js";
import { Icon } from "./ui/icons.js";

async function boot() {
  await store.init();

  // Retour du flux OAuth Strava (?code=... ajouté par Strava à l'URL de
  // redirection) : on échange le code contre les jetons durables puis on
  // nettoie l'URL pour ne pas la ré-échanger au prochain rechargement.
  const codeStrava = new URLSearchParams(location.search).get("code");
  if (codeStrava) {
    history.replaceState(null, "", location.pathname + location.hash);
    try {
      await store.finaliserConnexionStrava(codeStrava);
    } catch (err) {
      console.error("Connexion Strava échouée", err);
    }
    location.hash = "#/reglages";
  }

  registerRoute("dashboard", dashboard.render);
  registerRoute("plan", plan.render);
  registerRoute("seance", seanceDetail.render);
  registerRoute("profil", profil.render);
  registerRoute("renfo", renfo.render);
  registerRoute("nutrition", nutrition.render);
  registerRoute("jour-course", jourCourse.render);
  registerRoute("historique", historique.render);
  registerRoute("journal", journal.render);
  registerRoute("reglages", reglages.render);
  registerRoute("menu", menu.render);
  registerRoute("calculateur", calculateur.render);

  const appMain = document.getElementById("app-view");
  const nav = document.getElementById("app-nav");

  // Icônes ligne (icons.js) plutôt que les glyphes Unicode de index.html
  // (◆▤✎∿⋯) : injectées ici plutôt que codées en dur dans le HTML statique,
  // pour rester la seule source de vérité partagée avec menu.js.
  const NAV_ICONS = { dashboard: "home", plan: "calendar", journal: "pencil", historique: "chart", menu: "grid" };
  nav.querySelectorAll("[data-route]").forEach((a) => {
    const iconEl = a.querySelector(".icon");
    const name = NAV_ICONS[a.dataset.route];
    if (iconEl && name) iconEl.innerHTML = Icon(name);
  });

  initRouter(appMain, nav);

  // Rappel de séance du jour : au démarrage, puis à chaque retour au
  // premier plan (l'utilisateur peut ouvrir l'appli le matin, la laisser en
  // arrière-plan, puis y revenir plus tard le même jour — le
  // dédoublonnage dans notifications.js empêche un doublon dans ce cas).
  verifierEtNotifierSeanceDuJour().catch((err) => console.warn("Rappel de séance du jour échoué", err));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      verifierEtNotifierSeanceDuJour().catch((err) => console.warn("Rappel de séance du jour échoué", err));
    }
  });

  if ("serviceWorker" in navigator) {
    // Recharge automatiquement dès qu'un nouveau service worker prend le
    // contrôle : sans ça, un onglet resté ouvert continue d'exécuter le JS
    // déjà chargé en mémoire même après un déploiement (le SPA en
    // hash-routing ne redéclenche jamais de navigation complète qui
    // provoquerait ce rechargement naturellement).
    let dejaRecharge = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (dejaRecharge) return;
      dejaRecharge = true;
      location.reload();
    });

    navigator.serviceWorker
      // updateViaCache: "none" force le navigateur à toujours vérifier sw.js
      // sur le réseau (jamais depuis le cache HTTP) à chaque enregistrement —
      // sans ça, GitHub Pages sert sw.js avec ses propres en-têtes de cache
      // (non configurables sur Pages) et un navigateur, en particulier sur
      // mobile, peut continuer à considérer une ancienne version comme "à
      // jour" alors qu'elle a changé côté serveur.
      .register("./sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // Vérifie activement une mise à jour à chaque retour sur l'onglet,
        // plutôt que de dépendre uniquement des vérifications automatiques
        // du navigateur (peu fréquentes sur une SPA jamais rechargée).
        // "focus" en plus de "visibilitychange" : sur certains navigateurs
        // mobiles (PWA relancée depuis l'écran d'accueil), l'un des deux
        // événements peut ne pas se déclencher de façon fiable.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
        window.addEventListener("focus", () => registration.update());
        registration.update();
      })
      .catch((err) => console.warn("SW registration failed", err));
  }
}

boot();
