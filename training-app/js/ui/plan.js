import * as repo from "../data/repo.js";
import { ACWR_SAFE_MIN, ACWR_SAFE_MAX } from "../engines/load.js";
import { escapeHtml, formatDateFr, zoneTag, badge, emptyState, card } from "./components.js";
import { chargeSnapshot, seancesManqueesRecentes, surentrainementSignal, semaineActuelle, SEANCES_MANQUEES_ALERTE_SEUIL, FENETRE_ALERTE_JOURS } from "./monitoring.js";

const FIT_LEVEL_BADGE = { atteint: "ok", ambitieux: "warning", tres_ambitieux: "danger" };

function riskBadge(level) {
  if (level === "risque_surcharge") return badge("ACWR élevé — risque de surcharge", "danger");
  if (level === "sous_charge") return badge("ACWR bas — sous-charge", "warning");
  if (level === "inconnu") return badge("Pas assez de données", "muted");
  return badge("ACWR dans la zone sûre", "ok");
}

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

function volumeParSemaineRows(seances) {
  const byWeek = new Map();
  for (const s of seances) {
    if (!byWeek.has(s.weekIndex)) byWeek.set(s.weekIndex, { prevu: 0, realise: 0, aVenir: 0 });
    const w = byWeek.get(s.weekIndex);
    w.prevu += s.targetVolumeKm;
    if (s.status === "realisee" || s.status === "modifiee") w.realise += s.log?.realiseKm ?? s.targetVolumeKm;
    else if (s.status === "planifiee") w.aVenir += s.targetVolumeKm;
  }
  return [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
}

async function buildMonitoringHtml(objectif, plan) {
  const seances = await repo.listSeancesByPlan(plan.id);
  const semaine = semaineActuelle(plan);
  const realisees = seances.filter((s) => s.status === "realisee" || s.status === "modifiee");
  const pctRealise = seances.length > 0 ? Math.round((realisees.length / seances.length) * 100) : 0;

  const { ctl, atl, tsb, ratio, riskLevel } = await chargeSnapshot();
  const seancesManquees = await seancesManqueesRecentes(objectif.id);
  const surentrainement = await surentrainementSignal();

  const alertesHtml = [
    seancesManquees.length >= SEANCES_MANQUEES_ALERTE_SEUIL
      ? `<p>${badge("Alerte", "danger")} ${seancesManquees.length} séances manquées sur cet objectif ces ${FENETRE_ALERTE_JOURS} derniers jours.</p>`
      : "",
    riskLevel === "risque_surcharge" || riskLevel === "sous_charge"
      ? `<p>${riskBadge(riskLevel)}</p>`
      : "",
    surentrainement.detecte
      ? `<p>${badge("Signaux convergents", "danger")} RPE élevé et sommeil dégradé sur ${surentrainement.joursConvergents} jours récents — envisage une décharge anticipée.</p>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const volumeRows = volumeParSemaineRows(seances)
    .map(
      ([idx, w]) => `
        <tr>
          <td>Semaine ${idx + 1}</td>
          <td>${Math.round(w.prevu * 10) / 10} km prévu</td>
          <td>${w.aVenir > 0 ? "à venir" : `${Math.round(w.realise * 10) / 10} km réalisé`}</td>
        </tr>
      `
    )
    .join("");

  return card(`
    <h3>Suivi de la préparation</h3>
    <div class="grid-3">
      <div class="stat"><div class="value">${semaine} / ${plan.totalWeeks}</div><div class="label">semaine du plan</div></div>
      <div class="stat"><div class="value">${pctRealise}%</div><div class="label">séances réalisées</div></div>
      <div class="stat"><div class="value">${plan.objectifFit ? badge(plan.objectifFit.label, FIT_LEVEL_BADGE[plan.objectifFit.niveau] ?? "muted") : "--"}</div><div class="label">ambition</div></div>
    </div>
    <p class="muted" style="font-size:0.78rem">${realisees.length} / ${seances.length} séances loggées sur l'ensemble du plan.</p>
    <h4 style="margin-bottom:4px">Charge &amp; fraîcheur</h4>
    <div class="grid-3">
      <div class="stat"><div class="value">${ctl}</div><div class="label">CTL (fitness)</div></div>
      <div class="stat"><div class="value">${atl}</div><div class="label">ATL (fatigue)</div></div>
      <div class="stat"><div class="value">${tsb}</div><div class="label">TSB (forme)</div></div>
    </div>
    <p>ACWR : <strong>${Number.isFinite(ratio) ? ratio.toFixed(2) : "--"}</strong> ${riskBadge(riskLevel)}</p>
    <p class="muted" style="font-size:0.78rem">Zone sûre indicative : ${ACWR_SAFE_MIN}–${ACWR_SAFE_MAX}. Charge globale (tous objectifs), calculée à partir des séances réalisées.</p>
    ${alertesHtml ? `<h4 style="margin-bottom:4px">Alertes actives</h4>${alertesHtml}` : ""}
    ${
      volumeRows
        ? `<h4 style="margin-bottom:4px">Volume par semaine</h4>
           <table><thead><tr><th>Semaine</th><th>Prévu</th><th>Réalisé</th></tr></thead><tbody>${volumeRows}</tbody></table>`
        : ""
    }
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-secondary btn-small" href="#/nutrition">Nutrition</a>
      <a class="btn btn-secondary btn-small" href="#/historique">Historique</a>
    </div>
  `);
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
  const saison = await repo.listSaisons().then((all) => all.find((s) => s.id === objectif.saisonId));

  container.innerHTML = `
    <p class="muted" style="font-size:0.78rem">
      <a href="#/saison">${escapeHtml(saison?.nom ?? "Saison")}</a> › ${escapeHtml(objectif.nom)}
    </p>
    ${card(`
      <h2>${escapeHtml(objectif.nom)} ${objectif.principal ? badge("Principal", "ok") : badge("Secondaire", "muted")}</h2>
      <p class="muted">${objectif.type === "trail" ? "Trail" : "Route"} · ${objectif.distanceKm} km${
        objectif.deniveleM ? ` · ${objectif.deniveleM} m D+` : ""
      } · course le ${formatDateFr(objectif.dateCourse)} · priorité ${escapeHtml(objectif.priorite ?? "B")}</p>
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
    <div id="plan-monitoring"></div>
    <div id="plan-weeks"></div>
  `;

  async function renderMonitoring() {
    const el = container.querySelector("#plan-monitoring");
    if (!plan) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = await buildMonitoringHtml(objectif, plan);
  }

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

  await renderMonitoring();
  await renderWeeks();
}
