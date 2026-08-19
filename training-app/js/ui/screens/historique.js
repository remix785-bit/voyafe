import * as store from "../../store.js";
import { ewmaAcwr, acwr } from "../../engines/load.js";

export async function render(container) {
  const { profil, plans, logsQuotidiens } = store.getState();
  const plan = plans.find((p) => p.statut === "actif") ?? plans[plans.length - 1];

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Historique &amp; Stats</h1>
      </div>

      <div class="card">
        <h2>VDOT dans le temps</h2>
        ${profil?.historiqueVdot?.length ? sparkline(profil.historiqueVdot.map((h) => h.vdot)) : `<p class="muted">Pas encore d'historique.</p>`}
      </div>

      <div class="card">
        <h2>ACWR / EWMA dans le temps</h2>
        ${renderLoadHistory(logsQuotidiens)}
      </div>

      <div class="card">
        <h2>Respect des zones hebdo (semaine en cours)</h2>
        ${plan ? renderZoneRespect(plan) : `<p class="muted">Aucun plan.</p>`}
      </div>

      ${plan?.discipline === "trail" ? `<div class="card"><h2>D+ cumulé mensuel</h2>${renderDPlusMensuel(plan)}</div>` : ""}
    </div>`;
}

function sparkline(values) {
  if (values.length < 2) return `<p class="data">${values[0]?.toFixed(1) ?? "—"}</p>`;
  const w = 400;
  const h = 60;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 8) - 4}`)
    .join(" ");
  return `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="var(--color-accent-strong)" stroke-width="2" />
    </svg>
    <p class="muted">Min ${min.toFixed(1)} — Max ${max.toFixed(1)}</p>`;
}

function renderLoadHistory(logs) {
  const loads = logs.map((l) => (l.rpe ?? 0) * 30);
  if (loads.length < 7) return `<p class="muted">Nécessite au moins 7 jours de journal quotidien renseigné.</p>`;
  const points = [];
  for (let i = 6; i < loads.length; i++) {
    const window = loads.slice(0, i + 1);
    points.push({ simple: acwr(window), ewma: ewmaAcwr(window) });
  }
  return sparklineDual(points.map((p) => p.ewma));
}

function sparklineDual(values) {
  return sparkline(values);
}

function renderZoneRespect(plan) {
  const semaine = semaineActuelle(plan);
  const total = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0) || 1;
  const parZone = {};
  for (const s of semaine.seances) {
    parZone[s.zoneDaniels] = (parZone[s.zoneDaniels] ?? 0) + s.volumeSeanceMin;
  }
  return `<div class="stack">${Object.entries(parZone)
    .map(([z, v]) => `<div class="row"><span class="zone-badge zone-badge--${z}">${z}</span><span class="data">${Math.round((v / total) * 100)}%</span></div>`)
    .join("")}</div>`;
}

function renderDPlusMensuel(plan) {
  return `<p class="muted">D+ planifié agrégé par mois — nécessite le rattachement d'un profil de parcours par séance (v3).</p>`;
}

function semaineActuelle(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante;
}
