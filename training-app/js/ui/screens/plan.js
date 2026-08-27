import * as store from "../../store.js";
import { WeekStrip, StatStrip, WeekTable, ZoneLegend } from "../components.js";
import { formatPace } from "../../engines/vdot.js";
import { genererIcs, telechargerIcs } from "../../data/icsExport.js";

export async function render(container, params) {
  const plan = store.planActif();
  if (!plan) {
    container.innerHTML = `<div class="app-main"><div class="card"><p class="muted">Aucun plan actif.</p><a class="btn btn--primary" href="#/profil">Créer un plan</a></div></div>`;
    return;
  }

  const semaineNumero = Number(params.semaine) || semaineParDefaut(plan);
  const semaine = plan.semaines.find((s) => s.numero === semaineNumero) ?? plan.semaines[0];
  const idx = plan.semaines.indexOf(semaine);
  const stats = statsSemaine(semaine);

  container.innerHTML = `
    <div class="app-main">
      ${StatStrip([
        { label: "Distance", value: `${stats.totalDistance.toFixed(1)} km` },
        { label: "Durée", value: `${Math.round(stats.totalDuree)} min` },
        { label: "Séances", value: `${stats.realisees}/${stats.total}`, sub: "réalisées" },
        { label: "Phase", value: semaine.phase, sub: semaine.statut === "decharge" ? "décharge" : undefined },
      ])}

      <div class="card">
        <div class="card__header">
          <h1>Plan — ${escapeAttr(plan.discipline)}</h1>
          <div class="row">
            <button class="btn btn--sm" id="export-ics">Exporter en .ics</button>
            <a class="btn btn--sm" href="#/profil">Modifier</a>
          </div>
        </div>
        <p class="muted">${escapeAttr(plan.objectif ?? "")} — échéance ${new Date(plan.dateEcheance).toLocaleDateString("fr-FR")}</p>
        ${plan.distanceObjectifM && plan.tempsObjectifS ? `<p class="row"><span class="data">${(plan.distanceObjectifM / 1000).toFixed(1)} km</span><span class="muted">en</span><span class="data">${secondesVersLabel(plan.tempsObjectifS)}</span><span class="muted">— allure objectif</span><span class="data">${formatPace(plan.objectifPaceMinParKm)}</span></p>` : ""}
        ${WeekStrip(plan.semaines, semaine.numero)}
      </div>

      <div class="card">
        <div class="card__header">
          <button class="btn btn--sm" id="week-prev" ${idx === 0 ? "disabled" : ""}>&larr; Semaine préc.</button>
          <h2>Semaine ${semaine.numero} — ${semaine.phase}${semaine.statut === "decharge" ? " · décharge" : ""}</h2>
          <button class="btn btn--sm" id="week-next" ${idx === plan.semaines.length - 1 ? "disabled" : ""}>Semaine suiv. &rarr;</button>
        </div>
        <div style="overflow-x:auto;">
          ${WeekTable(semaine.seances, (i) => `#/seance?semaine=${semaine.numero}&idx=${i}&plan=${plan.id}`)}
        </div>
        ${semaine.renfoRecommande?.length ? renderRenfo(semaine.renfoRecommande) : ""}
      </div>

      <div class="card">
        <h2>Zones d'entraînement</h2>
        ${ZoneLegend(plan.profilCourant.vdot)}
      </div>
    </div>`;

  container.querySelector("#export-ics").addEventListener("click", () => {
    const { ics, nbEvenements } = genererIcs(plan);
    if (!nbEvenements) {
      alert(
        "Aucune séance datée dans ce plan — choisis tes jours d'entraînement (Profil) pour que chaque séance ait une date précise avant d'exporter."
      );
      return;
    }
    telechargerIcs(ics, `voyafe-training-${plan.discipline}-${plan.id}.ics`);
  });

  container.querySelector("#week-prev")?.addEventListener("click", () => {
    location.hash = `#/plan?semaine=${plan.semaines[idx - 1].numero}`;
  });
  container.querySelector("#week-next")?.addEventListener("click", () => {
    location.hash = `#/plan?semaine=${plan.semaines[idx + 1].numero}`;
  });

  // WeekTable rend des <tr> cliquables plutôt que des <a> (invalide en HTML
  // dans un <table>) — navigation gérée ici via l'attribut data-href.
  container.querySelectorAll(".week-table__row[data-href]").forEach((row) => {
    row.addEventListener("click", () => {
      location.hash = row.dataset.href;
    });
  });
}

function statsSemaine(semaine) {
  const totalDistance = semaine.seances.reduce((a, s) => a + (s.distanceKm ?? 0), 0);
  const totalDuree = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0);
  const realisees = semaine.seances.filter((s) => s.statut === "realisee").length;
  return { totalDistance, totalDuree, realisees, total: semaine.seances.length };
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

function secondesVersLabel(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
