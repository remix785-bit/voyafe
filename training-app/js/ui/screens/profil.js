import * as store from "../../store.js";
import { vdotFromPerformance, paceZonesForVdot, formatPace } from "../../engines/vdot.js";
import { calculerAllureObjectif } from "../../engines/planGenerator.js";

export async function render(container) {
  const { profil } = store.getState();
  const planExistant = store.planActif() ?? store.getState().plans[store.getState().plans.length - 1] ?? null;

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
        <h2>${planExistant ? "Modifier le plan" : "Générer un plan"}</h2>
        ${planExistant ? `<p class="muted">Change la distance, le temps objectif ou l'échéance puis mets à jour — les séances déjà réalisées/manquées restent enregistrées.</p>` : ""}
        <form id="form-plan">
          <div class="field">
            <label for="discipline">Discipline</label>
            <select id="discipline">
              <option value="route" ${planExistant?.discipline === "trail" ? "" : "selected"}>Route</option>
              <option value="trail" ${planExistant?.discipline === "trail" ? "selected" : ""}>Trail</option>
            </select>
          </div>
          <div class="field">
            <label for="objectif">Objectif (libellé)</label>
            <input type="text" id="objectif" value="${escapeAttr(planExistant?.objectif ?? "")}" placeholder="ex: Marathon de Paris sub-3h30" />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="distance-objectif">Distance de la course (km)</label>
              <input type="number" id="distance-objectif" step="0.001" min="0" value="${planExistant?.distanceObjectifM ? planExistant.distanceObjectifM / 1000 : ""}" placeholder="ex: 42.195" />
            </div>
            <div class="field">
              <label for="temps-objectif">Temps objectif (hh:mm:ss)</label>
              <input type="text" id="temps-objectif" value="${planExistant?.tempsObjectifS ? secondesVersLabel(planExistant.tempsObjectifS) : ""}" placeholder="ex: 3:30:00" />
            </div>
          </div>
          <p class="muted data" id="allure-objectif-preview"></p>
          <div class="field-row">
            <div class="field">
              <label for="debut-plan">Date de début du plan</label>
              <input type="date" id="debut-plan" value="${(planExistant?.dateDebutPlan ?? new Date().toISOString()).slice(0, 10)}" />
            </div>
            <div class="field">
              <label for="echeance">Date de la course</label>
              <input type="date" id="echeance" value="${planExistant?.dateEcheance ? planExistant.dateEcheance.slice(0, 10) : ""}" />
            </div>
          </div>
          <div class="field">
            <label>Jours d'entraînement</label>
            ${renderJoursCheckboxes(planExistant?.joursEntrainement ?? joursParDefaut(profil?.disponibiliteHebdo ?? 5))}
            <p class="muted" id="jours-count" style="margin-top:4px;"></p>
          </div>
          <div class="field-row">
            <div class="field">
              <label for="charge">Charge hebdo actuelle</label>
              <select id="charge">
                <option value="faible" ${planExistant?.chargeHebdoMoyenneActuelle === "faible" ? "selected" : ""}>Faible</option>
                <option value="moderee" ${!planExistant || planExistant.chargeHebdoMoyenneActuelle === "moderee" ? "selected" : ""}>Modérée</option>
                <option value="elevee" ${planExistant?.chargeHebdoMoyenneActuelle === "elevee" ? "selected" : ""}>Élevée</option>
              </select>
            </div>
            <div class="field">
              <label for="volume-hebdo-max">Volume hebdo max (h, optionnel)</label>
              <input type="number" id="volume-hebdo-max" step="0.5" min="1" value="${planExistant?.volumeHebdoMaxMin ? (planExistant.volumeHebdoMaxMin / 60).toFixed(1) : ""}" placeholder="ex: 6" />
            </div>
          </div>
          <p class="muted" style="margin-top:-8px;">Temps total dispo par semaine, toutes séances confondues — le plan réduit proportionnellement les séances pour rester dans ce budget plutôt que d'en supprimer.</p>
          <div class="row">
            <button class="btn btn--primary" type="submit">${planExistant ? "Mettre à jour le plan" : "Générer le plan"}</button>
            ${planExistant ? `<button class="btn btn--sm" type="button" id="btn-nouveau-plan">Créer un nouveau plan à la place</button>` : ""}
          </div>
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

  let modeCreationForcee = false;

  const updateAllurePreview = () => {
    const distanceKm = Number(container.querySelector("#distance-objectif").value);
    const tempsLabel = container.querySelector("#temps-objectif").value.trim();
    const preview = container.querySelector("#allure-objectif-preview");
    if (!distanceKm || !tempsLabel) {
      preview.textContent = "";
      return;
    }
    const tempsS = labelVersSecondes(tempsLabel);
    const allure = calculerAllureObjectif(distanceKm * 1000, tempsS);
    preview.textContent = allure ? `Allure objectif : ${formatPace(allure)} — utilisée pour les blocs allure course (zone M) du plan.` : "";
  };
  container.querySelector("#distance-objectif").addEventListener("input", updateAllurePreview);
  container.querySelector("#temps-objectif").addEventListener("input", updateAllurePreview);
  updateAllurePreview();

  const updateJoursCount = () => {
    const n = container.querySelectorAll('[data-jour]:checked').length;
    container.querySelector("#jours-count").textContent =
      n === 0 ? "Choisis au moins un jour." : `${n} séance${n > 1 ? "s" : ""}/semaine.`;
  };
  container.querySelectorAll("[data-jour]").forEach((cb) => cb.addEventListener("change", updateJoursCount));
  updateJoursCount();

  container.querySelector("#btn-nouveau-plan")?.addEventListener("click", () => {
    modeCreationForcee = true;
    container.querySelector("#form-plan button[type=submit]").textContent = "Générer le plan";
    container.querySelector("#btn-nouveau-plan").remove();
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
    const distanceKm = Number(container.querySelector("#distance-objectif").value) || null;
    const tempsLabel = container.querySelector("#temps-objectif").value.trim();
    const debutPlan = container.querySelector("#debut-plan").value;
    const echeance = container.querySelector("#echeance").value;
    const charge = container.querySelector("#charge").value;
    const volumeHebdoMaxH = Number(container.querySelector("#volume-hebdo-max").value) || null;
    const joursEntrainement = Array.from(container.querySelectorAll("[data-jour]:checked")).map((cb) => Number(cb.value));
    if (!echeance) {
      alert("Choisis une date de course.");
      return;
    }
    if (!joursEntrainement.length) {
      alert("Choisis au moins un jour d'entraînement.");
      return;
    }
    const inputs = {
      discipline,
      objectif,
      dateEcheance: new Date(echeance).toISOString(),
      dateDebut: debutPlan ? new Date(debutPlan).toISOString() : new Date().toISOString(),
      performanceRef: p.performanceRef,
      joursEntrainement,
      chargeHebdoMoyenneActuelle: charge,
      distanceObjectifM: distanceKm ? distanceKm * 1000 : null,
      tempsObjectifS: tempsLabel ? labelVersSecondes(tempsLabel) : null,
      volumeHebdoMaxMin: volumeHebdoMaxH ? volumeHebdoMaxH * 60 : null,
    };

    if (planExistant && !modeCreationForcee) {
      await store.modifierPlan(planExistant.id, inputs);
    } else {
      await store.creerPlan(inputs);
    }
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

const JOURS_LABELS = [
  { iso: 1, label: "Lun" },
  { iso: 2, label: "Mar" },
  { iso: 3, label: "Mer" },
  { iso: 4, label: "Jeu" },
  { iso: 5, label: "Ven" },
  { iso: 6, label: "Sam" },
  { iso: 7, label: "Dim" },
];

/** Spread par défaut pour pré-cocher les jours d'entraînement selon le
 * nombre de séances habituel — l'utilisateur reste libre de tout changer. */
function joursParDefaut(n) {
  const spreads = {
    1: [7],
    2: [3, 7],
    3: [2, 4, 7],
    4: [2, 4, 6, 7],
    5: [1, 3, 4, 6, 7],
    6: [1, 2, 3, 4, 6, 7],
    7: [1, 2, 3, 4, 5, 6, 7],
  };
  return spreads[Math.min(Math.max(n, 1), 7)] ?? spreads[5];
}

function renderJoursCheckboxes(joursCoches) {
  return `
    <div class="row" style="flex-wrap:wrap;">
      ${JOURS_LABELS.map(
        ({ iso, label }) => `
        <label class="btn btn--sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <input type="checkbox" data-jour value="${iso}" ${joursCoches.includes(iso) ? "checked" : ""} style="margin:0;" />
          ${label}
        </label>`
      ).join("")}
    </div>`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
