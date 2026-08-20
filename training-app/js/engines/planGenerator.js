// Générateur de plan — Étapes ①→④, Partie II.
// ① Normalisation du profil · ② Macrocycle · ③ Microcycle · ④ Instanciation des séances.

import { vdotFromPerformance, paceZonesForVdot } from "./vdot.js";
import { gapFactor, flatEquivalentToRealPace } from "./gap.js";
import { SESSIONS_ROUTE } from "../catalog/sessionsRoute.js";
import { SESSIONS_TRAIL } from "../catalog/sessionsTrail.js";
import { renfoPourPhase } from "../catalog/renfo.js";

const JOUR_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// ① Normalisation du profil
// ---------------------------------------------------------------------------

/**
 * @param {{distanceM:number, tempsS:number, dateTest:string}} performanceRef
 * @param {{facteurGapCalibre?:number}} options
 * @returns {object} ProfilCourant
 */
export function normaliserProfil(performanceRef, options = {}) {
  const { vdot, warnings } = vdotFromPerformance(performanceRef.distanceM, performanceRef.tempsS);
  const allures = paceZonesForVdot(vdot);
  return {
    vdot,
    warnings,
    allures,
    facteurGapCalibre: options.facteurGapCalibre ?? null, // null -> utiliser Minetti par défaut
    dateCalcul: new Date().toISOString(),
  };
}

export function semainesDisponibles(dateEcheanceISO, dateDuJourISO = new Date().toISOString()) {
  const dateEcheance = new Date(dateEcheanceISO);
  const dateDuJour = new Date(dateDuJourISO);
  return Math.floor((dateEcheance - dateDuJour) / (7 * JOUR_MS));
}

// ---------------------------------------------------------------------------
// ② Génération du macrocycle
// ---------------------------------------------------------------------------

export const SEUIL_PLAN_COURT_SEMAINES = 6; // Point ouvert Partie II §10.1 — tranché ici par défaut

/**
 * @param {number} semainesDispo
 * @param {"faible"|"moderee"|"elevee"} chargeHebdoMoyenneActuelle
 */
export function construireMacrocycle(semainesDispo, chargeHebdoMoyenneActuelle = "moderee") {
  if (semainesDispo < SEUIL_PLAN_COURT_SEMAINES) {
    return construirePlanCourt(semainesDispo);
  }

  let taperSemaines = 2;
  if (chargeHebdoMoyenneActuelle === "elevee") taperSemaines = 3;
  if (chargeHebdoMoyenneActuelle === "faible") taperSemaines = 1;

  const semainesRestantes = semainesDispo - taperSemaines;
  const semainesBase = Math.round(semainesRestantes * 0.53);
  const semainesDeveloppement = semainesRestantes - semainesBase;

  return {
    mode: "standard",
    base: semainesBase,
    developpement: semainesDeveloppement,
    taper: taperSemaines,
  };
}

/**
 * Garde-fou plan court (<6 semaines) : pas de vraie phase Base, focus
 * maintien + affûtage (Partie II §9, point ouvert 1 — résolu par défaut ainsi).
 */
function construirePlanCourt(semainesDispo) {
  const taperSemaines = semainesDispo <= 3 ? 1 : 2;
  const developpement = Math.max(semainesDispo - taperSemaines, 0);
  return { mode: "court", base: 0, developpement, taper: taperSemaines };
}

/**
 * Construit la liste ordonnée des semaines taguées par phase, avec insertion
 * des semaines de décharge (toutes les 3-4 semaines, hors taper).
 * @param {{mode:string, base:number, developpement:number, taper:number}} macrocycle
 * @param {string} dateDebutISO
 */
export function genererSemaines(macrocycle, dateDebutISO) {
  const semaines = [];
  let numero = 1;
  let dateCourante = new Date(dateDebutISO);
  let compteurDepuisDecharge = 0;

  const pousserSemaine = (phase) => {
    compteurDepuisDecharge++;
    let statut = "normale";
    // décharge toutes les 3-4 semaines, jamais en taper, jamais la 1ère semaine
    if (phase !== "taper" && compteurDepuisDecharge >= 4 && numero > 1) {
      statut = "decharge";
      compteurDepuisDecharge = 0;
    }
    semaines.push({
      numero,
      phase,
      statut: phase === "taper" ? "taper" : statut,
      dateDebut: new Date(dateCourante).toISOString(),
    });
    numero++;
    dateCourante = new Date(dateCourante.getTime() + 7 * JOUR_MS);
  };

  for (let i = 0; i < macrocycle.base; i++) pousserSemaine("base");
  for (let i = 0; i < macrocycle.developpement; i++) pousserSemaine("developpement");
  for (let i = 0; i < macrocycle.taper; i++) pousserSemaine("taper");

  return semaines;
}

// ---------------------------------------------------------------------------
// ③ Génération du microcycle (semaine type)
// ---------------------------------------------------------------------------

const PLAFONDS_VOLUME_HEBDO = { T: 0.1, I: 0.08, R: 0.05 };

/**
 * Composition type de la semaine selon phase/discipline (Partie II §4.1),
 * simplifiée en une liste ordonnée de slots (id catalogue + jour proposé).
 *
 * S'appuie sur l'intégralité du catalogue (Partie I §6/§7), pas seulement
 * les templates "qualité" — deux entrées étaient jusqu'ici absentes de toute
 * génération malgré leur fiche `frequenceRecommandee` explicite :
 * - route_footing_recup ("lendemain de séance qualité", §6.1) : remplace
 *   l'endurance fondamentale générique le jour suivant chaque séance T/I/R.
 * - trail_sortie_longue_specifique ("1 répétition générale 3-4 semaines
 *   avant l'échéance", §7.5) : remplace la sortie D+ progressif de la
 *   dernière semaine hors affûtage.
 * trail_descente_technique restait aussi cantonnée à la phase Base alors que
 * sa propre fiche prévoit "jusqu'à 1×/semaine en Développement" (§7.4).
 *
 * `semaineNumero` (numéro global, 1-indexé) pilote la variété semaine par
 * semaine — sans lui, les versions précédentes reproduisaient exactement
 * la même composition chaque semaine (T incluse même en Base, jamais de R) :
 * - Base route : T seulement 1 semaine sur 2 ("tous les 15 jours", pas d'I/R)
 * - Développement route : T chaque semaine + I/R en alternance semaine par semaine
 *
 * `estRepetitionGenerale` marque la dernière semaine hors affûtage (trail).
 */
export function composerSemaine(phase, discipline, nbSeancesDispo, semaineNumero = 1, estRepetitionGenerale = false) {
  const slots = [];
  const isTaper = phase === "taper";
  const isBase = phase === "base";
  const semainePaire = semaineNumero % 2 === 0;

  if (discipline === "route") {
    slots.push({ catalogueId: "route_sortie_longue", jour: "dimanche" });

    const seancesQualite = [];
    if (isTaper) {
      // "1 séance courte à intensité maintenue, pas de nouveau stimulus" (Partie II §4.1)
      seancesQualite.push({ catalogueId: "route_interval", jour: "mardi", volumeReduit: true });
    } else if (isBase) {
      // "1 séance T tous les 15 jours, pas d'I/R" (Partie II §4.1)
      if (semainePaire) seancesQualite.push({ catalogueId: "route_seuil", jour: "mardi" });
    } else {
      // Développement : "1 T/semaine + 1 I ou R en alternance" (Partie II §4.1)
      seancesQualite.push({ catalogueId: "route_seuil", jour: "mardi" });
      if (nbSeancesDispo >= 4) {
        seancesQualite.push({ catalogueId: semainePaire ? "route_interval" : "route_repetition", jour: "jeudi" });
      }
    }

    // Footing récupération le lendemain de chaque séance qualité (§6.1),
    // plutôt que de la générique endurance fondamentale.
    for (const q of seancesQualite) {
      slots.push(q);
      if (slots.length < nbSeancesDispo) {
        slots.push({ catalogueId: "route_footing_recup", jour: "lendemain" });
      }
    }

    while (slots.length < nbSeancesDispo) {
      slots.push({ catalogueId: "route_endurance_fondamentale", jour: "libre" });
    }
  } else {
    slots.push({
      catalogueId: estRepetitionGenerale ? "trail_sortie_longue_specifique" : "trail_sortie_dplus_progressif",
      jour: "dimanche",
    });
    if (!isTaper && !isBase) {
      // "Côtes longues 1×/sem, côtes courtes 1×/sem (alterné)" (Partie II §4.1)
      slots.push({ catalogueId: "trail_cotes_longues", jour: "mardi" });
      if (nbSeancesDispo >= 4) {
        slots.push({ catalogueId: "trail_cotes_courtes", jour: "jeudi" });
      }
    }
    // "1×/2 semaines en phase Base, jusqu'à 1×/semaine en Développement" (§7.4)
    if ((isBase && semainePaire) || (!isBase && !isTaper)) {
      slots.push({ catalogueId: "trail_descente_technique", jour: "mercredi" });
    }
    while (slots.length < nbSeancesDispo) {
      slots.push({ catalogueId: "trail_sortie_dplus_progressif", jour: "libre" });
    }
  }

  return slots.slice(0, nbSeancesDispo);
}

function trouverTemplate(catalogueId) {
  return (
    SESSIONS_ROUTE.find((s) => s.id === catalogueId) ||
    SESSIONS_TRAIL.find((s) => s.id === catalogueId)
  );
}

// ---------------------------------------------------------------------------
// ④ Instanciation des séances
// ---------------------------------------------------------------------------

/**
 * Calcule le volume de séance en appliquant la progression au sein de la
 * phase (voir calculerFacteurProgression) et les modificateurs de phase
 * (décharge -30/-40%, taper -40/-60%).
 */
function calculerVolumeSeance(volumeBase, semaineContexte, progressionContext) {
  let volume = volumeBase * (progressionContext?.facteurPhase ?? 1);
  if (semaineContexte.statut === "decharge") volume *= 0.65; // -35% (milieu de -30/-40%)
  if (semaineContexte.phase === "taper") volume *= 0.5; // -50% (milieu de -40/-60%)
  return volume;
}

/**
 * Facteur de progression du volume au sein d'une phase : 0.75x en début de
 * phase à 1.15x en fin de phase, progression linéaire — reste sous le
 * plafond heuristique "+10%/semaine max" documenté (Partie I §6.3) sur des
 * cycles de 4 semaines et plus. Répond au besoin "je veux pouvoir progresser"
 * : chaque séance qualité grossit d'une semaine à l'autre au sein d'une même
 * phase, avant que la phase suivante ne relève le niveau de base.
 * @param {number} indexDansPhase 0-indexé
 * @param {number} totalDansPhase
 */
export function calculerFacteurProgression(indexDansPhase, totalDansPhase) {
  if (totalDansPhase <= 1) return 1;
  const t = indexDansPhase / (totalDansPhase - 1);
  return 0.75 + t * 0.4;
}

const SORTIE_LONGUE_IDS = ["route_sortie_longue", "trail_sortie_dplus_progressif", "trail_sortie_longue_specifique"];

/**
 * Calcule la distance cible (km) de la sortie longue de la semaine, en
 * rampe progressive vers un pic proche de l'objectif de course, puis
 * affûtage (Partie II §7 / demande explicite : adapter le plan à la
 * distance et au temps visés, pas seulement à la forme actuelle).
 *
 * Hypothèses par défaut (non tirées du dossier, à documenter comme point
 * ouvert) : pic = distance objectif pour les courses ≤25km (le format long
 * peut s'en approcher ou l'atteindre à l'entraînement), pic = 85% plafonné à
 * 35km au-delà (pratique standard marathon/ultra — jamais la distance
 * complète à l'entraînement). Départ = 55% du pic, plafonné à 16km.
 * @param {number} indexNonTaper 0-indexé, position parmi les semaines hors affûtage
 * @param {number} totalNonTaper
 * @param {number} distanceObjectifM
 */
export function calculerDistanceSortieLongue(indexNonTaper, totalNonTaper, distanceObjectifM) {
  const goalKm = distanceObjectifM / 1000;
  const peakKm = goalKm <= 25 ? goalKm : Math.min(goalKm * 0.85, 35);
  const startKm = Math.min(peakKm * 0.55, 16);
  if (totalNonTaper <= 1) return peakKm;
  const t = Math.min(Math.max(indexNonTaper, 0), totalNonTaper - 1) / (totalNonTaper - 1);
  return startKm + (peakKm - startKm) * t;
}

/**
 * Instancie une séance concrète à partir d'un template catalogue + profil.
 * @param {object} template entrée du catalogue (SESSIONS_ROUTE/SESSIONS_TRAIL)
 * @param {object} profilCourant sortie de normaliserProfil
 * @param {object} semaineContexte { phase, statut, dateDebut }
 * @param {{penteMoyenne?:number}} contexteDenivele pour l'ajustement GAP (trail)
 * @param {number|null} objectifPaceMinParKm allure de course objectif (distance+temps saisis
 *   par l'utilisateur) — remplace, quand fournie, l'allure M déduite de la seule forme actuelle
 *   pour les blocs "spécificité allure course" (zone M, route). Sans objectif renseigné, on
 *   retombe sur l'allure M dérivée du VDOT comme avant.
 * @param {{facteurPhase?:number, distanceSortieLongueKm?:number|null}|null} progressionContext
 */
export function instancierSeance(
  template,
  profilCourant,
  semaineContexte,
  contexteDenivele = {},
  objectifPaceMinParKm = null,
  progressionContext = null
) {
  const zoneCible = template.zoneDaniels;
  const allureZone = profilCourant.allures[zoneCible];
  let allureCible = allureZone ? allureZone.target : null;
  let gapWarning = null;

  if (template.discipline === "trail" && template.gapAjuste && allureCible != null) {
    const pente = contexteDenivele.penteMoyenne ?? 0;
    const ajuste = flatEquivalentToRealPace(allureCible, pente);
    allureCible = ajuste.paceMinPerKm;
    gapWarning = ajuste.warning;
  }

  let volumeSeanceMin;
  let distanceKm = null;
  let allureBlocObjectifMinParKm = null;

  const estSortieLongueAvecObjectif =
    SORTIE_LONGUE_IDS.includes(template.id) && progressionContext?.distanceSortieLongueKm != null;

  if (estSortieLongueAvecObjectif) {
    // Rampe en distance directe plutôt qu'en durée. La sortie longue est
    // majoritairement courue en E — c'est cette allure (GAP-ajustée ci-dessus
    // pour le trail) qui sert de référence pour convertir distance -> durée,
    // afin que l'allure affichée reste cohérente avec le couple distance/durée.
    // L'allure objectif (bloc "spécificité allure course", zone M en route)
    // est exposée séparément dans allureBlocObjectifMinParKm plutôt que
    // d'écraser l'allure globale — évite l'incohérence "35km à 4:59/km"
    // alors que l'essentiel du volume se court à une allure plus lente.
    let distanceCible = progressionContext.distanceSortieLongueKm;
    if (semaineContexte.statut === "decharge") distanceCible *= 0.65;
    if (semaineContexte.phase === "taper") distanceCible *= 0.5;
    distanceKm = distanceCible;
    const allureMajoriteE = zoneCible === "E" ? allureCible : profilCourant.allures.E.target;
    volumeSeanceMin = distanceKm * allureMajoriteE;
    allureCible = allureMajoriteE;

    if (zoneCible === "M" && template.discipline === "route" && objectifPaceMinParKm != null) {
      allureBlocObjectifMinParKm = objectifPaceMinParKm;
    }
  } else {
    const volumeBaseMin = template.corpsDeSeance.dureeMin
      ? (template.corpsDeSeance.dureeMin[0] + template.corpsDeSeance.dureeMin[1]) / 2
      : 30;
    volumeSeanceMin = calculerVolumeSeance(volumeBaseMin, semaineContexte, progressionContext);
    distanceKm = allureCible ? volumeSeanceMin / allureCible : null;
  }

  return {
    templateId: template.id,
    nom: template.nom,
    discipline: template.discipline,
    zoneDaniels: zoneCible,
    allureCibleMinParKm: allureCible,
    allureBlocObjectifMinParKm,
    volumeSeanceMin,
    distanceKm,
    structureDetaillee: template.corpsDeSeance,
    protocoleEchauffement: template.protocoleEchauffement ?? false,
    precautions: [template.precautions, gapWarning].filter(Boolean),
    statut: "a_venir",
  };
}

/**
 * Vérifie les plafonds hebdo T≤10% / I≤8% / R≤5% et reconvertit l'excédent
 * en E (Partie II §4.2, dernière étape).
 * @param {Array<{zoneDaniels:string, volumeSeanceMin:number}>} seances
 */
export function appliquerPlafondsHebdo(seances) {
  const volumeTotal = seances.reduce((sum, s) => sum + s.volumeSeanceMin, 0) || 1;
  return seances.map((s) => {
    const plafond = PLAFONDS_VOLUME_HEBDO[s.zoneDaniels];
    if (!plafond) return s;
    const part = s.volumeSeanceMin / volumeTotal;
    if (part > plafond) {
      const volumeSeanceMin = volumeTotal * plafond;
      return {
        ...s,
        volumeSeanceMin,
        distanceKm: s.allureCibleMinParKm ? volumeSeanceMin / s.allureCibleMinParKm : s.distanceKm,
        avertissementPlafond: `Volume écrêté au plafond hebdo ${zoneCibleLabel(s.zoneDaniels)} (${Math.round(plafond * 100)}%) — excédent reconverti en E.`,
      };
    }
    return s;
  });
}

function zoneCibleLabel(zone) {
  return { T: "seuil", I: "interval", R: "répétition" }[zone] ?? zone;
}

/**
 * Calcule l'allure de course objectif (min/km) à partir d'une distance et d'un
 * temps cible saisis par l'utilisateur (Partie I §1 : "Objectif" = temps cible
 * chronométré, "Distance/profil" = distance seule en route).
 * @param {number|null} distanceObjectifM
 * @param {number|null} tempsObjectifS
 * @returns {number|null}
 */
export function calculerAllureObjectif(distanceObjectifM, tempsObjectifS) {
  if (!distanceObjectifM || !tempsObjectifS) return null;
  return (tempsObjectifS / 60) / (distanceObjectifM / 1000);
}

/**
 * Pipeline complet ①→④ : génère un plan daté à partir des inputs utilisateur.
 * @param {object} inputs voir Partie I §1 (discipline, objectif, échéance, performanceRef,
 *   distanceObjectifM, tempsObjectifS, ...)
 */
export function genererPlanComplet(inputs) {
  const profilCourant = normaliserProfil(inputs.performanceRef, {
    facteurGapCalibre: inputs.facteurGapCalibre,
  });
  const semDispo = semainesDisponibles(inputs.dateEcheance, inputs.dateDebut);
  const macrocycle = construireMacrocycle(semDispo, inputs.chargeHebdoMoyenneActuelle ?? "moderee");
  const semaines = genererSemaines(macrocycle, inputs.dateDebut ?? new Date().toISOString());
  const objectifPaceMinParKm = calculerAllureObjectif(inputs.distanceObjectifM, inputs.tempsObjectifS);

  // Index de chaque semaine au sein de sa propre phase (progression du volume,
  // calculerFacteurProgression) et parmi les semaines hors affûtage (rampe de
  // distance de la sortie longue, calculerDistanceSortieLongue).
  const semainesParPhase = { base: [], developpement: [], taper: [] };
  for (const s of semaines) semainesParPhase[s.phase].push(s);
  const semainesNonTaper = semaines.filter((s) => s.phase !== "taper");

  const semainesAvecSeances = semaines.map((semaineContexte) => {
    const indexDansPhase = semainesParPhase[semaineContexte.phase].indexOf(semaineContexte);
    const totalDansPhase = semainesParPhase[semaineContexte.phase].length;
    const facteurPhase = calculerFacteurProgression(indexDansPhase, totalDansPhase);

    const indexNonTaper = semainesNonTaper.indexOf(semaineContexte);
    const distanceSortieLongueKm = inputs.distanceObjectifM
      ? calculerDistanceSortieLongue(indexNonTaper, semainesNonTaper.length, inputs.distanceObjectifM)
      : null;
    // "1 répétition générale 3-4 semaines avant l'échéance" (trail, Partie I §7.5) :
    // la dernière semaine hors affûtage, juste avant que le volume ne redescende.
    const estRepetitionGenerale = indexNonTaper === semainesNonTaper.length - 1 && semainesNonTaper.length > 0;

    const progressionContext = { facteurPhase, distanceSortieLongueKm };

    const slots = composerSemaine(
      semaineContexte.phase,
      inputs.discipline,
      inputs.nbSeancesHebdo ?? 4,
      semaineContexte.numero,
      estRepetitionGenerale
    );
    const renfo = renfoPourPhase(semaineContexte.phase);
    const seances = slots
      .map((slot) => trouverTemplate(slot.catalogueId))
      .filter(Boolean)
      .map((tpl) => instancierSeance(tpl, profilCourant, semaineContexte, {}, objectifPaceMinParKm, progressionContext));
    const seancesWithCaps = appliquerPlafondsHebdo(seances);
    return { ...semaineContexte, seances: seancesWithCaps, renfoRecommande: renfo };
  });

  return {
    profilCourant,
    macrocycle,
    semaines: semainesAvecSeances,
    distanceObjectifM: inputs.distanceObjectifM ?? null,
    tempsObjectifS: inputs.tempsObjectifS ?? null,
    objectifPaceMinParKm,
    nbSeancesHebdo: inputs.nbSeancesHebdo ?? 4,
    chargeHebdoMoyenneActuelle: inputs.chargeHebdoMoyenneActuelle ?? "moderee",
    statut: "en_attente",
  };
}
