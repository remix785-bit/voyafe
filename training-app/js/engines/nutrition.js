// Moteur nutrition & hydratation — doc technique Section 8. Fonctions
// pures ; aucun accès store ici, les besoins en g/kg sont des ordres de
// grandeur usuels en nutrition du sport (le doc technique ne fournit pas
// de valeurs numériques, seulement des directions qualitatives — les
// fourchettes ci-dessous sont un choix produit documenté, pas une
// reproduction d'une source publiée précise).

import { ACWR_SAFE_MAX, ACWR_SAFE_MIN } from "./load.js";

/** Niveau de charge du jour à partir du ratio ACWR (Section 8 : "augmentent avec la charge d'entraînement du moment"). */
export function chargeNiveauFromAcwr(ratio) {
  if (!Number.isFinite(ratio)) return "normale";
  if (ratio > ACWR_SAFE_MAX) return "elevee";
  if (ratio < ACWR_SAFE_MIN) return "decharge";
  return "normale";
}

// Glucides : le levier qui varie le plus avec le volume/intensité —
// nettement plus élevé en semaine de forte charge qu'en décharge.
const GLUCIDES_G_PAR_KG = { decharge: 3.5, normale: 5.5, elevee: 8 };
// Protéines : besoins stables mais > population sédentaire, légèrement
// plus élevés en charge importante (réparation, composante excentrique).
const PROTEINES_G_PAR_KG = { decharge: 1.6, normale: 1.8, elevee: 2.0 };
// Lipides : complètent l'apport énergétique, ne varient pas avec la
// charge — ne doivent pas être sacrifiés au profit des glucides.
const LIPIDES_G_PAR_KG = 1.1;

// Charge glucidique pré-course (Section 8) : dans les jours précédant une
// course longue (semi et au-delà), on maximise les réserves de glycogène.
const CARB_LOADING_DISTANCE_KM_SEUIL = 21.1;
const CARB_LOADING_JOURS_AVANT = 3;
const CARB_LOADING_G_PAR_KG = 9;

/**
 * Besoins quotidiens en macronutriments (g et g/kg), modulés par la charge
 * du jour ou de la semaine, avec bascule vers une charge glucidique
 * pré-course quand applicable.
 * @param {{weightKg: number, acwrRatio?: number, joursAvantCourse?: number, distanceCourseKm?: number}} params
 */
export function dailyMacroNeeds({ weightKg, acwrRatio, joursAvantCourse, distanceCourseKm }) {
  if (!weightKg || weightKg <= 0) return null;
  const chargeNiveau = chargeNiveauFromAcwr(acwrRatio);
  const carbLoading =
    joursAvantCourse != null &&
    joursAvantCourse >= 0 &&
    joursAvantCourse <= CARB_LOADING_JOURS_AVANT &&
    (distanceCourseKm ?? 0) >= CARB_LOADING_DISTANCE_KM_SEUIL;

  const glucidesGKg = carbLoading ? CARB_LOADING_G_PAR_KG : GLUCIDES_G_PAR_KG[chargeNiveau] ?? GLUCIDES_G_PAR_KG.normale;
  const proteinesGKg = PROTEINES_G_PAR_KG[chargeNiveau] ?? PROTEINES_G_PAR_KG.normale;

  return {
    chargeNiveau,
    carbLoading,
    glucidesGKg,
    proteinesGKg,
    lipidesGKg: LIPIDES_G_PAR_KG,
    glucidesG: Math.round(glucidesGKg * weightKg),
    proteinesG: Math.round(proteinesGKg * weightKg),
    lipidesG: Math.round(LIPIDES_G_PAR_KG * weightKg),
  };
}

/**
 * Apport glucidique cible en g/h pendant la course, fonction de la durée
 * (Section 8 : "les épreuves longues demandent un apport régulier plutôt
 * que concentré"). Paliers usuels : rien sous 1h, 30-60g/h en dessous de
 * 2h30, 60-90g/h au-delà, jusqu'à 90g/h pour l'ultra long.
 * @param {number} dureeMin
 */
export function fuelingCarbsPerHour(dureeMin) {
  if (!dureeMin || dureeMin < 60) return 0;
  if (dureeMin <= 150) return 45;
  if (dureeMin <= 240) return 75;
  return 90;
}

// Hydratation/électrolytes ajustés à la chaleur (Section 8) : le besoin en
// eau/sodium augmente sensiblement par forte chaleur/humidité.
export function hydrationNeeds({ dureeMin, temperatureC = 18 }) {
  if (!dureeMin) return null;
  let mlPerHour = 500;
  let sodiumMgPerHour = 400;
  if (temperatureC >= 28) {
    mlPerHour = 900;
    sodiumMgPerHour = 900;
  } else if (temperatureC >= 25) {
    mlPerHour = 750;
    sodiumMgPerHour = 800;
  } else if (temperatureC >= 20) {
    mlPerHour = 625;
    sodiumMgPerHour = 600;
  }
  return {
    mlPerHour,
    sodiumMgPerHour,
    totalMl: Math.round((mlPerHour * dureeMin) / 60),
    totalSodiumMg: Math.round((sodiumMgPerHour * dureeMin) / 60),
    hyponatremieAlerte: dureeMin >= 180 && temperatureC >= 25,
  };
}
