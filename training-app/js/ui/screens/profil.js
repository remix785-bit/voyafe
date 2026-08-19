import * as store from "../../store.js";
import { vdotFromPerformance, paceZonesForVdot, formatPace } from "../../engines/vdot.js";

export async function render(container) {
  const { profil } = store.getState();

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Profil &amp; Tests</h1>
        <form id="form-profil">
          <div class="field-row">
            <div class="field">
              <label for="distance">Distance de référence (m)</label>
              <input type="number" id="distance" value="${profil?.performanceRef?.distanceM ?? 10000}" min="1000" max="60000" />
            </div>
            <div class="field">
              <label for="temps">Temps réalisé (mm:ss ou hh:mm:ss)</label>
              <input type="text" id="temps" value="${profil ? secondesVersLabel(profil.performanceRef.tempsS) : "40:00"}" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="poids">Poids (kg)</label>
              <input type="number" id="poids" value="${profil?.weightKg ?? 70}" min="30" max="150" />
            </div>
            <div class="field">
              <label for="dispo">Séances/semaine disponibles</label>
              <input type="number" id="dispo" value="${profil?.disponibiliteHebdo ?? 5}" min="2" max="7" />
            </div>
          </div>
          <button class="btn btn--primary" type="submit">Enregistrer et recalculer le VDOT</button>
        </form>
      </div>

      <div class="card" id="zones-card"></div>

      <div class="card">
        <h2>Historique VDOT</h2>
        <div id="vdot-history"></div>
      </div>

      <div class="card">
        <h2>Générer un plan</h2>
        <form id="form-plan">
          <div class="field">
            <label for="discipline">Discipline</label>
            <select id="discipline">
              <option value="route">Route</option>
              <option value="trail">Trail</option>
            </select>
          </div>
          <div class="field">
            <label for="objectif">Objectif</label>
            <input type="text" id="objectif" placeholder="ex: Marathon de Paris sub-3h30" />
          </div>
          <div class="field">
            <label for="echeance">Date de la course</label>
            <input type="date" id="echeance" />
          </div>
          <div class="field">
            <label for="charge">Charge hebdo actuelle</label>
            <select id="charge">
              <option value="faible">Faible</option>
              <option value="moderee" selected>Modérée</option>
              <option value="elevee">Élevée</option>
            </select>
          </div>
          <button class="btn btn--primary" type="submit">Générer le plan</button>
        </form>
      </div>
    </div>`;

  renderZones(container, profil);
  renderHistory(container, profil);

  container.querySelector("#form-profil").addEventListener("submit", async (e) => {
    e.preventDefault();
    const distanceM = Number(container.querySelector("#distance").value);
    const tempsS = labelVersSecondes(container.querySelector("#temps").value);
    const poids = Number(container.querySelector("#poids").value);
    const dispo = Number(container.querySelector("#dispo").value);
    const updated = await store.enregistrerProfil({ distanceM, tempsS, dateTest: new Date().toISOString() }, poids, dispo);
    renderZones(container, updated);
    renderHistory(container, updated);
  });

  container.querySelector("#form-plan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { profil: p } = store.getState();
    if (!p) {
      alert("Renseigne d'abord ton profil (performance de référence).");
      return;
    }
    const discipline = container.querySelector("#discipline").value;
    const objectif = container.querySelector("#objectif").value;
    const echeance = container.querySelector("#echeance").value;
    const charge = container.querySelector("#charge").value;
    if (!echeance) {
      alert("Choisis une date de course.");
      return;
    }
    await store.creerPlan({
      discipline,
      objectif,
      dateEcheance: new Date(echeance).toISOString(),
      dateDebut: new Date().toISOString(),
      performanceRef: p.performanceRef,
      nbSeancesHebdo: p.disponibiliteHebdo,
      chargeHebdoMoyenneActuelle: charge,
    });
    location.hash = "#/plan";
  });
}

function renderZones(container, profil) {
  const zonesCard = container.querySelector("#zones-card");
  if (!profil) {
    zonesCard.innerHTML = `<p class="muted">Renseigne une performance de référence pour calculer tes zones d'entraînement.</p>`;
    return;
  }
  const { vdot, warnings } = vdotFromPerformance(profil.performanceRef.distanceM, profil.performanceRef.tempsS);
  const zones = paceZonesForVdot(vdot);
  zonesCard.innerHTML = `
    <h2>VDOT actuel : <span class="data">${vdot.toFixed(1)}</span></h2>
    ${warnings.map((w) => `<p class="badge-warning">${escapeAttr(w)}</p>`).join("")}
    <table class="pacing-timeline">
      <thead><tr><th>Zone</th><th>Allure rapide</th><th>Allure cible</th><th>Allure lente</th></tr></thead>
      <tbody>
        ${Object.entries(zones)
          .map(
            ([z, v]) => `<tr><td><span class="zone-badge zone-badge--${z}">${z}</span></td><td class="data">${formatPace(v.fast)}</td><td class="data">${formatPace(v.target)}</td><td class="data">${formatPace(v.slow)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="muted" style="margin-top:8px;">Retest recommandé toutes les 4-6 semaines.</p>`;
}

function renderHistory(container, profil) {
  const el = container.querySelector("#vdot-history");
  const hist = profil?.historiqueVdot ?? [];
  if (!hist.length) {
    el.innerHTML = `<p class="muted">Pas encore d'historique — chaque génération de plan enregistre un point.</p>`;
    return;
  }
  el.innerHTML = `<div class="stack">${hist
    .map((h) => `<div class="row"><span class="muted">${new Date(h.date).toLocaleDateString("fr-FR")}</span><span class="data">${h.vdot.toFixed(1)}</span></div>`)
    .join("")}</div>`;
}

function secondesVersLabel(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function labelVersSecondes(label) {
  const parts = label.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(label) || 0;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
