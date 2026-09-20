import { registerRoute, setNotFound, startRouter } from "./router.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderSaison } from "./ui/saison.js";
import { renderPlan } from "./ui/plan.js";
import { renderSeanceDetail } from "./ui/seanceDetail.js";
import { renderProfil } from "./ui/profil.js";
import { renderRenfo } from "./ui/renfo.js";
import { renderJournal } from "./ui/journal.js";
import { renderStrava } from "./ui/strava.js";
import { renderHistorique } from "./ui/historique.js";

registerRoute("dashboard", renderDashboard);
registerRoute("saison", renderSaison);
registerRoute("plan", renderPlan);
registerRoute("seance", renderSeanceDetail);
registerRoute("profil", renderProfil);
registerRoute("renfo", renderRenfo);
registerRoute("journal", renderJournal);
registerRoute("strava", renderStrava);
registerRoute("historique", renderHistorique);
setNotFound(() => `<div class="card"><p>Page introuvable.</p></div>`);

const screen = document.getElementById("app-screen");
startRouter(screen);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Échec de l'enregistrement du service worker", err);
    });
  });
}
