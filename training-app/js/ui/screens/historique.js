import * as store from "../../store.js";
import { ewmaAcwr, acwr } from "../../engines/load.js";
import { Sparkline, ZoneRepartition } from "../components.js";

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
        ${profil?.historiqueVdot?.length ? Sparkline(profil.historiqueVdot.map((h) => h.vdot)) : `<p class="muted">Pas encore d'historique.</p>`}
      </div>

      <div class="card">
        <h2>ACWR / EWMA dans le temps</h2>
        ${renderLoadHistory(logsQuotidiens)}
      </div>

      <div class="card">
        <h2>Respect des zones hebdo (semaine en cours)</h2>
        ${plan ? ZoneRepartition(semaineActuelle(plan)) : `<p class="muted">Aucun plan.</p>`}
      </div>

      ${plan?.discipline === "trail" ? `<div class="card"><h2>D+ cumulé mensuel</h2>${renderDPlusMensuel(plan)}</div>` : ""}
    </div>`;
}

function renderLoadHistory(logs) {
  const loads = logs.map((l) => (l.rpe ?? 0) * 30);
  if (loads.length < 7) return `<p class="muted">Nécessite au moins 7 jours de journal quotidien renseigné.</p>`;
  const points = [];
  for (let i = 6; i < loads.length; i++) {
    const window = loads.slice(0, i + 1);
    points.push({ simple: acwr(window), ewma: ewmaAcwr(window) });
  }
  return Sparkline(points.map((p) => p.ewma));
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
