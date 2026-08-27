import * as store from "../../store.js";
import { ewmaAcwr, acwr } from "../../engines/load.js";
import { barresDPlusMensuel } from "../../engines/performance.js";
import { Sparkline, ZoneRepartition, BarChart, ActivityHeatmap, SegmentedControl, attachSegmentedControl, attachChartInteractions } from "../components.js";
import { formatPace } from "../../engines/vdot.js";

export async function render(container) {
  const { profil, plans, seancesRealisees } = store.getState();
  const plan = plans.find((p) => p.statut === "actif") ?? plans[plans.length - 1];

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Historique &amp; Stats</h1>
      </div>

      ${SegmentedControl(
        [
          { id: "tendances", label: "Tendances" },
          { id: "detail", label: "Détail" },
        ],
        "tendances"
      )}

      <div class="screen-segment active" data-segment-panel="tendances">
        <div class="card">
          <h2>VDOT dans le temps</h2>
          ${profil?.historiqueVdot?.length ? Sparkline(profil.historiqueVdot.map((h) => h.vdot)) : `<p class="muted">Pas encore d'historique.</p>`}
        </div>

        <div class="card">
          <h2>ACWR / EWMA dans le temps</h2>
          ${renderLoadHistory(store.chargeHebdoDepuisLogs())}
        </div>

        <div class="card">
          <h2>Régularité (26 dernières semaines)</h2>
          ${ActivityHeatmap(store.volumeParJourAvecDates(), { semaines: 26 })}
        </div>
      </div>

      <div class="screen-segment" data-segment-panel="detail">
        <div class="card">
          <h2>Respect des zones hebdo (semaine en cours)</h2>
          ${plan ? ZoneRepartition(semaineActuelle(plan)) : `<p class="muted">Aucun plan.</p>`}
        </div>

        <div class="card">
          <div class="card__header">
            <h2>Activités Strava récentes</h2>
            <a class="btn btn--sm" href="#/reglages">Synchroniser</a>
          </div>
          ${renderActivitesRecentes(seancesRealisees)}
        </div>

        <div class="card">
          <h2>D+ cumulé mensuel</h2>
          ${renderDPlusMensuel(seancesRealisees)}
        </div>
      </div>
    </div>`;

  attachSegmentedControl(container);
  attachChartInteractions(container);
}

function renderLoadHistory(loads) {
  if (loads.length < 7) return `<p class="muted">Nécessite au moins 7 jours de données (journal quotidien et/ou activités Strava synchronisées).</p>`;
  const points = [];
  for (let i = 6; i < loads.length; i++) {
    const window = loads.slice(0, i + 1);
    points.push({ simple: acwr(window), ewma: ewmaAcwr(window) });
  }
  return Sparkline(points.map((p) => p.ewma));
}

function renderActivitesRecentes(seancesRealisees) {
  if (!seancesRealisees?.length) {
    return `<p class="muted">Aucune activité synchronisée pour l'instant — configure ton token Strava dans Réglages puis synchronise.</p>`;
  }
  const recentes = [...seancesRealisees].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  return `<div class="stack">${recentes
    .map(
      (a) => `
      <div class="row" style="justify-content:space-between; border-bottom:1px solid var(--color-border); padding-bottom:8px;">
        <div>
          <div>${escapeAttr(a.nom)}</div>
          <div class="muted">${new Date(a.date).toLocaleDateString("fr-FR")} — <span class="data">${a.distanceKm.toFixed(1)} km</span> · ${Math.round(a.dureeMin)} min${a.deniveleM ? ` · D+ ${Math.round(a.deniveleM)} m` : ""}${a.allureMoyenneMinParKm ? ` · <span class="data">${formatPace(a.allureMoyenneMinParKm)}</span>` : ""}</div>
        </div>
        ${a.seanceIndex != null ? `<span class="badge-warning" style="border-color: var(--color-success); color: var(--color-success);">rapprochée</span>` : ""}
      </div>`
    )
    .join("")}</div>`;
}

function renderDPlusMensuel(seancesRealisees) {
  const barres = barresDPlusMensuel(seancesRealisees);
  if (!barres.some((b) => b.value > 0)) {
    return `<p class="muted">Aucun dénivelé enregistré pour l'instant — connecte et synchronise Strava (<a href="#/reglages">Réglages</a>) pour le voir apparaître ici.</p>`;
  }
  return BarChart(barres, { unite: " m", formatValue: (v) => Math.round(v).toString(), colorVar: "--color-structural-strong" });
}

function semaineActuelle(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
