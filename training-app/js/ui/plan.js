import * as repo from "../data/repo.js";
import { escapeHtml, formatDateFr, zoneTag, badge, emptyState, card } from "./components.js";

const FIT_LEVEL_BADGE = { atteint: "ok", ambitieux: "warning", tres_ambitieux: "danger" };

const STATUS_BADGE = {
  planifiee: null,
  realisee: () => badge("Réalisée", "ok"),
  modifiee: () => badge("Modifiée", "warning"),
  manquee: () => badge("Manquée", "danger"),
};

function seanceRow(s) {
  const statusBadge = STATUS_BADGE[s.status]?.() ?? "";
  return `
    <a class="session-row" href="#/seance?id=${s.id}">
      <span>${zoneTag(s.zone)} ${escapeHtml(s.label)}
        <br><span class="meta">${formatDateFr(s.date)} · ${s.targetVolumeKm} km</span>
      </span>
      <span>${statusBadge}</span>
    </a>
  `;
}

function weekBlock(weekIndex, seances) {
  const total = seances.reduce((s, x) => s + x.targetVolumeKm, 0);
  const phase = seances[0]?.phase ?? "";
  const decharge = seances[0]?.decharge;
  return `
    <div class="week-block">
      <div class="week-block-header">
        <strong>Semaine ${weekIndex + 1}</strong>
        <span class="meta muted">${phase}${decharge ? " · décharge" : ""} · ${Math.round(total)} km</span>
      </div>
      ${seances.map(seanceRow).join("")}
    </div>
  `;
}

export async function renderPlan(params, container) {
  const objectifId = params.objectifId ?? (await repo.getObjectifPrincipal())?.id;
  if (!objectifId) {
    container.innerHTML = card(emptyState("Aucun objectif sélectionné.", `<a class="btn" href="#/saison">Créer un objectif</a>`));
    return;
  }
  const objectif = await repo.getObjectif(objectifId);
  if (!objectif) {
    container.innerHTML = card(emptyState("Objectif introuvable."));
    return;
  }
  let plan = await repo.getPlanForObjectif(objectifId);

  container.innerHTML = `
    ${card(`
      <h2>${escapeHtml(objectif.nom)}</h2>
      <p class="muted">${objectif.type === "trail" ? "Trail" : "Route"} · ${objectif.distanceKm} km${
        objectif.deniveleM ? ` · ${objectif.deniveleM} m D+` : ""
      } · course le ${formatDateFr(objectif.dateCourse)}</p>
      ${
        plan
          ? `<p class="muted" style="font-size:0.78rem">Plan généré le ${formatDateFr(plan.generatedAt)} — ${plan.totalWeeks} semaines (${plan.mode === "gestion_forme_existante" ? "gestion de forme existante" : "cycle complet"}).</p>
             <p class="muted" style="font-size:0.78rem">Priorité ${escapeHtml(plan.priorite ?? "B")} · Axe de travail : ${escapeHtml(plan.axeTravail ?? "équilibre")}</p>
             ${
               plan.objectifFit
                 ? `<p>Calage objectif : ${badge(plan.objectifFit.label, FIT_LEVEL_BADGE[plan.objectifFit.niveau] ?? "muted")}
                    <span class="muted" style="font-size:0.78rem">(VDOT actuel ${plan.objectifFit.vdotActuel} vs. VDOT requis ${plan.objectifFit.vdotRequis})</span></p>`
                 : ""
             }
             ${plan.prepWindowWarning ? `<p class="muted" style="font-size:0.78rem">${badge("Fenêtre courte", "warning")} ${escapeHtml(plan.prepWindowWarning.message)}</p>` : ""}
             <button id="btn-regenerer" class="btn btn-secondary">Régénérer le plan</button>`
          : `<button id="btn-generer" class="btn">Générer le plan</button>`
      }
    `)}
    <div id="plan-weeks"></div>
  `;

  async function renderWeeks() {
    if (!plan) return;
    const seances = await repo.listSeancesByPlan(plan.id);
    const byWeek = new Map();
    for (const s of seances) {
      if (!byWeek.has(s.weekIndex)) byWeek.set(s.weekIndex, []);
      byWeek.get(s.weekIndex).push(s);
    }
    const weeksHtml = [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, list]) => weekBlock(idx, list))
      .join("");
    container.querySelector("#plan-weeks").innerHTML = weeksHtml || emptyState("Plan vide.");
  }

  async function generer() {
    plan = await repo.generateAndSavePlan(objectif);
    await renderPlan(params, container);
  }

  container.querySelector("#btn-generer")?.addEventListener("click", generer);
  container.querySelector("#btn-regenerer")?.addEventListener("click", generer);

  await renderWeeks();
}
