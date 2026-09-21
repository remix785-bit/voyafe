import * as repo from "../data/repo.js";
import { paceZonesFromVdot, formatPace } from "../engines/vdot.js";
import { rawPaceToGap, averageGrade } from "../engines/gap.js";
import { escapeHtml, formatDateFr, zoneTag, card } from "./components.js";

function structureList(structure) {
  return `
    <table>
      <thead><tr><th>Bloc</th><th>Zone</th><th>Description</th></tr></thead>
      <tbody>
        ${structure
          .map(
            (b) => `<tr><td>${escapeHtml(b.bloc)}</td><td>${zoneTag(b.zone)}</td><td>${escapeHtml(b.description)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export async function renderSeanceDetail(params, container) {
  const seance = await repo.getSeance(params.id);
  if (!seance) {
    container.innerHTML = card(`<p>Séance introuvable.</p>`);
    return;
  }
  const objectif = await repo.getObjectif(seance.objectifId);
  const vdot = await repo.currentVdot();
  const zones = paceZonesFromVdot(vdot);
  const zoneInfo = zones[seance.zone];

  let gapHtml = "";
  if (objectif?.type === "trail" && objectif.deniveleM && zoneInfo) {
    const grade = averageGrade(objectif.distanceKm * 1000, objectif.deniveleM, 0);
    const rawPace = zoneInfo.slowPaceMinPerKm;
    const gapPace = rawPaceToGap(rawPace, grade);
    gapHtml = `
      <p class="muted" style="font-size:0.8rem">
        Allure GAP estimée (pente moyenne ~${(grade * 100).toFixed(1)}% déduite du profil de l'objectif) :
        <strong>${formatPace(gapPace)}</strong> équivalent-plat pour une allure brute de ${formatPace(rawPace)}.
      </p>
    `;
  }

  const log = seance.log ?? {};

  container.innerHTML = `
    ${card(`
      <h2>${zoneTag(seance.zone)} ${escapeHtml(seance.label)}</h2>
      <p class="muted">${formatDateFr(seance.date)} · Semaine ${seance.weekIndex + 1} · ${escapeHtml(seance.phase)}${
        seance.decharge ? " (décharge)" : ""
      }</p>
      <p>Volume cible : <strong>${seance.targetVolumeKm} km</strong></p>
      ${zoneInfo ? `<p>Allure cible zone ${escapeHtml(seance.zone)} : <strong>${zoneInfo.fastPace} – ${zoneInfo.slowPace}</strong></p>` : ""}
      ${gapHtml}
      ${
        seance.runWalkSuggested
          ? `<p class="muted" style="font-size:0.8rem">Run/walk conseillé sur cette séance en côte (profil débutant et/ou pente raide) : alterner course et marche rapide en montée, plus efficace énergétiquement et moins risqué.</p>`
          : ""
      }
    `)}
    ${card(`<h3>Structure</h3>${structureList(seance.structure)}`)}
    ${card(`
      <h3>Réalisé</h3>
      <form id="form-log">
        <label for="realiseKm">Distance réalisée (km)</label>
        <input id="realiseKm" name="realiseKm" type="number" step="0.1" min="0" value="${log.realiseKm ?? ""}" />

        <label for="realiseDplus">D+ réalisé (m)</label>
        <input id="realiseDplus" name="realiseDplus" type="number" step="10" min="0" value="${log.realiseDplus ?? ""}" />

        <label for="realiseDureeMin">Durée réalisée (min)</label>
        <input id="realiseDureeMin" name="realiseDureeMin" type="number" step="1" min="0" value="${log.realiseDureeMin ?? ""}" />

        <label for="rpe">RPE (1-10)</label>
        <input id="rpe" name="rpe" type="number" min="1" max="10" value="${log.rpe ?? ""}" />

        <label for="sensations">Sensations</label>
        <textarea id="sensations" name="sensations" rows="2">${escapeHtml(log.sensations ?? "")}</textarea>

        <div style="margin-top:16px">
          <button type="submit" class="btn">Enregistrer</button>
        </div>
      </form>
      <div style="margin-top:12px">
        <form id="form-alea">
          <label for="alea-raison">Séance manquée — motif</label>
          <select id="alea-raison" name="raison">
            <option value="blessure">Blessure</option>
            <option value="maladie">Maladie</option>
            <option value="voyage">Voyage</option>
            <option value="autre">Autre</option>
          </select>
          <label for="alea-coupure">Coupure sans courir (jours, si applicable)</label>
          <input id="alea-coupure" name="coupureJours" type="number" min="0" step="1" placeholder="0" />
          <button type="submit" class="btn btn-secondary" style="margin-top:8px">Marquer manquée</button>
        </form>
      </div>
      <p id="status-msg" class="muted" style="font-size:0.8rem"></p>
      <div id="alea-result"></div>
    `)}
  `;

  container.querySelector("#form-log").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    await repo.logSeance(seance.id, {
      realiseKm: data.get("realiseKm") ? parseFloat(data.get("realiseKm")) : null,
      realiseDplus: data.get("realiseDplus") ? parseFloat(data.get("realiseDplus")) : null,
      realiseDureeMin: data.get("realiseDureeMin") ? parseFloat(data.get("realiseDureeMin")) : null,
      rpe: data.get("rpe") ? parseInt(data.get("rpe"), 10) : null,
      sensations: data.get("sensations") ?? "",
    });
    container.querySelector("#status-msg").textContent = "Séance enregistrée.";
  });

  container.querySelector("#form-alea").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const raison = data.get("raison");
    const coupureJours = data.get("coupureJours") ? parseInt(data.get("coupureJours"), 10) : 0;

    const result = await repo.marquerAlea(seance.id, raison, { coupureJours });

    if (!result.recalcule) {
      container.querySelector("#status-msg").textContent = "Séance marquée manquée.";
      container.querySelector("#alea-result").innerHTML = `
        <p class="muted" style="font-size:0.8rem">
          Séance isolée (motif : ${escapeHtml(raison)}) — pas de recalcul du plan. La reprendre ou l'omettre suffit
          (${result.manqueesRecentes} séance(s) manquée(s) sur les 14 derniers jours, sous le seuil de série).
        </p>
      `;
    } else {
      container.querySelector("#status-msg").textContent = "Série de séances manquées / coupure détectée : le plan a été recalculé.";
      container.querySelector("#alea-result").innerHTML = `
        <p class="muted" style="font-size:0.8rem">
          ${
            result.estCoupureProlongee
              ? `Coupure prolongée déclarée (${coupureJours} jours)`
              : `Série de ${result.manqueesRecentes} séances manquées sur les 14 derniers jours`
          } — réévaluation du niveau de reprise (volume réduit, séances de seuil/intervalle retirées) pour éviter un pic ACWR.
          Un retest VDOT est recommandé avant de reprendre la charge prévue si la coupure est significative.
        </p>
      `;
    }
  });
}
