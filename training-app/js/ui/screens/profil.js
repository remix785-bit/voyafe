import * as store from "../../store.js";
import { vdotFromPerformance, paceZonesForVdot, formatPace } from "../../engines/vdot.js";
import { calculerAllureObjectif } from "../../engines/planGenerator.js";
import { SegmentedControl, attachSegmentedControl } from "../components.js";

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
          <p id="correction-notice" class="muted" style="display:none; margin-top:-8px;">Correction du test du <strong id="correction-date"></strong> — <button type="button" id="annuler-correction" class="btn btn--sm" style="padding:2px 8px;">Annuler</button></p>
          <button class="btn btn--primary" type="submit" id="submit-profil">Enregistrer et recalculer le VDOT</button>
        </form>
      </div>

      <div class="card" id="zones-card"></div>

      <div class="card">
        <h2>Historique VDOT</h2>
        <p class="muted">Un test par erreur ? Corrige-le (✎) ou supprime-le (✕) — il en faut toujours au moins un.</p>
        <div id="vdot-history"></div>
      </div>

      <div class="card">
        <h2>Plan d'entraînement</h2>
        ${SegmentedControl(
          [
            { id: "simple", label: "Plan simple" },
            { id: "saison", label: "Saison (objectif final + courses intermédiaires)" },
          ],
          "simple"
        )}

        <div class="screen-segment active" data-segment-panel="simple" style="margin-top:16px;">
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
            <label for="gap-calibre">Calibration GAP (trail, optionnel)</label>
            <input type="number" id="gap-calibre" step="0.05" min="0.5" max="2" value="${planExistant?.profilCourant?.facteurGapCalibre ?? 1}" />
          </div>
          <p class="muted" style="margin-top:-8px;">Ajuste le modèle théorique (Minetti) à ta sensibilité réelle aux pentes. 1.0 = modèle standard ; augmente si tu ralentis plus que prévu en montée/descente technique, diminue si tu t'en sors mieux que prévu. Sans effet en route.</p>
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

        <div class="screen-segment" data-segment-panel="saison" style="margin-top:16px;">
          <p class="muted">Structure ta saison quasi sur l'année : un objectif final (ta course cible) et, si besoin, des objectifs intermédiaires (courses d'étape) — chacun reçoit son propre bloc de plan, affûté à sa mesure, chaîné du début de saison jusqu'à l'objectif final pour que les courses intermédiaires servent la progression plutôt que de la casser.</p>
          <form id="form-saison">
            <div class="field">
              <label for="s-gap-calibre">Calibration GAP (trail, optionnel)</label>
              <input type="number" id="s-gap-calibre" step="0.05" min="0.5" max="2" value="1" />
            </div>
            <p class="muted" style="margin-top:-8px;">Ajuste le modèle théorique (Minetti) à ta sensibilité réelle aux pentes — commun à toute la saison, quelle que soit la discipline de chaque objectif.</p>
            <div class="field">
              <label for="s-debut">Date de début de la saison</label>
              <input type="date" id="s-debut" value="${new Date().toISOString().slice(0, 10)}" />
            </div>

            <div class="contour-divider"></div>
            <h3>Objectif final</h3>
            <div class="field">
              <label for="s-final-nom">Nom</label>
              <input type="text" id="s-final-nom" placeholder="ex: Marathon de Paris" />
            </div>
            <div class="field-row">
              <div class="field">
                <label for="s-final-discipline">Discipline</label>
                <select id="s-final-discipline" data-objectif-discipline>
                  <option value="route">Route</option>
                  <option value="trail">Trail</option>
                </select>
              </div>
              <div class="field" data-champ-denivele hidden>
                <label for="s-final-denivele">D+ de la course (m)</label>
                <input type="number" id="s-final-denivele" min="0" placeholder="ex: 2500" />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="s-final-distance">Distance (km)</label>
                <input type="number" id="s-final-distance" step="0.001" min="0" placeholder="ex: 42.195" />
              </div>
              <div class="field">
                <label for="s-final-temps">Temps objectif (hh:mm:ss, optionnel)</label>
                <input type="text" id="s-final-temps" placeholder="ex: 3:30:00" />
              </div>
            </div>
            <div class="field">
              <label for="s-final-date">Date de la course</label>
              <input type="date" id="s-final-date" />
            </div>

            <div class="contour-divider"></div>
            <div class="card__header">
              <h3>Objectifs intermédiaires</h3>
              <button class="btn btn--sm" type="button" id="btn-ajouter-intermediaire">+ Ajouter</button>
            </div>
            <p class="muted" style="margin-top:-8px;">Optionnel — des courses d'étape avant l'objectif final, chacune avec sa propre discipline (route ou trail, avec son D+), avec un affûtage minimal pour ne pas interrompre la progression.</p>
            <div id="intermediaires-list" class="stack"></div>

            <div class="contour-divider"></div>
            <div class="field">
              <label>Jours d'entraînement</label>
              ${renderJoursCheckboxes(joursParDefaut(profil?.disponibiliteHebdo ?? 5), "data-jour-saison")}
              <p class="muted" id="s-jours-count" style="margin-top:4px;"></p>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="s-charge">Charge hebdo actuelle</label>
                <select id="s-charge">
                  <option value="faible">Faible</option>
                  <option value="moderee" selected>Modérée</option>
                  <option value="elevee">Élevée</option>
                </select>
              </div>
              <div class="field">
                <label for="s-volume-hebdo-max">Volume hebdo max (h, optionnel)</label>
                <input type="number" id="s-volume-hebdo-max" step="0.5" min="1" placeholder="ex: 6" />
              </div>
            </div>
            <button class="btn btn--primary" type="submit">Générer la saison</button>
          </form>
        </div>
      </div>
    </div>`;

  let indexEnCorrection = null;

  function entrerModeCorrection(index, entree) {
    indexEnCorrection = index;
    container.querySelector("#distance").value = entree.distanceM;
    container.querySelector("#temps").value = secondesVersLabel(entree.tempsS);
    container.querySelector("#submit-profil").textContent = "Enregistrer la correction";
    container.querySelector("#correction-date").textContent = new Date(entree.date).toLocaleDateString("fr-FR");
    container.querySelector("#correction-notice").style.display = "block";
    container.querySelector("#form-profil").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function sortirModeCorrection() {
    indexEnCorrection = null;
    container.querySelector("#submit-profil").textContent = "Enregistrer et recalculer le VDOT";
    container.querySelector("#correction-notice").style.display = "none";
    const { profil: actuel } = store.getState();
    if (actuel) {
      container.querySelector("#distance").value = actuel.performanceRef.distanceM;
      container.querySelector("#temps").value = secondesVersLabel(actuel.performanceRef.tempsS);
    }
  }

  function renderHistory(container, profil) {
    const el = container.querySelector("#vdot-history");
    const hist = profil?.historiqueVdot ?? [];
    if (!hist.length) {
      el.innerHTML = `<p class="muted">Pas encore d'historique — chaque test renseigné en enregistre un point.</p>`;
      return;
    }
    el.innerHTML = `<div class="stack">${hist
      .map((h, i) => {
        const aDesBrutes = h.distanceM != null && h.tempsS != null;
        return `
        <div class="row" style="justify-content:space-between; gap:8px;">
          <div>
            <span class="muted">${new Date(h.date).toLocaleDateString("fr-FR")}</span>
            <span class="data" style="margin-left:8px;">${h.vdot.toFixed(1)}</span>
            ${aDesBrutes ? `<span class="muted" style="margin-left:8px;">(${(h.distanceM / 1000).toFixed(1)} km en ${secondesVersLabel(h.tempsS)})</span>` : ""}
          </div>
          <div class="row" style="gap:4px;">
            ${aDesBrutes ? `<button type="button" class="btn btn--sm" data-edit-vdot="${i}" style="padding:2px 8px;" title="Corriger ce test">✎</button>` : ""}
            ${hist.length > 1 ? `<button type="button" class="btn btn--sm" data-delete-vdot="${i}" style="padding:2px 8px;" title="Supprimer ce test">✕</button>` : ""}
          </div>
        </div>`;
      })
      .join("")}</div>`;

    el.querySelectorAll("[data-edit-vdot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.editVdot);
        entrerModeCorrection(idx, hist[idx]);
      });
    });
    el.querySelectorAll("[data-delete-vdot]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.deleteVdot);
        const entree = hist[idx];
        if (!confirm(`Supprimer le test du ${new Date(entree.date).toLocaleDateString("fr-FR")} (VDOT ${entree.vdot.toFixed(1)}) ?`)) return;
        try {
          const updated = await store.supprimerTestVdot(idx);
          if (indexEnCorrection === idx) sortirModeCorrection();
          renderZones(container, updated);
          renderHistory(container, updated);
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  renderZones(container, profil);
  renderHistory(container, profil);

  container.querySelector("#annuler-correction").addEventListener("click", sortirModeCorrection);

  container.querySelector("#form-profil").addEventListener("submit", async (e) => {
    e.preventDefault();
    const distanceM = Number(container.querySelector("#distance").value);
    const tempsS = labelVersSecondes(container.querySelector("#temps").value);
    const poids = Number(container.querySelector("#poids").value);
    const dispo = Number(container.querySelector("#dispo").value);

    let updated;
    if (indexEnCorrection != null) {
      updated = await store.modifierTestVdot(indexEnCorrection, { distanceM, tempsS });
      updated = await store.enregistrerProfil(updated.performanceRef, poids, dispo);
      sortirModeCorrection();
    } else {
      updated = await store.enregistrerProfil({ distanceM, tempsS, dateTest: new Date().toISOString() }, poids, dispo);
    }
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
    const facteurGapCalibre = Number(container.querySelector("#gap-calibre").value) || 1;
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
      facteurGapCalibre,
    };

    if (planExistant && !modeCreationForcee) {
      await store.modifierPlan(planExistant.id, inputs);
    } else {
      await store.creerPlan(inputs);
    }
    location.hash = "#/plan";
  });

  attachSegmentedControl(container);
  initSaisonForm(container);
}

/**
 * Câblage du formulaire Saison (objectif final + objectifs intermédiaires) :
 * ajout/retrait dynamique des lignes d'objectifs intermédiaires et soumission
 * vers store.creerSaison. Séparé de render() car indépendant du profil/plan
 * existant (contrairement au formulaire "Plan simple").
 */
function initSaisonForm(container) {
  const liste = container.querySelector("#intermediaires-list");
  let compteur = 0;

  function ajouterLigneIntermediaire() {
    compteur++;
    const div = document.createElement("div");
    div.className = "card";
    div.style.padding = "12px";
    div.dataset.intermediaireRow = "";
    div.innerHTML = `
      <div class="card__header">
        <strong>Objectif intermédiaire ${compteur}</strong>
        <button type="button" class="btn btn--sm" data-remove-intermediaire>Retirer</button>
      </div>
      <div class="field">
        <label>Nom</label>
        <input type="text" data-int-nom placeholder="ex: 10km de rentrée" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Discipline</label>
          <select data-objectif-discipline data-int-discipline>
            <option value="route">Route</option>
            <option value="trail">Trail</option>
          </select>
        </div>
        <div class="field" data-champ-denivele hidden>
          <label>D+ de la course (m)</label>
          <input type="number" min="0" data-int-denivele placeholder="ex: 800" />
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Distance (km)</label><input type="number" step="0.001" min="0" data-int-distance placeholder="ex: 10" /></div>
        <div class="field"><label>Temps objectif (hh:mm:ss, optionnel)</label><input type="text" data-int-temps /></div>
      </div>
      <div class="field"><label>Date</label><input type="date" data-int-date /></div>`;
    liste.appendChild(div);
    div.querySelector("[data-remove-intermediaire]").addEventListener("click", () => div.remove());
  }

  container.querySelector("#btn-ajouter-intermediaire").addEventListener("click", ajouterLigneIntermediaire);

  // Le champ D+ n'a de sens qu'en trail — masqué/affiché selon la discipline
  // choisie, pour l'objectif final comme pour chaque ligne intermédiaire
  // (déléguation : couvre aussi les lignes ajoutées dynamiquement).
  container.querySelector("#form-saison").addEventListener("change", (e) => {
    if (!e.target.matches("[data-objectif-discipline]")) return;
    const champDenivele = e.target.closest(".field-row")?.querySelector("[data-champ-denivele]");
    if (champDenivele) champDenivele.hidden = e.target.value !== "trail";
  });

  const updateJoursCountSaison = () => {
    const n = container.querySelectorAll("[data-jour-saison]:checked").length;
    container.querySelector("#s-jours-count").textContent =
      n === 0 ? "Choisis au moins un jour." : `${n} séance${n > 1 ? "s" : ""}/semaine.`;
  };
  container.querySelectorAll("[data-jour-saison]").forEach((cb) => cb.addEventListener("change", updateJoursCountSaison));
  updateJoursCountSaison();

  container.querySelector("#form-saison").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { profil: p } = store.getState();
    if (!p) {
      alert("Renseigne d'abord ton profil (performance de référence).");
      return;
    }
    const facteurGapCalibre = Number(container.querySelector("#s-gap-calibre").value) || 1;
    const debut = container.querySelector("#s-debut").value;
    const charge = container.querySelector("#s-charge").value;
    const volumeHebdoMaxH = Number(container.querySelector("#s-volume-hebdo-max").value) || null;
    const joursEntrainement = Array.from(container.querySelectorAll("[data-jour-saison]:checked")).map((cb) => Number(cb.value));

    const finalNom = container.querySelector("#s-final-nom").value;
    const finalDiscipline = container.querySelector("#s-final-discipline").value;
    const finalDeniveleM = Number(container.querySelector("#s-final-denivele").value) || null;
    const finalDistanceKm = Number(container.querySelector("#s-final-distance").value) || null;
    const finalTempsLabel = container.querySelector("#s-final-temps").value.trim();
    const finalDate = container.querySelector("#s-final-date").value;

    if (!finalDate) {
      alert("Choisis la date de l'objectif final.");
      return;
    }
    if (!joursEntrainement.length) {
      alert("Choisis au moins un jour d'entraînement.");
      return;
    }

    const objectifsIntermediaires = Array.from(container.querySelectorAll("[data-intermediaire-row]")).map((row) => {
      const date = row.querySelector("[data-int-date]").value;
      const distanceKm = Number(row.querySelector("[data-int-distance]").value) || null;
      const tempsLabel = row.querySelector("[data-int-temps]").value.trim();
      const discipline = row.querySelector("[data-int-discipline]").value;
      const deniveleM = Number(row.querySelector("[data-int-denivele]").value) || null;
      return {
        nom: row.querySelector("[data-int-nom]").value,
        discipline,
        deniveleM: discipline === "trail" ? deniveleM : null,
        distanceM: distanceKm ? distanceKm * 1000 : null,
        tempsS: tempsLabel ? labelVersSecondes(tempsLabel) : null,
        date: date ? new Date(date).toISOString() : null,
      };
    });
    if (objectifsIntermediaires.some((o) => !o.date)) {
      alert("Chaque objectif intermédiaire a besoin d'une date (ou retire la ligne).");
      return;
    }

    const inputs = {
      performanceRef: p.performanceRef,
      joursEntrainement,
      chargeHebdoMoyenneActuelle: charge,
      volumeHebdoMaxMin: volumeHebdoMaxH ? volumeHebdoMaxH * 60 : null,
      facteurGapCalibre,
      dateDebut: debut ? new Date(debut).toISOString() : new Date().toISOString(),
      objectifFinal: {
        nom: finalNom,
        discipline: finalDiscipline,
        deniveleM: finalDiscipline === "trail" ? finalDeniveleM : null,
        distanceM: finalDistanceKm ? finalDistanceKm * 1000 : null,
        tempsS: finalTempsLabel ? labelVersSecondes(finalTempsLabel) : null,
        date: new Date(finalDate).toISOString(),
      },
      objectifsIntermediaires,
    };

    try {
      await store.creerSaison(inputs);
    } catch (err) {
      alert(err.message);
      return;
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
      <thead><tr><th>Zone</th><th>Allure rapide</th><th>Allure cible</th></tr></thead>
      <tbody>
        ${Object.entries(zones)
          .map(
            ([z, v]) => `<tr><td><span class="zone-badge zone-badge--${z}">${z}</span></td><td class="data">${formatPace(v.fast)}</td><td class="data">${formatPace(v.target)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
    <p class="muted" style="margin-top:8px;">Retest recommandé toutes les 4-6 semaines.</p>`;
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

function renderJoursCheckboxes(joursCoches, attr = "data-jour") {
  return `
    <div class="row" style="flex-wrap:wrap;">
      ${JOURS_LABELS.map(
        ({ iso, label }) => `
        <label class="btn btn--sm" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <input type="checkbox" ${attr} value="${iso}" ${joursCoches.includes(iso) ? "checked" : ""} style="margin:0;" />
          ${label}
        </label>`
      ).join("")}
    </div>`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
