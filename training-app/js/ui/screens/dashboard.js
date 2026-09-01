import * as store from "../../store.js";
import {
  CountdownRing,
  LoadGauge,
  SessionCard,
  WeekStrip,
  ZoneLegend,
  ZoneRepartition,
  BarChart,
  DonutChart,
  LineChart,
  StatStrip,
  ActivityHeatmap,
  WeekTable,
  SegmentedControl,
  attachSegmentedControl,
  RecoveryTrend,
  ProgressBar,
  attachChartInteractions,
} from "../components.js";
import { formatPace, formatDureeCompacte, riegelPredict, ZONES } from "../../engines/vdot.js";
import { statsPerformance, barresDistanceHebdo, barresDistanceMensuelle, barresDPlusMensuel, variationPct } from "../../engines/performance.js";
import { ewmaAcwr } from "../../engines/load.js";

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
  const { profil, plans, logsQuotidiens, seancesRealisees } = store.getState();
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

  const perf = statsPerformance(seancesRealisees);
  const barresHebdo = barresDistanceHebdo(seancesRealisees);
  const barresMensuel = barresDistanceMensuelle(seancesRealisees);
  const barresDPlus = barresDPlusMensuel(seancesRealisees);
  const semainesRetest = semainesDepuisDernierTest(profil?.historiqueVdot);
  // Le VDOT du plan est figé au moment de sa création/mise à jour ; l'historique
  // (alimenté à chaque retest, même sans toucher au plan) porte la valeur réelle
  // la plus récente — c'est elle qu'on affiche en tête, pas celle du plan.
  const vdotActuel = profil?.historiqueVdot?.length
    ? profil.historiqueVdot[profil.historiqueVdot.length - 1].vdot
    : plan.profilCourant.vdot;

  const autresPlans = plans.filter((p) => p.id !== plan.id);

  const zoneVersTonalite = { verte: "good", orange: "warn", rouge: "bad" };
  const loadsRecents = store.chargeHebdoDepuisLogs();
  const statTiles = [
    { label: "VDOT", value: vdotActuel.toFixed(1), tone: "accent", history: profil?.historiqueVdot?.map((h) => h.vdot) },
    {
      label: "Charge EWMA",
      value: chargeSummary ? chargeSummary.acwrEwma.toFixed(2) : "—",
      sub: chargeSummary?.zone,
      tone: chargeSummary ? zoneVersTonalite[chargeSummary.zone] : undefined,
      history: courbeEwmaRecente(loadsRecents),
    },
    { label: "Jours restants", value: `${jours}` },
    { label: "Semaine", value: `${stats.realisees}/${stats.total}`, sub: "réalisées" },
  ];
  const volumesRecents = store.volumeParJourAvecDates();
  const progressionPlan = progressionCumuleePlan(plan);
  const tempsPredits = profil?.performanceRef ? predireTempsAutresDistances(profil.performanceRef) : null;

  container.innerHTML = `
    <div class="app-main">
      ${StatStrip(statTiles)}

      ${adaptation.propositions.length ? renderPropositions(adaptation) : ""}

      ${SegmentedControl(
        [
          { id: "aujourdhui", label: "Aujourd'hui" },
          { id: "semaine", label: "Semaine" },
          { id: "progression", label: "Progression" },
        ],
        "aujourdhui"
      )}

      <div class="screen-segment active" data-segment-panel="aujourdhui">
        <div class="card card--action">
          <div class="card__header">
            <h1>Séance du jour</h1>
            <span class="badge-warning" style="border-color: var(--color-accent); color: var(--color-accent);">${escapeAttr(plan.objectif ?? "")}</span>
          </div>
          ${seance ? SessionCard(seance, `#/seance?semaine=${semaineSeanceDuJour.numero}&idx=${semaineSeanceDuJour.seances.indexOf(seance)}&plan=${plan.id}`) : `<p class="muted">Aucune séance programmée aujourd'hui.</p>`}
        </div>

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
      </div>

      <div class="screen-segment" data-segment-panel="semaine">
        <div class="card">
          <h2>Échéance</h2>
          ${CountdownRing(plan.macrocycle, pctProgression, {
            centreValeur: `${jours}`,
            centreLabel: jours > 1 ? "jours restants" : "jour restant",
            centreSous: new Date(plan.dateEcheance).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
          })}
          <p class="muted" style="text-align:center; margin-top:4px;">Semaine ${semaineActuelle.numero}/${semainesTotal} — phase ${semaineActuelle.phase}${semaineActuelle.statut === "decharge" ? " (décharge)" : ""}</p>
          ${plan.distanceObjectifM && plan.tempsObjectifS ? `<p class="row" style="justify-content:center; margin-top:8px;"><span class="data">${(plan.distanceObjectifM / 1000).toFixed(1)} km</span><span class="muted">en</span><span class="data">${secondesVersLabel(plan.tempsObjectifS)}</span><span class="muted">— allure objectif</span><span class="data">${formatPace(plan.objectifPaceMinParKm)}</span></p>` : ""}
          <div style="margin-top:16px;">${WeekStrip(plan.semaines, semaineActuelle.numero)}</div>
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
          <div style="margin-top:8px; overflow-x:auto;">
            ${WeekTable(semaineActuelle.seances, (i) => `#/seance?semaine=${semaineActuelle.numero}&idx=${i}&plan=${plan.id}`)}
          </div>
        </div>

        <div class="card">
          <h2>Répartition des zones (semaine)</h2>
          ${DonutChart(segmentsZones(semaineActuelle), {
            centreValeur: `${Math.round(semaineActuelle.seances.reduce((a, s) => a + s.volumeSeanceMin, 0))}`,
            centreLabel: "min",
          })}
          <div style="margin-top:12px;">${ZoneRepartition(semaineActuelle)}</div>
        </div>

        ${
          autresPlans.length
            ? `<div class="card">
                <h2>Autres plans</h2>
                <div class="stack">
                  ${autresPlans
                    .map((p) => {
                      const label = p.saisonId
                        ? `${escapeAttr(p.objectif ?? p.discipline)} <span class="muted">(bloc ${p.ordreSaison}${p.roleSaison === "finale" ? " · objectif final" : " · intermédiaire"})</span>`
                        : escapeAttr(p.objectif ?? p.discipline);
                      return `<a class="row" href="#/plan?planId=${p.id}" style="justify-content:space-between; text-decoration:none; color:inherit;"><span>${label}</span><span class="muted">${p.statut}</span></a>`;
                    })
                    .join("")}
                </div>
              </div>`
            : ""
        }
      </div>

      <div class="screen-segment" data-segment-panel="progression">
        <div class="card">
          <div class="card__header"><h2>Progression du plan</h2><span class="data" style="font-size:1.3rem;">${Math.round(progressionPlan.pct)}%</span></div>
          ${ProgressBar(progressionPlan.pct, { label: `${progressionPlan.seancesRealisees}/${progressionPlan.seancesPrevues} séances réalisées depuis le début du plan` })}
        </div>

        <div class="card">
          <h2>Régularité (16 dernières semaines)</h2>
          ${ActivityHeatmap(volumesRecents)}
        </div>

        <div class="card">
          <div class="card__header"><h2>Performance réelle</h2><a class="btn btn--sm" href="#/historique">Historique complet</a></div>
          ${renderPerformanceReelle(perf, barresHebdo, barresMensuel, barresDPlus)}
        </div>

        <div class="card">
          <div class="card__header"><h2>VDOT actuel</h2><span class="data" style="font-size:1.3rem;">${vdotActuel.toFixed(1)}</span></div>
          ${
            Math.abs(vdotActuel - plan.profilCourant.vdot) >= 0.1
              ? `<p class="muted">Le plan utilise encore ${plan.profilCourant.vdot.toFixed(1)} (dernier retest non encore appliqué) — <a href="#/profil">mets à jour le plan</a> pour recalculer les allures.</p>`
              : ""
          }
          ${
            profil?.historiqueVdot?.length > 1
              ? LineChart(
                  profil.historiqueVdot.map((h) => ({ label: new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), value: h.vdot })),
                  { formatValue: (v) => v.toFixed(1) }
                )
              : `<p class="muted">Pas encore d'historique — un deuxième point apparaîtra après ton prochain retest.</p>`
          }
          <p class="muted" style="margin-top:8px;">${
            semainesRetest == null
              ? "Pas encore de retest enregistré."
              : semainesRetest >= 4
                ? `Retest recommandé — dernier test il y a ${semainesRetest} semaines.`
                : `Prochain retest recommandé dans ${4 - semainesRetest} semaine${4 - semainesRetest > 1 ? "s" : ""}.`
          }</p>
          <a class="btn btn--sm" href="#/profil" style="margin-top:8px;">Voir le détail des zones</a>
        </div>

        ${
          tempsPredits
            ? `<div class="card">
                <h2>Temps prédits (Riegel)</h2>
                <p class="muted">À partir de ta performance de référence actuelle — cross-check indépendant du modèle VDOT.</p>
                <div class="card-grid card-grid--2">
                  ${tempsPredits.map((t) => `<div><span class="muted">${escapeAttr(t.label)}</span><br /><span class="data" style="font-size:1.15rem;">${formatDureeCompacte(t.tempsS)}</span></div>`).join("")}
                </div>
              </div>`
            : ""
        }

        <div class="card">
          <div class="card__header"><h2>Charge (ACWR/EWMA)</h2></div>
          ${chargeSummary ? LoadGauge(chargeSummary) : `<p class="muted">Pas encore de données — log ta première journée (journal quotidien ou synchro Strava) pour voir la tendance de charge démarrer.</p>`}
          ${renderCourbeCharge()}
        </div>

        <div class="card">
          <h2>Récupération</h2>
          <p class="muted">Ce que la boucle adaptative surveille déjà en coulisses pour proposer une décharge.</p>
          ${RecoveryTrend(logsQuotidiens)}
        </div>

        <div class="card">
          <h2>Zones d'entraînement</h2>
          ${ZoneLegend(vdotActuel)}
        </div>
      </div>
    </div>`;

  attachSegmentedControl(container);

  container.querySelectorAll("[data-proposition-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const decision = btn.dataset.propositionAction;
      const idx = Number(btn.dataset.propositionIdx);
      await store.enregistrerPropositionDecision(adaptation.propositions[idx], decision);
      render(container);
    });
  });

  // WeekTable rend des <tr> cliquables plutôt que des <a> (invalide en HTML
  // dans un <table>) — navigation gérée ici via l'attribut data-href.
  container.querySelectorAll(".week-table__row[data-href]").forEach((row) => {
    row.addEventListener("click", () => {
      location.hash = row.dataset.href;
    });
  });

  attachChartInteractions(container);
}

/**
 * Dernières valeurs (jusqu'à nbPoints) de la tendance EWMA de charge,
 * recalculée sur des fenêtres croissantes — même principe que
 * renderCourbeCharge, réutilisé ici pour la micro-courbe du StatTile
 * "Charge EWMA" (ticker avec tendance, pas juste une valeur brute).
 */
function courbeEwmaRecente(loads, nbPoints = 10) {
  if (loads.length < 2) return [];
  const debut = Math.max(1, loads.length - nbPoints);
  const points = [];
  for (let i = debut; i <= loads.length; i++) points.push(ewmaAcwr(loads.slice(0, i)));
  return points;
}

/**
 * Progression cumulée du plan : volume (min) prévu vs réalisé sur toutes
 * les semaines déjà entamées (dateDebut <= aujourd'hui) — pas seulement la
 * semaine en cours (déjà couverte ailleurs sur le Dashboard), pour donner
 * une vue d'ensemble "suis-je dans les clous depuis le début ?".
 * @param {ReturnType<typeof store.planActif>} plan
 */
function progressionCumuleePlan(plan) {
  const maintenant = new Date();
  let volumePrevu = 0;
  let volumeRealise = 0;
  let seancesPrevues = 0;
  let seancesRealisees = 0;
  for (const semaine of plan.semaines) {
    if (new Date(semaine.dateDebut) > maintenant) continue;
    for (const seance of semaine.seances) {
      volumePrevu += seance.volumeSeanceMin;
      seancesPrevues++;
      if (seance.statut === "realisee") {
        volumeRealise += seance.volumeSeanceMin;
        seancesRealisees++;
      }
    }
  }
  return {
    pct: volumePrevu > 0 ? (volumeRealise / volumePrevu) * 100 : 0,
    seancesPrevues,
    seancesRealisees,
  };
}

/**
 * Temps prédits aux distances standard (5K/10K/semi/marathon) à partir de la
 * performance de référence actuelle — formule de Riegel (déjà utilisée pour
 * la comparaison indépendante du modèle VDOT, jamais exposée en UI jusqu'ici).
 * @param {{distanceM:number, tempsS:number}} performanceRef
 */
function predireTempsAutresDistances(performanceRef) {
  const distances = [
    { label: "5 km", m: 5000 },
    { label: "10 km", m: 10000 },
    { label: "Semi", m: 21097.5 },
    { label: "Marathon", m: 42195 },
  ];
  return distances.map((d) => ({
    label: d.label,
    tempsS: riegelPredict(performanceRef.tempsS, performanceRef.distanceM, d.m),
  }));
}

/** Segments E/M/T/I/R (volume de la semaine) pour le DonutChart — mêmes données que ZoneRepartition. */
function segmentsZones(semaine) {
  const total = semaine.seances.reduce((a, s) => a + s.volumeSeanceMin, 0) || 1;
  const parZone = {};
  for (const s of semaine.seances) parZone[s.zoneDaniels] = (parZone[s.zoneDaniels] ?? 0) + s.volumeSeanceMin;
  const ordre = ["E", "M", "T", "I", "R"];
  return ordre
    .filter((z) => parZone[z])
    .map((z) => ({ label: `${z} — ${ZONES[z]?.label ?? z}`, value: parZone[z], colorVar: `--zone-${z.toLowerCase()}` }));
}

/**
 * Courbe ACWR/EWMA — même calcul que l'écran Historique, ici pour donner une
 * tendance directement sur le Dashboard. Tracée dès 2 jours de données
 * (plutôt que d'attendre 7 jours pleins) : avec moins de points, la courbe
 * est encore instable (la formule EWMA n'a pas fini de "monter en charge"
 * sur son historique), mais elle donne déjà un signal utile dès la première
 * semaine plutôt que de rester invisible.
 */
function renderCourbeCharge() {
  const loads = store.chargeHebdoDepuisLogs();
  if (loads.length < 2) return "";
  const points = [];
  for (let i = 0; i < loads.length; i++) {
    const fenetre = loads.slice(0, i + 1);
    const joursAvantAujourdhui = loads.length - 1 - i;
    points.push({
      label: joursAvantAujourdhui === 0 ? "Aujourd'hui" : `J-${joursAvantAujourdhui}`,
      value: ewmaAcwr(fenetre),
    });
  }
  return `<div style="margin-top:12px;"><span class="muted">Tendance EWMA — ${points.length} derniers jours</span>${LineChart(points, {
    formatValue: (v) => v.toFixed(2),
    colorVar: "--color-functional-strong",
  })}</div>`;
}

function renderPerformanceReelle(perf, barresHebdo, barresMensuel, barresDPlus) {
  if (!perf.semaine.nbSeances && !perf.mois.nbSeances) {
    return `<p class="muted">Aucune activité réelle enregistrée — connecte Strava (<a href="#/reglages">Réglages</a>) pour voir tes stats réelles ici, ou synchronise si c'est déjà fait.</p>`;
  }
  return `
    <div class="card-grid card-grid--2" style="margin-bottom:12px;">
      <div>
        <span class="muted">Cette semaine</span><br />
        <span class="data" style="font-size:1.3rem;">${perf.semaine.distanceKm.toFixed(1)} km</span>${deltaLabel(perf.semaine.distanceKm, perf.semainePrecedente.distanceKm)}
      </div>
      <div>
        <span class="muted">Ce mois</span><br />
        <span class="data" style="font-size:1.3rem;">${perf.mois.distanceKm.toFixed(1)} km</span>${deltaLabel(perf.mois.distanceKm, perf.moisPrecedent.distanceKm)}
      </div>
    </div>
    <p class="muted">Semaine : ${Math.round(perf.semaine.dureeMin)} min · D+ ${Math.round(perf.semaine.deniveleM)} m · ${perf.semaine.nbSeances} séance${perf.semaine.nbSeances > 1 ? "s" : ""}${perf.semaine.allureMoyenneMinParKm ? ` · allure moy. ${formatPace(perf.semaine.allureMoyenneMinParKm)}` : ""}</p>
    <p class="muted">Mois : ${Math.round(perf.mois.dureeMin)} min · D+ ${Math.round(perf.mois.deniveleM)} m · ${perf.mois.nbSeances} séance${perf.mois.nbSeances > 1 ? "s" : ""}${perf.mois.allureMoyenneMinParKm ? ` · allure moy. ${formatPace(perf.mois.allureMoyenneMinParKm)}` : ""}</p>
    ${
      barresHebdo.some((b) => b.value > 0)
        ? `<div style="margin-top:16px;"><span class="muted">Distance réelle par semaine</span>${BarChart(barresHebdo, { unite: " km" })}</div>`
        : ""
    }
    ${
      barresMensuel.some((b) => b.value > 0)
        ? `<div style="margin-top:16px;"><span class="muted">Distance réelle par mois</span>${BarChart(barresMensuel, { unite: " km", colorVar: "--color-functional-strong" })}</div>`
        : ""
    }
    ${
      barresDPlus.some((b) => b.value > 0)
        ? `<div style="margin-top:16px;"><span class="muted">D+ cumulé par mois</span>${BarChart(barresDPlus, { unite: " m", formatValue: (v) => Math.round(v).toString(), colorVar: "--color-structural-strong" })}</div>`
        : ""
    }`;
}

function deltaLabel(actuel, precedent) {
  const pct = variationPct(actuel, precedent);
  if (pct == null) return "";
  const signe = pct >= 0 ? "+" : "";
  return ` <span class="muted">(${signe}${pct.toFixed(0)}% vs période préc.)</span>`;
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
