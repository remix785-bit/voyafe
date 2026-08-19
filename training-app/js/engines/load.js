// Moteur de Charge — ACWR (Acute:Chronic Workload Ratio) et alternative EWMA
// Sources : Gabbett TJ. "The training-injury prevention paradox." Br J Sports Med. 2016.
//           Critique du couplage mathématique : Wang et al., 2020.
//           Alternative EWMA : Williams et al., 2016.
// Voir dossier technique, Partie I, Section 10.
//
// IMPORTANT (limite méthodologique documentée) : l'ACWR n'est PAS présenté comme un
// prédicteur causal fiable ici, seulement comme un indicateur de tendance parmi
// d'autres (RPE déclaratif, RMSSD, FC repos — cf. adaptiveLoop.js).

export const ACWR_SWEET_SPOT = { min: 0.8, max: 1.3 };
export const ACWR_DANGER_THRESHOLD = 1.5;

/**
 * Charge aiguë : moyenne mobile simple des 7 derniers jours.
 * @param {number[]} dailyLoads charges journalières (ex: TRIMP, distance, durée), plus récent en dernier
 */
export function acuteLoad(dailyLoads) {
  const last7 = dailyLoads.slice(-7);
  return last7.reduce((a, b) => a + b, 0) / (last7.length || 1);
}

/**
 * Charge chronique : moyenne mobile simple des 28 derniers jours.
 */
export function chronicLoad(dailyLoads) {
  const last28 = dailyLoads.slice(-28);
  return last28.reduce((a, b) => a + b, 0) / (last28.length || 1);
}

/**
 * ACWR classique = charge aiguë (7j) / charge chronique (28j).
 * @param {number[]} dailyLoads plus récent en dernier
 */
export function acwr(dailyLoads) {
  const chronic = chronicLoad(dailyLoads);
  if (chronic === 0) return 0;
  return acuteLoad(dailyLoads) / chronic;
}

export function acwrZone(value) {
  if (value > ACWR_DANGER_THRESHOLD) return "rouge";
  if (value >= ACWR_SWEET_SPOT.min && value <= ACWR_SWEET_SPOT.max) return "verte";
  return "orange";
}

/**
 * EWMA (Exponentially Weighted Moving Average) — pondère davantage les jours
 * récents, réduit le biais de couplage mathématique de l'ACWR simple.
 * lambda = 2 / (N + 1), calcul récursif jour par jour.
 * @param {number[]} dailyLoads plus récent en dernier
 * @param {number} windowDays fenêtre équivalente (7 pour aigu, 28 pour chronique)
 */
export function ewma(dailyLoads, windowDays) {
  const lambda = 2 / (windowDays + 1);
  let value = dailyLoads[0] ?? 0;
  for (let i = 1; i < dailyLoads.length; i++) {
    value = dailyLoads[i] * lambda + value * (1 - lambda);
  }
  return value;
}

/**
 * ACWR calculé via EWMA (aigu 7j / chronique 28j), alternative plus robuste
 * recommandée en complément de l'ACWR à moyenne mobile simple.
 * @param {number[]} dailyLoads plus récent en dernier
 */
export function ewmaAcwr(dailyLoads) {
  const chronic = ewma(dailyLoads, 28);
  if (chronic === 0) return 0;
  return ewma(dailyLoads, 7) / chronic;
}

/**
 * Vue combinée pour le dashboard : ACWR simple + EWMA + zone + avertissement
 * méthodologique à afficher systématiquement à l'utilisateur.
 * @param {number[]} dailyLoads plus récent en dernier
 */
export function loadSummary(dailyLoads) {
  const simple = acwr(dailyLoads);
  const robust = ewmaAcwr(dailyLoads);
  return {
    acwrSimple: simple,
    acwrEwma: robust,
    zone: acwrZone(robust),
    disclaimer:
      "Indicateur de tendance, pas un prédicteur causal fiable isolément (couplage mathématique documenté par Wang et al., 2020) — à croiser avec le ressenti et les autres marqueurs.",
  };
}
