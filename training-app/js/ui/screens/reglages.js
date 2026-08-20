import * as store from "../../store.js";
import { verifierAcces } from "../../data/githubSync.js";
import { verifierAcces as verifierAccesStrava } from "../../data/stravaSync.js";
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
        <p class="muted">Optionnel — tes données sont déjà sauvegardées sur cet appareil (IndexedDB). Ceci ne fait pour l'instant que <strong>tester la connexion</strong> ; la sauvegarde/restauration automatique via GitHub n'est pas encore branchée. Utilise « Exporter en JSON » ci-dessous pour une sauvegarde manuelle en attendant.</p>
        <p class="muted">Si tu veux quand même le configurer : crée un dépôt <strong>privé</strong> sur GitHub dédié aux données (différent du dépôt de code, ex. <code>voyafe-training-data</code>), puis un <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">Personal Access Token</a> (fine-grained) limité à ce seul dépôt avec la permission <strong>Contents: Read and write</strong>.</p>
        <div class="field-row">
          <div class="field"><label for="gh-owner">Propriétaire (ton nom d'utilisateur GitHub)</label><input id="gh-owner" value="${escapeAttr(reglages.githubOwner)}" /></div>
          <div class="field"><label for="gh-repo">Dépôt de données (nom du dépôt privé créé ci-dessus)</label><input id="gh-repo" value="${escapeAttr(reglages.githubRepo)}" /></div>
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
        <p class="muted">Sur <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a>, copie le champ « Your Access Token » (pas le Client ID ni le Client Secret). ⚠️ Ce token <strong>expire au bout d'environ 6 heures</strong> — s'il est refusé (« invalide ou expiré »), retourne sur cette page, régénère-le, recolle-le puis re-teste tout de suite.</p>
        <div class="field">
          <label for="strava-token">Token d'accès</label>
          <input id="strava-token" type="password" value="${escapeAttr(reglages.stravaToken)}" />
        </div>
        <div class="row">
          <button class="btn btn--primary" id="strava-save">Enregistrer</button>
          <button class="btn" id="strava-test">Tester la connexion</button>
          <button class="btn" id="strava-sync">Synchroniser maintenant</button>
        </div>
        <p id="strava-status" class="muted">${reglages.stravaDerniereSyncLe ? `Dernière synchro : ${new Date(reglages.stravaDerniereSyncLe).toLocaleString("fr-FR")}` : "Jamais synchronisé."}</p>
        <p class="muted">La synchro rapproche automatiquement chaque activité d'une séance planifiée du même jour (marquée réalisée) et alimente le calcul de charge (ACWR/EWMA) avec la durée réelle plutôt que le RPE déclaré seul.</p>
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
    container.querySelector("#strava-status").textContent = "Enregistré.";
  });

  container.querySelector("#strava-test").addEventListener("click", async () => {
    const statusEl = container.querySelector("#strava-status");
    statusEl.textContent = "Test en cours...";
    try {
      const res = await verifierAccesStrava({ token: container.querySelector("#strava-token").value });
      statusEl.textContent = res.ok ? `Connexion OK — ${res.athlete.prenom} ${res.athlete.nom}.` : `Échec : ${res.raison}`;
    } catch (err) {
      statusEl.textContent = `Erreur réseau : ${err.message}`;
    }
  });

  container.querySelector("#strava-sync").addEventListener("click", async () => {
    const statusEl = container.querySelector("#strava-status");
    statusEl.textContent = "Synchronisation en cours...";
    try {
      const { nouvelles, rapprochees, totalRecuperees } = await store.synchroniserStrava();
      statusEl.textContent = `${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""} activité${nouvelles > 1 ? "s" : ""} (sur ${totalRecuperees} récupérée${totalRecuperees > 1 ? "s" : ""}), ${rapprochees} rapprochée${rapprochees > 1 ? "s" : ""} d'une séance planifiée.`;
    } catch (err) {
      statusEl.textContent = `Erreur : ${err.message}`;
    }
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
