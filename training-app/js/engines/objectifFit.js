// Calage du plan sur l'objectif — doc technique Section 6.
// Compare la forme actuelle (VDOT mesuré) au VDOT qu'exige réellement
// l'allure objectif (distance + temps visé), corrigé du dénivelé en trail
// via le modèle GAP (Section 5). En dérive un niveau d'ambition qui pilote
// la part d'allure objectif dans la sortie longue et, pour le trail,
// l'amplifie encore selon le palier de D+ visé.

import { vdotFromPerformance } from "./vdot.js";
import { rawPaceToGap, averageGrade, elevationTierFor } from "./gap.js";

/**
 * VDOT nécessaire pour tenir l'allure objectif (distance/temps visé).
 * En trail, le temps visé implique une allure brute plus lente sur les
 * portions en montée : on convertit cette allure brute moyenne en
 * équivalent-plat (GAP) avant de calculer le VDOT requis, pour ne pas
 * sous-estimer l'exigence réelle d'un objectif à fort D+.
 * @param {{distanceKm: number, tempsViseS: number, deniveleM?: number, type?: 'route'|'trail'}} objectif
 */
export function requiredVdotForObjectif({ distanceKm, tempsViseS, deniveleM, type }) {
  if (!distanceKm || !tempsViseS) return null;
  const distanceM = distanceKm * 1000;
  if (type === "trail" && deniveleM) {
    const grade = averageGrade(distanceM, deniveleM, 0);
    const rawPaceMinPerKm = tempsViseS / 60 / distanceKm;
    const gapPaceMinPerKm = rawPaceToGap(rawPaceMinPerKm, grade);
    const equivalentFlatTimeS = gapPaceMinPerKm * distanceKm * 60;
    return vdotFromPerformance(distanceM, equivalentFlatTimeS).vdot;
  }
  return vdotFromPerformance(distanceM, tempsViseS).vdot;
}

// Seuils d'écart de forme (VDOT requis vs. VDOT actuel, en %) — choix
// produit documenté : en dessous de 3% l'écart est dans la marge d'erreur
// normale d'une préparation standard ("Atteint") ; au-delà de 8% l'écart
// devient difficile à combler sans pousser nettement plus de spécificité
// allure course ("Très ambitieux") ; entre les deux, "Ambitieux".
export const FIT_GAP_ATTEINT_MAX = 0.03;
export const FIT_GAP_AMBITIEUX_MAX = 0.08;

/** Niveau d'ambition de l'objectif : 'atteint' | 'ambitieux' | 'tres_ambitieux'. */
export function objectifFitLevel(vdotActuel, vdotRequis) {
  if (!vdotActuel || !vdotRequis) return "atteint";
  const gapPct = (vdotRequis - vdotActuel) / vdotActuel;
  if (gapPct <= FIT_GAP_ATTEINT_MAX) return "atteint";
  if (gapPct <= FIT_GAP_AMBITIEUX_MAX) return "ambitieux";
  return "tres_ambitieux";
}

export const FIT_LEVEL_LABELS = {
  atteint: "Atteint",
  ambitieux: "Ambitieux",
  tres_ambitieux: "Très ambitieux",
};

// Part de la sortie longue effectuée à allure objectif, par niveau
// d'ambition — valeurs choisies dans les fourchettes indiquées par le doc
// (faible / modérée / nettement plus élevée), sans référence numérique
// publiée à reproduire :
const SPECIFICITE_ALLURE_BASE = { atteint: 0.12, ambitieux: 0.22, tres_ambitieux: 0.32 };

// Amplification par palier de D+ (doc : "un facteur de spécificité D+
// amplifie encore cette part quand l'écart de forme est important") —
// n'intervient que si l'objectif n'est pas déjà "Atteint".
const DPLUS_SPECIFICITE_AMPLIFICATION = { eleve: 1.4, modere: 1.15, faible: 1.0 };

const SPECIFICITE_ALLURE_PLAFOND = 0.45;

/**
 * Part cible (0-1) du volume de la sortie longue à courir à allure
 * objectif, selon le niveau d'ambition et, en trail, le palier de D+.
 * @param {'atteint'|'ambitieux'|'tres_ambitieux'} fitLevel
 * @param {{type?: 'route'|'trail', deniveleM?: number, distanceKm?: number}} [objectif]
 */
export function specificiteAllureLongue(fitLevel, objectif = {}) {
  let frac = SPECIFICITE_ALLURE_BASE[fitLevel] ?? SPECIFICITE_ALLURE_BASE.atteint;
  if (objectif.type === "trail" && fitLevel !== "atteint") {
    const tier = elevationTierFor(objectif.deniveleM, objectif.distanceKm);
    frac *= DPLUS_SPECIFICITE_AMPLIFICATION[tier] ?? 1;
  }
  return Math.min(frac, SPECIFICITE_ALLURE_PLAFOND);
}

/**
 * Évalue le calage complet d'un objectif : VDOT requis, niveau d'ambition,
 * part d'allure objectif à intégrer dans la sortie longue. Retourne null
 * si aucun temps visé n'a été renseigné (le doc n'exige un calage temps que
 * si un objectif chronométrique existe).
 * @param {{distanceKm: number, tempsViseS?: number, deniveleM?: number, type?: string}} objectif
 * @param {number} vdotActuel
 */
export function evaluateObjectifFit(objectif, vdotActuel) {
  const vdotRequis = requiredVdotForObjectif(objectif);
  if (vdotRequis == null) return null;
  const niveau = objectifFitLevel(vdotActuel, vdotRequis);
  const specificiteLongue = specificiteAllureLongue(niveau, objectif);
  return {
    vdotActuel,
    vdotRequis: Math.round(vdotRequis * 10) / 10,
    niveau,
    label: FIT_LEVEL_LABELS[niveau],
    specificiteLongue,
  };
}

// Axes de travail (doc Section 6) : oriente le choix des séances de
// qualité vers I/R ("vitesse"), E/longue ("endurance"), ou sans biais
// ("equilibre", comportement par défaut).
export const AXES_TRAVAIL = ["vitesse", "equilibre", "endurance"];
