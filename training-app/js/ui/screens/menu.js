// Écran "Plus" — regroupe les écrans secondaires pour que la barre de
// navigation du bas tienne sur un écran de téléphone (5 onglets max, cf.
// convention mobile standard) plutôt que les 9 précédents qui débordaient.

import * as store from "../../store.js";
import { Icon } from "../icons.js";

const ENTREES = [
  { route: "renfo", icon: "dumbbell", label: "Renfo", description: "Séances de renforcement musculaire de la semaine." },
  { route: "calculateur", icon: "calculator", label: "Calculateur", description: "Distance / allure / temps — utile sur piste ou en ligne droite." },
  { route: "nutrition", icon: "flame", label: "Nutrition", description: "Besoins glucidiques/hydriques du jour et de la course." },
  { route: "jour-course", icon: "flag", label: "Jour de course", description: "Fiche de pacing GAP-ajustée à partir d'un GPX." },
  { route: "profil", icon: "user", label: "Profil", description: "Performance de référence, poids, disponibilité hebdo." },
  { route: "reglages", icon: "gear", label: "Réglages", description: "Thème, backend GitHub, connexion Strava, sauvegarde." },
];

// Nombre de jours avant l'échéance à partir duquel "Jour de course" mérite
// d'être mis en avant — une liste toujours dans le même ordre plaçait cet
// écran au même niveau que Réglages (rarement visité) alors qu'il devient
// l'écran le plus utile de tout ce menu à l'approche d'une course.
const SEUIL_JOURS_MISE_EN_AVANT = 14;

export async function render(container) {
  const plan = store.planActif();
  const joursAvantEcheance = plan?.dateEcheance ? Math.ceil((new Date(plan.dateEcheance) - new Date()) / 86400000) : null;
  const echeanceProche = joursAvantEcheance != null && joursAvantEcheance >= 0 && joursAvantEcheance <= SEUIL_JOURS_MISE_EN_AVANT;

  const entrees = echeanceProche
    ? [ENTREES.find((e) => e.route === "jour-course"), ...ENTREES.filter((e) => e.route !== "jour-course")]
    : ENTREES;

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Plus</h1>
        <p class="muted">Renfo, nutrition, jour de course, profil et réglages.</p>
        ${echeanceProche ? `<p class="badge-info">Échéance dans ${joursAvantEcheance} jour${joursAvantEcheance > 1 ? "s" : ""} — Jour de course mis en avant.</p>` : ""}
      </div>
      <div class="card" style="padding:0;">
        ${entrees
          .map(
            (e) => `
          <a href="#/${e.route}" class="menu-entry">
            <span class="menu-entry__icon">${Icon(e.icon)}</span>
            <span class="menu-entry__text">
              <span class="menu-entry__label">${e.label}</span>
              <span class="muted">${e.description}</span>
            </span>
            <span class="menu-entry__chevron">›</span>
          </a>`
          )
          .join("")}
      </div>
    </div>`;
}
