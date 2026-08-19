import * as store from "../../store.js";
import { verifierAcces } from "../../data/githubSync.js";
import { exporterJson, telechargerExport, importerJson } from "../../data/exportImport.js";

export async function render(container) {
  const { reglages } = store.getState();

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Réglages</h1>
        <div class="field">
          <label>Thème</label>
          <div class="row">
            <button class="btn ${reglages.theme === "dark" ? "btn--primary" : ""}" data-theme-btn="dark">Sombre</button>
            <button class="btn ${reglages.theme === "light" ? "btn--primary" : ""}" data-theme-btn="light">Clair</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Backend GitHub (Partie III §4)</h2>
        <p class="muted">Dépôt PRIVÉ séparé du dépôt de code, PAT à portée restreinte, jamais commité.</p>
        <div class="field-row">
          <div class="field"><label for="gh-owner">Propriétaire</label><input id="gh-owner" value="${escapeAttr(reglages.githubOwner)}" /></div>
          <div class="field"><label for="gh-repo">Dépôt de données</label><input id="gh-repo" value="${escapeAttr(reglages.githubRepo)}" /></div>
        </div>
        <div class="field">
          <label for="gh-token">Personal Access Token</label>
          <input id="gh-token" type="password" value="${escapeAttr(reglages.githubToken)}" />
        </div>
        <div class="row">
          <button class="btn btn--primary" id="gh-save">Enregistrer</button>
          <button class="btn" id="gh-test">Tester la connexion</button>
        </div>
        <p id="gh-status" class="muted"></p>
      </div>

      <div class="card">
        <h2>Strava (Option A — token personnel)</h2>
        <p class="muted">Généré depuis la page des paramètres API Strava. Renouvellement manuel.</p>
        <div class="field">
          <label for="strava-token">Token d'accès</label>
          <input id="strava-token" type="password" value="${escapeAttr(reglages.stravaToken)}" />
        </div>
        <button class="btn btn--primary" id="strava-save">Enregistrer</button>
      </div>

      <div class="card">
        <h2>Sauvegarde locale</h2>
        <p class="muted">Solution de secours indépendante du backend GitHub.</p>
        <div class="row">
          <button class="btn" id="export-json">Exporter en JSON</button>
          <label class="btn" for="import-json-input" style="cursor:pointer;">Importer un JSON</label>
          <input type="file" id="import-json-input" accept="application/json" style="display:none;" />
        </div>
      </div>
    </div>`;

  container.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      store.setTheme(btn.dataset.themeBtn);
      render(container);
    });
  });

  container.querySelector("#gh-save").addEventListener("click", () => {
    store.sauvegarderReglages({
      githubOwner: container.querySelector("#gh-owner").value,
      githubRepo: container.querySelector("#gh-repo").value,
      githubToken: container.querySelector("#gh-token").value,
    });
    container.querySelector("#gh-status").textContent = "Enregistré.";
  });

  container.querySelector("#gh-test").addEventListener("click", async () => {
    const statusEl = container.querySelector("#gh-status");
    statusEl.textContent = "Test en cours...";
    try {
      const res = await verifierAcces({
        owner: container.querySelector("#gh-owner").value,
        repo: container.querySelector("#gh-repo").value,
        token: container.querySelector("#gh-token").value,
      });
      statusEl.textContent = res.ok ? "Connexion OK." : `Échec : ${res.raison}`;
    } catch (err) {
      statusEl.textContent = `Erreur réseau : ${err.message}`;
    }
  });

  container.querySelector("#strava-save").addEventListener("click", () => {
    store.sauvegarderReglages({ stravaToken: container.querySelector("#strava-token").value });
  });

  container.querySelector("#export-json").addEventListener("click", async () => {
    const json = await exporterJson();
    telechargerExport(json);
  });

  container.querySelector("#import-json-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await importerJson(text);
    location.reload();
  });
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
