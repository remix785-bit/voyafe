import * as store from "../../store.js";
import { ElevationBar, LoadGauge, SessionCard, WeekStrip, ZoneLegend, Sparkline, ZoneRepartition } from "../components.js";
import { formatPace } from "../../engines/vdot.js";
import { dailyMacros } from "../../engines/nutrition.js";

function joursRestants(dateEcheance) {
  const ms = new Date(dateEcheance) - new Date();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function memeJour(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function trouverSeanceDuJour(plan) {
  if (!plan) return null;

  // Priorité 1 : une séance précisément datée sur aujourd'hui (jours
  // d'entraînement choisis, cf. Profil) — "la séance du jour" au sens propre.
  const maintenant = new Date();
  for (const semaine of plan.semaines) {
    const idx = semaine.seances.findIndex((s) => s.date && memeJour(new Date(s.date), maintenant));
    if (idx !== -1) return { semaine, seance: semaine.seances[idx] };
  }

  // Priorité 2 : plans générés sans jours d'entraînement précis (comportement
  // antérieur) — semaine courante, première séance "à venir".
  const semaine = trouverSemaineActuelle(plan);
  if (!semaine) return null;
  return { semaine, seance: semaine.seances.find((s) => s.statut === "a_venir") ?? semaine.seances[0] };
}

function trouverSemaineActuelle(plan) {
  const maintenant = new Date();
  let courante = plan.semaines[0];
  for (const s of plan.semaines) {
    if (new Date(s.dateDebut) <= maintenant) courante = s;
  }
  return courante;
}

function statsSemaine(semaine) {
  const totalDistance = semaine.seances.reduce((a, s) => a + (s.distanceKm ?? 0), 0);
  const totalDuree = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0);
  const realisees = semaine.seances.filter((s) => s.statut === "realisee").length;
  const manquees = semaine.seances.filter((s) => s.statut === "manquee").length;
  return { totalDistance, totalDuree, realisees, manquees, total: semaine.seances.length };
}

function semainesDepuisDernierTest(historiqueVdot) {
  if (!historiqueVdot?.length) return null;
  const dernier = new Date(historiqueVdot[historiqueVdot.length - 1].date);
  return Math.floor((Date.now() - dernier.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export async function render(container) {
  const { profil, plans, logsQuotidiens } = store.getState();
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
  const { semaine: semaineSeanceDuJour, seance } = trouverSeanceDuJour(plan) ?? {};
  const jours = joursRestants(plan.dateEcheance);
  const semainesTotal = plan.semaines.length;
  const pctProgression = ((plan.semaines.indexOf(semaineActuelle) + 1) / semainesTotal) * 100;
  const stats = statsSemaine(semaineActuelle);

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const logDuJour = logsQuotidiens.find((l) => l.date === aujourdhui);
  const dernierLog = logsQuotidiens[logsQuotidiens.length - 1];

  const semainesRetest = semainesDepuisDernierTest(profil?.historiqueVdot);
  const macros = profil?.weightKg ? dailyMacros(profil.weightKg, plan.chargeHebdoMoyenneActuelle ?? "moderee") : null;

  const autresPlans = plans.filter((p) => p.id !== plan.id);

  container.innerHTML = `
    <div class="app-main">
      <div class="card card--action">
        <div class="card__header">
          <h1>Séance du jour</h1>
          <span class="badge-warning" style="border-color: var(--color-accent); color: var(--color-accent);">${escapeAttr(plan.objectif ?? "")}</span>
        </div>
        ${seance ? SessionCard(seance, `#/seance?semaine=${semaineSeanceDuJour.numero}&idx=${semaineSeanceDuJour.seances.indexOf(seance)}&plan=${plan.id}`) : `<p class="muted">Aucune séance programmée aujourd'hui.</p>`}
      </div>

      <div class="card">
        <div class="card__header"><h2>Échéance</h2><span class="data">${jours} j</span></div>
        ${ElevationBar(pctProgression)}
        <p class="muted" style="margin-top:8px;">Semaine ${semaineActuelle.numero}/${semainesTotal} — phase ${semaineActuelle.phase}${semaineActuelle.statut === "decharge" ? " (décharge)" : ""}</p>
        ${WeekStrip(plan.semaines, semaineActuelle.numero)}
        ${plan.distanceObjectifM && plan.tempsObjectifS ? `<p class="row" style="margin-top:8px;"><span class="data">${(plan.distanceObjectifM / 1000).toFixed(1)} km</span><span class="muted">en</span><span class="data">${secondesVersLabel(plan.tempsObjectifS)}</span><span class="muted">— allure objectif</span><span class="data">${formatPace(plan.objectifPaceMinParKm)}</span></p>` : ""}
      </div>

      <div class="card">
        <div class="card__header">
          <h2>Cette semaine</h2>
          <a class="btn btn--sm" href="#/plan?semaine=${semaineActuelle.numero}">Voir le plan</a>
        </div>
        <div class="card-grid card-grid--2" style="margin-bottom:12px;">
          <div><span class="muted">Distance planifiée</span><br /><span class="data" style="font-size:1.3rem;">${stats.totalDistance.toFixed(1)} km</span></div>
          <div><span class="muted">Durée planifiée</span><br /><span class="data" style="font-size:1.3rem;">${Math.round(stats.totalDuree)} min</span></div>
        </div>
        <p class="muted">${stats.realisees}/${stats.total} réalisée${stats.realisees > 1 ? "s" : ""}${stats.manquees ? ` · ${stats.manquees} manquée${stats.manquees > 1 ? "s" : ""}` : ""}</p>
        <div class="stack" style="gap:8px; margin-top:8px;">
          ${semaineActuelle.seances.map((s, i) => SessionCard(s, `#/seance?semaine=${semaineActuelle.numero}&idx=${i}&plan=${plan.id}`)).join("")}
        </div>
      </div>

      <div class="card">
        <h2>Répartition des zones (semaine)</h2>
        ${ZoneRepartition(semaineActuelle)}
      </div>

      <div class="card">
        <div class="card__header"><h2>VDOT actuel</h2><span class="data" style="font-size:1.3rem;">${plan.profilCourant.vdot.toFixed(1)}</span></div>
        ${profil?.historiqueVdot?.length > 1 ? Sparkline(profil.historiqueVdot.map((h) => h.vdot)) : ""}
        <p class="muted" style="margin-top:8px;">${
          semainesRetest == null
            ? "Pas encore de retest enregistré."
            : semainesRetest >= 4
              ? `Retest recommandé — dernier test il y a ${semainesRetest} semaines.`
              : `Prochain retest recommandé dans ${4 - semainesRetest} semaine${4 - semainesRetest > 1 ? "s" : ""}.`
        }</p>
        <a class="btn btn--sm" href="#/profil" style="margin-top:8px;">Voir le détail des zones</a>
      </div>

      <div class="card">
        <div class="card__header"><h2>Charge (ACWR/EWMA)</h2></div>
        ${chargeSummary ? LoadGauge(chargeSummary) : `<p class="muted">Pas encore assez de données (journal quotidien, min. 7 jours) pour calculer la tendance de charge.</p>`}
      </div>

      ${
        semaineActuelle.renfoRecommande?.length
          ? `<div class="card">
              <div class="card__header"><h2>Renfo cette semaine</h2><a class="btn btn--sm" href="#/renfo">Voir le détail</a></div>
              <div class="stack">
                ${semaineActuelle.renfoRecommande
                  .map((r) => `<div class="row"><span class="zone-badge zone-badge--renfo">R</span><span>${escapeAttr(r.nom)} — ${Array.isArray(r.frequenceParSemaine) ? r.frequenceParSemaine.join("-") : r.frequenceParSemaine}×/sem</span></div>`)
                  .join("")}
              </div>
            </div>`
          : ""
      }

      ${
        macros
          ? `<div class="card">
              <div class="card__header"><h2>Nutrition du jour</h2><a class="btn btn--sm" href="#/nutrition">Détail</a></div>
              <table class="pacing-timeline">
                <tbody>
                  <tr><td>Glucides</td><td class="data">${macros.glucidesG} g</td></tr>
                  <tr><td>Protéines</td><td class="data">${macros.proteinesG} g</td></tr>
                  <tr><td>Lipides</td><td class="data">${macros.lipidesG} g</td></tr>
                </tbody>
              </table>
            </div>`
          : ""
      }

      <div class="card">
        <div class="card__header">
          <h2>Journal quotidien</h2>
          ${!logDuJour ? `<a class="btn btn--primary btn--sm" href="#/journal">Log du jour</a>` : `<span class="muted">Déjà loggé aujourd'hui</span>`}
        </div>
        ${
          dernierLog
            ? `<p class="muted">Dernier log (${new Date(dernierLog.date).toLocaleDateString("fr-FR")}) :</p>
               <div class="row">
                 ${dernierLog.fcRepos != null ? `<span class="data">FC repos ${dernierLog.fcRepos}</span>` : ""}
                 ${dernierLog.rmssd != null ? `<span class="data">RMSSD ${dernierLog.rmssd}</span>` : ""}
                 ${dernierLog.bienEtre != null ? `<span class="data">Bien-être ${dernierLog.bienEtre}/10</span>` : ""}
                 ${dernierLog.rpe != null ? `<span class="data">RPE ${dernierLog.rpe}/10</span>` : ""}
               </div>`
            : `<p class="muted">Pas encore de log enregistré.</p>`
        }
      </div>

      ${adaptation.propositions.length ? renderPropositions(adaptation) : ""}

      ${
        autresPlans.length
          ? `<div class="card">
              <h2>Autres plans</h2>
              <div class="stack">
                ${autresPlans
                  .map((p) => `<div class="row" style="justify-content:space-between;"><span>${escapeAttr(p.objectif ?? p.discipline)}</span><span class="muted">${p.statut}</span></div>`)
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <div class="card">
        <h2>Zones d'entraînement</h2>
        ${ZoneLegend()}
      </div>
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

function secondesVersLabel(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
