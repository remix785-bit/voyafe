import * as store from "../../store.js";
import { RENFO_CATALOG } from "../../catalog/renfo.js";

export async function render(container) {
  const plan = store.planActif();
  const semaine = plan ? semaineActuelle(plan) : null;
  const phaseActuelle = semaine?.phase ?? null;
  const joursQualite = semaine ? joursSeancesQualite(semaine) : [];

  container.innerHTML = `
    <div class="app-main">
      <div class="card">
        <h1>Renforcement musculaire</h1>
        <p class="muted">Référence : Eihara et al. (2022) — le renfo lourd (g=-0.32) est prioritaire sur la pliométrie seule (g=-0.13) pour l'économie de course.</p>
        ${phaseActuelle ? `<p>Phase actuelle du plan : <strong>${phaseActuelle}</strong></p>` : ""}
      </div>
      ${RENFO_CATALOG.slice()
        .sort((a, b) => a.priorite - b.priorite)
        .map((r) => renderBloc(r, phaseActuelle, joursQualite))
        .join("")}
    </div>`;

  container.querySelectorAll("[data-charge-input]").forEach((input) => {
    const key = `voyafe-1rm-${input.dataset.chargeInput}`;
    input.value = localStorage.getItem(key) ?? "";
    const resultat = container.querySelector(`[data-charge-result="${input.dataset.chargeInput}"]`);
    const majResultat = () => {
      if (!resultat) return;
      const rm1 = Number(input.value);
      const fourchette = JSON.parse(input.dataset.fourchette);
      resultat.textContent = rm1 > 0 ? `→ charge de travail : ${Math.round(rm1 * fourchette.min)}-${Math.round(rm1 * fourchette.max)} kg` : "";
    };
    majResultat();
    input.addEventListener("input", majResultat);
    input.addEventListener("change", () => localStorage.setItem(key, input.value));
  });
}

function semaineActuelle(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante;
}

/** Jours (avec date) des séances de qualité (T/I/R) de la semaine — pour la règle des 48h. */
function joursSeancesQualite(semaine) {
  return semaine.seances.filter((s) => s.date && ["T", "I", "R"].includes(s.zoneDaniels)).map((s) => new Date(s.date));
}

function renderBloc(r, phaseActuelle, joursQualite) {
  const actif = phaseActuelle && r.phase.includes(phaseActuelle);
  return `
    <div class="card" style="${actif ? "border-color: var(--color-accent);" : ""}">
      <div class="card__header">
        <h2>${escapeAttr(r.nom)}${actif ? " — recommandé cette phase" : ""}</h2>
        <span class="muted">${Array.isArray(r.frequenceParSemaine) ? r.frequenceParSemaine.join("-") : r.frequenceParSemaine}×/sem</span>
      </div>
      <div class="stack">
        ${r.exercices
          .map((ex) => {
            const fourchette = extraireFourchette1RM(ex.format);
            return `
          <div class="row" style="justify-content: space-between;">
            <div>
              <strong>${escapeAttr(ex.nom)}</strong>
              <p class="muted">${escapeAttr(ex.format)}</p>
              ${fourchette ? `<p class="muted data" data-charge-result="${slug(ex.nom)}"></p>` : ""}
            </div>
            ${fourchette ? `<div class="field" style="max-width:110px;"><label>1RM (kg)</label><input type="number" data-charge-input="${slug(ex.nom)}" data-fourchette='${JSON.stringify(fourchette)}' placeholder="—" /></div>` : ""}
          </div>`;
          })
          .join("")}
      </div>
      ${r.note ? `<p class="muted" style="margin-top:8px;">${escapeAttr(r.note)}</p>` : ""}
      ${r.delaiMinAvecSeanceQualiteH ? renderRegle48h(r.delaiMinAvecSeanceQualiteH, joursQualite) : ""}
      ${r.contreIndiqueEnAffutage ? `<p class="badge-warning">Contre-indiqué en affûtage</p>` : ""}
    </div>`;
}

/**
 * Surface concrètement la règle de délai renfo excentrique <-> séance
 * qualité (catalogue : delaiMinAvecSeanceQualiteH) — le champ existait sans
 * jamais être exploité nulle part dans l'appli. Le renfo n'étant pas placé
 * à un jour précis par le générateur (l'utilisateur choisit lui-même son
 * jour), on ne peut pas bloquer automatiquement un jour — on liste donc les
 * séances qualité de la semaine pour que l'utilisateur espace son renfo
 * excentrique d'au moins ce délai de chacune d'elles.
 */
function renderRegle48h(delaiH, joursQualite) {
  if (!joursQualite?.length) {
    return `<p class="muted" style="margin-top:8px;">À espacer d'au moins ${delaiH}h d'une séance qualité (T/I/R) — aucune séance qualité planifiée cette semaine.</p>`;
  }
  const jours = joursQualite.map((d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })).join(", ");
  return `<p class="badge-warning" style="margin-top:8px;">Séance(s) qualité cette semaine : ${jours} — espace ton renfo excentrique d'au moins ${delaiH}h de ces jours.</p>`;
}

/** Extrait la fourchette "X-Y% 1RM" d'un format d'exercice, si présente. */
function extraireFourchette1RM(format) {
  const m = format.match(/(\d+)-(\d+)%\s*1RM/i);
  if (!m) return null;
  return { min: Number(m[1]) / 100, max: Number(m[2]) / 100 };
}

function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
