// Écran "Plus" — regroupe les écrans secondaires pour que la barre de
// navigation du bas tienne sur un écran de téléphone (5 onglets max, cf.
// convention mobile standard) plutôt que les 9 précédents qui débordaient.

const ENTREES = [
  { route: "renfo", icon: "▲", label: "Renfo", description: "Séances de renforcement musculaire de la semaine." },
  { route: "nutrition", icon: "●", label: "Nutrition", description: "Besoins glucidiques/hydriques du jour et de la course." },
  { route: "jour-course", icon: "⟿", label: "Jour de course", description: "Fiche de pacing GAP-ajustée à partir d'un GPX." },
  { route: "profil", icon: "○", label: "Profil", description: "Performance de référence, poids, disponibilité hebdo." },
  { route: "reglages", icon: "⚙", label: "Réglages", description: "Thème, backend GitHub, connexion Strava, sauvegarde." },
];

export async function render(container) {
  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Plus</h1>
        <p class="muted">Renfo, nutrition, jour de course, profil et réglages.</p>
      </div>
      <div class="card" style="padding:0;">
        ${ENTREES.map(
          (e) => `
          <a href="#/${e.route}" class="menu-entry">
            <span class="menu-entry__icon">${e.icon}</span>
            <span class="menu-entry__text">
              <span class="menu-entry__label">${e.label}</span>
              <span class="muted">${e.description}</span>
            </span>
            <span class="menu-entry__chevron">›</span>
          </a>`
        ).join("")}
      </div>
    </div>`;
}
