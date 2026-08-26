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

const ORDRE_PRUDENCE = { verte: 0, orange: 1, rouge: 2 };

/** Retient la zone la plus prudente entre deux zones (verte < orange < rouge). */
function zonePlusPrudente(a, b) {
  if (!a) return b;
  if (!b) return a;
  return ORDRE_PRUDENCE[a] >= ORDRE_PRUDENCE[b] ? a : b;
}

/**
 * Vue combinée pour le dashboard : ACWR simple + EWMA (intensité perçue,
 * sRPE = durée × RPE) + zone + avertissement méthodologique à afficher
 * systématiquement à l'utilisateur.
 *
 * Le volume brut journalier (ex: km, dailyVolumes) est intégré comme second
 * axe à poids au moins égal, sur demande explicite : un gros volume répété
 * peut représenter un risque même à intensité perçue modérée, ce que le
 * sRPE seul peut sous-pondérer. Sa propre tendance ACWR/EWMA est calculée
 * avec exactement la même mécanique (moyenne mobile 7j/28j, EWMA) que
 * l'intensité perçue — la zone finale retenue est la plus prudente des deux
 * axes, pas seulement celle de l'intensité perçue.
 * @param {number[]} dailyLoads charges journalières sRPE (durée × RPE), plus récent en dernier
 * @param {number[]|null} dailyVolumes volumes bruts journaliers (ex: km), même ordre que dailyLoads ; optionnel
 */
export function loadSummary(dailyLoads, dailyVolumes = null) {
  const simple = acwr(dailyLoads);
  const robust = ewmaAcwr(dailyLoads);
  const zoneIntensite = acwrZone(robust);

  // Calculé dès qu'il y a au moins un jour de volume connu (pas d'attente
  // de 7 jours pleins) — sur demande explicite, la tendance doit être
  // visible dès le début du programme plutôt que masquée pendant la
  // première semaine. `donneesLimitees` signale que c'est encore provisoire.
  let acwrVolumeEwma = null;
  let zoneVolume = null;
  if (dailyVolumes && dailyVolumes.length) {
    acwrVolumeEwma = ewmaAcwr(dailyVolumes);
    zoneVolume = acwrZone(acwrVolumeEwma);
  }

  const donneesLimitees = dailyLoads.length < 7;
  const noteDonneesLimitees = donneesLimitees
    ? "Tendance encore provisoire (moins de 7 jours d'historique) — se fiabilise au fil des jours. "
    : "";

  return {
    acwrSimple: simple,
    acwrEwma: robust,
    acwrVolumeEwma,
    zoneIntensite,
    zoneVolume,
    zone: zonePlusPrudente(zoneIntensite, zoneVolume),
    donneesLimitees,
    disclaimer:
      `${noteDonneesLimitees}Indicateur de tendance, pas un prédicteur causal fiable isolément (couplage mathématique documenté par Wang et al., 2020) — à croiser avec le ressenti et les autres marqueurs. Le volume brut (km) pèse au moins autant que l'intensité perçue : la zone retenue est la plus prudente des deux axes.`,
  };
}
