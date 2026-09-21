// Helpers de suivi partagés entre dashboard, nutrition et la vue de
// monitoring du plan — factorise le calcul de charge et les alertes pour
// éviter de dupliquer la même logique dans chaque écran.

import * as repo from "../data/repo.js";
import { sessionLoad, renfoSessionLoad, acwr, acwrRiskLevel, latestLoadState, signauxSurentrainement } from "../engines/load.js";

export function intensityFactorFor(type) {
  return { T: 1.3, I: 1.5, R: 1.4, longue: 1.1, E: 1, recuperation: 0.7 }[type] ?? 1;
}

/** Charge quotidienne agrégée (toutes séances réalisées + renfo loggé), tous objectifs confondus. */
export async function buildDailyLoads() {
  const plans = await Promise.all((await repo.listObjectifs()).map((o) => repo.getPlanForObjectif(o.id)));
  const validPlans = plans.filter(Boolean);
  const allSeances = (await Promise.all(validPlans.map((p) => repo.listSeancesByPlan(p.id)))).flat();

  const byDate = new Map();
  for (const s of allSeances) {
    if (s.status !== "realisee" && s.status !== "modifiee") continue;
    const distanceKm = s.log?.realiseKm ?? s.targetVolumeKm;
    const load = sessionLoad({ distanceKm, intensityFactor: intensityFactorFor(s.type) });
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + load);
  }

  const renfoLogs = await repo.listRenfoLogs();
  for (const r of renfoLogs) {
    const load = renfoSessionLoad({ rpe: r.rpe, dureeMin: r.dureeMin });
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + load);
  }

  return [...byDate.entries()].map(([date, load]) => ({ date, load }));
}

/** Instantané de charge/fraîcheur courant (CTL/ATL/TSB + ACWR), pour dashboard et plan. */
export async function chargeSnapshot() {
  const dailyLoads = await buildDailyLoads();
  const today = new Date().toISOString().slice(0, 10);
  const { ratio } = acwr(dailyLoads, today);
  const riskLevel = acwrRiskLevel(ratio);
  const { ctl, atl, tsb } = latestLoadState(dailyLoads);
  return { ctl, atl, tsb, ratio, riskLevel };
}

/** Semaine courante du plan (1-indexée, bornée à [1, totalWeeks]). */
export function semaineActuelle(plan) {
  const jours = Math.floor((new Date() - new Date(plan.dateDebut)) / (24 * 3600 * 1000));
  return Math.min(Math.max(Math.floor(jours / 7) + 1, 1), plan.totalWeeks);
}

export const SEANCES_MANQUEES_ALERTE_SEUIL = 2;
export const FENETRE_ALERTE_JOURS = 14;

/** Séances manquées récentes, éventuellement filtrées sur un objectif donné. */
export async function seancesManqueesRecentes(objectifId = null) {
  const objectifs = objectifId ? [{ id: objectifId }] : await repo.listObjectifs();
  const plans = await Promise.all(objectifs.map((o) => repo.getPlanForObjectif(o.id)));
  const validPlans = plans.filter(Boolean);
  const allSeances = (await Promise.all(validPlans.map((p) => repo.listSeancesByPlan(p.id)))).flat();
  const seuilDate = new Date();
  seuilDate.setDate(seuilDate.getDate() - FENETRE_ALERTE_JOURS);
  return allSeances.filter((s) => s.status === "manquee" && new Date(s.date) >= seuilDate);
}

/** Signaux convergents de surentraînement (RPE élevé + sommeil dégradé), à partir du journal. */
export async function surentrainementSignal() {
  const journal = await repo.listJournal();
  return signauxSurentrainement(journal);
}

/** Alertes actives pertinentes pour un objectif/plan donné (factorise dashboard + vue plan). */
export async function alertesActives(objectifId = null) {
  const [seancesManquees, surentrainement] = await Promise.all([
    seancesManqueesRecentes(objectifId),
    surentrainementSignal(),
  ]);
  return { seancesManquees, surentrainement };
}
