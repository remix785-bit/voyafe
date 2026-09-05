// Moteur VDOT / Allures — modèle Daniels & Gilbert
// Sources : Daniels J, Gilbert J. "Oxygen Power: Performance Tables for Distance Runners" (1979)
//           Daniels J. "Daniels' Running Formula", 4e éd., Human Kinetics, 2021.
// Voir dossier technique, Partie I, Section 2.

/**
 * Bornes de validité du modèle : distance de référence 1500 m à 50 km,
 * effort maximal, idéalement testé/retesté toutes les 4-6 semaines.
 */
export const VDOT_MODEL_LIMITS = {
  minDistanceM: 1500,
  maxDistanceM: 50000,
  recencyWeeks: { min: 4, max: 6 },
};

/**
 * Équation 1 (Daniels-Gilbert) — coût en oxygène à une vitesse donnée.
 * @param {number} vMetersPerMin vitesse en m/min
 * @returns {number} VO2 en mL/kg/min
 */
export function vo2AtSpeed(vMetersPerMin) {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
}

/**
 * Équation 2 (Daniels-Gilbert) — fraction de VO2max soutenable selon la durée.
 * @param {number} tMinutes durée de l'effort en minutes
 * @returns {number} fraction de VO2max (0-1)
 */
export function pctVo2maxForDuration(tMinutes) {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMinutes) +
    0.2989558 * Math.exp(-0.1932605 * tMinutes)
  );
}

/**
 * Résout la vitesse (m/min) correspondant à une consommation d'O2 cible,
 * en inversant l'équation 1 (racine positive du polynôme du 2nd degré).
 * @param {number} vo2Target mL/kg/min
 * @returns {number} vitesse en m/min
 */
export function speedForVo2(vo2Target) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2Target);
  const discriminant = b * b - 4 * a * c;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

/**
 * Calcule le VDOT à partir d'une performance de référence (distance + temps).
 * @param {number} distanceMeters distance de la performance de référence
 * @param {number} timeSeconds temps réalisé
 * @returns {{vdot:number, warnings:string[]}}
 */
export function vdotFromPerformance(distanceMeters, timeSeconds) {
  const warnings = [];
  if (distanceMeters < VDOT_MODEL_LIMITS.minDistanceM) {
    warnings.push(
      `Distance de référence (${distanceMeters} m) sous la borne de validité du modèle (${VDOT_MODEL_LIMITS.minDistanceM} m) — VDOT peu fiable.`
    );
  }
  if (distanceMeters > VDOT_MODEL_LIMITS.maxDistanceM) {
    warnings.push(
      `Distance de référence (${distanceMeters} m) au-delà de la borne de validité du modèle (${VDOT_MODEL_LIMITS.maxDistanceM} m) — VDOT peu fiable.`
    );
  }
  const tMinutes = timeSeconds / 60;
  const vMetersPerMin = distanceMeters / tMinutes;
  const vo2 = vo2AtSpeed(vMetersPerMin);
  const pct = pctVo2maxForDuration(tMinutes);
  const vdot = vo2 / pct;
  return { vdot, warnings };
}

/**
 * Cross-check indépendant — formule de Riegel (1977) : T2 = T1 * (D2/D1)^1.06
 * Fiable surtout pour des extrapolations courtes (10K -> semi) ; sur marathon,
 * tend à sous-estimer légèrement le temps réel des coureurs récréatifs.
 * @param {number} t1Seconds temps connu
 * @param {number} d1Meters distance connue
 * @param {number} d2Meters distance à prédire
 * @returns {number} temps prédit en secondes
 */
export function riegelPredict(t1Seconds, d1Meters, d2Meters) {
  return t1Seconds * (d2Meters / d1Meters) ** 1.06;
}

/**
 * Zones d'entraînement Daniels (E/M/T/I/R) — bornes %VO2max.
 * Partie I, Section 3. R est extrapolé au-delà de 100% (approximatif).
 */
export const ZONES = {
  E: { min: 0.59, max: 0.74, label: "Endurance fondamentale", rpe: "2-4" },
  M: { min: 0.75, max: 0.84, label: "Allure marathon", rpe: "5" },
  T: { min: 0.86, max: 0.88, label: "Seuil", rpe: "6-7" },
  I: { min: 0.95, max: 1.0, label: "Interval / VO2max", rpe: "7-8" },
  R: { min: 1.05, max: 1.2, label: "Répétition / vitesse", rpe: "8-9" },
};

/**
 * Convertit une vitesse (m/min) en allure min/km.
 * @param {number} vMetersPerMin
 * @returns {number} allure en minutes par km (décimal)
 */
export function speedToPaceMinPerKm(vMetersPerMin) {
  return 1000 / vMetersPerMin;
}

/**
 * Formate une allure décimale (min/km) en "m:ss/km".
 * @param {number} paceMinPerKm
 */
export function formatPace(paceMinPerKm) {
  const totalSeconds = Math.round(paceMinPerKm * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/**
 * Parse une allure saisie en "m:ss" (avec ou sans le "/km" de formatPace())
 * en allure décimale (min/km) — inverse de formatPace().
 * @param {string} label
 * @returns {number|null} null si non parsable
 */
export function parsePaceLabel(label) {
  const match = String(label ?? "").trim().match(/^(\d+):([0-5]?\d)/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

/**
 * Parse une durée saisie en "m:ss" ou "h:mm:ss" en secondes totales.
 * @param {string} label
 */
export function parseDureeLabel(label) {
  const parts = String(label ?? "").trim().split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(label) || 0;
}

/**
 * Formate une durée en secondes en "m:ss" (ou "h:mm:ss" au-delà d'une
 * heure) — inverse de parseDureeLabel().
 * @param {number} totalSecondes
 */
export function formatDureeCompacte(totalSecondes) {
  const s = Math.round(totalSecondes);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * Calcule les allures cibles (bornes rapide/lente + valeur représentative)
 * pour chaque zone E/M/T/I/R à partir d'un VDOT donné.
 * @param {number} vdot
 * @returns {Object<string, {fast:number, slow:number, target:number, fastLabel:string, slowLabel:string, targetLabel:string}>}
 */
export function paceZonesForVdot(vdot) {
  const out = {};
  for (const [zone, bounds] of Object.entries(ZONES)) {
    const vo2Fast = vdot * bounds.max; // %VO2max le plus haut -> allure la plus rapide
    const vo2Slow = vdot * bounds.min;
    const vFast = speedForVo2(vo2Fast);
    const vSlow = speedForVo2(vo2Slow);
    const paceFast = speedToPaceMinPerKm(vFast);
    const paceSlow = speedToPaceMinPerKm(vSlow);
    const target = (paceFast + paceSlow) / 2;
    out[zone] = {
      fast: paceFast,
      slow: paceSlow,
      target,
      fastLabel: formatPace(paceFast),
      slowLabel: formatPace(paceSlow),
      targetLabel: formatPace(target),
    };
  }
  return out;
}

/**
 * Distance "plat-équivalente" d'un objectif avec D+ (même heuristique que
 * allurePlatEquivalenteCible, pacing.js : 100 m de D+ ≈ 1 km à plat) —
 * indispensable pour comparer un objectif trail au modèle VDOT (Daniels,
 * conçu pour de la course à plat) sans sous-estimer sa difficulté réelle :
 * courir 20 km avec 1200 m de D+ n'a rien à voir avec 20 km à plat, même à
 * temps égal. Sans D+ renseigné, reste la distance brute (route).
 * @param {number} distanceM
 * @param {number} deniveleM
 * @returns {number} distance équivalente plat, en mètres
 */
export function distanceEquivalentePlateM(distanceM, deniveleM = 0) {
  return distanceM + (deniveleM / 100) * 1000;
}

/**
 * Évalue si l'objectif visé (distance+temps, +D+ en trail) est cohérent avec
 * la forme actuelle (VDOT) compte tenu du nombre de semaines d'entraînement
 * disponibles — répond au besoin "être certain que le contenu de mes
 * séances me permet de réaliser mon objectif" : le plan peut être bien
 * construit et pourtant viser un temps hors de portée dans le délai donné,
 * sans qu'aucun signal ne le dise ailleurs dans l'appli.
 *
 * Hypothèse indicative (point ouvert, non tirée d'une source unique) : un
 * gain de VDOT d'environ 0.25%/semaine d'entraînement structuré est un
 * ordre de grandeur raisonnable pour un coureur récréatif à intermédiaire
 * sur un bloc de plusieurs mois — un coureur déjà très entraîné progresse
 * nettement moins vite, à l'inverse un débutant peut progresser plus vite.
 * Sert de repère, pas d'une prédiction individualisée garantie.
 * @param {number} vdotActuel
 * @param {number} distanceObjectifM
 * @param {number} tempsObjectifS
 * @param {number} semainesDisponibles nombre de semaines du plan menant à l'échéance
 * @param {number} [deniveleM] D+ attendu de la course (trail) — converti en distance
 *   plat-équivalente avant le calcul de VDOT, sans quoi un objectif trail avec fort D+
 *   ressortirait comme "déjà atteint" ou "irréaliste" à tort (modèle route par défaut).
 * @returns {{vdotObjectif:number, ecartPct:number, plafondRealistePct:number, niveau:"atteint"|"ambitieux"|"tres_ambitieux"}}
 */
export function evaluerCoherenceObjectif(vdotActuel, distanceObjectifM, tempsObjectifS, semainesDisponibles, deniveleM = 0) {
  const distanceEquivalente = distanceEquivalentePlateM(distanceObjectifM, deniveleM);
  const { vdot: vdotObjectif } = vdotFromPerformance(distanceEquivalente, tempsObjectifS);
  const ecartPct = ((vdotObjectif - vdotActuel) / vdotActuel) * 100;
  const GAIN_HEBDO_PCT = 0.25;
  const PLAFOND_GAIN_PCT = 12; // la progression de VDOT plafonne aussi sur de très longs blocs
  const plafondRealistePct = Math.min(Math.max(semainesDisponibles, 0) * GAIN_HEBDO_PCT, PLAFOND_GAIN_PCT);
  let niveau;
  if (ecartPct <= 0) niveau = "atteint";
  else if (ecartPct <= plafondRealistePct) niveau = "ambitieux";
  else niveau = "tres_ambitieux";
  return { vdotObjectif, ecartPct, plafondRealistePct, niveau };
}

/**
 * Identifie l'axe de travail prioritaire pour combler un écart d'objectif —
 * répond à "ce que je dois améliorer pour atteindre mon objectif", pas
 * seulement "l'objectif est ambitieux". Le VDOT est une mesure composite
 * (vitesse ET endurance) : on ne peut pas décomposer les deux à partir d'un
 * seul point de mesure, mais le RATIO entre la distance objectif (plat-
 * équivalente, D+ inclus) et la distance réellement testée est lui-même
 * informatif — c'est exactement la limite documentée du modèle de Riegel
 * (riegelPredict ci-dessus) : fiable sur des extrapolations courtes,
 * optimiste sur de longues extrapolations pour un coureur récréatif (la
 * vitesse pure ne suffit pas à tenir la distance, il faut de la durabilité
 * aérobie spécifiquement construite). En trail, une pente moyenne marquée
 * (≥2%) signale en plus un axe D+/technicité à part entière — grimper et
 * descendre sollicitent des qualités musculaires spécifiques que
 * l'endurance/vitesse pure ne couvrent pas.
 * @param {number} distanceRefM distance de la performance de référence testée
 * @param {number} distanceObjectifM distance de l'objectif visé
 * @param {number} [deniveleM] D+ attendu de la course (trail)
 * @returns {{ratio:number, axe:"vitesse"|"equilibre"|"endurance", axeSecondaire:"denivele"|null, penteMoyenne:number}}
 */
export function identifierAxeTravail(distanceRefM, distanceObjectifM, deniveleM = 0) {
  const distanceEquivalente = distanceEquivalentePlateM(distanceObjectifM, deniveleM);
  const ratio = distanceEquivalente / distanceRefM;
  let axe;
  if (ratio <= 1.5) axe = "vitesse";
  else if (ratio <= 3) axe = "equilibre";
  else axe = "endurance";
  const penteMoyenne = distanceObjectifM > 0 ? deniveleM / distanceObjectifM : 0;
  const axeSecondaire = penteMoyenne >= 0.02 ? "denivele" : null;
  return { ratio, axe, axeSecondaire, penteMoyenne };
}

/**
 * Correction d'altitude — Partie I, Section 3.1.
 * Modèle en deux phases (Peronnet/Thibault/Cousineau 1991 ; Wehrlin/Hallén 2006).
 * @param {number} altitudeM altitude en mètres
 * @returns {number} delta VO2max (fraction négative, ex: -0.03 = -3%)
 */
export function altitudeDeltaVo2max(altitudeM) {
  if (altitudeM <= 1500) {
    return -0.01 * (altitudeM / 1000);
  }
  return -0.015 - 0.063 * ((altitudeM - 1500) / 1000);
}

export const ACCLIMATATION_REDUCTION = {
  aucune: 0,
  "1-2semaines": 0.45, // milieu de 40-50%
  "3semaines+": 0.75, // milieu de 70-80%
};

/**
 * Ajuste une allure cible pour l'altitude, avec facteur d'acclimatation.
 * La baisse de performance réelle est ~moitié moindre que la baisse de VO2max.
 * @param {number} paceMinPerKm allure cible au niveau de la mer
 * @param {number} altitudeM altitude de la course/du stage
 * @param {keyof ACCLIMATATION_REDUCTION} acclimatation
 * @returns {{paceAjustee:number, deltaPerfEffectif:number}}
 */
export function adjustPaceForAltitude(paceMinPerKm, altitudeM, acclimatation = "aucune") {
  const deltaVo2max = altitudeDeltaVo2max(altitudeM);
  const deltaPerf = deltaVo2max * 0.5;
  const reduction = ACCLIMATATION_REDUCTION[acclimatation] ?? 0;
  const deltaPerfEffectif = deltaPerf * (1 - reduction);
  const paceAjustee = paceMinPerKm * (1 - deltaPerfEffectif);
  return { paceAjustee, deltaPerfEffectif };
}
