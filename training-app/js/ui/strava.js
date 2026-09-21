import {
  getStravaConfig,
  setStravaConfig,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  getStoredToken,
  fetchAthleteActivities,
  mapStravaActivityToResultat,
} from "../data/stravaSync.js";
import { escapeHtml, formatDateFr, card, badge } from "./components.js";

export async function renderStrava(params, container) {
  const config = getStravaConfig() ?? {};
  const token = getStoredToken();
  const connecte = !!token?.access_token;

  if (params.code) {
    try {
      await exchangeCodeForToken(params.code);
      window.location.hash = "#/strava";
      return;
    } catch (err) {
      container.innerHTML = card(`<p>Échec de la connexion Strava : ${err.message}</p>`);
      return;
    }
  }

  container.innerHTML = `
    ${card(`
      <h2>Strava ${connecte ? badge("Connecté", "ok") : badge("Non connecté", "muted")}</h2>
      <p class="muted" style="font-size:0.8rem">
        Cette app n'a pas de backend : le client_secret que tu saisis ci-dessous est stocké dans le
        navigateur (localStorage), pas de façon sécurisée. N'utilise pas un compte Strava sensible sans
        en avoir conscience.
      </p>
    `)}
    ${card(`
      <h3>Configuration de l'application Strava</h3>
      <form id="form-strava-config">
        <label for="clientId">Client ID</label>
        <input id="clientId" name="clientId" required value="${config.clientId ?? ""}" />

        <label for="clientSecret">Client Secret</label>
        <input id="clientSecret" name="clientSecret" type="password" required value="${config.clientSecret ?? ""}" />

        <label for="redirectUri">Redirect URI</label>
        <input id="redirectUri" name="redirectUri" required value="${config.redirectUri ?? window.location.origin + window.location.pathname + "#/strava"}" />

        <div style="margin-top:16px">
          <button type="submit" class="btn btn-secondary">Enregistrer la configuration</button>
        </div>
      </form>
    `)}
    ${card(`
      <h3>Connexion</h3>
      <button id="btn-connect" class="btn" ${connecte ? "disabled" : ""}>Se connecter à Strava</button>
      <button id="btn-sync" class="btn btn-secondary" ${connecte ? "" : "disabled"} style="margin-top:8px">Synchroniser maintenant</button>
      <p id="strava-msg" class="muted" style="font-size:0.8rem"></p>
      <div id="strava-activities"></div>
    `)}
  `;

  container.querySelector("#form-strava-config").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    setStravaConfig({
      clientId: data.get("clientId"),
      clientSecret: data.get("clientSecret"),
      redirectUri: data.get("redirectUri"),
    });
    container.querySelector("#strava-msg").textContent = "Configuration enregistrée.";
  });

  container.querySelector("#btn-connect").addEventListener("click", () => {
    try {
      window.location.href = buildAuthorizeUrl();
    } catch (err) {
      container.querySelector("#strava-msg").textContent = err.message;
    }
  });

  container.querySelector("#btn-sync")?.addEventListener("click", async () => {
    const msg = container.querySelector("#strava-msg");
    const list = container.querySelector("#strava-activities");
    msg.textContent = "Synchronisation en cours...";
    try {
      const activities = await fetchAthleteActivities({ perPage: 20 });
      const courses = activities.filter((a) => a.type === "Run" || a.type === "TrailRun").map(mapStravaActivityToResultat);
      msg.textContent = `${courses.length} activité(s) de course récupérée(s) depuis Strava.`;
      list.innerHTML = courses.length
        ? `<table>
            <thead><tr><th>Date</th><th>Nom</th><th>Distance</th></tr></thead>
            <tbody>
              ${courses
                .map(
                  (c) => `<tr><td>${formatDateFr(c.date)}</td><td>${escapeHtml(c.label)}</td><td>${(c.distanceM / 1000).toFixed(2)} km</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
          <p class="muted" style="font-size:0.78rem">Pour transformer une sortie en test de référence VDOT, saisis-la dans l'écran Profil.</p>`
        : "";
    } catch (err) {
      msg.textContent = `Échec de la synchronisation : ${err.message}`;
    }
  });
}
