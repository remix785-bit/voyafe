// Agrégation des statistiques de performance RÉELLE (séances Strava
// synchronisées, data/stravaSync.js) sur la semaine et le mois en cours —
// par opposition aux séances *planifiées* déjà affichées ailleurs (Plan,
// Dashboard "Cette semaine"). Donne un vrai "aperçu de mes perf" : volume
// couru, D+, allure moyenne, avec une tendance vs la période précédente.

/**
 * Agrège les séances réalisées dont la date tombe dans [debut, fin).
 * @param {Array<{date:string, distanceKm?:number, dureeMin?:number, deniveleM?:number}>} seancesRealisees
 * @param {Date} debut inclus
 * @param {Date} fin exclu
 */
export function agregerPeriode(seancesRealisees, debut, fin) {
  const dansLaPeriode = seancesRealisees.filter((s) => {
    const d = new Date(s.date);
    return d >= debut && d < fin;
  });
  const distanceKm = dansLaPeriode.reduce((a, s) => a + (s.distanceKm ?? 0), 0);
  const dureeMin = dansLaPeriode.reduce((a, s) => a + (s.dureeMin ?? 0), 0);
  const deniveleM = dansLaPeriode.reduce((a, s) => a + (s.deniveleM ?? 0), 0);
  const nbSeances = dansLaPeriode.length;
  const allureMoyenneMinParKm = distanceKm > 0 ? dureeMin / distanceKm : null;
  return { distanceKm, dureeMin, deniveleM, nbSeances, allureMoyenneMinParKm };
}

/** Début (lundi 00:00 local) de la semaine ISO contenant `date`. */
export function debutSemaineIso(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const decalageLundi = (d.getDay() + 6) % 7; // 0=lundi..6=dimanche
  d.setDate(d.getDate() - decalageLundi);
  return d;
}

/** Début (1er du mois, 00:00 local) du mois calendaire contenant `date`. */
export function debutMoisCalendaire(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Stats de performance réelle pour la semaine et le mois calendaires en
 * cours, plus la période précédente équivalente pour donner une tendance.
 * @param {Array} seancesRealisees
 * @param {Date} maintenant injectable pour les tests
 */
export function statsPerformance(seancesRealisees, maintenant = new Date()) {
  const debutSemaine = debutSemaineIso(maintenant);
  const finSemaine = new Date(debutSemaine.getTime() + 7 * 24 * 60 * 60 * 1000);
  const debutSemainePrecedente = new Date(debutSemaine.getTime() - 7 * 24 * 60 * 60 * 1000);

  const debutMois = debutMoisCalendaire(maintenant);
  const finMois = new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 1);
  const debutMoisPrecedent = new Date(debutMois.getFullYear(), debutMois.getMonth() - 1, 1);

  return {
    semaine: agregerPeriode(seancesRealisees, debutSemaine, finSemaine),
    semainePrecedente: agregerPeriode(seancesRealisees, debutSemainePrecedente, debutSemaine),
    mois: agregerPeriode(seancesRealisees, debutMois, finMois),
    moisPrecedent: agregerPeriode(seancesRealisees, debutMoisPrecedent, debutMois),
  };
}

/**
 * Distance hebdomadaire réelle sur les `nbSemaines` dernières semaines
 * (dont la semaine en cours, incomplète) — pour visualiser la tendance de
 * volume ; plus récente en dernier.
 */
export function distanceHebdoRecente(seancesRealisees, nbSemaines = 8, maintenant = new Date()) {
  const debutSemaineCourante = debutSemaineIso(maintenant);
  const semaines = [];
  for (let i = nbSemaines - 1; i >= 0; i--) {
    const debut = new Date(debutSemaineCourante.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const fin = new Date(debut.getTime() + 7 * 24 * 60 * 60 * 1000);
    semaines.push(agregerPeriode(seancesRealisees, debut, fin).distanceKm);
  }
  return semaines;
}

/**
 * Variation en % entre une valeur actuelle et précédente — null si la
 * période précédente est vide (pourcentage non significatif dans ce cas).
 */
export function variationPct(actuel, precedent) {
  if (!precedent) return null;
  return ((actuel - precedent) / precedent) * 100;
}
