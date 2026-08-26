import * as store from "../../store.js";
import { verifierAcces } from "../../data/githubSync.js";
import { exporterJson, telechargerExport, importerJson } from "../../data/exportImport.js";
import { demanderPermission, permissionRefusee, verifierEtNotifierSeanceDuJour, notifierTest } from "../../notifications.js";

export async function render(container) {
  const { reglages } = store.getState();
  const notifDisponibles = "Notification" in window;

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
        <h2>Rappel de séance du jour</h2>
        <p class="muted">Une notification s'affiche quand tu ouvres l'appli et qu'une séance est planifiée aujourd'hui — pratique pour ne pas l'oublier avant de partir. Ne fonctionne que quand l'appli est ouverte ou revient au premier plan (pas de serveur de notifications derrière cette appli 100% statique, donc pas de rappel appli fermée).</p>
        ${
          !notifDisponibles
            ? `<p class="muted">Notifications non supportées par ce navigateur.</p>`
            : `<div class="row">
                 <button class="btn ${reglages.rappelSeanceActif ? "btn--primary" : ""}" id="rappel-toggle">${reglages.rappelSeanceActif ? "Désactiver" : "Activer"}</button>
                 ${reglages.rappelSeanceActif ? `<button class="btn" id="rappel-test">Tester une notification</button>` : ""}
               </div>
               <p id="rappel-status" class="muted">${permissionRefusee() ? "Autorisation refusée dans le navigateur — réactive-la dans les réglages du site (icône cadenas dans la barre d'adresse) pour utiliser ce rappel." : ""}</p>`
        }
      </div>

      <div class="card">
        <h2>Backend GitHub (Partie III §4)</h2>
        <p class="muted">Optionnel — tes données sont déjà sauvegardées sur cet appareil (IndexedDB). Une fois configuré ci-dessous, chaque modification (plan, séance, journal...) est <strong>automatiquement poussée</strong> vers ton dépôt de données (regroupée par lots de quelques secondes pour éviter un commit par clic), et un appareil sans données locales <strong>récupère automatiquement</strong> la dernière sauvegarde au démarrage — pratique pour utiliser l'appli sur plusieurs appareils. « Exporter en JSON » reste une sauvegarde de secours indépendante.</p>
        <p class="muted">Pour le configurer : crée un dépôt <strong>privé</strong> sur GitHub dédié aux données (différent du dépôt de code, ex. <code>voyafe-training-data</code>), puis un <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener">Personal Access Token</a> (fine-grained) limité à ce seul dépôt avec la permission <strong>Contents: Read and write</strong>.</p>
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
          <button class="btn" id="gh-sync">Synchroniser maintenant</button>
        </div>
        <p id="gh-status" class="muted">${reglages.githubDerniereSyncLe ? `Dernière synchro : ${new Date(reglages.githubDerniereSyncLe).toLocaleString("fr-FR")}` : "Jamais synchronisé."}${reglages.githubDerniereErreur ? ` — dernière erreur : ${escapeAttr(reglages.githubDerniereErreur)}` : ""}</p>
      </div>

      <div class="card">
        <h2>Strava (connexion OAuth — durable)</h2>
        ${
          reglages.stravaRefreshToken
            ? `<p class="muted">Connecté${reglages.stravaAthleteNom ? ` — <strong>${escapeAttr(reglages.stravaAthleteNom)}</strong>` : ""}. Le jeton se renouvelle automatiquement en arrière-plan : plus besoin de rien recoller, même après 6h.</p>
               <div class="row">
                 <button class="btn" id="strava-test">Tester la connexion</button>
                 <button class="btn btn--primary" id="strava-sync">Synchroniser maintenant</button>
                 <button class="btn" id="strava-disconnect">Se déconnecter</button>
               </div>`
            : `<p class="muted">Crée une application sur <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a> — champ <strong>« Authorization Callback Domain »</strong> = <code>${escapeAttr(location.hostname)}</code>. Colle ensuite son Client ID et Client Secret ci-dessous et connecte-toi <strong>une seule fois</strong> : l'appli renouvellera le jeton toute seule ensuite.</p>
               <div class="field-row">
                 <div class="field"><label for="strava-client-id">Client ID</label><input id="strava-client-id" value="${escapeAttr(reglages.stravaClientId)}" /></div>
                 <div class="field"><label for="strava-client-secret">Client Secret</label><input id="strava-client-secret" type="password" value="${escapeAttr(reglages.stravaClientSecret)}" /></div>
               </div>
               <div class="row">
                 <button class="btn btn--primary" id="strava-connect">Se connecter à Strava</button>
               </div>`
        }
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

      <div class="card">
        <h2>Version de l'appli</h2>
        <p class="muted">Utile pour vérifier que l'appli a bien reçu une mise à jour — une PWA installée peut mettre du temps à détecter un nouveau déploiement.</p>
        <p id="version-status" class="muted">Vérification…</p>
        <button class="btn" id="version-check">Forcer la vérification de mise à jour</button>
      </div>
    </div>`;

  container.querySelectorAll("[data-theme-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      store.setTheme(btn.dataset.themeBtn);
      render(container);
    });
  });

  const rappelToggleBtn = container.querySelector("#rappel-toggle");
  if (rappelToggleBtn) {
    rappelToggleBtn.addEventListener("click", async () => {
      if (reglages.rappelSeanceActif) {
        store.sauvegarderReglages({ rappelSeanceActif: false });
        render(container);
        return;
      }
      const accordee = await demanderPermission();
      store.sauvegarderReglages({ rappelSeanceActif: accordee });
      if (accordee) verifierEtNotifierSeanceDuJour().catch(() => {});
      render(container);
    });
  }

  const rappelTestBtn = container.querySelector("#rappel-test");
  if (rappelTestBtn) {
    rappelTestBtn.addEventListener("click", async () => {
      const statusEl = container.querySelector("#rappel-status");
      try {
        await notifierTest();
        statusEl.textContent = "Notification de test envoyée.";
      } catch (err) {
        statusEl.textContent = `Erreur : ${err.message}`;
      }
    });
  }

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

  container.querySelector("#gh-sync").addEventListener("click", async () => {
    const statusEl = container.querySelector("#gh-status");
    statusEl.textContent = "Synchronisation en cours...";
    try {
      await store.synchroniserGithubMaintenant();
      statusEl.textContent = `Synchronisé — ${new Date().toLocaleString("fr-FR")}.`;
    } catch (err) {
      statusEl.textContent = `Erreur : ${err.message}`;
    }
  });

  const connectBtn = container.querySelector("#strava-connect");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      store.sauvegarderReglages({
        stravaClientId: container.querySelector("#strava-client-id").value.trim(),
        stravaClientSecret: container.querySelector("#strava-client-secret").value.trim(),
      });
      try {
        store.demarrerConnexionStrava();
      } catch (err) {
        container.querySelector("#strava-status").textContent = `Erreur : ${err.message}`;
      }
    });
  }

  const disconnectBtn = container.querySelector("#strava-disconnect");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", () => {
      store.deconnecterStrava();
      render(container);
    });
  }

  const stravaTestBtn = container.querySelector("#strava-test");
  if (stravaTestBtn) {
    stravaTestBtn.addEventListener("click", async () => {
      const statusEl = container.querySelector("#strava-status");
      statusEl.textContent = "Test en cours...";
      try {
        const res = await store.testerConnexionStrava();
        statusEl.textContent = res.ok ? `Connexion OK — ${res.athlete.prenom} ${res.athlete.nom}.` : `Échec : ${res.raison}`;
      } catch (err) {
        statusEl.textContent = `Erreur : ${err.message}`;
      }
    });
  }

  const stravaSyncBtn = container.querySelector("#strava-sync");
  if (stravaSyncBtn) {
    stravaSyncBtn.addEventListener("click", async () => {
      const statusEl = container.querySelector("#strava-status");
      statusEl.textContent = "Synchronisation en cours...";
      try {
        const { nouvelles, rapprochees, totalRecuperees } = await store.synchroniserStrava();
        statusEl.textContent = `${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""} activité${nouvelles > 1 ? "s" : ""} (sur ${totalRecuperees} récupérée${totalRecuperees > 1 ? "s" : ""}), ${rapprochees} rapprochée${rapprochees > 1 ? "s" : ""} d'une séance planifiée.`;
      } catch (err) {
        statusEl.textContent = `Erreur : ${err.message}`;
      }
    });
  }

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

  afficherVersionServiceWorker(container);
  container.querySelector("#version-check").addEventListener("click", async () => {
    const statusEl = container.querySelector("#version-status");
    statusEl.textContent = "Vérification en cours…";
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    afficherVersionServiceWorker(container);
  });
}

/**
 * Interroge directement le service worker qui contrôle CETTE page (pas
 * seulement le JS déjà chargé en mémoire, qui peut être périmé) pour
 * afficher sa version réelle — utile pour confirmer qu'une mise à jour a
 * bien été reçue, en particulier sur une PWA installée où le cache du
 * navigateur peut retarder la détection d'un nouveau déploiement.
 */
async function afficherVersionServiceWorker(container) {
  const statusEl = container.querySelector("#version-status");
  if (!statusEl) return;
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    statusEl.textContent = "Aucun service worker actif (hors-ligne au premier chargement, ou navigateur non compatible).";
    return;
  }
  try {
    const version = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error("délai dépassé")), 3000);
      channel.port1.onmessage = (e) => {
        clearTimeout(timeout);
        resolve(e.data?.version);
      };
      navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    });
    statusEl.textContent = version ? `Version active : ${version}.` : "Version inconnue.";
  } catch {
    statusEl.textContent = "Impossible de vérifier la version (le service worker n'a pas répondu).";
  }
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
