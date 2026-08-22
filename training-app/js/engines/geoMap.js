// Géométrie du tracé GPS — fonctions pures (testables en Node, sans DOM), au
// service de la carte de course (Jour de course). Utilisées à la fois pour
// placer les repères (km, sommets, ravito) sur la vraie carte (Leaflet,
// jourCourse.js) et pour la projection de la carte schématique de repli
// hors-ligne / sans Leaflet (components.js, RouteMapFallback).

/**
 * Latitude/longitude interpolées à une distance cumulée donnée le long du
 * tracé — interpolation linéaire entre les deux points encadrants, une
 * approximation raisonnable à l'échelle serrée des points GPS d'un parcours
 * de course (même principe que l'interpolation d'altitude par distance).
 * @param {{lat:number, lon:number, distanceCumulee:number}[]} points
 * @param {number} distanceM
 */
export function latLonADistance(points, distanceM) {
  if (!points?.length) return null;
  if (distanceM <= points[0].distanceCumulee) return { lat: points[0].lat, lon: points[0].lon };
  for (let i = 1; i < points.length; i++) {
    if (distanceM <= points[i].distanceCumulee) {
      const a = points[i - 1];
      const b = points[i];
      const ratio = b.distanceCumulee > a.distanceCumulee ? (distanceM - a.distanceCumulee) / (b.distanceCumulee - a.distanceCumulee) : 0;
      return { lat: a.lat + ratio * (b.lat - a.lat), lon: a.lon + ratio * (b.lon - a.lon) };
    }
  }
  const dernier = points[points.length - 1];
  return { lat: dernier.lat, lon: dernier.lon };
}

/**
 * Projette des points lat/lon en coordonnées planes locales, en mètres,
 * x=est/y=nord (donc orientation nord-haut une fois l'axe y inversé pour
 * l'affichage SVG) — projection équirectangulaire simple autour d'un point
 * de référence commun, précision largement suffisante à l'échelle d'un
 * parcours de course (quelques km à quelques dizaines de km), pas adaptée à
 * une carte à grande échelle. `reference` doit être partagée entre le tracé
 * et ses repères pour que route et marqueurs restent sur la même origine.
 * @param {{lat:number, lon:number}[]} points
 * @param {{lat:number, lon:number}} [reference] défaut : points[0]
 */
export function projeterPlan(points, reference) {
  if (!points?.length) return [];
  const latRef = reference?.lat ?? points[0].lat;
  const lonRef = reference?.lon ?? points[0].lon;
  const R = 6371000;
  const latRad = (latRef * Math.PI) / 180;
  return points.map((p) => ({
    x: ((p.lon - lonRef) * Math.PI) / 180 * R * Math.cos(latRad),
    y: ((p.lat - latRef) * Math.PI) / 180 * R,
  }));
}

/**
 * Arrondit une distance en mètres à une valeur "ronde" adaptée à une barre
 * d'échelle (1/2/5 × puissance de 10), la plus grande qui reste ≤ maxM.
 * @param {number} maxM longueur maximale disponible pour la barre, en mètres
 */
export function arrondirEchelle(maxM) {
  if (maxM <= 0) return 0;
  const puissance = Math.pow(10, Math.floor(Math.log10(maxM)));
  const paliers = [1, 2, 5, 10];
  let meilleur = puissance;
  for (const p of paliers) {
    const valeur = p * puissance;
    if (valeur <= maxM) meilleur = valeur;
  }
  return meilleur;
}
