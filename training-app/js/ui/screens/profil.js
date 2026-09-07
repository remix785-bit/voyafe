import * as store from "../../store.js";
import { vdotFromPerformance, paceZonesForVdot, formatPace, riegelPredictAjuste, formatDureeCompacte, evaluerCoherenceObjectif, identifierAxeTravail } from "../../engines/vdot.js";
import { calculerAllureObjectif, semainesDisponibles } from "../../engines/planGenerator.js";
import { SegmentedControl, attachSegmentedControl, confirmerAction, afficherToast } from "../components.js";

/**
 * Bloc de champs "objectif course" (discipline, nom, distance, temps
 * objectif, D+) — partagé entre le formulaire Plan simple et le bloc
 * "Objectif final" de la Saison, jusqu'ici deux copies HTML quasi
 * identiques à maintenir en double (source de libellés "optionnel"
 * incohérents entre les deux). `idPrefix` doit être unique sur la page
 * (ex. "obj-" pour le plan simple, "s-final-" pour la saison) : les deux
 * formulaires coexistent toujours dans le DOM (onglets Plan simple/Saison),
 * des ids partagés seraient ambigus pour querySelector.
 * @param {string} idPrefix
 * @param {{discipline?:string, objectif?:string, distanceObjectifM?:number, tempsObjectifS?:number, deniveleM?:number}} prefill
 */
function champsObjectifHTML(idPrefix, prefill = {}) {
  const estTrail = prefill?.discipline === "trail";
  return `
    <div class="field-row">
      <div class="field">
        <label for="${idPrefix}discipline">Discipline</label>
        <select id="${idPrefix}discipline" data-objectif-discipline>
          <option value="route" ${estTrail ? "" : "selected"}>Route</option>
          <option value="trail" ${estTrail ? "selected" : ""}>Trail</option>
        </select>
      </div>
      <div class="field" data-champ-denivele ${estTrail ? "" : "hidden"}>
        <label for="${idPrefix}denivele">D+ de la course (m, optionnel)</label>
        <input type="number" id="${idPrefix}denivele" min="0" value="${prefill?.deniveleM ?? ""}" placeholder="ex: 2500" />
      </div>
    </div>
    <div class="field">
      <label for="${idPrefix}nom">Objectif (libellé, optionnel)</label>
      <input type="text" id="${idPrefix}nom" value="${escapeAttr(prefill?.objectif ?? "")}" placeholder="ex: Marathon de Paris sub-3h30" />
    </div>
    <div class="field-row">
      <div class="field">
        <label for="${idPrefix}distance">Distance de la course (km, optionnel)</label>
        <input type="number" id="${idPrefix}distance" step="0.001" min="0" value="${prefill?.distanceObjectifM ? prefill.distanceObjectifM / 1000 : ""}" placeholder="ex: 42.195" />
      </div>
      <div class="field">
        <label for="${idPrefix}temps">Temps objectif (hh:mm:ss, optionnel)</label>
        <input type="text" id="${idPrefix}temps" value="${prefill?.tempsObjectifS ? secondesVersLabel(prefill.tempsObjectifS) : ""}" placeholder="ex: 3:30:00" />
      </div>
    </div>`;
}

/** Lit le bloc généré par champsObjectifHTML(idPrefix, ...) — renvoie une
 * forme neutre, à chaque appelant de la mapper vers ses propres clés
 * d'input (ex. distanceObjectifM pour un plan, distanceM pour un objectif
 * de saison). */
function lireChampsObjectif(container, idPrefix) {
  const discipline = container.querySelector(`#${idPrefix}discipline`).value;
  const distanceKm = Number(container.querySelector(`#${idPrefix}distance`).value) || null;
  const tempsLabel = container.querySelector(`#${idPrefix}temps`).value.trim();
  const deniveleBrut = Number(container.querySelector(`#${idPrefix}denivele`).value) || null;
  return {
    discipline,
    nom: container.querySelector(`#${idPrefix}nom`).value,
    distanceM: distanceKm ? distanceKm * 1000 : null,
    tempsS: tempsLabel ? labelVersSecondes(tempsLabel) : null,
    deniveleM: discipline === "trail" ? deniveleBrut : null,
  };
}

/**
 * Bloc "jours d'entraînement + charge hebdo + volume max" — partagé entre
 * le formulaire Plan simple (idPrefix "", jourAttr "data-jour") et le
 * réglage commun de la Saison (idPrefix "s-", jourAttr "data-jour-saison").
 * @param {string} idPrefix
 * @param {string} jourAttr
 * @param {{joursEntrainement?:number[], chargeHebdoMoyenneActuelle?:string, volumeHebdoMaxMin?:number}} prefill
 * @param {number} profilDispoDefaut séances/semaine du profil, pour préremplir sans saisie existante
 */
function champsDisponibiliteHTML(idPrefix, jourAttr, prefill, profilDispoDefaut) {
  return `
    <div class="field">
      <label>Jours d'entraînement</label>
      ${renderJoursCheckboxes(prefill?.joursEntrainement ?? joursParDefaut(profilDispoDefaut), jourAttr)}
      <p class="muted" id="${idPrefix}jours-count" style="margin-top:4px;"></p>
    </div>
    <div class="field-row">
      <div class="field">
        <label for="${idPrefix}charge">Charge hebdo actuelle</label>
        <select id="${idPrefix}charge">
          <option value="faible" ${prefill?.chargeHebdoMoyenneActuelle === "faible" ? "selected" : ""}>Faible</option>
          <option value="moderee" ${!prefill || prefill.chargeHebdoMoyenneActuelle === "moderee" ? "selected" : ""}>Modérée</option>
          <option value="elevee" ${prefill?.chargeHebdoMoyenneActuelle === "elevee" ? "selected" : ""}>Élevée</option>
        </select>
      </div>
      <div class="field">
        <label for="${idPrefix}volume-hebdo-max">Volume hebdo max (h, optionnel)</label>
        <input type="number" step="0.5" min="1" id="${idPrefix}volume-hebdo-max" value="${prefill?.volumeHebdoMaxMin ? (prefill.volumeHebdoMaxMin / 60).toFixed(1) : ""}" placeholder="ex: 6" />
      </div>
    </div>
    <p class="muted" style="margin-top:-8px;">Temps total dispo par semaine, toutes séances confondues — le plan réduit proportionnellement les séances pour rester dans ce budget plutôt que d'en supprimer.</p>`;
}

/**
 * Gate un bouton de soumission (profil renseigné ET au moins un jour
 * d'entraînement coché) — même logique pour le formulaire Plan simple et
 * le formulaire Saison, jusqu'ici dupliquée entre les deux. Met aussi à
 * jour le compteur "N séances/semaine" à chaque changement de case.
 * @returns {() => void} fonction à rappeler après un événement externe (ex.
 *   le profil vient d'être enregistré plus haut sur la page) pour
 *   ré-évaluer l'état du bouton sans toucher au compteur de jours.
 */
function creerGatingFormulaire(container, { noteId, submitId, jourAttr, countId }) {
  const update = () => {
    const hasProfil = !!store.getState().profil;
    const hasJours = container.querySelectorAll(`[${jourAttr}]:checked`).length > 0;
    const note = container.querySelector(`#${noteId}`);
    if (note) note.hidden = hasProfil;
    const btn = container.querySelector(`#${submitId}`);
    if (btn) btn.disabled = !hasProfil || !hasJours;
  };
  const updateCount = () => {
    const n = container.querySelectorAll(`[${jourAttr}]:checked`).length;
    const el = container.querySelector(`#${countId}`);
    if (el) el.textContent = n === 0 ? "Choisis au moins un jour." : `${n} séance${n > 1 ? "s" : ""}/semaine.`;
    update();
  };
  container.querySelectorAll(`[${jourAttr}]`).forEach((cb) => cb.addEventListener("change", updateCount));
  updateCount();
  return update;
}

/**
 * Transforme un formulaire découpé en <div class="form-step"> en mini-
 * wizard à étapes (Suivant/Précédent, compteur "Étape X/N") plutôt qu'un
 * unique long scroll — chaque étape reste un simple <div> à l'intérieur du
 * MÊME <form>, la soumission finale lit donc l'ensemble des champs sans
 * rien changer côté validation/données (un champ dans une étape masquée
 * (hidden) reste lisible en JS, seule la validation native HTML l'ignore —
 * les contrôles JS explicites du submit restent le vrai garde-fou).
 * Les boutons d'action (data-form-actions) ne sont visibles qu'à la
 * dernière étape.
 * @param {HTMLFormElement} form
 */
function activerEtapesFormulaire(form) {
  const etapes = Array.from(form.querySelectorAll(".form-step"));
  if (etapes.length < 2) return;
  let etapeCourante = 0;
  const actions = form.querySelector("[data-form-actions]");

  const nav = document.createElement("div");
  nav.className = "form-step-nav";
  form.insertBefore(nav, etapes[0]);

  const majAffichage = () => {
    etapes.forEach((etape, i) => (etape.hidden = i !== etapeCourante));
    if (actions) actions.hidden = etapeCourante !== etapes.length - 1;
    nav.innerHTML = `
      <p class="muted form-step-nav__compteur">Étape ${etapeCourante + 1}/${etapes.length}</p>
      <div class="row form-step-nav__actions">
        ${etapeCourante > 0 ? `<button type="button" class="btn btn--sm" data-step-precedent>&larr; Précédent</button>` : ""}
        ${etapeCourante < etapes.length - 1 ? `<button type="button" class="btn btn--sm btn--primary" data-step-suivant>Suivant &rarr;</button>` : ""}
      </div>`;
    nav.querySelector("[data-step-precedent]")?.addEventListener("click", () => {
      etapeCourante--;
      majAffichage();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.querySelector("[data-step-suivant]")?.addEventListener("click", () => {
      etapeCourante++;
      majAffichage();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  majAffichage();
}

export async function render(container) {
  const { profil } = store.getState();
  const planExistant = store.planActif() ?? store.getState().plans[store.getState().plans.length - 1] ?? null;

  // Saison existante à éditer : celle du plan actif si elle en fait partie,
  // sinon la plus récemment créée — même logique de repli que planExistant.
  const planAvecSaison =
    store.getState().plans.find((p) => p.saisonId && p.statut === "actif") ??
    [...store.getState().plans].filter((p) => p.saisonId).sort((a, b) => new Date(b.creeLe) - new Date(a.creeLe))[0] ??
    null;
  const saisonId = planAvecSaison?.saisonId ?? null;
  const blocsSaisonExistante = saisonId ? store.blocsSaison(saisonId) : [];
  const blocFinalExistant = blocsSaisonExistante.find((b) => b.roleSaison === "finale") ?? null;
  const blocsIntermediairesExistants = blocsSaisonExistante.filter((b) => b.roleSaison === "intermediaire");

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Profil &amp; Tests</h1>
        ${
          !profil
            ? `<p class="muted">Champs pré-remplis à titre d'exemple (10 km en 40 min, 70 kg, 5 séances/sem.) — remplace-les par ta propre performance de référence avant d'enregistrer.</p>`
            : ""
        }
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
        <p class="badge-warning" id="profil-manquant-note" ${profil ? "hidden" : ""}>Renseigne d'abord ta performance de référence ci-dessus pour pouvoir générer un plan.</p>
        <form id="form-plan">
          <div class="form-step" data-step-titre="Objectif">
            <h3>Objectif</h3>
            ${champsObjectifHTML("obj-", planExistant)}
            <div class="field">
              <label for="gap-calibre">Calibration GAP (trail, optionnel)</label>
              <input type="number" id="gap-calibre" step="0.05" min="0.5" max="2" value="${planExistant?.profilCourant?.facteurGapCalibre ?? 1}" />
            </div>
            <p class="muted" style="margin-top:-8px;">Ajuste le modèle théorique (Minetti) à ta sensibilité réelle aux pentes. 1.0 = modèle standard ; augmente si tu ralentis plus que prévu en montée/descente technique, diminue si tu t'en sors mieux que prévu. Sans effet en route.</p>
            <p class="muted data" id="allure-objectif-preview"></p>
            <p class="muted" id="coherence-objectif-preview"></p>
          </div>

          <div class="form-step" data-step-titre="Planning" hidden>
            <h3>Planning</h3>
            <div class="field-row">
              <div class="field">
                <label for="debut-plan">Date de début du plan</label>
                <input type="date" id="debut-plan" value="${(planExistant?.dateDebutPlan ?? new Date().toISOString()).slice(0, 10)}" />
              </div>
              <div class="field">
                <label for="echeance">Date de la course</label>
                <input type="date" id="echeance" required value="${planExistant?.dateEcheance ? planExistant.dateEcheance.slice(0, 10) : ""}" />
              </div>
            </div>
          </div>

          <div class="form-step" data-step-titre="Charge & disponibilité" hidden>
            <h3>Charge &amp; disponibilité</h3>
            ${champsDisponibiliteHTML("", "data-jour", planExistant, profil?.disponibiliteHebdo ?? 5)}
          </div>

          <div class="row" data-form-actions>
            <button class="btn btn--primary" type="submit" id="submit-plan" ${profil ? "" : "disabled"}>${planExistant ? "Mettre à jour le plan" : "Générer le plan"}</button>
            ${planExistant ? `<button class="btn btn--sm" type="button" id="btn-nouveau-plan">Créer un nouveau plan à la place</button>` : ""}
          </div>
        </form>
        </div>

        <div class="screen-segment" data-segment-panel="saison" style="margin-top:16px;">
          <p class="muted">Structure ta saison quasi sur l'année : un objectif final (ta course cible) et, si besoin, des objectifs intermédiaires (courses d'étape) — chacun reçoit son propre bloc de plan, affûté à sa mesure, chaîné du début de saison jusqu'à l'objectif final pour que les courses intermédiaires servent la progression plutôt que de la casser.</p>
          ${blocFinalExistant ? `<p class="muted">Modifie n'importe quel champ puis mets à jour — les séances déjà réalisées/manquées restent enregistrées, bloc par bloc.</p>` : ""}
          <p class="badge-warning" id="s-profil-manquant-note" ${profil ? "hidden" : ""}>Renseigne d'abord ta performance de référence ci-dessus pour pouvoir générer une saison.</p>
          <form id="form-saison">
            <div class="form-step" data-step-titre="Réglages généraux">
              <h3>Réglages généraux</h3>
              <div class="field">
                <label for="s-gap-calibre">Calibration GAP (trail, optionnel)</label>
                <input type="number" id="s-gap-calibre" step="0.05" min="0.5" max="2" value="${blocFinalExistant?.profilCourant?.facteurGapCalibre ?? 1}" />
              </div>
              <p class="muted" style="margin-top:-8px;">Ajuste le modèle théorique (Minetti) à ta sensibilité réelle aux pentes — commun à toute la saison, quelle que soit la discipline de chaque objectif.</p>
              <div class="field">
                <label for="s-debut">Date de début de la saison</label>
                <input type="date" id="s-debut" value="${(blocsIntermediairesExistants[0] ?? blocFinalExistant)?.dateDebutPlan?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)}" />
              </div>
            </div>

            <div class="form-step" data-step-titre="Objectif final" hidden>
              <h3>Objectif final</h3>
              ${champsObjectifHTML("s-final-", blocFinalExistant)}
              <div class="field">
                <label for="s-final-date">Date de la course</label>
                <input type="date" id="s-final-date" required value="${blocFinalExistant?.dateEcheance?.slice(0, 10) ?? ""}" />
              </div>
            </div>

            <div class="form-step" data-step-titre="Objectifs intermédiaires" hidden>
              <div class="card__header">
                <h3>Objectifs intermédiaires</h3>
                <button class="btn btn--sm" type="button" id="btn-ajouter-intermediaire">+ Ajouter</button>
              </div>
              <p class="muted" style="margin-top:-8px;">Optionnel — des courses d'étape avant l'objectif final, chacune avec sa propre discipline (route ou trail, avec son D+), avec un affûtage minimal pour ne pas interrompre la progression.</p>
              <div id="intermediaires-list" class="stack"></div>
            </div>

            <div class="form-step" data-step-titre="Jours & disponibilité" hidden>
              <h3>Jours &amp; disponibilité</h3>
              ${champsDisponibiliteHTML("s-", "data-jour-saison", blocFinalExistant, profil?.disponibiliteHebdo ?? 5)}
            </div>

            <div class="row" data-form-actions>
              <button class="btn btn--primary" type="submit" id="submit-saison" ${profil ? "" : "disabled"}>${blocFinalExistant ? "Mettre à jour la saison" : "Générer la saison"}</button>
              ${blocFinalExistant ? `<button class="btn btn--sm" type="button" id="btn-supprimer-saison">Supprimer la saison</button>` : ""}
            </div>
          </form>
        </div>
      </div>
    </div>`;

  let indexEnCorrection = null;
  let refreshSaisonGating = null;

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
        // Résultat de course réel avec D+ (enregistrerResultatCourse) : affiche
        // la distance/D+ réellement courus, pas la distance plat-équivalente
        // utilisée en coulisses pour le calcul du VDOT (h.distanceM/h.tempsS).
        const distanceAffichee = h.distanceReelleM ?? h.distanceM;
        const suffixeDenivele = h.deniveleReelM ? ` · D+ ${Math.round(h.deniveleReelM)} m` : "";
        return `
        <div class="row" style="justify-content:space-between; gap:8px;">
          <div>
            <span class="muted">${new Date(h.date).toLocaleDateString("fr-FR")}</span>
            <span class="data" style="margin-left:8px;">${h.vdot.toFixed(1)}</span>
            ${aDesBrutes ? `<span class="muted" style="margin-left:8px;">(${(distanceAffichee / 1000).toFixed(1)} km${suffixeDenivele} en ${secondesVersLabel(h.tempsS)})</span>` : ""}
          </div>
          <div class="row" style="gap:4px;">
            ${aDesBrutes ? `<button type="button" class="btn btn--sm" data-edit-vdot="${i}" title="Corriger ce test">✎ Corriger</button>` : ""}
            ${hist.length > 1 ? `<button type="button" class="btn btn--sm" data-delete-vdot="${i}" title="Supprimer ce test">✕ Supprimer</button>` : ""}
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
        const confirme = await confirmerAction(`Supprimer le test du ${new Date(entree.date).toLocaleDateString("fr-FR")} (VDOT ${entree.vdot.toFixed(1)}) ?`, {
          titre: "Supprimer ce test",
          libelleConfirmer: "Supprimer",
          danger: true,
        });
        if (!confirme) return;
        try {
          const updated = await store.supprimerTestVdot(idx);
          if (indexEnCorrection === idx) sortirModeCorrection();
          renderZones(container, updated);
          renderHistory(container, updated);
        } catch (err) {
          afficherToast(err.message, { type: "error" });
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
    const referenceAvant = store.getState().profil?.performanceRef;

    let updated;
    if (indexEnCorrection != null) {
      updated = await store.modifierTestVdot(indexEnCorrection, { distanceM, tempsS });
      updated = await store.enregistrerProfil(updated.performanceRef, poids, dispo);
      sortirModeCorrection();
    } else {
      updated = await store.enregistrerProfil({ distanceM, tempsS, dateTest: new Date().toISOString() }, poids, dispo);
    }
    // Un retest (distance/temps réellement changés, pas juste poids/dispo)
    // met aussi à jour le plan actif et, pour une saison, les blocs à venir —
    // sans ça, seul un résultat de course déclenchait cette mise à jour, un
    // retest classique laissait tout sur l'ancienne forme.
    const performanceChangee =
      !referenceAvant || referenceAvant.distanceM !== updated.performanceRef.distanceM || referenceAvant.tempsS !== updated.performanceRef.tempsS;
    if (performanceChangee) await store.appliquerRetestAuPlanActif();
    renderZones(container, updated);
    renderHistory(container, updated);
    updateSubmitPlanState();
    refreshSaisonGating?.();
  });

  let modeCreationForcee = false;

  const updateAllurePreview = () => {
    const distanceKm = Number(container.querySelector("#obj-distance").value);
    const tempsLabel = container.querySelector("#obj-temps").value.trim();
    const preview = container.querySelector("#allure-objectif-preview");
    const coherencePreview = container.querySelector("#coherence-objectif-preview");
    if (!distanceKm || !tempsLabel) {
      preview.textContent = "";
      coherencePreview.textContent = "";
      return;
    }
    const distanceM = distanceKm * 1000;
    const tempsS = labelVersSecondes(tempsLabel);
    const estTrail = container.querySelector("#obj-discipline").value === "trail";
    const deniveleM = estTrail ? Number(container.querySelector("#obj-denivele").value) || 0 : 0;
    const allure = calculerAllureObjectif(distanceM, tempsS);
    preview.textContent = allure ? `Allure objectif : ${formatPace(allure)} — utilisée pour les blocs allure course (zone M) du plan.` : "";

    // Cohérence objectif/forme — répond à "être certain que le contenu de mes
    // séances me permet de réaliser mon objectif" AVANT même de générer le
    // plan (même check qu'affiché ensuite sur l'écran Plan). En trail, le D+
    // est converti en distance plat-équivalente (evaluerCoherenceObjectif) :
    // sans ça, un objectif avec fort D+ ressortirait à tort comme "atteint".
    const { profil: profilActuel } = store.getState();
    const debutVal = container.querySelector("#debut-plan").value;
    const echeanceVal = container.querySelector("#echeance").value;
    if (!profilActuel || !echeanceVal) {
      coherencePreview.textContent = "";
      return;
    }
    const vdotActuel = profilActuel.historiqueVdot?.length
      ? profilActuel.historiqueVdot[profilActuel.historiqueVdot.length - 1].vdot
      : vdotFromPerformance(profilActuel.performanceRef.distanceM, profilActuel.performanceRef.tempsS).vdot;
    const dateDebut = debutVal ? new Date(debutVal).toISOString() : new Date().toISOString();
    const semDispo = Math.max(semainesDisponibles(new Date(echeanceVal).toISOString(), dateDebut), 0);
    const coherence = evaluerCoherenceObjectif(vdotActuel, distanceM, tempsS, semDispo, deniveleM);
    const ecartLabel = `${coherence.ecartPct >= 0 ? "+" : ""}${coherence.ecartPct.toFixed(1)}%`;
    const noteDenivele = deniveleM > 0 ? " (D+ pris en compte)" : "";
    let texte;
    if (coherence.niveau === "atteint") {
      texte = `✓ Objectif déjà à ta portée avec ta forme actuelle${noteDenivele}.`;
    } else if (coherence.niveau === "ambitieux") {
      texte = `Ambitieux mais cohérent avec ${semDispo} semaines de plan (${ecartLabel} de VDOT à gagner${noteDenivele}).`;
    } else if (deniveleM > 0) {
      // Riegel ne modélise pas le D+ — pas de "temps réaliste" chiffré en trail.
      texte = `Très ambitieux pour ${semDispo} semaines (${ecartLabel} de VDOT nécessaire${noteDenivele}).`;
    } else {
      const tempsRealiste = riegelPredictAjuste(profilActuel.performanceRef.tempsS, profilActuel.performanceRef.distanceM, distanceM);
      texte = `Très ambitieux pour ${semDispo} semaines (${ecartLabel} de VDOT nécessaire) — avec ta forme actuelle, plutôt ~${formatDureeCompacte(tempsRealiste)} sur cette distance.`;
    }
    if (coherence.niveau !== "atteint") {
      const { axe, axeSecondaire, penteMoyenne } = identifierAxeTravail(profilActuel.performanceRef.distanceM, distanceM, deniveleM);
      const AXE_COURT = { vitesse: "vitesse pure", equilibre: "vitesse et endurance", endurance: "endurance/tenue de distance" };
      texte += ` À travailler en priorité : ${AXE_COURT[axe]}${axeSecondaire === "denivele" ? ` + D+/technicité (pente moy. ~${Math.round(penteMoyenne * 100)}%)` : ""}.`;
    }
    coherencePreview.textContent = texte;
  };
  container.querySelector("#obj-distance").addEventListener("input", updateAllurePreview);
  container.querySelector("#obj-temps").addEventListener("input", updateAllurePreview);
  container.querySelector("#obj-denivele").addEventListener("input", updateAllurePreview);
  container.querySelector("#obj-discipline").addEventListener("change", updateAllurePreview);
  container.querySelector("#debut-plan").addEventListener("input", updateAllurePreview);
  container.querySelector("#echeance").addEventListener("input", updateAllurePreview);
  updateAllurePreview();

  // Le champ D+ n'a de sens qu'en trail — masqué/affiché selon la discipline
  // choisie, pour TOUT champ objectif de la page (plan simple, objectif
  // final de la saison, chaque ligne intermédiaire) via un seul écouteur
  // délégué au niveau du conteneur, plutôt qu'une logique par formulaire.
  container.addEventListener("change", (e) => {
    if (!e.target.matches("[data-objectif-discipline]")) return;
    const champDenivele = e.target.closest(".field-row")?.querySelector("[data-champ-denivele]");
    if (champDenivele) champDenivele.hidden = e.target.value !== "trail";
  });

  // Gate le bouton "Générer/Mettre à jour le plan" en amont (profil renseigné
  // ET au moins un jour d'entraînement coché) plutôt que de laisser
  // remplir tout le formulaire avant de découvrir le blocage via un
  // alert() au clic — l'utilisateur voit tout de suite pourquoi le bouton
  // est inactif (note au-dessus + compteur de jours).
  const updateSubmitPlanState = creerGatingFormulaire(container, {
    noteId: "profil-manquant-note",
    submitId: "submit-plan",
    jourAttr: "data-jour",
    countId: "jours-count",
  });
  activerEtapesFormulaire(container.querySelector("#form-plan"));

  container.querySelector("#btn-nouveau-plan")?.addEventListener("click", () => {
    modeCreationForcee = true;
    container.querySelector("#form-plan button[type=submit]").textContent = "Générer le plan";
    container.querySelector("#btn-nouveau-plan").remove();
  });

  container.querySelector("#form-plan").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { profil: p } = store.getState();
    // Garde-fou de secours (le bouton est déjà désactivé en amont tant que
    // ces conditions ne sont pas réunies, cf. updateSubmitPlanState) —
    // toast plutôt que alert() bloquant si jamais atteint malgré tout.
    if (!p) {
      afficherToast("Renseigne d'abord ton profil (performance de référence).", { type: "error" });
      return;
    }
    const objectifChamps = lireChampsObjectif(container, "obj-");
    const debutPlan = container.querySelector("#debut-plan").value;
    const echeance = container.querySelector("#echeance").value;
    const charge = container.querySelector("#charge").value;
    const volumeHebdoMaxH = Number(container.querySelector("#volume-hebdo-max").value) || null;
    const facteurGapCalibre = Number(container.querySelector("#gap-calibre").value) || 1;
    const joursEntrainement = Array.from(container.querySelectorAll("[data-jour]:checked")).map((cb) => Number(cb.value));
    if (!echeance) {
      afficherToast("Choisis une date de course.", { type: "error" });
      return;
    }
    if (!joursEntrainement.length) {
      afficherToast("Choisis au moins un jour d'entraînement.", { type: "error" });
      return;
    }
    const inputs = {
      discipline: objectifChamps.discipline,
      objectif: objectifChamps.nom,
      dateEcheance: new Date(echeance).toISOString(),
      dateDebut: debutPlan ? new Date(debutPlan).toISOString() : new Date().toISOString(),
      performanceRef: p.performanceRef,
      joursEntrainement,
      chargeHebdoMoyenneActuelle: charge,
      distanceObjectifM: objectifChamps.distanceM,
      tempsObjectifS: objectifChamps.tempsS,
      deniveleM: objectifChamps.deniveleM,
      volumeHebdoMaxMin: volumeHebdoMaxH ? volumeHebdoMaxH * 60 : null,
      facteurGapCalibre,
    };

    if (planExistant && !modeCreationForcee) {
      // Un plan déjà en cours (actif) modifie ses semaines à venir — les
      // séances déjà réalisées/manquées restent enregistrées, mais le reste
      // du plan change ; une saison en pause/en attente n'a pas cette
      // incidence immédiate, pas besoin d'y ajouter un garde-fou.
      if (planExistant.statut === "actif") {
        const confirme = await confirmerAction(
          "Ce plan est en cours — mettre à jour changera les semaines à venir (les séances déjà réalisées/manquées restent enregistrées). Continuer ?",
          { titre: "Modifier le plan en cours", libelleConfirmer: "Mettre à jour" }
        );
        if (!confirme) return;
      }
      await store.modifierPlan(planExistant.id, inputs);
    } else {
      await store.creerPlan(inputs);
    }
    location.hash = "#/plan";
  });

  attachSegmentedControl(container);
  refreshSaisonGating = initSaisonForm(container, saisonId, blocsIntermediairesExistants);
}

/**
 * Câblage du formulaire Saison (objectif final + objectifs intermédiaires) :
 * ajout/retrait dynamique des lignes d'objectifs intermédiaires et soumission
 * vers store.creerSaison (nouvelle saison) ou store.modifierSaison (édition
 * d'une saison existante, saisonId fourni) — régénère toute la saison en
 * conservant son identité, comme modifierPlan le fait pour un plan simple.
 * @param {string|null} saisonId saison à éditer, ou null pour en créer une nouvelle
 * @param {Array<object>} blocsIntermediairesExistants blocs "intermediaire" de la saison à éditer, pour préremplir les lignes
 */
function initSaisonForm(container, saisonId, blocsIntermediairesExistants = []) {
  const liste = container.querySelector("#intermediaires-list");
  let compteur = 0;

  function ajouterLigneIntermediaire(prefill = null) {
    compteur++;
    const div = document.createElement("div");
    div.className = "card";
    div.style.padding = "12px";
    div.dataset.intermediaireRow = "";
    const estTrail = prefill?.discipline === "trail";
    div.innerHTML = `
      <div class="card__header">
        <strong>Objectif intermédiaire ${compteur}</strong>
        <button type="button" class="btn btn--sm" data-remove-intermediaire>Retirer</button>
      </div>
      <div class="field">
        <label>Nom (optionnel)</label>
        <input type="text" data-int-nom value="${escapeAttr(prefill?.objectif ?? "")}" placeholder="ex: 10km de rentrée" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Discipline</label>
          <select data-objectif-discipline data-int-discipline>
            <option value="route" ${estTrail ? "" : "selected"}>Route</option>
            <option value="trail" ${estTrail ? "selected" : ""}>Trail</option>
          </select>
        </div>
        <div class="field" data-champ-denivele ${estTrail ? "" : "hidden"}>
          <label>D+ de la course (m, optionnel)</label>
          <input type="number" min="0" data-int-denivele value="${prefill?.deniveleM ?? ""}" placeholder="ex: 800" />
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Distance (km, optionnel)</label><input type="number" step="0.001" min="0" data-int-distance value="${prefill?.distanceObjectifM ? prefill.distanceObjectifM / 1000 : ""}" placeholder="ex: 10" /></div>
        <div class="field"><label>Temps objectif (hh:mm:ss, optionnel)</label><input type="text" data-int-temps value="${prefill?.tempsObjectifS ? secondesVersLabel(prefill.tempsObjectifS) : ""}" /></div>
      </div>
      <div class="field"><label>Date</label><input type="date" required data-int-date value="${prefill?.dateEcheance?.slice(0, 10) ?? ""}" /></div>
      <div class="field-row">
        <div class="field">
          <label>Priorité de la course</label>
          <select data-int-priorite>
            <option value="C" ${!prefill?.priorite || prefill.priorite === "C" ? "selected" : ""}>C — course d'étape (affûtage minimal)</option>
            <option value="B" ${prefill?.priorite === "B" ? "selected" : ""}>B — course intermédiaire importante</option>
            <option value="A" ${prefill?.priorite === "A" ? "selected" : ""}>A — aussi importante qu'un objectif final</option>
          </select>
        </div>
        <div class="field">
          <label>Jours de coupure après (optionnel)</label>
          <input type="number" min="1" data-int-coupure value="${prefill?.joursDeCoupureBrut ?? ""}" placeholder="1 par défaut" />
        </div>
      </div>
      <div class="field">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:normal;">
          <input type="checkbox" data-int-perso-dispo ${prefill?.joursEntrainementPerso ? "checked" : ""} style="margin:0;" />
          Jours d'entraînement/charge différents de la saison pour cet objectif
        </label>
      </div>
      <div data-champ-dispo-perso ${prefill?.joursEntrainementPerso ? "" : "hidden"}>
        <div class="field">
          <label>Jours d'entraînement (cet objectif)</label>
          ${renderJoursCheckboxes(prefill?.joursEntrainementPerso ?? joursParDefaut(5), "data-jour-int")}
        </div>
        <div class="field">
          <label>Charge hebdo (cet objectif)</label>
          <select data-int-charge>
            <option value="faible" ${prefill?.chargeHebdoMoyenneActuellePerso === "faible" ? "selected" : ""}>Faible</option>
            <option value="moderee" ${!prefill?.chargeHebdoMoyenneActuellePerso || prefill.chargeHebdoMoyenneActuellePerso === "moderee" ? "selected" : ""}>Modérée</option>
            <option value="elevee" ${prefill?.chargeHebdoMoyenneActuellePerso === "elevee" ? "selected" : ""}>Élevée</option>
          </select>
        </div>
      </div>`;
    liste.appendChild(div);
    div.querySelector("[data-remove-intermediaire]").addEventListener("click", async () => {
      // Confirmation seulement si la ligne contient déjà une saisie —
      // retirer une ligne vide qu'on vient d'ajouter par erreur ne mérite
      // pas d'interruption, mais une ligne déjà remplie (nom, distance ou
      // date) représente une vraie perte de saisie si le clic est accidentel.
      const dejaRemplie = ["[data-int-nom]", "[data-int-distance]", "[data-int-date]"].some(
        (sel) => div.querySelector(sel).value.trim() !== ""
      );
      if (dejaRemplie) {
        const confirme = await confirmerAction("Retirer cet objectif intermédiaire ? La saisie de cette ligne sera perdue.", {
          titre: "Retirer l'objectif",
          libelleConfirmer: "Retirer",
          danger: true,
        });
        if (!confirme) return;
      }
      div.remove();
    });
    div.querySelector("[data-int-perso-dispo]").addEventListener("change", (e) => {
      div.querySelector("[data-champ-dispo-perso]").hidden = !e.target.checked;
    });
  }

  for (const bloc of blocsIntermediairesExistants) ajouterLigneIntermediaire(bloc);

  container.querySelector("#btn-ajouter-intermediaire").addEventListener("click", () => ajouterLigneIntermediaire());

  container.querySelector("#btn-supprimer-saison")?.addEventListener("click", async () => {
    const confirme = await confirmerAction("Supprimer cette saison et tous ses blocs ? Cette action est irréversible.", {
      titre: "Supprimer la saison",
      libelleConfirmer: "Supprimer",
      danger: true,
    });
    if (!confirme) return;
    await store.supprimerSaison(saisonId);
    await render(container);
  });

  // Le champ D+ n'a de sens qu'en trail (objectif final, lignes
  // intermédiaires) — géré par l'écouteur délégué unique posé sur le
  // conteneur dans render() (couvre aussi le plan simple).

  // Même logique de garde-fou en amont que le formulaire Plan simple
  // (updateSubmitPlanState) : profil renseigné ET au moins un jour coché.
  const updateSubmitSaisonState = creerGatingFormulaire(container, {
    noteId: "s-profil-manquant-note",
    submitId: "submit-saison",
    jourAttr: "data-jour-saison",
    countId: "s-jours-count",
  });
  activerEtapesFormulaire(container.querySelector("#form-saison"));

  container.querySelector("#form-saison").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { profil: p } = store.getState();
    // Garde-fou de secours (le bouton est déjà désactivé en amont, cf.
    // updateSubmitSaisonState) — toast plutôt qu'alert() bloquant.
    if (!p) {
      afficherToast("Renseigne d'abord ton profil (performance de référence).", { type: "error" });
      return;
    }
    const facteurGapCalibre = Number(container.querySelector("#s-gap-calibre").value) || 1;
    const debut = container.querySelector("#s-debut").value;
    const charge = container.querySelector("#s-charge").value;
    const volumeHebdoMaxH = Number(container.querySelector("#s-volume-hebdo-max").value) || null;
    const joursEntrainement = Array.from(container.querySelectorAll("[data-jour-saison]:checked")).map((cb) => Number(cb.value));

    const finalChamps = lireChampsObjectif(container, "s-final-");
    const finalDate = container.querySelector("#s-final-date").value;

    if (!finalDate) {
      afficherToast("Choisis la date de l'objectif final.", { type: "error" });
      return;
    }
    if (!joursEntrainement.length) {
      afficherToast("Choisis au moins un jour d'entraînement.", { type: "error" });
      return;
    }

    const objectifsIntermediaires = Array.from(container.querySelectorAll("[data-intermediaire-row]")).map((row) => {
      const date = row.querySelector("[data-int-date]").value;
      const distanceKm = Number(row.querySelector("[data-int-distance]").value) || null;
      const tempsLabel = row.querySelector("[data-int-temps]").value.trim();
      const discipline = row.querySelector("[data-int-discipline]").value;
      const deniveleM = Number(row.querySelector("[data-int-denivele]").value) || null;
      const perso = row.querySelector("[data-int-perso-dispo]").checked;
      const joursCoupure = Number(row.querySelector("[data-int-coupure]").value) || null;
      return {
        nom: row.querySelector("[data-int-nom]").value,
        discipline,
        deniveleM: discipline === "trail" ? deniveleM : null,
        distanceM: distanceKm ? distanceKm * 1000 : null,
        tempsS: tempsLabel ? labelVersSecondes(tempsLabel) : null,
        date: date ? new Date(date).toISOString() : null,
        priorite: row.querySelector("[data-int-priorite]").value,
        joursDeCoupure: joursCoupure,
        joursEntrainement: perso
          ? Array.from(row.querySelectorAll("[data-jour-int]:checked")).map((cb) => Number(cb.value))
          : null,
        chargeHebdoMoyenneActuelle: perso ? row.querySelector("[data-int-charge]").value : null,
      };
    });
    if (objectifsIntermediaires.some((o) => !o.date)) {
      afficherToast("Chaque objectif intermédiaire a besoin d'une date (ou retire la ligne).", { type: "error" });
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
        nom: finalChamps.nom,
        discipline: finalChamps.discipline,
        deniveleM: finalChamps.deniveleM,
        distanceM: finalChamps.distanceM,
        tempsS: finalChamps.tempsS,
        date: new Date(finalDate).toISOString(),
      },
      objectifsIntermediaires,
    };

    try {
      if (saisonId) {
        // Même garde-fou que pour un plan simple en cours (updateSubmitPlanState
        // / la confirmation du formulaire Plan) : une saison avec un bloc déjà
        // actif régénère les semaines à venir de ce bloc, pas juste "à créer".
        const aUnBlocActif = store.blocsSaison(saisonId).some((b) => b.statut === "actif");
        if (aUnBlocActif) {
          const confirme = await confirmerAction(
            "Cette saison a un bloc en cours — mettre à jour changera les semaines à venir de ce bloc (les séances déjà réalisées/manquées restent enregistrées). Continuer ?",
            { titre: "Modifier la saison en cours", libelleConfirmer: "Mettre à jour" }
          );
          if (!confirme) return;
        }
        await store.modifierSaison(saisonId, inputs);
      } else {
        await store.creerSaison(inputs);
      }
    } catch (err) {
      afficherToast(err.message, { type: "error" });
      return;
    }
    location.hash = "#/plan";
  });

  return updateSubmitSaisonState;
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
