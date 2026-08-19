import * as store from "../../store.js";
import { WeekStrip, SessionCard } from "../components.js";

export async function render(container, params) {
  const plan = store.planActif();
  if (!plan) {
    container.innerHTML = `<div class="app-main"><div class="card"><p class="muted">Aucun plan actif.</p><a class="btn btn--primary" href="#/profil">Créer un plan</a></div></div>`;
    return;
  }

  const semaineNumero = Number(params.semaine) || semaineParDefaut(plan);
  const semaine = plan.semaines.find((s) => s.numero === semaineNumero) ?? plan.semaines[0];
  const idx = plan.semaines.indexOf(semaine);

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Plan — ${escapeAttr(plan.discipline)}</h1>
        <p class="muted">${escapeAttr(plan.objectif ?? "")} — échéance ${new Date(plan.dateEcheance).toLocaleDateString("fr-FR")}</p>
        ${WeekStrip(plan.semaines, semaine.numero)}
      </div>

      <div class="card">
        <div class="card__header">
          <button class="btn btn--sm" id="week-prev" ${idx === 0 ? "disabled" : ""}>&larr; Semaine préc.</button>
          <h2>Semaine ${semaine.numero} — ${semaine.phase}${semaine.statut === "decharge" ? " · décharge" : ""}</h2>
          <button class="btn btn--sm" id="week-next" ${idx === plan.semaines.length - 1 ? "disabled" : ""}>Semaine suiv. &rarr;</button>
        </div>
        <div class="stack">
          ${semaine.seances
            .map(
              (s, i) => SessionCard(s, `#/seance?semaine=${semaine.numero}&idx=${i}&plan=${plan.id}`)
            )
            .join("")}
        </div>
        ${semaine.renfoRecommande?.length ? renderRenfo(semaine.renfoRecommande) : ""}
      </div>
    </div>`;

  container.querySelector("#week-prev")?.addEventListener("click", () => {
    location.hash = `#/plan?semaine=${plan.semaines[idx - 1].numero}`;
  });
  container.querySelector("#week-next")?.addEventListener("click", () => {
    location.hash = `#/plan?semaine=${plan.semaines[idx + 1].numero}`;
  });
}

function semaineParDefaut(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante.numero;
}

function renderRenfo(renfoList) {
  return `
    <div class="contour-divider"></div>
    <h3>Renfo recommandé cette phase</h3>
    <div class="stack">
      ${renfoList
        .map(
          (r) => `<div class="row"><span class="zone-badge zone-badge--renfo">R</span><span>${escapeAttr(r.nom)} — ${Array.isArray(r.frequenceParSemaine) ? r.frequenceParSemaine.join("-") : r.frequenceParSemaine}×/sem</span></div>`
        )
        .join("")}
      <a class="btn btn--sm" href="#/renfo">Voir le détail</a>
    </div>`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
