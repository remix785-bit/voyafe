import * as store from "../../store.js";
import { ElevationBar, LoadGauge, SessionCard } from "../components.js";

function joursRestants(dateEcheance) {
  const ms = new Date(dateEcheance) - new Date();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function trouverSeanceDuJour(plan) {
  if (!plan) return null;
  const semaineIdx = trouverSemaineActuelle(plan);
  if (!semaineIdx) return null;
  return { semaine: semaineIdx, seance: semaineIdx.seances.find((s) => s.statut === "a_venir") ?? semaineIdx.seances[0] };
}

function trouverSemaineActuelle(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante;
}

export async function render(container) {
  const plan = store.planActif();
  const chargeSummary = store.resumeCharge();
  const adaptation = store.evaluerAdaptation();

  if (!plan) {
    container.innerHTML = `
      <div class="app-main">
        <div class="card card--action">
          <h1>Bienvenue</h1>
          <p class="muted">Aucun plan actif. Commence par renseigner ton profil et générer ton premier plan.</p>
          <a class="btn btn--primary" href="#/profil">Créer mon profil &amp; mon plan</a>
        </div>
      </div>`;
    return;
  }

  const semaineActuelle = trouverSemaineActuelle(plan);
  const { seance } = trouverSeanceDuJour(plan) ?? {};
  const jours = joursRestants(plan.dateEcheance);
  const semainesTotal = plan.semaines.length;
  const pctProgression = ((plan.semaines.indexOf(semaineActuelle) + 1) / semainesTotal) * 100;

  container.innerHTML = `
    <div class="app-main">
      <div class="card card--action">
        <div class="card__header">
          <h1>Séance du jour</h1>
          <span class="badge-warning" style="border-color: var(--color-accent); color: var(--color-accent);">${escapeAttr(plan.objectif ?? "")}</span>
        </div>
        ${seance ? SessionCard(seance, `#/seance?semaine=${semaineActuelle.numero}&idx=${semaineActuelle.seances.indexOf(seance)}&plan=${plan.id}`) : `<p class="muted">Aucune séance programmée aujourd'hui.</p>`}
      </div>

      <div class="card">
        <div class="card__header"><h2>Échéance</h2><span class="data">${jours} j</span></div>
        ${ElevationBar(pctProgression)}
        <p class="muted" style="margin-top:8px;">Semaine ${semaineActuelle.numero}/${semainesTotal} — phase ${semaineActuelle.phase}${semaineActuelle.statut === "decharge" ? " (décharge)" : ""}</p>
      </div>

      <div class="card">
        <div class="card__header"><h2>Charge (ACWR/EWMA)</h2></div>
        ${chargeSummary ? LoadGauge(chargeSummary) : `<p class="muted">Pas encore assez de données (journal quotidien) pour calculer la tendance de charge.</p>`}
      </div>

      ${adaptation.propositions.length ? renderPropositions(adaptation) : ""}
    </div>`;

  container.querySelectorAll("[data-proposition-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const decision = btn.dataset.propositionAction;
      const idx = Number(btn.dataset.propositionIdx);
      await store.enregistrerPropositionDecision(adaptation.propositions[idx], decision);
      render(container);
    });
  });
}

function renderPropositions(adaptation) {
  return adaptation.propositions
    .map(
      (p, i) => `
    <div class="card proposal-card">
      <h2>Proposition de la boucle adaptative</h2>
      <p>${escapeAttr(p.justification)}</p>
      <ul class="muted">${p.alternatives.map((a) => `<li>${escapeAttr(a)}</li>`).join("")}</ul>
      <div class="row">
        <button class="btn btn--primary btn--sm" data-proposition-action="accepte" data-proposition-idx="${i}">Accepter</button>
        <button class="btn btn--sm" data-proposition-action="refuse" data-proposition-idx="${i}">Refuser</button>
      </div>
      <p class="load-gauge__disclaimer">La boucle ne modifie jamais le plan automatiquement — c'est toi qui décides.</p>
    </div>`
    )
    .join("");
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
