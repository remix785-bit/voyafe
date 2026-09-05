import * as store from "../../store.js";
import { WeekStrip, StatStrip, WeekTable, ZoneLegend } from "../components.js";
import { formatPace, riegelPredict, formatDureeCompacte, evaluerCoherenceObjectif } from "../../engines/vdot.js";
import { genererIcs, telechargerIcs } from "../../data/icsExport.js";
import { Icon } from "../icons.js";

export async function render(container, params) {
  const plan = params.planId
    ? store.getState().plans.find((p) => p.id === params.planId)
    : store.planActif();
  if (!plan) {
    container.innerHTML = `<div class="app-main"><div class="card"><p class="muted">Aucun plan actif.</p><a class="btn btn--primary" href="#/profil">Créer un plan</a></div></div>`;
    return;
  }

  const semaineNumero = Number(params.semaine) || semaineParDefaut(plan);
  const semaine = plan.semaines.find((s) => s.numero === semaineNumero) ?? plan.semaines[0];
  const idx = plan.semaines.indexOf(semaine);
  const stats = statsSemaine(semaine);
  const blocsSaison = plan.saisonId ? store.blocsSaison(plan.saisonId) : null;

  // VDOT réel le plus récent (dernier retest, même non encore appliqué au plan)
  // — même définition que dashboard.js, pour rester cohérent d'un écran à l'autre.
  const { profil } = store.getState();
  const vdotActuel = profil?.historiqueVdot?.length
    ? profil.historiqueVdot[profil.historiqueVdot.length - 1].vdot
    : plan.profilCourant.vdot;
  const planPeriment = Math.abs(vdotActuel - plan.profilCourant.vdot) >= 0.1;
  const coherence =
    plan.distanceObjectifM && plan.tempsObjectifS
      ? evaluerCoherenceObjectif(vdotActuel, plan.distanceObjectifM, plan.tempsObjectifS, plan.semaines.length)
      : null;

  container.innerHTML = `
    <div class="app-main">
      ${blocsSaison ? renderFeuilleDeRoute(blocsSaison, plan.id) : ""}

      ${StatStrip([
        { label: "Distance", value: `${stats.totalDistance.toFixed(1)} km` },
        { label: "Durée", value: `${Math.round(stats.totalDuree)} min` },
        { label: "Séances", value: `${stats.realisees}/${stats.total}`, sub: "réalisées" },
        { label: "Phase", value: semaine.phase, sub: semaine.statut === "decharge" ? "décharge" : undefined },
      ])}

      <div class="card">
        <div class="card__header">
          <h1>${blocsSaison ? `Bloc ${plan.ordreSaison}/${blocsSaison.length}` : "Plan"} — ${escapeAttr(plan.discipline)}</h1>
          <div class="row">
            <button class="btn btn--sm" id="export-ics">Exporter en .ics</button>
            ${plan.statut === "actif" || !plan.saisonId ? `<a class="btn btn--sm" href="#/profil">Modifier</a>` : ""}
          </div>
        </div>
        <p class="muted">${escapeAttr(plan.objectif ?? "")} — échéance ${new Date(plan.dateEcheance).toLocaleDateString("fr-FR")}${plan.roleSaison === "intermediaire" ? " · objectif intermédiaire" : plan.roleSaison === "finale" ? " · objectif final de la saison" : ""}</p>
        ${plan.distanceObjectifM && plan.tempsObjectifS ? `<p class="row"><span class="data">${(plan.distanceObjectifM / 1000).toFixed(1)} km</span><span class="muted">en</span><span class="data">${secondesVersLabel(plan.tempsObjectifS)}</span><span class="muted">— allure objectif</span><span class="data">${formatPace(plan.objectifPaceMinParKm)}</span></p>` : ""}
        ${plan.deniveleM ? `<p class="muted">D+ <span class="data">${Math.round(plan.deniveleM)} m</span></p>` : ""}
        ${WeekStrip(plan.semaines, semaine.numero)}
      </div>

      ${coherence ? renderCoherenceObjectif(plan, coherence, profil, planPeriment) : ""}

      <div class="card">
        <div class="card__header">
          <button class="btn btn--sm" id="week-prev" ${idx === 0 ? "disabled" : ""}>&larr; Semaine préc.</button>
          <h2>Semaine ${semaine.numero} — ${semaine.phase}${semaine.statut === "decharge" ? " · décharge" : ""}</h2>
          <button class="btn btn--sm" id="week-next" ${idx === plan.semaines.length - 1 ? "disabled" : ""}>Semaine suiv. &rarr;</button>
        </div>
        <div style="overflow-x:auto;">
          ${WeekTable(semaine.seances, (i) => `#/seance?semaine=${semaine.numero}&idx=${i}&plan=${plan.id}`)}
        </div>
        ${idx === plan.semaines.length - 1 ? renderJourJ(plan) : ""}
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
    location.hash = `#/plan?semaine=${plan.semaines[idx - 1].numero}&planId=${plan.id}`;
  });
  container.querySelector("#week-next")?.addEventListener("click", () => {
    location.hash = `#/plan?semaine=${plan.semaines[idx + 1].numero}&planId=${plan.id}`;
  });

  // WeekTable rend des <tr> cliquables plutôt que des <a> (invalide en HTML
  // dans un <table>) — navigation gérée ici via l'attribut data-href.
  container.querySelectorAll(".week-table__row[data-href]").forEach((row) => {
    row.addEventListener("click", () => {
      location.hash = row.dataset.href;
    });
  });

  container.querySelectorAll("[data-bloc-saison]").forEach((el) => {
    el.addEventListener("click", () => {
      location.hash = `#/plan?planId=${el.dataset.blocSaison}`;
    });
  });
}

/**
 * Feuille de route de la saison (Partie II §9 étendue) : chaque bloc
 * (objectifs intermédiaires puis objectif final) avec son statut, pour
 * visualiser où on en est et naviguer entre les blocs de la même saison.
 */
function renderFeuilleDeRoute(blocs, planCourantId) {
  const STATUT_LABEL = { actif: "en cours", en_attente: "à venir", termine: "terminé" };
  return `
    <div class="card">
      <h2>Feuille de route de la saison</h2>
      <div class="stack">
        ${blocs
          .map((b) => {
            const estCourant = b.id === planCourantId;
            return `
            <div class="row" data-bloc-saison="${b.id}" style="justify-content:space-between; cursor:pointer; padding:8px; border-radius:8px; ${estCourant ? "background:var(--color-surface-2, rgba(255,255,255,.04));" : ""}">
              <div>
                <span class="data" style="margin-right:8px;">${b.ordreSaison}/${blocs.length}</span>
                <span>${escapeAttr(b.objectif || (b.roleSaison === "finale" ? "Objectif final" : "Objectif intermédiaire"))}</span>
                ${b.roleSaison === "finale" ? `<span class="zone-badge" style="margin-left:6px;">final</span>` : ""}
              </div>
              <div class="row" style="gap:8px;">
                <span class="muted">${new Date(b.dateEcheance).toLocaleDateString("fr-FR")}</span>
                <span class="muted">${STATUT_LABEL[b.statut] ?? b.statut}</span>
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

/**
 * Marqueur visuel "Jour J" sur la dernière semaine du plan — l'écart calendaire
 * entre la dernière séance planifiée et l'échéance est désormais borné à 0-2
 * jours (genererSemaines absorbe le reste dans la 1ère semaine), mais ça reste
 * invisible dans le calendrier tant que la course elle-même n'apparaît nulle
 * part : ce bandeau rend explicite que le plan vise précisément cette date,
 * pas une semaine "qui s'arrête" avant l'objectif.
 */
function renderJourJ(plan) {
  const joursRestants = Math.ceil((new Date(plan.dateEcheance) - new Date()) / (24 * 60 * 60 * 1000));
  const compteRebours = joursRestants > 0 ? `J-${joursRestants}` : joursRestants === 0 ? "Aujourd'hui" : "Passée";
  return `
    <div class="contour-divider"></div>
    <div class="row" style="justify-content:space-between; align-items:center; padding:12px; border-radius:var(--radius-card, 12px); background:var(--color-surface-2, rgba(255,255,255,.04));">
      <div class="row" style="gap:10px; align-items:center;">
        <span class="jour-j__icon">${Icon("flag")}</span>
        <div>
          <strong>Jour J — ${escapeAttr(plan.objectif ?? "")}</strong>
          <p class="muted" style="margin:0;">${new Date(plan.dateEcheance).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${plan.distanceObjectifM ? ` · ${(plan.distanceObjectifM / 1000).toFixed(1)} km` : ""}</p>
        </div>
      </div>
      <span class="data" style="font-size:1.1rem;">${compteRebours}</span>
    </div>`;
}

const BADGE_NIVEAU = {
  atteint: { classe: "badge-success", label: "Objectif à ta portée" },
  ambitieux: { classe: "badge-warning", label: "Objectif ambitieux" },
  tres_ambitieux: { classe: "badge-danger", label: "Objectif très ambitieux" },
};

/**
 * "Cohérence de l'objectif" — répond au besoin explicite d'être certain que
 * le contenu des séances peut effectivement mener à l'objectif (distance +
 * temps visé), pas seulement que le plan est bien structuré. Compare le VDOT
 * qu'exigerait l'objectif au VDOT réel le plus récent, resitué par rapport à
 * ce qu'un bloc de la durée du plan permet généralement de combler
 * (evaluerCoherenceObjectif, hypothèse indicative documentée dans vdot.js).
 */
function renderCoherenceObjectif(plan, coherence, profil, planPeriment) {
  const badge = BADGE_NIVEAU[coherence.niveau];
  const ecartLabel = `${coherence.ecartPct >= 0 ? "+" : ""}${coherence.ecartPct.toFixed(1)}%`;

  let conseil = "";
  if (coherence.niveau === "atteint") {
    conseil = `Ta forme actuelle permettrait déjà de réaliser ce temps — ce plan vise à le sécuriser et à progresser encore d'ici l'échéance.`;
  } else if (coherence.niveau === "ambitieux") {
    conseil = `Il te faut gagner environ ${ecartLabel} de VDOT d'ici l'échéance — cohérent avec ce que ${plan.semaines.length} semaines de plan bien suivi permettent généralement. Les blocs à l'allure objectif de tes sorties longues sont là pour ça.`;
  } else {
    const perf = profil?.performanceRef;
    const tempsRealiste = perf ? riegelPredict(perf.tempsS, perf.distanceM, plan.distanceObjectifM) : null;
    conseil = `Il faudrait gagner environ ${ecartLabel} de VDOT en ${plan.semaines.length} semaines — nettement au-delà de ce qu'un plan permet généralement sur ce délai (contenu des séances mis à part). ${
      tempsRealiste
        ? `Avec ta forme actuelle, un temps plus réaliste sur cette distance serait plutôt autour de ${formatDureeCompacte(tempsRealiste)}. `
        : ""
    }Envisage d'allonger le délai, d'augmenter le volume/les jours d'entraînement, ou de revoir l'objectif — <a href="#/profil">ajuster dans Profil</a>.`;
  }

  return `
    <div class="card">
      <div class="card__header">
        <h2>Cohérence de l'objectif</h2>
        <span class="${badge.classe}">${badge.label}</span>
      </div>
      <p class="muted">${conseil}</p>
      ${
        planPeriment
          ? `<p class="badge-warning">Le plan utilise encore un VDOT de ${plan.profilCourant.vdot.toFixed(1)} (dernier retest non encore appliqué) — <a href="#/profil">mets à jour le plan</a> pour recalculer allures et cohérence sur ta forme la plus récente.</p>`
          : ""
      }
    </div>`;
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
