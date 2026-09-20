// Moteur charge d'entraînement & fatigue — ACWR et CTL/ATL/TSB.
// Cadrage produit, Section 5 (Charge & fatigue) ; doc technique Section 3.

/**
 * Charge d'une séance : distance (km) * facteur d'intensité, ou TRIMP-like
 * simplifié si la FC moyenne est disponible.
 * @param {{distanceKm?: number, durationMin?: number, intensityFactor?: number, avgHr?: number, maxHr?: number, restHr?: number}} session
 */
export function sessionLoad(session) {
  const { distanceKm, durationMin, intensityFactor = 1, avgHr, maxHr, restHr } = session;
  if (avgHr && maxHr && restHr && durationMin) {
    // TRIMP-like (Banister simplifié) : durée * réserve FC relative * facteur exponentiel léger.
    const hrReserve = (avgHr - restHr) / (maxHr - restHr);
    const trimp = durationMin * hrReserve * 0.64 * Math.exp(1.92 * hrReserve);
    return Math.round(trimp * 10) / 10;
  }
  if (distanceKm) {
    return Math.round(distanceKm * intensityFactor * 10) / 10;
  }
  if (durationMin) {
    return Math.round(durationMin * intensityFactor * 10) / 10;
  }
  return 0;
}

/**
 * Charge d'une séance de renfo loggée : RPE * durée (méthode cohérente avec
 * le TRIMP-like des séances de course, sans FC disponible pour du renfo).
 * @param {{rpe?: number, dureeMin?: number}} renfoLog
 */
export function renfoSessionLoad(renfoLog) {
  const { rpe, dureeMin } = renfoLog;
  if (!rpe || !dureeMin) return 0;
  return Math.round(rpe * dureeMin * 10) / 10;
}

/**
 * ACWR = charge aiguë (moyenne 7j) / charge chronique (moyenne 28j).
 * @param {{date: string, load: number}[]} dailyLoads triés ou non, une entrée par jour
 * @param {string|Date} onDate date de calcul
 */
export function acwr(dailyLoads, onDate) {
  const target = new Date(onDate);
  const byDate = new Map(dailyLoads.map((d) => [toDateKey(d.date), d.load]));
  const acute = averageLoadOverWindow(byDate, target, 7);
  const chronic = averageLoadOverWindow(byDate, target, 28);
  const ratio = chronic > 0 ? acute / chronic : acute > 0 ? Infinity : 0;
  return { acute, chronic, ratio };
}

function averageLoadOverWindow(byDate, target, days) {
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(target);
    d.setDate(d.getDate() - i);
    sum += byDate.get(toDateKey(d)) ?? 0;
  }
  return sum / days;
}

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Zone de risque ACWR (cadrage produit, Section 15) : hors [0.8, 1.5].
export const ACWR_SAFE_MIN = 0.8;
export const ACWR_SAFE_MAX = 1.5;

export function acwrRiskLevel(ratio) {
  if (!Number.isFinite(ratio)) return "inconnu";
  if (ratio > ACWR_SAFE_MAX) return "risque_surcharge";
  if (ratio < ACWR_SAFE_MIN) return "sous_charge";
  return "ok";
}

// Constantes de temps EWMA façon TrainingPeaks : CTL 42j (fitness/forme
// chronique), ATL 7j (fatigue aiguë). TSB = CTL - ATL.
export const CTL_TIME_CONSTANT_DAYS = 42;
export const ATL_TIME_CONSTANT_DAYS = 7;

// Remplit les jours sans séance (load 0) entre le premier et le dernier jour
// de l'historique : l'EWMA doit décroître à chaque jour calendaire, pas
// seulement aux jours où une charge a été enregistrée.
function fillDailyGaps(dailyLoads) {
  const byDate = new Map(dailyLoads.map((d) => [toDateKey(d.date), d.load]));
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];
  const filled = [];
  const cursor = new Date(dates[0]);
  const end = new Date(dates[dates.length - 1]);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    filled.push({ date: key, load: byDate.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return filled;
}

function ewma(dailyLoads, timeConstantDays) {
  const sorted = fillDailyGaps(dailyLoads);
  const alpha = 1 / timeConstantDays;
  let value = 0;
  const series = [];
  for (const { date, load } of sorted) {
    value = value + alpha * (load - value);
    series.push({ date: toDateKey(date), value: Math.round(value * 10) / 10 });
  }
  return series;
}

/**
 * Calcule les séries CTL (fitness), ATL (fatigue) et TSB (forme/fraîcheur)
 * jour par jour à partir d'un historique de charges quotidiennes.
 * @param {{date: string, load: number}[]} dailyLoads
 */
export function ctlAtlTsb(dailyLoads) {
  const ctlSeries = ewma(dailyLoads, CTL_TIME_CONSTANT_DAYS);
  const atlSeries = ewma(dailyLoads, ATL_TIME_CONSTANT_DAYS);
  const tsbSeries = ctlSeries.map((c, i) => ({
    date: c.date,
    value: Math.round((c.value - atlSeries[i].value) * 10) / 10,
  }));
  return { ctlSeries, atlSeries, tsbSeries };
}

/** Dernière valeur CTL/ATL/TSB de la série, ou zéros si vide. */
export function latestLoadState(dailyLoads) {
  if (dailyLoads.length === 0) return { ctl: 0, atl: 0, tsb: 0 };
  const { ctlSeries, atlSeries, tsbSeries } = ctlAtlTsb(dailyLoads);
  const last = (s) => s[s.length - 1]?.value ?? 0;
  return { ctl: last(ctlSeries), atl: last(atlSeries), tsb: last(tsbSeries) };
}
