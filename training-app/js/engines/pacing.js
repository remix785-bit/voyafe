// Générateur de pacing course — Étape ⑥, Partie II, Section 7.
// Stratégie : effort métabolique constant GAP-ajusté (polynôme de Minetti).
// Import/traitement GPX entièrement côté client (pas de backend, cf. Partie III §3).

import { minettiEnergyCost } from "./gap.js";
import { adjustPaceForAltitude } from "./vdot.js";

const EARTH_RADIUS_M = 6371000;

function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Parse un fichier GPX (texte XML) en liste de points {lat, lon, altitude, distanceCumulee}.
 * @param {string} gpxText contenu brut du fichier .gpx
 */
export function parseGpx(gpxText) {
  const doc = new DOMParser().parseFromString(gpxText, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("Fichier GPX invalide ou corrompu.");

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  const source = trkpts.length
    ? trkpts
    : Array.from(doc.getElementsByTagName("rtept"));
  if (!source.length) throw new Error("Aucun point de tracé (trkpt/rtept) trouvé dans le GPX.");

  const points = [];
  let cumDist = 0;
  for (let i = 0; i < source.length; i++) {
    const pt = source[i];
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    const eleEl = pt.getElementsByTagName("ele")[0];
    const altitude = eleEl ? parseFloat(eleEl.textContent) : 0;
    if (i > 0) {
      cumDist += haversineDistanceM(
        points[i - 1].lat,
        points[i - 1].lon,
        lat,
        lon
      );
    }
    points.push({ lat, lon, altitude, distanceCumulee: cumDist });
  }
  return points;
}

/**
 * Lisse l'altitude par moyenne mobile — l'altitude GPS brute est bruitée
 * (±plusieurs mètres), un calcul de pente sans lissage produit des segments
 * erratiques (Partie II §7.1).
 * @param {{altitude:number}[]} points
 * @param {number} windowM largeur de fenêtre approximative en mètres (~50-100m)
 */
export function smoothElevation(points, windowM = 75) {
  if (points.length < 3) return points.map((p) => ({ ...p }));
  return points.map((p, i) => {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < points.length; j++) {
      if (Math.abs(points[j].distanceCumulee - p.distanceCumulee) <= windowM / 2) {
        sum += points[j].altitude;
        count++;
      }
    }
    return { ...p, altitude: count ? sum / count : p.altitude };
  });
}

function pente(pA, pB) {
  const dDist = pB.distanceCumulee - pA.distanceCumulee;
  if (dDist === 0) return 0;
  return (pB.altitude - pA.altitude) / dDist;
}

/**
 * Découpe un tracé lissé en segments à pente homogène (Partie II §7.1).
 * @param {{lat:number,lon:number,altitude:number,distanceCumulee:number}[]} pointsLisses
 * @param {{tolerancePente?:number, longueurMin?:number, longueurMax?:number}} options
 * @returns {{distance:number, denivele:number, penteMoyenne:number, depart:number, fin:number}[]}
 */
export function decouperSegments(pointsLisses, options = {}) {
  const tolerancePente = options.tolerancePente ?? 0.025; // ~2-3%
  const longueurMin = options.longueurMin ?? 150; // m
  const longueurMax = options.longueurMax ?? 1200; // m (1-1.5km)

  if (pointsLisses.length < 2) return [];

  const segments = [];
  let debutIdx = 0;

  const cloreSegment = (finIdx) => {
    const depart = pointsLisses[debutIdx];
    const fin = pointsLisses[finIdx];
    const distance = fin.distanceCumulee - depart.distanceCumulee;
    if (distance <= 0) return;
    const denivele = fin.altitude - depart.altitude;
    segments.push({
      distance,
      denivele,
      penteMoyenne: denivele / distance,
      depart: depart.distanceCumulee,
      fin: fin.distanceCumulee,
    });
  };

  for (let i = 1; i < pointsLisses.length; i++) {
    const penteLocale = pente(pointsLisses[i - 1], pointsLisses[i]);
    const penteRef = pente(pointsLisses[debutIdx], pointsLisses[i - 1]);
    const longueurCourante = pointsLisses[i - 1].distanceCumulee - pointsLisses[debutIdx].distanceCumulee;

    if (Math.abs(penteLocale - penteRef) > tolerancePente && longueurCourante >= longueurMin) {
      cloreSegment(i - 1);
      debutIdx = i - 1;
    } else if (longueurCourante >= longueurMax) {
      cloreSegment(i - 1);
      debutIdx = i - 1;
    }
  }
  cloreSegment(pointsLisses.length - 1);
  return segments;
}

/**
 * Profil de parcours par défaut (mode dégradé sans GPX importé) : un seul
 * segment plat sur toute la distance (Partie II §7.1, "Mode dégradé").
 * @param {number} distanceM
 */
export function profilParcoursParDefaut(distanceM) {
  return {
    segments: [{ distance: distanceM, denivele: 0, penteMoyenne: 0, depart: 0, fin: distanceM }],
    source: "plat_par_defaut",
  };
}

/**
 * Calcule le pacing en effort métabolique constant sur un parcours segmenté
 * (Partie II §7.2 — solution fermée, sans itération).
 * @param {{distance:number, penteMoyenne:number}[]} segments
 * @param {number} tempsCibleSecondes temps cible total de la course
 * @param {{altitudeM?:number, acclimatation?:string}} altitudeOptions correction d'altitude optionnelle (Partie I §3.1)
 * @returns {{segments: Array, puissanceMetabolique:number}}
 */
export function calculerPacingEffortConstant(segments, tempsCibleSecondes, altitudeOptions = {}) {
  const tempsCibleMin = tempsCibleSecondes / 60;

  // P = Σ[dᵢ × EC(iᵢ)] / temps_cible   (dᵢ en km pour une puissance en J/kg/km, indifférent tant que cohérent)
  let sommeCoutTotal = 0;
  const ecParSegment = segments.map((s) => {
    const ec = minettiEnergyCost(s.penteMoyenne);
    sommeCoutTotal += (s.distance / 1000) * ec; // distance en km
    return ec;
  });
  const puissanceMetabolique = sommeCoutTotal / tempsCibleMin; // J/kg/km par minute -> cohérent avec vitesse km/min

  let tempsCumuleMin = 0;
  const segmentsPacing = segments.map((s, i) => {
    const ec = ecParSegment[i];
    const vitesseKmPerMin = puissanceMetabolique / ec;
    let allureMinParKm = 1 / vitesseKmPerMin;

    if (altitudeOptions.altitudeM && altitudeOptions.altitudeM > 1500) {
      const { paceAjustee } = adjustPaceForAltitude(
        allureMinParKm,
        altitudeOptions.altitudeM,
        altitudeOptions.acclimatation
      );
      allureMinParKm = paceAjustee;
    }

    const tempsSegmentMin = (s.distance / 1000) * allureMinParKm;
    tempsCumuleMin += tempsSegmentMin;

    return {
      distance: s.distance,
      penteMoyenne: s.penteMoyenne,
      allureMinParKm,
      tempsSegmentMin,
      tempsCumuleMin,
    };
  });

  return { segments: segmentsPacing, puissanceMetabolique };
}

/**
 * Ré-agrège la sortie segment-par-segment de calculerPacingEffortConstant
 * (segments à pente homogène, 150m-1.2km — corrects pour le calcul GAP mais
 * illisibles affichés tels quels : jusqu'à un segment tous les ~150-200m sur
 * un parcours vallonné) en une ligne par kilomètre complet, plus un dernier
 * segment partiel si la distance totale n'est pas un multiple de 1km — c'est
 * la granularité attendue d'une fiche de pacing (repère km par km en course).
 * L'allure au sein d'un segment est traitée comme constante (comme le fait
 * déjà calculerPacingEffortConstant) : le temps à une distance donnée est
 * donc interpolé linéairement entre les points de rupture des segments.
 * @param {ReturnType<typeof calculerPacingEffortConstant>["segments"]} segmentsPacing
 * @param {number} distanceTotaleM
 * @returns {{distance:number, allureMinParKm:number, tempsSegmentMin:number, tempsCumuleMin:number}[]}
 */
export function agregerPacingParKm(segmentsPacing, distanceTotaleM) {
  const points = [{ distance: 0, temps: 0 }];
  let distCum = 0;
  let tempsCum = 0;
  for (const seg of segmentsPacing) {
    distCum += seg.distance;
    tempsCum += seg.tempsSegmentMin;
    points.push({ distance: distCum, temps: tempsCum });
  }

  const tempsADistance = (d) => {
    if (d <= 0) return 0;
    for (let i = 1; i < points.length; i++) {
      if (d <= points[i].distance) {
        const a = points[i - 1];
        const b = points[i];
        const ratio = b.distance > a.distance ? (d - a.distance) / (b.distance - a.distance) : 0;
        return a.temps + ratio * (b.temps - a.temps);
      }
    }
    return tempsCum; // au-delà du dernier point connu (arrondi flottant) -> temps total
  };

  const buckets = [];
  const nbKmPleins = Math.floor(distanceTotaleM / 1000);
  let distancePrecedente = 0;
  let tempsPrecedent = 0;
  for (let k = 1; k <= nbKmPleins; k++) {
    const d = k * 1000;
    const t = tempsADistance(d);
    const distanceSegment = d - distancePrecedente;
    const tempsSegmentMin = t - tempsPrecedent;
    buckets.push({
      distance: distanceSegment,
      allureMinParKm: distanceSegment > 0 ? tempsSegmentMin / (distanceSegment / 1000) : 0,
      tempsSegmentMin,
      tempsCumuleMin: t,
    });
    distancePrecedente = d;
    tempsPrecedent = t;
  }

  const reste = distanceTotaleM - nbKmPleins * 1000;
  if (reste > 1) {
    const t = tempsADistance(distanceTotaleM);
    const tempsSegmentMin = t - tempsPrecedent;
    buckets.push({
      distance: reste,
      allureMinParKm: tempsSegmentMin / (reste / 1000),
      tempsSegmentMin,
      tempsCumuleMin: t,
    });
  }

  return buckets;
}

/**
 * Fusionne la timeline de pacing avec des marqueurs de ravitaillement,
 * selon les cibles de la Section 8 (Partie I).
 * @param {Array} segmentsPacing sortie de calculerPacingEffortConstant
 * @param {{glucidesGParH:number, frequenceMin:number}} ravito produit/fréquence choisis par l'utilisateur
 * @returns {{km:number, tempsCumule:number, allureCible:number, actionNutrition:string|null}[]}
 */
export function fusionnerNutritionPacing(segmentsPacing, ravito) {
  const timeline = [];
  let kmCumule = 0;
  let prochainRavitoMin = ravito ? ravito.frequenceMin : Infinity;

  for (const seg of segmentsPacing) {
    kmCumule += seg.distance / 1000;
    let actionNutrition = null;
    if (ravito && seg.tempsCumuleMin >= prochainRavitoMin) {
      actionNutrition = `Ravitaillement : ~${Math.round(
        (ravito.glucidesGParH / 60) * ravito.frequenceMin
      )} g glucides`;
      prochainRavitoMin += ravito.frequenceMin;
    }
    timeline.push({
      km: kmCumule,
      tempsCumule: seg.tempsCumuleMin,
      allureCible: seg.allureMinParKm,
      actionNutrition,
    });
  }
  return timeline;
}
