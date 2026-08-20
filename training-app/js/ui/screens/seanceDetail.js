import * as store from "../../store.js";
import { ZoneBadge, TrainingTimer } from "../components.js";
import { formatPace } from "../../engines/vdot.js";
import { ECHAUFFEMENT_INTENSITE, RETOUR_AU_CALME } from "../../catalog/protocols.js";

let timer = null;

export async function render(container, params) {
  const plan = store.getState().plans.find((p) => p.id === params.plan) ?? store.planActif();
  const semaine = plan?.semaines.find((s) => s.numero === Number(params.semaine));
  const seance = semaine?.seances[Number(params.idx)];

  if (!plan || !semaine || !seance) {
    container.innerHTML = `<div class="app-main"><div class="card"><p class="muted">Séance introuvable.</p></div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <div class="card__header">
          ${ZoneBadge(seance.zoneDaniels)}
          <h1 style="margin:0;">${escapeAttr(seance.nom)}</h1>
        </div>
        <p class="muted">${escapeAttr(seance.discipline)} · ${seance.distanceKm ? `<span class="data">${seance.distanceKm.toFixed(1)} km</span> · ` : ""}${Math.round(seance.volumeSeanceMin)} min · allure cible <span class="data">${seance.allureCibleMinParKm ? formatPace(seance.allureCibleMinParKm) : "—"}</span></p>
        ${seance.allureBlocObjectifMinParKm ? `<p>Dont un bloc à l'<strong>allure objectif</strong> (course visée) : <span class="data">${formatPace(seance.allureBlocObjectifMinParKm)}</span> — le reste de la sortie se court à l'allure cible ci-dessus.</p>` : ""}
        ${seance.avertissementVolumeHebdo ? `<p class="badge-warning">${escapeAttr(seance.avertissementVolumeHebdo)}</p>` : ""}
        ${seance.avertissementPlafond ? `<p class="badge-warning">${escapeAttr(seance.avertissementPlafond)}</p>` : ""}
        ${seance.precautions?.length ? seance.precautions.map((p) => `<p class="badge-warning">${escapeAttr(p)}</p>`).join("") : ""}
      </div>

      ${seance.protocoleEchauffement ? renderEchauffement(plan.profilCourant.allures) : ""}

      <div class="card">
        <h2>Corps de séance</h2>
        <p><strong>Format :</strong> ${escapeAttr(seance.structureDetaillee?.format ?? "—")}</p>
        ${renderAlluresCorps(seance)}
        ${seance.structureDetaillee?.contrainteVolume ? `<p class="muted">${escapeAttr(seance.structureDetaillee.contrainteVolume)}</p>` : ""}
        ${seance.structureDetaillee?.ratioEffortRecup ? `<p class="muted">Ratio effort:récup — ${escapeAttr(seance.structureDetaillee.ratioEffortRecup)}</p>` : ""}
        ${seance.structureDetaillee?.progression ? `<p class="muted">Progression — ${escapeAttr(seance.structureDetaillee.progression)}</p>` : ""}
      </div>

      ${renderRetourCalme(plan.profilCourant.allures)}

      <div class="card" id="timer-card">
        <h2>Mode entraînement</h2>
        <div class="training-timer">
          <div class="training-timer__phase" id="timer-phase">Prêt</div>
          <div class="training-timer__clock data" id="timer-clock">--:--</div>
          <div class="training-timer__controls">
            <button class="btn btn--primary" id="timer-start">Démarrer</button>
            <button class="btn" id="timer-pause">Pause</button>
            <button class="btn" id="timer-reset">Réinitialiser</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Séance réalisée</h2>
        <div class="field">
          <label for="note-libre">Note libre (ressenti, conditions)</label>
          <textarea id="note-libre" rows="3">${escapeAttr(seance.note ?? "")}</textarea>
        </div>
        <div class="row">
          <button class="btn btn--primary" id="mark-realisee">Marquer réalisée</button>
          <button class="btn btn--danger" id="mark-manquee">Marquer manquée</button>
        </div>
      </div>
    </div>`;

  wireTimer(container, seance);

  container.querySelector("#mark-realisee")?.addEventListener("click", async () => {
    await store.marquerSeanceStatut(plan.id, semaine.numero, Number(params.idx), "realisee", container.querySelector("#note-libre").value);
    location.hash = "#/plan?semaine=" + semaine.numero;
  });
  container.querySelector("#mark-manquee")?.addEventListener("click", async () => {
    await store.marquerSeanceStatut(plan.id, semaine.numero, Number(params.idx), "manquee", container.querySelector("#note-libre").value);
    location.hash = "#/plan?semaine=" + semaine.numero;
  });
}

function wireTimer(container, seance) {
  const phases = [];
  if (seance.protocoleEchauffement) {
    phases.push({ nom: "Mise en route aérobie", dureeSec: 17 * 60 });
    phases.push({ nom: "Gammes / éducatifs", dureeSec: 9 * 60 });
    phases.push({ nom: "Accélérations progressives", dureeSec: 5 * 60 });
  }
  phases.push({ nom: "Corps de séance", dureeSec: Math.round(seance.volumeSeanceMin * 60) });
  phases.push({ nom: "Footing retour au calme", dureeSec: 12 * 60 });
  phases.push({ nom: "Mobilité", dureeSec: 6 * 60 });

  timer = new TrainingTimer(phases);
  const phaseEl = container.querySelector("#timer-phase");
  const clockEl = container.querySelector("#timer-clock");
  clockEl.textContent = TrainingTimer.formatClock(timer.remaining);

  timer.onTick = (s) => {
    phaseEl.textContent = `${s.phaseNom} (${s.index + 1}/${s.total})`;
    clockEl.textContent = TrainingTimer.formatClock(s.remaining);
  };

  container.querySelector("#timer-start")?.addEventListener("click", () => timer.start());
  container.querySelector("#timer-pause")?.addEventListener("click", () => timer.pause());
  container.querySelector("#timer-reset")?.addEventListener("click", () => {
    timer.reset();
    phaseEl.textContent = "Prêt";
    clockEl.textContent = TrainingTimer.formatClock(timer.remaining);
  });
}

/** Restitue les allures précises du corps de séance — cœur de la demande
 * "corps de séance précis avec les allures pour chaque séance" : l'allure
 * cible est déjà dans l'en-tête, on la réaffiche ici explicitement dans le
 * corps, avec le bloc allure objectif s'il y en a un. */
function renderAlluresCorps(seance) {
  const lignes = [`Allure de la séance : <span class="data">${seance.allureCibleMinParKm ? formatPace(seance.allureCibleMinParKm) : "—"}</span>`];
  if (seance.allureBlocObjectifMinParKm) {
    lignes.push(`Bloc allure objectif (course visée) : <span class="data">${formatPace(seance.allureBlocObjectifMinParKm)}</span>`);
  }
  return `<p>${lignes.join(" · ")}</p>`;
}

function renderEchauffement(allures) {
  // "Footing en zone E basse (60-65% VO2max)" (Partie I §5.1) : le bas de la
  // fourchette E déjà calculé par le moteur VDOT (borne à 59% VO2max), pas
  // une valeur inventée pour l'occasion. "Accélération progressive jusqu'à
  // ~90-95% de l'allure R" : allure R cible (haut de fourchette, la plus rapide).
  const paceEBasse = allures?.E?.slow;
  const paceR = allures?.R?.target;
  return `
    <div class="card">
      <h2>Échauffement (${ECHAUFFEMENT_INTENSITE.dureeTotaleMin.join("-")} min)</h2>
      <div class="stack">
        ${ECHAUFFEMENT_INTENSITE.phases
          .map((p, i) => {
            let alluresNote = "";
            if (i === 0 && paceEBasse) alluresNote = ` — allure E basse <span class="data">${formatPace(paceEBasse)}</span>`;
            if (i === 2 && paceR) alluresNote = ` — jusqu'à ~90-95% de l'allure R (<span class="data">${formatPace(paceR)}</span>)`;
            return `<div><strong>${escapeAttr(p.nom)}</strong>${p.dureeMin ? ` (${p.dureeMin.join("-")} min)` : p.format ? ` (${escapeAttr(p.format)})` : ""}${alluresNote}<p class="muted">${escapeAttr(p.contenu)}</p></div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderRetourCalme(allures) {
  // "Zone E basse / récupération" (Partie I §5.2) : même borne basse de la
  // zone E que pour l'échauffement.
  const paceEBasse = allures?.E?.slow;
  return `
    <div class="card">
      <h2>Retour au calme</h2>
      <div class="stack">
        ${RETOUR_AU_CALME.phases
          .map((p, i) => {
            const alluresNote = i === 0 && paceEBasse ? ` — allure E basse <span class="data">${formatPace(paceEBasse)}</span>` : "";
            return `<div><strong>${escapeAttr(p.nom)}</strong> (${p.dureeMin.join("-")} min)${alluresNote}<p class="muted">${escapeAttr(p.contenu)}</p></div>`;
          })
          .join("")}
      </div>
      <p class="load-gauge__disclaimer">${escapeAttr(RETOUR_AU_CALME.precaution)}</p>
    </div>`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
