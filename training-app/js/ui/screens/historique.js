import * as store from "../../store.js";
import { ewmaAcwr, acwr } from "../../engines/load.js";
import {
  barresDPlusMensuel,
  statsPerformance,
  barresDistanceHebdo,
  barresDistanceMensuelle,
  detailHebdomadaire,
  detailMensuel,
  nbSemainesMoisPasseEtCourant,
  variationPct,
} from "../../engines/performance.js";
import { Sparkline, ZoneRepartition, BarChart, ActivityHeatmap, SegmentedControl, attachSegmentedControl, attachChartInteractions } from "../components.js";
import { formatPace } from "../../engines/vdot.js";

export async function render(container) {
  const { profil, plans, seancesRealisees, logsQuotidiens } = store.getState();
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
          <h2>Stats hebdomadaires</h2>
          ${renderStatsHebdo(seancesRealisees)}
        </div>

        <div class="card">
          <h2>Stats mensuelles</h2>
          ${renderStatsMensuelles(seancesRealisees)}
        </div>

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

        <div class="card">
          <h2>Poids</h2>
          ${renderPoids(logsQuotidiens)}
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
  // EWMA (lissé) ET simple (7j/28j brut) étaient tous deux calculés par
  // load.js, mais seul l'EWMA était jamais affiché — le simple, plus réactif
  // et plus lisible pour un pic ponctuel, restait invisible.
  return `
    <div style="margin-bottom:10px;">
      <div class="row" style="justify-content:space-between;"><span class="muted">EWMA (lissé, référence)</span><span class="data">${points[points.length - 1].ewma.toFixed(2)}</span></div>
      ${Sparkline(points.map((p) => p.ewma))}
    </div>
    <div>
      <div class="row" style="justify-content:space-between;"><span class="muted">ACWR simple (7j / 28j)</span><span class="data">${points[points.length - 1].simple.toFixed(2)}</span></div>
      ${Sparkline(points.map((p) => p.simple))}
    </div>`;
}

function renderPoids(logsQuotidiens) {
  const valeurs = logsQuotidiens.filter((l) => l.poids != null).map((l) => l.poids);
  if (valeurs.length < 2) {
    return `<p class="muted">Renseigne ton poids dans le <a href="#/journal">journal quotidien</a> pour voir la tendance apparaître (min. 2 jours).</p>`;
  }
  return `<span class="data">${valeurs[valeurs.length - 1]} kg</span>${Sparkline(valeurs, { height: 50 })}`;
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

/**
 * Stats hebdomadaires réelles (Strava) — semaine en cours vs précédente,
 * tendance en barres et détail semaine par semaine sur le mois passé ET le
 * mois en cours (nbSemainesMoisPasseEtCourant, pas un nombre de semaines
 * fixe arbitraire). Même moteur (engines/performance.js) que le résumé du
 * Dashboard (onglet "Progression"), mais ici comme vue dédiée et complète :
 * l'écran "Historique & Stats" est l'endroit naturel où chercher ces stats,
 * pas seulement un résumé condensé ailleurs.
 */
function renderStatsHebdo(seancesRealisees) {
  const perf = statsPerformance(seancesRealisees);
  if (!perf.semaine.nbSeances && !perf.semainePrecedente.nbSeances) {
    return `<p class="muted">Aucune activité réelle enregistrée — connecte Strava (<a href="#/reglages">Réglages</a>) pour voir tes stats réelles ici, ou synchronise si c'est déjà fait.</p>`;
  }
  const nbSemaines = nbSemainesMoisPasseEtCourant();
  const barresHebdo = barresDistanceHebdo(seancesRealisees, nbSemaines);
  return `
    <div>
      <span class="muted">Cette semaine</span><br />
      <span class="data" style="font-size:1.3rem;">${perf.semaine.distanceKm.toFixed(1)} km</span>${deltaLabel(perf.semaine.distanceKm, perf.semainePrecedente.distanceKm)}
      <p class="muted" style="margin-top:4px;">${Math.round(perf.semaine.dureeMin)} min · D+ ${Math.round(perf.semaine.deniveleM)} m · ${perf.semaine.nbSeances} séance${perf.semaine.nbSeances > 1 ? "s" : ""}${perf.semaine.allureMoyenneMinParKm ? ` · allure moy. ${formatPace(perf.semaine.allureMoyenneMinParKm)}` : ""}</p>
    </div>
    ${barresHebdo.some((b) => b.value > 0) ? `<div style="margin-top:16px;">${BarChart(barresHebdo, { unite: " km" })}</div>` : ""}
    <div style="margin-top:16px;">
      <span class="muted">Détail par semaine (mois passé et en cours)</span>
      ${renderDetailPeriodes(detailHebdomadaire(seancesRealisees, nbSemaines))}
    </div>`;
}

/**
 * Stats mensuelles réelles — même principe que renderStatsHebdo, avec en
 * plus le D+ cumulé mensuel (regroupé ici avec le reste des stats
 * mensuelles plutôt que dans un onglet "Détail" séparé, plus logique).
 */
function renderStatsMensuelles(seancesRealisees) {
  const perf = statsPerformance(seancesRealisees);
  if (!perf.mois.nbSeances && !perf.moisPrecedent.nbSeances) {
    return `<p class="muted">Aucune activité réelle enregistrée — connecte Strava (<a href="#/reglages">Réglages</a>) pour voir tes stats réelles ici, ou synchronise si c'est déjà fait.</p>`;
  }
  const barresMensuel = barresDistanceMensuelle(seancesRealisees);
  const barresDPlus = barresDPlusMensuel(seancesRealisees);
  return `
    <div>
      <span class="muted">Ce mois</span><br />
      <span class="data" style="font-size:1.3rem;">${perf.mois.distanceKm.toFixed(1)} km</span>${deltaLabel(perf.mois.distanceKm, perf.moisPrecedent.distanceKm)}
      <p class="muted" style="margin-top:4px;">${Math.round(perf.mois.dureeMin)} min · D+ ${Math.round(perf.mois.deniveleM)} m · ${perf.mois.nbSeances} séance${perf.mois.nbSeances > 1 ? "s" : ""}${perf.mois.allureMoyenneMinParKm ? ` · allure moy. ${formatPace(perf.mois.allureMoyenneMinParKm)}` : ""}</p>
    </div>
    ${barresMensuel.some((b) => b.value > 0) ? `<div style="margin-top:16px;"><span class="muted">Distance</span>${BarChart(barresMensuel, { unite: " km", colorVar: "--color-functional-strong" })}</div>` : ""}
    ${barresDPlus.some((b) => b.value > 0) ? `<div style="margin-top:16px;"><span class="muted">D+ cumulé</span>${BarChart(barresDPlus, { unite: " m", formatValue: (v) => Math.round(v).toString(), colorVar: "--color-structural-strong" })}</div>` : ""}
    <div style="margin-top:16px;">
      <span class="muted">Détail par mois</span>
      ${renderDetailPeriodes(detailMensuel(seancesRealisees))}
    </div>`;
}

/** Liste "plus récent en premier" des stats complètes d'une série de périodes (semaines ou mois). */
function renderDetailPeriodes(periodes) {
  return `<div class="stack" style="margin-top:8px;">${periodes
    .map(
      (p) => `
      <div style="border-bottom:1px solid var(--color-border); padding-bottom:8px;">
        <div>${escapeAttr(p.label)}</div>
        <div class="muted">${
          p.nbSeances
            ? `<span class="data">${p.distanceKm.toFixed(1)} km</span> · ${Math.round(p.dureeMin)} min · D+ ${Math.round(p.deniveleM)} m · ${p.nbSeances} séance${p.nbSeances > 1 ? "s" : ""}${p.allureMoyenneMinParKm ? ` · ${formatPace(p.allureMoyenneMinParKm)}` : ""}`
            : "Aucune activité"
        }</div>
      </div>`
    )
    .join("")}</div>`;
}

function deltaLabel(actuel, precedent) {
  const pct = variationPct(actuel, precedent);
  if (pct == null) return "";
  const signe = pct >= 0 ? "+" : "";
  return ` <span class="muted">(${signe}${pct.toFixed(0)}% vs période préc.)</span>`;
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
