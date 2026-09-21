import * as repo from "../data/repo.js";
import { acwr, acwrRiskLevel, latestLoadState, ACWR_SAFE_MIN, ACWR_SAFE_MAX } from "../engines/load.js";
import { nextRetestWindow } from "../engines/vdot.js";
import { escapeHtml, formatDateFr, daysUntil, zoneTag, badge, emptyState, card } from "./components.js";
import { buildDailyLoads, seancesManqueesRecentes, surentrainementSignal, SEANCES_MANQUEES_ALERTE_SEUIL, FENETRE_ALERTE_JOURS } from "./monitoring.js";

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
  const seancesManquees = await seancesManqueesRecentes();
  const surentrainement = await surentrainementSignal();
  const dernierResultat = await repo.currentVdotResultat();
  let retestDepasse = false;
  if (dernierResultat) {
    const { maxDate } = nextRetestWindow(dernierResultat.date);
    retestDepasse = new Date() > maxDate;
  }

  const planPrincipal = objectifPrincipal ? await repo.getPlanForObjectif(objectifPrincipal.id) : null;
  const FIT_LEVEL_BADGE = { atteint: "ok", ambitieux: "warning", tres_ambitieux: "danger" };
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
        ${
          planPrincipal?.objectifFit
            ? `<p>Calage objectif : ${badge(planPrincipal.objectifFit.label, FIT_LEVEL_BADGE[planPrincipal.objectifFit.niveau] ?? "muted")}</p>`
            : ""
        }
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

  const alerteManqueesCard =
    seancesManquees.length >= SEANCES_MANQUEES_ALERTE_SEUIL
      ? card(`
          <h3>${badge("Alerte", "danger")} Séances manquées</h3>
          <p>${seancesManquees.length} séances manquées ces ${FENETRE_ALERTE_JOURS} derniers jours — envisage d'ajuster ton plan.</p>
          <a class="btn btn-secondary" href="#/seance?id=${seancesManquees[0].id}">Revoir une séance manquée</a>
        `)
      : "";

  const surentrainementCard = surentrainement.detecte
    ? card(`
        <h3>${badge("Signaux convergents", "danger")} Risque de surentraînement</h3>
        <p>RPE élevé et sommeil dégradé sur ${surentrainement.joursConvergents} jours récents — envisage une décharge anticipée plutôt que d'attendre la décharge programmée.</p>
        <a class="btn btn-secondary" href="#/journal">Voir le journal</a>
      `)
    : "";

  const retestCard = retestDepasse
    ? card(`
        <h3>${badge("À faire", "warning")} Retest VDOT</h3>
        <p>La fenêtre de retest recommandée est dépassée.</p>
        <a class="btn btn-secondary" href="#/profil">Enregistrer un nouveau test</a>
      `)
    : "";

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
    ${alerteManqueesCard}
    ${surentrainementCard}
    ${chargeCard}
    ${retestCard}
    ${seanceCard}
  `;
}
