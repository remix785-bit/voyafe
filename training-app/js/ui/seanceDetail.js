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
          <button type="submit" class="btn btn-secondary" style="margin-top:8px">Marquer manquée et recalculer le plan</button>
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
    const raison = new FormData(e.target).get("raison");
    const avant = await repo.listSeancesByPlan(seance.planId);
    const avantByid = new Map(avant.map((s) => [s.id, s.targetVolumeKm]));

    await repo.marquerAlea(seance.id, raison);

    const apres = await repo.listSeancesByPlan(seance.planId);
    const memeSemaine = apres.filter((s) => s.weekIndex === seance.weekIndex);
    const modifiees = memeSemaine.filter((s) => avantByid.get(s.id) !== s.targetVolumeKm);

    container.querySelector("#status-msg").textContent = "Séance marquée manquée, le reste du plan a été recalculé.";
    container.querySelector("#alea-result").innerHTML = `
      <p class="muted" style="font-size:0.8rem">
        Recalcul (motif : ${escapeHtml(raison)}) — ${modifiees.length} séance(s) ajustée(s) (volume réduit) sur la semaine ${
      seance.weekIndex + 1
    }. Les séances de seuil/intervalle de cette semaine ont été retirées du programme.
      </p>
    `;
  });
}
