// Générateur de pacing course (trail) — stratégie « effort constant, pas
// allure constante ». Implémente la spécification technique « Stratégie de
// pacing jour de course (trail) » fournie par l'utilisateur (sections
// référencées ci-dessous par leur numéro, ex. §2, §7, §13).
// Import/traitement GPX entièrement côté client (pas de backend).

import { gapFactor } from "./gap.js";
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
 * erratiques.
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

/**
 * Détecte les points significatifs du profil altimétrique (sommets/creux) sur
 * le tracé lissé — les vrais repères d'un parcours vallonné (haut d'une
 * montée, bas d'une descente), en plus du simple kilométrage. Algorithme
 * "zigzag" standard : suit l'extremum courant dans le sens du mouvement, ne
 * confirme un retournement (et donc un repère) que lorsque l'altitude s'en
 * écarte d'au moins `deniveleMinM` — filtre le bruit GPS résiduel (plusieurs
 * mètres) sans dépendre d'un seuil de pente arbitraire.
 * @param {{distanceCumulee:number, altitude:number}[]} pointsLisses
 * @param {{deniveleMinM?:number}} options
 * @returns {{distanceM:number, altitude:number, type:"sommet"|"creux"}[]}
 */
export function detecterPointsSignificatifs(pointsLisses, options = {}) {
  const deniveleMinM = options.deniveleMinM ?? 20;
  if (pointsLisses.length < 3) return [];

  const reperes = [];
  let extremum = pointsLisses[0];
  let sens = null; // "hausse" | "baisse"

  for (let i = 1; i < pointsLisses.length; i++) {
    const p = pointsLisses[i];
    if (sens !== "baisse" && p.altitude >= extremum.altitude) {
      extremum = p;
      sens = "hausse";
    } else if (sens !== "hausse" && p.altitude <= extremum.altitude) {
      extremum = p;
      sens = "baisse";
    } else if (sens === "hausse" && extremum.altitude - p.altitude >= deniveleMinM) {
      reperes.push({ distanceM: extremum.distanceCumulee, altitude: extremum.altitude, type: "sommet" });
      extremum = p;
      sens = "baisse";
    } else if (sens === "baisse" && p.altitude - extremum.altitude >= deniveleMinM) {
      reperes.push({ distanceM: extremum.distanceCumulee, altitude: extremum.altitude, type: "creux" });
      extremum = p;
      sens = "hausse";
    }
  }
  return reperes;
}

function pente(pA, pB) {
  const dDist = pB.distanceCumulee - pA.distanceCumulee;
  if (dDist === 0) return 0;
  return (pB.altitude - pA.altitude) / dDist;
}

/**
 * Découpe un tracé lissé en segments à pente homogène.
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
 * segment plat sur toute la distance.
 * @param {number} distanceM
 */
export function profilParcoursParDefaut(distanceM) {
  return {
    segments: [{ distance: distanceM, denivele: 0, penteMoyenne: 0, depart: 0, fin: distanceM }],
    source: "plat_par_defaut",
  };
}

// ---------------------------------------------------------------------
// §2 — Grade Adjusted Pace (Minetti) : coût énergétique borné au domaine
// de validité fiable.
// ---------------------------------------------------------------------

/** Domaine de validité fiable du modèle de coût Minetti (§2.3). Au-delà, le
 * freinage biomécanique/la technicité dominent — la pente est bornée avant
 * d'être passée à Minetti plutôt que d'extrapoler le polynôme hors domaine. */
export const DOMAINE_PENTE_FIABLE = { min: -0.2, max: 0.2 };

/**
 * Facteur de coût GAP (§2), borné au domaine de validité fiable ±20% (§2.3),
 * et calibré personnellement (même mise à l'échelle que flatEquivalentToRealPace
 * dans gap.js : l'écart au plat, pas le facteur brut, pour que
 * facteurCalibre=1 reste neutre quelle que soit la pente).
 * @param {number} penteMoyenne fraction décimale (0.10 = 10%)
 * @param {number} facteurCalibre calibration personnelle (1 = modèle Minetti standard)
 */
export function coutGapDomaine(penteMoyenne, facteurCalibre = 1) {
  const penteBornee = Math.max(DOMAINE_PENTE_FIABLE.min, Math.min(DOMAINE_PENTE_FIABLE.max, penteMoyenne));
  const factorBrut = gapFactor(penteBornee);
  return 1 + (factorBrut - 1) * facteurCalibre;
}

// ---------------------------------------------------------------------
// §3 — Facteur de technicité (au-delà du dénivelé pur).
// ---------------------------------------------------------------------

/** Facteurs de technicité par type de terrain (§3, valeur médiane des plages
 * données). Renseigné manuellement (recos terrain / retour d'expérience) —
 * non déductible du seul profil altimétrique GPX. */
export const FACTEURS_TECHNICITE = {
  roulant: 1.0, // chemin roulant / piste large
  modere: 1.125, // sentier technique modéré (racines, cailloux épars)
  technique: 1.275, // sentier très technique (pierrier, passages exposés)
  extreme: 1.45, // terrain extrême (câbles, désescalade)
};

/** @param {keyof FACTEURS_TECHNICITE} typeTerrain */
export function facteurTechnicite(typeTerrain) {
  return FACTEURS_TECHNICITE[typeTerrain] ?? FACTEURS_TECHNICITE.roulant;
}

// ---------------------------------------------------------------------
// §4 — Seuil de bascule course/marche (power hiking).
// ---------------------------------------------------------------------

/** Seuil de pente par défaut au-delà duquel marcher vite est plus efficace
 * et préserve les quadriceps (§4) — personnalisable selon niveau/expérience. */
export const SEUIL_MARCHE_PCT_DEFAUT = 0.15;

/**
 * @param {number} penteMoyenne fraction décimale
 * @param {number} seuilMarchePct fraction décimale (0.15 = 15%)
 * @returns {"run"|"hike"}
 */
export function modeSegment(penteMoyenne, seuilMarchePct = SEUIL_MARCHE_PCT_DEFAUT) {
  return penteMoyenne >= seuilMarchePct ? "hike" : "run";
}

// ---------------------------------------------------------------------
// §5 — Capacité D+/heure (référence en montée raide, mode "hike").
// ---------------------------------------------------------------------

/** Plages indicatives de capacité verticale (m D+/heure) par niveau (§5). */
export const CAPACITE_DPLUS_HEURE_PAR_NIVEAU = {
  loisir: [300, 450],
  entraine: [450, 650],
  confirme: [650, 850],
  elite: [900, 1200],
};

/**
 * Temps (minutes) pour un dénivelé positif donné, en mode marche active,
 * à partir de la capacité D+/h calibrée du coureur (§5).
 * @param {number} deniveleM D+ du segment (m, toujours positif)
 * @param {number} dplusParHeure capacité individuelle calibrée (m/h)
 */
export function tempsMinSegmentHike(deniveleM, dplusParHeure) {
  if (!dplusParHeure) return 0;
  return (deniveleM / dplusParHeure) * 60;
}

// ---------------------------------------------------------------------
// §6 — Zones d'effort et mapping terrain → zone.
// ---------------------------------------------------------------------

/** Zones d'effort Daniels appliquées au trail (§6) — bornes %FC max. */
export const ZONES_EFFORT_TRAIL = {
  Z1: { max: 0.7, usage: "marche de récupération, sections finales fatiguées" },
  Z2: { min: 0.7, max: 0.8, usage: "la quasi-totalité de la course (montées incluses, en endurance)" },
  Z3: { min: 0.8, max: 0.88, usage: "portions courtes/clés uniquement (montée finale, relance)" },
  Z4: { min: 0.88, max: 0.94, usage: "à éviter — réservé à un sprint final très court" },
  Z5: { min: 0.94, usage: "non pertinent au-delà de quelques dizaines de secondes" },
};

// ---------------------------------------------------------------------
// §7/§12 — Segmentation du parcours et prédiction de temps.
// ---------------------------------------------------------------------

/**
 * Allure plat-équivalente cible à partir de l'objectif global (§13) — heuristique
 * distance-équivalente : 100m de D+ ≈ 1km de plat.
 * @param {number} distanceKm
 * @param {number} dPlusM D+ total du parcours (m)
 * @param {number} tempsObjectifMin temps cible total (minutes)
 */
export function allurePlatEquivalenteCible(distanceKm, dPlusM, tempsObjectifMin) {
  const distanceEquivalentePlat = distanceKm + dPlusM / 100;
  return distanceEquivalentePlat > 0 ? tempsObjectifMin / distanceEquivalentePlat : 0;
}

/**
 * Génère le plan de pacing segment par segment (§7/§12) : pour chaque
 * segment, bascule course/marche (§4), applique le coût GAP borné (§2) ou la
 * capacité D+/h (§5), puis le facteur de technicité (§3).
 *
 * Contrairement à l'ancien modèle en solution fermée (retiré), le temps
 * total prédit n'est PAS forcé à coller exactement à l'objectif : l'allure
 * plat-équivalente est calibrée une fois en amont (allurePlatEquivalenteCible),
 * puis appliquée segment par segment ; l'écart éventuel avec l'objectif est
 * calculé et remonté dans `totals.deltaMin`, pas corrigé rétroactivement
 * (§10/§11 — « le plan de pacing est un guide d'effort, pas un chrono à
 * respecter au segment près »).
 * @param {{distance:number, denivele:number, penteMoyenne:number}[]} segments
 * @param {{flatEquivalentPaceMinKm:number, dplusParHeure:number, seuilMarchePct?:number, technicite?:string, facteurGapCalibre?:number}} runnerProfile
 * @param {{tempsCibleSecondes:number}} raceCible
 * @returns {{segments:Array, totals:{predictedTimeMin:number, targetTimeMin:number, deltaMin:number}}}
 */
export function genererPlanPacing(segments, runnerProfile, raceCible) {
  const {
    flatEquivalentPaceMinKm,
    dplusParHeure,
    seuilMarchePct = SEUIL_MARCHE_PCT_DEFAUT,
    technicite = "roulant",
    facteurGapCalibre = 1,
  } = runnerProfile;
  const facteurTech = facteurTechnicite(technicite);

  let cumulMin = 0;
  const segmentsPlan = segments.map((s) => {
    const deniveleMontee = Math.max(0, s.denivele ?? 0);
    const mode = modeSegment(s.penteMoyenne, seuilMarchePct);
    const tempsBaseMin =
      mode === "hike"
        ? tempsMinSegmentHike(deniveleMontee, dplusParHeure)
        : (s.distance / 1000) * flatEquivalentPaceMinKm * coutGapDomaine(s.penteMoyenne, facteurGapCalibre);
    const tempsSegmentMin = tempsBaseMin * facteurTech;
    cumulMin += tempsSegmentMin;
    return {
      distance: s.distance,
      denivele: s.denivele,
      penteMoyenne: s.penteMoyenne,
      mode,
      allureMinParKm: s.distance > 0 ? tempsSegmentMin / (s.distance / 1000) : 0,
      tempsSegmentMin,
      tempsCumuleMin: cumulMin,
    };
  });

  const targetTimeMin = raceCible.tempsCibleSecondes / 60;
  return {
    segments: segmentsPlan,
    totals: {
      predictedTimeMin: cumulMin,
      targetTimeMin,
      deltaMin: cumulMin - targetTimeMin,
    },
  };
}

/**
 * Construit une fonction "temps cumulé écoulé à telle distance" (minutes) à
 * partir de la timeline segment par segment de genererPlanPacing. L'allure au
 * sein d'un segment est traitée comme constante, donc le temps à une
 * distance donnée est interpolé linéairement entre les points de rupture
 * des segments. Partagé par l'agrégation par km et par le placement des
 * repères du profil de course (mêmes points de rupture, même interpolation).
 * @param {ReturnType<typeof genererPlanPacing>["segments"]} segmentsPlan
 * @returns {(distanceM:number) => number}
 */
export function construireTempsCumuleADistance(segmentsPlan) {
  const points = [{ distance: 0, temps: 0 }];
  let distCum = 0;
  let tempsCum = 0;
  for (const seg of segmentsPlan) {
    distCum += seg.distance;
    tempsCum += seg.tempsSegmentMin;
    points.push({ distance: distCum, temps: tempsCum });
  }

  return (d) => {
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
}

function construireModeADistance(segmentsPlan) {
  const bornes = [];
  let distCum = 0;
  for (const seg of segmentsPlan) {
    bornes.push({ debut: distCum, fin: distCum + seg.distance, mode: seg.mode });
    distCum += seg.distance;
  }
  return (d) => {
    const b = bornes.find((x) => d >= x.debut && d <= x.fin);
    return (b ?? bornes[bornes.length - 1])?.mode ?? "run";
  };
}

/**
 * Ré-agrège la sortie segment-par-segment de genererPlanPacing (segments à
 * pente homogène, 150m-1.2km — corrects pour le calcul GAP/marche mais
 * illisibles affichés tels quels) en une ligne par kilomètre complet, plus
 * un dernier segment partiel si la distance totale n'est pas un multiple de
 * 1km — la granularité attendue d'une fiche de pacing (repère km par km en
 * course). Le mode (course/marche) retenu par ligne est celui du segment
 * d'origine couvrant le milieu de l'intervalle.
 * @param {ReturnType<typeof genererPlanPacing>["segments"]} segmentsPlan
 * @param {number} distanceTotaleM
 * @returns {{distance:number, allureMinParKm:number, tempsSegmentMin:number, tempsCumuleMin:number, mode:"run"|"hike"}[]}
 */
export function agregerPacingParKm(segmentsPlan, distanceTotaleM) {
  const tempsADistance = construireTempsCumuleADistance(segmentsPlan);
  const modeADistance = construireModeADistance(segmentsPlan);
  const tempsCum = tempsADistance(distanceTotaleM);
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
      mode: modeADistance((distancePrecedente + d) / 2),
    });
    distancePrecedente = d;
    tempsPrecedent = t;
  }

  const reste = distanceTotaleM - nbKmPleins * 1000;
  if (reste > 1) {
    const tempsSegmentMin = tempsCum - tempsPrecedent;
    buckets.push({
      distance: reste,
      allureMinParKm: tempsSegmentMin / (reste / 1000),
      tempsSegmentMin,
      tempsCumuleMin: tempsCum,
      mode: modeADistance((distancePrecedente + distanceTotaleM) / 2),
    });
  }

  return buckets;
}

/**
 * Fusionne la timeline de pacing avec des marqueurs de ravitaillement/rappel
 * nutrition (§9) — un flag indépendant des ravitos officiels, à intervalle
 * régulier (ex. toutes les 30-40min).
 * @param {Array} segmentsPacing sortie de agregerPacingParKm
 * @param {{glucidesGParH:number, frequenceMin:number}} ravito produit/fréquence choisis par l'utilisateur
 * @returns {{km:number, tempsCumule:number, allureCible:number, mode:"run"|"hike", actionNutrition:string|null}[]}
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
      mode: seg.mode,
      actionNutrition,
    });
  }
  return timeline;
}

// ---------------------------------------------------------------------
// §14 — Erreurs de pacing à flagger automatiquement, calculables à la
// génération du plan (les alertes purement live — dérive de rythme en
// course, rattrapage de retard en montée — nécessitent un suivi GPS en
// temps réel, hors périmètre de ce générateur de fiche pré-course).
// ---------------------------------------------------------------------

/**
 * @param {{penteMoyenne:number}[]} segments
 * @param {ReturnType<typeof genererPlanPacing>} plan
 * @param {{frequenceMin?:number}} options
 * @returns {string[]}
 */
export function detecterAlertesPlan(segments, plan, options = {}) {
  const alertes = [];

  const horsDomaine = segments.some(
    (s) => s.penteMoyenne < DOMAINE_PENTE_FIABLE.min || s.penteMoyenne > DOMAINE_PENTE_FIABLE.max
  );
  if (horsDomaine) {
    alertes.push(
      "Certaines portions dépassent ±20% de pente — hors du domaine de validité fiable du modèle de coût énergétique (§2.3) : la prudence sur la technicité et le freinage prime sur le chiffre d'allure affiché."
    );
  }

  if (options.frequenceMin && options.frequenceMin > 45) {
    alertes.push(
      "Fréquence de rappel nutrition réglée au-delà de 45 min — risque de déficit calorique accumulé en 2e partie de course (§9/§14)."
    );
  }

  const targetTimeMin = plan.totals.targetTimeMin;
  const deltaPct = targetTimeMin > 0 ? plan.totals.deltaMin / targetTimeMin : 0;
  if (Math.abs(deltaPct) > 0.05) {
    const sens = deltaPct > 0 ? "plus lent" : "plus rapide";
    alertes.push(
      `Avec ce profil (allure plat-équivalente, capacité D+/h), le temps prédit est ${sens} de ${Math.abs(
        Math.round(deltaPct * 100)
      )}% par rapport à l'objectif — ajuste ta capacité D+/h ou ton objectif pour resserrer l'écart (§10/§11).`
    );
  }

  return alertes;
}

/**
 * Calculateur distance / allure / temps — utile sur piste ou une ligne
 * droite chronométrée (répétitions, fractionné) : connaissant deux des
 * trois valeurs, résout la troisième (relation simple temps = distance ×
 * allure, mais fastidieuse à faire de tête sous forme min:s en plein
 * effort). Ne dépend d'aucun GPX/segment — juste la relation elle-même.
 * @param {{distanceM?:number|null, allureMinParKm?:number|null, tempsS?:number|null}} valeurs
 *   exactement les valeurs connues ; laisser à null/undefined celle à calculer.
 * @returns {{distanceM:number, allureMinParKm:number, tempsS:number}|null}
 *   null si moins de deux valeurs sont renseignées (rien à résoudre).
 */
export function resoudreDistanceAllureTemps({ distanceM, allureMinParKm, tempsS } = {}) {
  const connues = [distanceM, allureMinParKm, tempsS].filter((v) => v != null && v > 0).length;
  if (connues < 2) return null;

  if (distanceM != null && allureMinParKm != null) {
    return { distanceM, allureMinParKm, tempsS: (distanceM / 1000) * allureMinParKm * 60 };
  }
  if (distanceM != null && tempsS != null) {
    return { distanceM, allureMinParKm: tempsS / 60 / (distanceM / 1000), tempsS };
  }
  // allureMinParKm et tempsS connus (distance à déduire)
  return { distanceM: (tempsS / 60 / allureMinParKm) * 1000, allureMinParKm, tempsS };
}
