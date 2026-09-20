// Moteur VDOT / allures cibles — modèle Daniels & Gilbert.
// Sources : Daniels J, Gilbert J., "Oxygen Power" (1979) ; Daniels J.,
// "Daniels' Running Formula", 4e éd., Human Kinetics, 2021.
// Voir cadrage produit, Section 1 (VDOT) et zones E/M/T/I/R.

// Bornes de validité indicatives du modèle Daniels : performance de
// référence entre 1500 m et le marathon, effort maximal, terrain plat,
// idéalement < 4-6 semaines.
export const REFERENCE_LIMITS = {
  minDistanceM: 1500,
  maxDistanceM: 42195,
  maxAgeWeeks: 6,
};

// Zones physio Daniels dérivées du %VO2max (cadrage produit, Section 7).
export const ZONES = {
  E: { min: 0.59, max: 0.74, label: "Endurance fondamentale", rpe: "3-4" },
  M: { min: 0.75, max: 0.84, label: "Allure marathon", rpe: "5-6" },
  T: { min: 0.83, max: 0.88, label: "Seuil", rpe: "6-7" },
  I: { min: 0.95, max: 1.0, label: "Intervalle VO2max", rpe: "8-9" },
  R: { min: 1.0, max: 1.2, label: "Répétition", rpe: "9-10" },
};

// Équation 1 (Daniels-Gilbert) : coût en oxygène à une vitesse donnée.
// v en m/min, retour en mL/kg/min.
export function vo2AtSpeed(vMetersPerMin) {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
}

// Racine positive de l'équation 1 inversée : vitesse (m/min) pour un VO2 cible.
export function speedForVo2(vo2Target) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2Target);
  const discriminant = b * b - 4 * a * c;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

// Équation 2 (Daniels-Gilbert) : fraction de VO2max soutenable selon la durée
// de l'effort (t en minutes), utilisée pour dériver le VDOT d'une perf.
export function pctVo2maxForDuration(tMinutes) {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMinutes) +
    0.2989558 * Math.exp(-0.1932605 * tMinutes)
  );
}

/**
 * Correction d'altitude simple : au-dessus de ~1000-1200 m, une perf
 * chronométrée sous-estime le VDOT réel (effet de l'hypoxie sur le VO2max
 * exploitable). Facteur empirique indicatif (pas une formule Daniels
 * publiée) : +0.6%/100 m au-delà de 1200 m, plafonné à +12%.
 * @param {number} vdot
 * @param {number} altitudeM altitude du lieu de la performance, en mètres
 */
export function correctionAltitude(vdot, altitudeM = 0) {
  const SEUIL_M = 1200;
  const TAUX_PAR_100M = 0.006;
  const PLAFOND = 0.12;
  if (altitudeM <= SEUIL_M) return vdot;
  const facteur = Math.min(((altitudeM - SEUIL_M) / 100) * TAUX_PAR_100M, PLAFOND);
  return vdot * (1 + facteur);
}

/**
 * Calcule le VDOT à partir d'une performance de référence.
 * @param {number} distanceMeters
 * @param {number} timeSeconds
 * @param {{altitudeM?: number}} [options]
 * @returns {{vdot:number, warnings:string[]}}
 */
export function vdotFromPerformance(distanceMeters, timeSeconds, options = {}) {
  const warnings = [];
  if (distanceMeters < REFERENCE_LIMITS.minDistanceM) {
    warnings.push(
      `Distance de référence (${distanceMeters} m) sous la borne de validité (${REFERENCE_LIMITS.minDistanceM} m) — VDOT peu fiable.`
    );
  }
  if (distanceMeters > REFERENCE_LIMITS.maxDistanceM) {
    warnings.push(
      `Distance de référence (${distanceMeters} m) au-delà de la borne de validité (${REFERENCE_LIMITS.maxDistanceM} m) — VDOT peu fiable.`
    );
  }
  const tMinutes = timeSeconds / 60;
  const vMetersPerMin = distanceMeters / tMinutes;
  const vo2 = vo2AtSpeed(vMetersPerMin);
  const pct = pctVo2maxForDuration(tMinutes);
  let vdot = vo2 / pct;
  const altitudeM = options.altitudeM ?? 0;
  if (altitudeM > 1200) {
    vdot = correctionAltitude(vdot, altitudeM);
    warnings.push(`Correction d'altitude appliquée (${altitudeM} m).`);
  }
  return { vdot, warnings };
}

export function speedToPaceMinPerKm(vMetersPerMin) {
  return 1000 / vMetersPerMin;
}

export function formatPace(paceMinPerKm) {
  if (!Number.isFinite(paceMinPerKm)) return "--:--/km";
  const totalSeconds = Math.round(paceMinPerKm * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

/**
 * Allure cible (min/km) pour une zone donnée, au centre de la fourchette
 * %VO2max de la zone.
 * @param {number} vdot
 * @param {keyof ZONES} zoneKey
 */
export function paceForZone(vdot, zoneKey) {
  const zone = ZONES[zoneKey];
  const vo2max = vdot;
  const pctMin = zone.min;
  const pctMax = zone.max;
  const speedMin = speedForVo2(vo2max * pctMin);
  const speedMax = speedForVo2(vo2max * pctMax);
  return {
    fastPaceMinPerKm: speedToPaceMinPerKm(speedMax),
    slowPaceMinPerKm: speedToPaceMinPerKm(speedMin),
  };
}

/** Calcule les 5 zones d'allure (min/km) pour un VDOT donné. */
export function paceZonesFromVdot(vdot) {
  const zones = {};
  for (const key of Object.keys(ZONES)) {
    const { fastPaceMinPerKm, slowPaceMinPerKm } = paceForZone(vdot, key);
    zones[key] = {
      ...ZONES[key],
      fastPaceMinPerKm,
      slowPaceMinPerKm,
      fastPace: formatPace(fastPaceMinPerKm),
      slowPace: formatPace(slowPaceMinPerKm),
    };
  }
  return zones;
}

/**
 * Prochaine date de retest recommandée (cadrage produit : 4-8 semaines).
 * @param {Date|string} lastTestDate
 * @returns {{minDate: Date, maxDate: Date}}
 */
export function nextRetestWindow(lastTestDate) {
  const base = new Date(lastTestDate);
  const minDate = new Date(base);
  minDate.setDate(minDate.getDate() + 4 * 7);
  const maxDate = new Date(base);
  maxDate.setDate(maxDate.getDate() + 8 * 7);
  return { minDate, maxDate };
}
