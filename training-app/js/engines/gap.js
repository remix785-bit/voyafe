// Moteur allure ajustée à la pente (GAP) — modèle de coût métabolique de
// Minetti et al., "Energy cost of walking and running at extreme uphill and
// downhill slopes", J Appl Physiol 93:1039-1046, 2002.
// Cadrage produit, Section 6 (dénivelé trail).

// Coefficients du polynôme de degré 5 de Minetti : coût énergétique net
// (J/kg/m) en fonction de la pente i (fraction, ex. 0.10 = +10%), valide
// pour i dans [-0.45, 0.45].
const MINETTI_COEFFS = [155.4, -30.4, -43.3, 46.3, 19.5, 3.6];

/** Coût énergétique de course (J/kg/m) selon la pente (fraction, + = montée). */
export function minettiCost(gradeFraction) {
  const i = Math.max(-0.45, Math.min(0.45, gradeFraction));
  const [c5, c4, c3, c2, c1, c0] = MINETTI_COEFFS;
  return c5 * i ** 5 + c4 * i ** 4 + c3 * i ** 3 + c2 * i ** 2 + c1 * i + c0;
}

// Coût énergétique de référence en terrain plat (i = 0), pour normaliser
// le ratio coût-pente / coût-plat utilisé en facteur d'équivalence GAP.
const FLAT_COST = minettiCost(0);

/**
 * Facteur d'équivalence GAP : rapport coût(pente) / coût(plat). Un facteur
 * de 1.3 signifie qu'à effort égal, courir sur cette pente coûte 30% de
 * plus que sur le plat — donc l'allure "équivalent plat" est 1.3x plus
 * rapide que l'allure brute mesurée.
 */
export function gapFactor(gradeFraction) {
  return minettiCost(gradeFraction) / FLAT_COST;
}

/**
 * Convertit une allure brute (min/km) sur une pente donnée en allure
 * équivalente terrain plat (GAP). En montée (factor > 1), l'allure brute
 * mesurée correspond à un effort plus intense qu'elle ne le paraît sur le
 * plat : la GAP (min/km) est donc plus rapide (valeur plus basse) que
 * l'allure brute, à effort égal.
 * @param {number} rawPaceMinPerKm
 * @param {number} gradeFraction pente (ex: 0.08 pour +8%)
 */
export function rawPaceToGap(rawPaceMinPerKm, gradeFraction) {
  const factor = gapFactor(gradeFraction);
  return rawPaceMinPerKm / factor;
}

/**
 * Convertit une allure équivalent-plat (GAP) en allure brute attendue sur
 * une pente donnée.
 * @param {number} gapPaceMinPerKm
 * @param {number} gradeFraction
 */
export function gapToRawPace(gapPaceMinPerKm, gradeFraction) {
  const factor = gapFactor(gradeFraction);
  return gapPaceMinPerKm * factor;
}

/**
 * Pente moyenne (fraction) d'un segment à partir du D+/D- et de la distance.
 * @param {number} distanceM
 * @param {number} elevationGainM D+ du segment
 * @param {number} elevationLossM D- du segment
 */
export function averageGrade(distanceM, elevationGainM = 0, elevationLossM = 0) {
  if (distanceM <= 0) return 0;
  return (elevationGainM - elevationLossM) / distanceM;
}
