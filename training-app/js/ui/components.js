// Système de composants UI — Partie III §8.
// Fonctions de rendu (chaînes HTML) + petites classes pour les composants
// interactifs (TrainingTimer, QuickLog). Pas de framework : re-rendu ciblé.

import { formatPace, ZONES } from "../../js/engines/vdot.js";

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/** ZoneBadge — étiquette couleur E/M/T/I/R (Section 2, palette). Le titre au
 * survol rappelle le nom complet de la zone (rappel pour les lettres). */
export function ZoneBadge(zone) {
  if (!zone) return "";
  const label = ZONES[zone]?.label ?? zone;
  return `<span class="zone-badge zone-badge--${zone}" title="${escapeHtml(label)}">${zone}</span>`;
}

/**
 * ZoneLegend — rappel permanent (pas seulement au survol, utile sur mobile)
 * de ce que signifie chaque lettre de zone E/M/T/I/R.
 */
export function ZoneLegend() {
  const rows = Object.entries(ZONES)
    .map(([zone, def]) => `<div class="row"><span class="zone-badge zone-badge--${zone}">${zone}</span><span class="muted">${escapeHtml(def.label)}</span></div>`)
    .join("");
  return `<div class="stack" style="gap:6px;">${rows}</div>`;
}

/**
 * Sparkline — mini courbe d'évolution (VDOT, ACWR/EWMA...), réutilisée sur
 * le Dashboard et l'écran Historique & Stats.
 * @param {number[]} values
 */
export function Sparkline(values, { height = 60 } = {}) {
  if (!values.length) return `<p class="muted">—</p>`;
  if (values.length < 2) return `<p class="data">${values[0].toFixed(1)}</p>`;
  const w = 400;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${height - ((v - min) / range) * (height - 8) - 4}`)
    .join(" ");
  return `
    <svg viewBox="0 0 ${w} ${height}" width="100%" height="${height}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="var(--color-accent-strong)" stroke-width="2" />
    </svg>
    <p class="muted">Min ${min.toFixed(1)} — Max ${max.toFixed(1)}</p>`;
}

/**
 * ZoneRepartition — répartition du volume hebdo par zone E/M/T/I/R, en %.
 * @param {{seances: Array<{zoneDaniels:string, volumeSeanceMin:number}>}} semaine
 */
export function ZoneRepartition(semaine) {
  const total = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0) || 1;
  const parZone = {};
  for (const s of semaine.seances) parZone[s.zoneDaniels] = (parZone[s.zoneDaniels] ?? 0) + s.volumeSeanceMin;
  const ordre = ["E", "M", "T", "I", "R"];
  const zones = Object.keys(parZone).sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
  return `<div class="stack" style="gap:6px;">${zones
    .map((z) => `<div class="row"><span class="zone-badge zone-badge--${z}">${z}</span><span class="data">${Math.round((parZone[z] / total) * 100)}%</span></div>`)
    .join("")}</div>`;
}

/**
 * ElevationBar — barre de progression signature, tracée en profil de relief
 * plutôt qu'en rectangle plein.
 * @param {number} pct 0-100
 * @param {string} id id DOM unique pour l'élément svg
 */
export function ElevationBar(pct, id = `eb-${Math.random().toString(36).slice(2, 8)}`) {
  const clamped = Math.max(0, Math.min(100, pct));
  // Profil de relief synthétique fixe (silhouette), la partie remplie suit le %.
  const points = "0,28 40,18 80,24 130,8 180,20 240,6 300,16 360,10 400,22 400,36 0,36";
  const trackPath = "M0,28 L40,18 L80,24 L130,8 L180,20 L240,6 L300,16 L360,10 L400,22";
  const length = 460; // approximation de la longueur du tracé pour le dash-offset
  const offset = length - (length * clamped) / 100;
  return `
    <svg class="elevation-bar" viewBox="0 0 400 36" preserveAspectRatio="none" role="img" aria-label="Progression ${Math.round(clamped)}%">
      <path class="eb-track" d="${trackPath}" />
      <path class="eb-fill" id="${id}" d="${trackPath}" style="--eb-length:${length}; --eb-offset:${offset};" />
    </svg>`;
}

/** LoadGauge — jauge ACWR/EWMA avec zone verte/orange/rouge (Partie I §10). */
export function LoadGauge(loadSummary) {
  const value = loadSummary.acwrEwma;
  const pct = Math.max(0, Math.min(100, (value / 2) * 100)); // échelle 0-2.0
  return `
    <div class="load-gauge">
      <div class="load-gauge__track">
        <div class="load-gauge__marker" style="left:${pct}%"></div>
      </div>
      <div class="load-gauge__value data">${value.toFixed(2)}</div>
    </div>
    <div class="load-gauge__disclaimer">${escapeHtml(loadSummary.disclaimer)}</div>`;
}

/** WeekStrip — bande de visualisation du macrocycle (phases). */
export function WeekStrip(semaines, semaineActuelleNumero) {
  const segs = semaines
    .map((s) => {
      const classes = ["week-strip__seg", `week-strip__seg--${s.phase}`];
      if (s.numero === semaineActuelleNumero) classes.push("week-strip__seg--current");
      if (s.statut === "decharge") classes.push("week-strip__seg--decharge");
      return `<div class="${classes.join(" ")}" title="Semaine ${s.numero} — ${s.phase}${s.statut === "decharge" ? " (décharge)" : ""}"></div>`;
    })
    .join("");
  return `
    <div class="week-strip">${segs}</div>
    <div class="week-strip__legend">
      <span class="leg-base">Base</span>
      <span class="leg-dev">Développement</span>
      <span class="leg-taper">Affûtage</span>
    </div>`;
}

/** SessionCard — carte séance (résumé), utilisée sur Dashboard et Plan. */
export function SessionCard(seance, href) {
  const statusClass =
    seance.statut === "realisee"
      ? "session-card__status--realisee"
      : seance.statut === "manquee"
        ? "session-card__status--manquee"
        : "";
  const statusLabel = { a_venir: "à venir", realisee: "réalisée", manquee: "manquée" }[seance.statut] ?? seance.statut;
  const allure = seance.allureCibleMinParKm ? formatPace(seance.allureCibleMinParKm) : "—";
  const distance = seance.distanceKm ? `${seance.distanceKm.toFixed(1)} km` : null;
  const jourLabel = seance.date
    ? new Date(seance.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
    : null;
  const inner = `
    ${ZoneBadge(seance.zoneDaniels)}
    <div class="session-card__body">
      <div class="session-card__title">${escapeHtml(seance.nom)}</div>
      <div class="session-card__meta">
        ${jourLabel ? `<span class="muted">${jourLabel}</span>` : ""}
        ${distance ? `<span class="data">${distance}</span>` : ""}
        <span>${Math.round(seance.volumeSeanceMin)} min</span>
        <span class="data">${allure}</span>
      </div>
    </div>
    <span class="session-card__status ${statusClass}">${statusLabel}</span>`;
  return href
    ? `<a class="card session-card" href="${href}">${inner}</a>`
    : `<div class="card session-card">${inner}</div>`;
}

/** TrainingTimer — minuteur intégré pour le mode entraînement. */
export class TrainingTimer {
  constructor(phases) {
    this.phases = phases; // [{nom, dureeSec}]
    this.index = 0;
    this.remaining = phases[0]?.dureeSec ?? 0;
    this.interval = null;
    this.onTick = null;
  }

  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.remaining--;
      if (this.remaining <= 0) {
        this.index = Math.min(this.index + 1, this.phases.length - 1);
        this.remaining = this.phases[this.index]?.dureeSec ?? 0;
      }
      this.onTick?.(this.state());
    }, 1000);
  }

  pause() {
    clearInterval(this.interval);
    this.interval = null;
  }

  reset() {
    this.pause();
    this.index = 0;
    this.remaining = this.phases[0]?.dureeSec ?? 0;
  }

  state() {
    return {
      phaseNom: this.phases[this.index]?.nom ?? "Terminé",
      remaining: this.remaining,
      index: this.index,
      total: this.phases.length,
    };
  }

  static formatClock(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
}

/** QuickLog — formulaire de saisie rapide du journal quotidien. */
export function QuickLogScale(name, value, min = 1, max = 10) {
  const buttons = [];
  for (let i = min; i <= max; i++) {
    buttons.push(
      `<button type="button" data-scale="${name}" data-value="${i}" class="${i === value ? "selected" : ""}">${i}</button>`
    );
  }
  return `<div class="quick-log__scale" data-scale-group="${name}">${buttons.join("")}</div>`;
}

/** PacingTimeline — timeline unique allure cible + marqueurs nutrition. */
export function PacingTimeline(timeline) {
  const rows = timeline
    .map((row) => {
      const h = Math.floor(row.tempsCumule / 60);
      const m = Math.round(row.tempsCumule % 60);
      return `
      <tr class="${row.actionNutrition ? "ravito" : ""}">
        <td class="data">${row.km.toFixed(1)} km</td>
        <td class="data">${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}</td>
        <td class="data">${formatPace(row.allureCible)}</td>
        <td>${row.actionNutrition ? escapeHtml(row.actionNutrition) : ""}</td>
      </tr>`;
    })
    .join("");
  return `
    <table class="pacing-timeline">
      <thead><tr><th>Km</th><th>Temps</th><th>Allure</th><th>Nutrition</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
