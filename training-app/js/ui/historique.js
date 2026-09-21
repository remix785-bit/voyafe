import * as repo from "../data/repo.js";
import { formatPace } from "../engines/vdot.js";
import { escapeHtml, formatDateFr, zoneTag, card, emptyState } from "./components.js";

function paceMinPerKm(distanceKm, dureeMin) {
  if (!distanceKm || !dureeMin) return null;
  return dureeMin / distanceKm;
}

function ecartRow(s) {
  const log = s.log ?? {};
  const realisePaceMinPerKm = paceMinPerKm(log.realiseKm, log.realiseDureeMin);
  return `
    <a class="session-row" href="#/seance?id=${s.id}">
      <span>${zoneTag(s.zone)} ${escapeHtml(s.label)}
        <br><span class="meta">${formatDateFr(s.date)}</span>
      </span>
      <span class="meta" style="text-align:right">
        Distance : ${s.targetVolumeKm} km prévu → ${log.realiseKm ?? "?"} km réalisé<br>
        Durée : ${log.realiseDureeMin ?? "?"} min réalisé<br>
        Allure réalisée : ${realisePaceMinPerKm ? formatPace(realisePaceMinPerKm) : "--:--/km"}
        ${log.rpe ? ` · RPE ${log.rpe}` : ""}
      </span>
    </a>
  `;
}

async function buildCyclesResume() {
  const objectifs = await repo.listObjectifs();
  const cycles = [];
  for (const o of objectifs) {
    const plan = await repo.getPlanForObjectif(o.id);
    if (!plan) continue;
    const seances = await repo.listSeancesByPlan(plan.id);
    const realisees = seances.filter((s) => s.status === "realisee" || s.status === "modifiee");
    const volumeTotalKm = realisees.reduce((sum, s) => sum + (s.log?.realiseKm ?? s.targetVolumeKm), 0);
    cycles.push({
      objectif: o,
      plan,
      volumeTotalKm: Math.round(volumeTotalKm),
      nbSeancesRealisees: realisees.length,
      nbSeancesTotal: seances.length,
    });
  }
  return cycles.sort((a, b) => new Date(b.plan.dateCourse) - new Date(a.plan.dateCourse));
}

export async function renderHistorique(params, container) {
  const plans = await Promise.all((await repo.listObjectifs()).map((o) => repo.getPlanForObjectif(o.id)));
  const validPlans = plans.filter(Boolean);
  const allSeances = (await Promise.all(validPlans.map((p) => repo.listSeancesByPlan(p.id)))).flat();
  const loggees = allSeances
    .filter((s) => s.status === "realisee" || s.status === "modifiee")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const cycles = await buildCyclesResume();
  const resultats = await repo.listResultats();

  container.innerHTML = `
    ${card(`
      <h2>Prévu vs réalisé</h2>
      ${loggees.length > 0 ? loggees.map(ecartRow).join("") : emptyState("Aucune séance loggée pour l'instant.")}
    `)}
    ${card(`
      <h3>Comparaison inter-cycles</h3>
      ${
        cycles.length > 0
          ? `<table>
              <thead><tr><th>Objectif</th><th>Course</th><th>Volume total réalisé</th><th>Séances réalisées</th><th>VDOT fin de cycle</th></tr></thead>
              <tbody>
                ${cycles
                  .map((c) => {
                    const vdotFinCycle = resultats
                      .filter((r) => new Date(r.date) <= new Date(c.objectif.dateCourse))
                      .slice(-1)[0]?.vdot;
                    return `<tr>
                      <td>${escapeHtml(c.objectif.nom)}</td>
                      <td>${formatDateFr(c.objectif.dateCourse)}</td>
                      <td>${c.volumeTotalKm} km</td>
                      <td>${c.nbSeancesRealisees} / ${c.nbSeancesTotal}</td>
                      <td>${vdotFinCycle ?? "--"}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>`
          : emptyState("Aucun cycle d'entraînement terminé pour l'instant.")
      }
    `)}
  `;
}
