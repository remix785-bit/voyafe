// Moteur Nutrition — cadrage ISSN (v1 non adaptative, calculs statiques g/kg)
// Sources : ISSN Position Stand — Nutrient Timing (Kerksick et al., 2017)
//           ISSN Position Stand — Nutritional considerations for single-stage
//           ultra-marathon (Tiller et al., 2019).
// Voir dossier technique, Partie I, Section 8.

/**
 * Apports quotidiens à l'entraînement, selon la charge hebdomadaire.
 * @param {number} weightKg poids corporel
 * @param {"faible"|"moderee"|"elevee"} chargeNiveau volume/intensité hebdo
 */
export function dailyMacros(weightKg, chargeNiveau = "moderee") {
  const glucidesParKg = { faible: 5, moderee: 7, elevee: 10 }[chargeNiveau] ?? 7;
  // haut de fourchette (jusqu'à 12) si >=70% VO2max sur >12h/sem — laissé à l'ajustement manuel
  const proteinesParKg = { faible: 1.6, moderee: 1.8, elevee: 2.2 }[chargeNiveau] ?? 1.8;
  const lipidesParKg = 1.25; // milieu de 1.0-1.5

  return {
    glucidesG: Math.round(glucidesParKg * weightKg),
    proteinesG: Math.round(proteinesParKg * weightKg),
    lipidesG: Math.round(lipidesParKg * weightKg),
    glucidesRange: [Math.round(5 * weightKg), Math.round(12 * weightKg)],
    proteinesRange: [Math.round(1.6 * weightKg), Math.round(2.5 * weightKg)],
    lipidesRange: [Math.round(1.0 * weightKg), Math.round(1.5 * weightKg)],
  };
}

/**
 * Charge glucidique pré-course (courses > 90 min).
 * 10-12 g/kg/j sur les 36-48h précédentes.
 * @param {number} weightKg
 */
export function preRaceCarbLoad(weightKg) {
  return {
    glucidesGParJourMin: Math.round(10 * weightKg),
    glucidesGParJourMax: Math.round(12 * weightKg),
    dureeHeures: [36, 48],
    consigne: "Réduire simultanément le volume d'entraînement sur cette fenêtre.",
  };
}

/**
 * Cibles de ravitaillement en course.
 * @param {number} dureeCourseMin durée estimée de la course en minutes
 * @param {"route"|"ultra"} type
 */
export function raceFuelingTargets(dureeCourseMin, type = "route") {
  if (dureeCourseMin < 90) {
    return {
      applicable: false,
      note: "Ravitaillement structuré généralement non nécessaire sous 90 min d'effort.",
    };
  }
  if (type === "ultra") {
    return {
      applicable: true,
      glucidesGParH: [30, 50],
      proteinesGParH: [5, 10],
      kcalParH: [150, 400],
      hydratationMlParH: [450, 750],
      sodiumNote: "Ajouter des électrolytes (sodium) pour limiter le risque d'hyponatrémie sur les efforts longs.",
    };
  }
  return {
    applicable: true,
    glucidesGParH: [30, 90],
    hydratationMlParH: [450, 750],
    sodiumNote: "Ajouter des électrolytes (sodium) pour limiter le risque d'hyponatrémie sur les efforts longs.",
    testAvertissement:
      "Ces apports doivent être individualisés et testés à l'entraînement avant d'être appliqués en course (tolérance digestive).",
  };
}

/**
 * Ajuste les besoins hydriques en course selon la température et l'humidité
 * ambiantes — en parallèle de l'ajustement d'allure déjà existant pour
 * l'altitude (vdot.js#adjustPaceForAltitude) : les cibles de base
 * (raceFuelingTargets) sont calibrées pour des conditions tempérées
 * (~20°C), la sudation augmente ensuite avec la chaleur (et, dans une
 * moindre mesure, l'humidité qui réduit l'évaporation).
 * @param {[number,number]} hydratationMlParH plage de base (raceFuelingTargets)
 * @param {number} temperatureC température ambiante estimée
 * @param {number} [humiditePct] humidité relative (0-100)
 */
export function ajusterHydratationChaleur(hydratationMlParH, temperatureC, humiditePct = 50) {
  if (temperatureC <= 20) {
    return { min: hydratationMlParH[0], max: hydratationMlParH[1], majorationPct: 0 };
  }
  // +5%/°C au-dessus de 20°C, +0.3%/point d'humidité au-dessus de 60%
  // (air humide, moins évaporatif) — plafonné à +60% : au-delà, la limite
  // devient la tolérance digestive/gastrique, pas le manque d'apport.
  const majorationTemp = (temperatureC - 20) * 0.05;
  const majorationHumidite = humiditePct > 60 ? (humiditePct - 60) * 0.003 : 0;
  const majorationPct = Math.min(0.6, majorationTemp + majorationHumidite);
  return {
    min: Math.round(hydratationMlParH[0] * (1 + majorationPct)),
    max: Math.round(hydratationMlParH[1] * (1 + majorationPct)),
    majorationPct: Math.round(majorationPct * 100),
  };
}
