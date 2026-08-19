import * as store from "../../store.js";
import { RENFO_CATALOG } from "../../catalog/renfo.js";

export async function render(container) {
  const plan = store.planActif();
  const phaseActuelle = plan ? semaineActuellePhase(plan) : null;

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Renforcement musculaire</h1>
        <p class="muted">Référence : Eihara et al. (2022) — le renfo lourd (g=-0.32) est prioritaire sur la pliométrie seule (g=-0.13) pour l'économie de course.</p>
        ${phaseActuelle ? `<p>Phase actuelle du plan : <strong>${phaseActuelle}</strong></p>` : ""}
      </div>
      ${RENFO_CATALOG.map((r) => renderBloc(r, phaseActuelle)).join("")}
    </div>`;

  container.querySelectorAll("[data-charge-input]").forEach((input) => {
    const key = `voyafe-1rm-${input.dataset.chargeInput}`;
    input.value = localStorage.getItem(key) ?? "";
    input.addEventListener("change", () => localStorage.setItem(key, input.value));
  });
}

function semaineActuellePhase(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante.phase;
}

function renderBloc(r, phaseActuelle) {
  const actif = phaseActuelle && r.phase.includes(phaseActuelle);
  return `
    <div class="card" style="${actif ? "border-color: var(--color-accent);" : ""}">
      <div class="card__header">
        <h2>${escapeAttr(r.nom)}${actif ? " — recommandé cette phase" : ""}</h2>
        <span class="muted">${Array.isArray(r.frequenceParSemaine) ? r.frequenceParSemaine.join("-") : r.frequenceParSemaine}×/sem</span>
      </div>
      <div class="stack">
        ${r.exercices
          .map(
            (ex) => `
          <div class="row" style="justify-content: space-between;">
            <div>
              <strong>${escapeAttr(ex.nom)}</strong>
              <p class="muted">${escapeAttr(ex.format)}</p>
            </div>
            ${/squat|soulevé|presse/i.test(ex.nom) ? `<div class="field" style="max-width:110px;"><label>1RM (kg)</label><input type="number" data-charge-input="${slug(ex.nom)}" placeholder="—" /></div>` : ""}
          </div>`
          )
          .join("")}
      </div>
      ${r.note ? `<p class="muted" style="margin-top:8px;">${escapeAttr(r.note)}</p>` : ""}
      ${r.contreIndiqueEnAffutage ? `<p class="badge-warning">Contre-indiqué en affûtage</p>` : ""}
    </div>`;
}

function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
