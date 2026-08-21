// Moteur GAP / Trail — coût énergétique de Minetti
// Source : Minetti AE, Moia C, Roi GS, Susta D, Ferretti G.
// "Energy cost of walking and running at extreme uphill and downhill slopes."
// J Appl Physiol. 2002;93(3):1039-1046.
// Voir dossier technique, Partie I, Section 4.

/**
 * Coût énergétique de la course selon la pente (Minetti et al. 2002).
 * @param {number} slope pente en fraction décimale (0.10 = 10% ; négatif en descente)
 * @returns {number} coût énergétique en J/kg/m
 */
export function minettiEnergyCost(slope) {
  const i = slope;
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  );
}

export const FLAT_ENERGY_COST = minettiEnergyCost(0); // ≈ 3.6 J/kg/m

/**
 * Facteur d'ajustement GAP = EC(pente) / EC(plat).
 * >1 en montée (effort accru), <1 en légère descente (jusqu'à ~-10%, le plus économique),
 * remonte au-delà de -15/-20% (coût de freinage excentrique).
 * @param {number} slope fraction décimale
 */
export function gapFactor(slope) {
  return minettiEnergyCost(slope) / FLAT_ENERGY_COST;
}

/** Seuil au-delà duquel le modèle métabolique perd sa pertinence (Partie I §4). */
export const ECCENTRIC_LIMIT_SLOPE = -0.15;

/**
 * Convertit une allure réelle observée sur un segment en pente en allure
 * équivalente "effort plat" (pour analyser une séance réalisée en trail).
 * @param {number} paceMinPerKm allure réelle sur le segment
 * @param {number} slope pente du segment (fraction décimale)
 */
export function realPaceToFlatEquivalent(paceMinPerKm, slope) {
  return paceMinPerKm / gapFactor(slope);
}

/**
 * Convertit une allure cible "plat" (issue des zones VDOT) en allure réelle
 * à viser sur un segment en pente donnée (pour générer une séance trail).
 * @param {number} flatPaceMinPerKm allure cible zone E/M/T/I/R (allure plat)
 * @param {number} slope pente du segment (fraction décimale)
 * @param {number} facteurCalibre calibration personnelle (1 = modèle Minetti
 *   standard, non calibré) — met à l'échelle l'ÉCART au plat plutôt que le
 *   facteur entier, pour que 1.0 reste toujours "aucun changement" quelle que
 *   soit la pente : >1 amplifie la sensibilité aux pentes (ce coureur souffre
 *   plus que le modèle théorique en montée/descente), <1 l'atténue.
 */
export function flatEquivalentToRealPace(flatPaceMinPerKm, slope, facteurCalibre = 1) {
  const factorBrut = gapFactor(slope);
  const factor = 1 + (factorBrut - 1) * facteurCalibre;
  const adjusted = flatPaceMinPerKm * factor;
  const warning =
    slope < ECCENTRIC_LIMIT_SLOPE
      ? "Pente de descente au-delà de -15/-20% : piloter par le RPE et la tolérance musculaire, pas uniquement par l'allure GAP (dommage excentrique, Partie I §4/§7.3)."
      : null;
  return { paceMinPerKm: adjusted, warning };
}

/**
 * Calcule la pente moyenne d'un segment à partir de distance et dénivelé.
 * @param {number} distanceM distance horizontale du segment (m)
 * @param {number} elevationChangeM dénivelé du segment (m, signé)
 */
export function slopeFromElevation(distanceM, elevationChangeM) {
  if (distanceM === 0) return 0;
  return elevationChangeM / distanceM;
}
