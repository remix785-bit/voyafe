import * as store from "./store.js";
import { initRouter, registerRoute } from "./router.js";

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

async function boot() {
  await store.init();

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

  const appMain = document.getElementById("app-view");
  const nav = document.getElementById("app-nav");
  initRouter(appMain, nav);

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
      .register("./sw.js")
      .then((registration) => {
        // Vérifie activement une mise à jour à chaque retour sur l'onglet,
        // plutôt que de dépendre uniquement des vérifications automatiques
        // du navigateur (peu fréquentes sur une SPA jamais rechargée).
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update();
        });
        registration.update();
      })
      .catch((err) => console.warn("SW registration failed", err));
  }
}

boot();
