import * as repo from "../data/repo.js";
import { sessionLoad, acwr, acwrRiskLevel, latestLoadState, ACWR_SAFE_MIN, ACWR_SAFE_MAX } from "../engines/load.js";
import { escapeHtml, formatDateFr, daysUntil, zoneTag, badge, emptyState, card } from "./components.js";

async function buildDailyLoads() {
  const plans = await Promise.all((await repo.listObjectifs()).map((o) => repo.getPlanForObjectif(o.id)));
  const validPlans = plans.filter(Boolean);
  const allSeances = (
    await Promise.all(validPlans.map((p) => repo.listSeancesByPlan(p.id)))
  ).flat();

  const byDate = new Map();
  for (const s of allSeances) {
    if (s.status !== "realisee" && s.status !== "modifiee") continue;
    const distanceKm = s.log?.realiseKm ?? s.targetVolumeKm;
    const load = sessionLoad({ distanceKm, intensityFactor: intensityFactorFor(s.type) });
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + load);
  }
  return [...byDate.entries()].map(([date, load]) => ({ date, load }));
}

function intensityFactorFor(type) {
  return { T: 1.3, I: 1.5, R: 1.4, longue: 1.1, E: 1, recuperation: 0.7 }[type] ?? 1;
}

function riskBadge(level) {
  if (level === "risque_surcharge") return badge("ACWR élevé — risque de surcharge", "danger");
  if (level === "sous_charge") return badge("ACWR bas — sous-charge", "warning");
  if (level === "inconnu") return badge("Pas assez de données", "muted");
  return badge("ACWR dans la zone sûre", "ok");
}

async function findSeanceDuJour() {
  const today = new Date().toISOString().slice(0, 10);
  const objectifs = await repo.listObjectifs();
  for (const o of objectifs) {
    const plan = await repo.getPlanForObjectif(o.id);
    if (!plan) continue;
    const seances = await repo.listSeancesByPlan(plan.id);
    const found = seances.find((s) => s.date === today);
    if (found) return { seance: found, objectif: o };
  }
  return null;
}

export async function renderDashboard(params, container) {
  const objectifPrincipal = await repo.getObjectifPrincipal();
  const dailyLoads = await buildDailyLoads();
  const { ratio } = acwr(dailyLoads, new Date().toISOString().slice(0, 10));
  const riskLevel = acwrRiskLevel(ratio);
  const { ctl, atl, tsb } = latestLoadState(dailyLoads);
  const seanceDuJour = await findSeanceDuJour();

  const objectifCard = objectifPrincipal
    ? card(`
        <h2>${escapeHtml(objectifPrincipal.nom)}</h2>
        <p class="muted">${objectifPrincipal.type === "trail" ? "Trail" : "Route"} · ${escapeHtml(String(objectifPrincipal.distanceKm))} km${
          objectifPrincipal.deniveleM ? ` · ${escapeHtml(String(objectifPrincipal.deniveleM))} m D+` : ""
        }</p>
        <div class="stat">
          <div class="value">${daysUntil(objectifPrincipal.dateCourse)}</div>
          <div class="label">jours restants</div>
        </div>
        <p class="muted">Course le ${formatDateFr(objectifPrincipal.dateCourse)}</p>
        <a class="btn btn-secondary" href="#/plan?objectifId=${objectifPrincipal.id}">Voir le plan</a>
      `)
    : card(emptyState("Aucun objectif principal défini.", `<a class="btn" href="#/saison">Créer un objectif</a>`));

  const chargeCard = card(`
    <h3>Charge &amp; fraîcheur</h3>
    <div class="grid-3">
      <div class="stat"><div class="value">${ctl}</div><div class="label">CTL (fitness)</div></div>
      <div class="stat"><div class="value">${atl}</div><div class="label">ATL (fatigue)</div></div>
      <div class="stat"><div class="value">${tsb}</div><div class="label">TSB (forme)</div></div>
    </div>
    <p>ACWR : <strong>${Number.isFinite(ratio) ? ratio.toFixed(2) : "--"}</strong> ${riskBadge(riskLevel)}</p>
    <p class="muted" style="font-size:0.78rem">Zone sûre indicative : ${ACWR_SAFE_MIN}–${ACWR_SAFE_MAX}. Calculé à partir des séances marquées réalisées.</p>
  `);

  const seanceCard = seanceDuJour
    ? card(`
        <h3>Séance du jour</h3>
        <a class="session-row" href="#/seance?id=${seanceDuJour.seance.id}">
          <span>${zoneTag(seanceDuJour.seance.zone)} ${escapeHtml(seanceDuJour.seance.label)}</span>
          <span class="meta">${seanceDuJour.seance.targetVolumeKm} km</span>
        </a>
      `)
    : card(`<h3>Séance du jour</h3><p class="muted">Aucune séance planifiée aujourd'hui.</p>`);

  container.innerHTML = `
    <h1 class="visually-hidden">Dashboard</h1>
    ${objectifCard}
    ${chargeCard}
    ${seanceCard}
  `;
}
