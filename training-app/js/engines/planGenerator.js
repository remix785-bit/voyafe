// Générateur de plan — Étapes ①→④, Partie II.
// ① Normalisation du profil · ② Macrocycle · ③ Microcycle · ④ Instanciation des séances.

import { vdotFromPerformance, paceZonesForVdot, evaluerCoherenceObjectif } from "./vdot.js";
import { gapFactor, flatEquivalentToRealPace } from "./gap.js";
import { resoudreStructureDetaillee, formatDureeCourte } from "./structureSeance.js";
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

/**
 * Convertit un jour JS (Date#getDay : 0=dimanche..6=samedi) en jour ISO
 * (1=lundi..7=dimanche).
 */
function jourIso(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

/**
 * Attribue une date calendaire précise à chaque séance de la semaine, selon
 * les jours d'entraînement choisis par l'utilisateur — répond à la demande
 * "pouvoir choisir les jours sur lesquels je veux faire mes séances".
 * L'app ne modélise aucune autre notion de date par séance : c'est cette
 * fonction qui fait le lien entre la semaine (une seule date) et le planning
 * réel. Les séances sont déjà ordonnées "facile en premier, sortie longue en
 * dernier" (composerSemaine) ; les dater dans l'ordre chronologique des
 * jours choisis fait naturellement tomber la sortie longue sur le dernier
 * jour choisi de la semaine.
 * @param {string} dateDebutSemaineISO
 * @param {number} nbSeances
 * @param {number[]} joursEntrainement jours ISO (1=lundi..7=dimanche), sans doublon
 * @returns {string[]|null[]} dates ISO, une par séance, dans l'ordre — ou
 *   null partout si aucun jour d'entraînement n'est fourni (comportement
 *   antérieur préservé : pas de date précise, seul l'ordre compte)
 */
export function assignerDatesSeances(dateDebutSemaineISO, nbSeances, joursEntrainement, nbJoursFenetre = 7) {
  if (!joursEntrainement?.length) return Array(nbSeances).fill(null);

  const debut = new Date(dateDebutSemaineISO);
  const candidats = [];
  for (let i = 0; i < nbJoursFenetre; i++) {
    const d = new Date(debut.getTime() + i * JOUR_MS);
    if (joursEntrainement.includes(jourIso(d))) candidats.push(d);
  }
  candidats.sort((a, b) => a - b);

  const dates = [];
  for (let i = 0; i < nbSeances; i++) {
    const d = candidats.length ? candidats[i % candidats.length] : new Date(debut.getTime() + i * JOUR_MS);
    dates.push(d.toISOString());
  }
  return dates;
}

// ---------------------------------------------------------------------------
// ② Génération du macrocycle
// ---------------------------------------------------------------------------

export const SEUIL_PLAN_COURT_SEMAINES = 6; // Point ouvert Partie II §10.1 — tranché ici par défaut

/**
 * @param {number} semainesDispo
 * @param {"faible"|"moderee"|"elevee"} chargeHebdoMoyenneActuelle
 * @param {{typeObjectif?:"finale"|"intermediaire"}} options `typeObjectif:"intermediaire"`
 *   (Saison — Partie II §9 étendue) plafonne l'affûtage à 1 semaine : une course
 *   d'étape qui sert un objectif final plus lointain ne doit pas interrompre la
 *   progression de charge comme le ferait l'affûtage complet d'un objectif final.
 */
export function construireMacrocycle(semainesDispo, chargeHebdoMoyenneActuelle = "moderee", options = {}) {
  const { typeObjectif = "finale" } = options;
  if (semainesDispo < SEUIL_PLAN_COURT_SEMAINES) {
    return construirePlanCourt(semainesDispo, typeObjectif);
  }

  let taperSemaines = 2;
  if (chargeHebdoMoyenneActuelle === "elevee") taperSemaines = 3;
  if (chargeHebdoMoyenneActuelle === "faible") taperSemaines = 1;
  if (typeObjectif === "intermediaire") taperSemaines = Math.min(taperSemaines, 1);

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
function construirePlanCourt(semainesDispo, typeObjectif = "finale") {
  let taperSemaines = semainesDispo <= 3 ? 1 : 2;
  if (typeObjectif === "intermediaire") taperSemaines = Math.min(taperSemaines, 1);
  const developpement = Math.max(semainesDispo - taperSemaines, 0);
  return { mode: "court", base: 0, developpement, taper: taperSemaines };
}

/**
 * Construit la liste ordonnée des semaines taguées par phase, avec insertion
 * des semaines de décharge (toutes les 3-4 semaines, hors taper).
 *
 * semainesDisponibles() tronque à un nombre entier de semaines (floor) — le
 * reste (0 à 6 jours) est absorbé ici dans la fenêtre calendaire de la
 * PREMIÈRE semaine (dureeJours > 7) plutôt que laissé en silence après la
 * dernière semaine : sans ça, le taper se terminait jusqu'à 6 jours avant
 * l'échéance réelle (aucune séance planifiée sur ces derniers jours, le plan
 * semblait "s'arrêter" avant l'objectif au lieu de le viser précisément).
 * Absorber le reste en semaine 1 (phase Base, l'écart compte le moins) laisse
 * en revanche le nombre de semaines de chaque phase strictement inchangé
 * (macrocycle déjà figé), et fait culminer très précisément le taper sur la
 * date d'échéance.
 * @param {{mode:string, base:number, developpement:number, taper:number}} macrocycle
 * @param {string} dateDebutISO
 * @param {number} dureeSupplementaireJours jours de reste (0-6) à absorber en semaine 1
 */
export function genererSemaines(macrocycle, dateDebutISO, dureeSupplementaireJours = 0) {
  const semaines = [];
  let numero = 1;
  let dateCourante = new Date(dateDebutISO);
  let compteurDepuisDecharge = 0;
  let extraRestant = dureeSupplementaireJours;

  const pousserSemaine = (phase) => {
    compteurDepuisDecharge++;
    let statut = "normale";
    // décharge toutes les 3-4 semaines, jamais en taper, jamais la 1ère semaine
    if (phase !== "taper" && compteurDepuisDecharge >= 4 && numero > 1) {
      statut = "decharge";
      compteurDepuisDecharge = 0;
    }
    const dureeJours = 7 + extraRestant;
    semaines.push({
      numero,
      phase,
      statut: phase === "taper" ? "taper" : statut,
      dateDebut: new Date(dateCourante).toISOString(),
      dureeJours,
    });
    numero++;
    dateCourante = new Date(dateCourante.getTime() + dureeJours * JOUR_MS);
    extraRestant = 0; // seule la 1ère semaine absorbe le reste
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

  // Endurance en début de semaine, sortie longue en fin de semaine : la
  // sortie longue est toujours le DERNIER élément (elle occupe le dernier
  // créneau disponible), les fillers E générique le PREMIER, les séances
  // qualité (+ leur récup) entre les deux. L'app ne modélise pas de vraies
  // dates par séance (seule la semaine a une date) — cet ordre pilote donc
  // directement l'ordre d'affichage (Dashboard/Plan), qui vaut agenda.
  const slotsPourLongue = 1;
  const slotsRestants = Math.max(0, nbSeancesDispo - slotsPourLongue);

  if (discipline === "route") {
    const seancesQualite = [];
    if (isTaper) {
      // "1 séance courte à intensité maintenue, pas de nouveau stimulus" (Partie II §4.1)
      seancesQualite.push({ catalogueId: "route_interval", jour: "mardi", volumeReduit: true });
    } else if (isBase) {
      // "1 séance T tous les 15 jours, pas d'I/R" (Partie II §4.1)
      if (semainePaire) seancesQualite.push({ catalogueId: "route_seuil", jour: "mardi" });
    } else {
      // Développement : "1 T/semaine + 1 I ou R en alternance" (Partie II §4.1) —
      // les deux sont dues chaque semaine de Développement, quel que soit le
      // nombre de séances disponibles : le dossier ne conditionne cette règle
      // à aucun seuil de disponibilité, donc on ne doit pas en inventer un.
      seancesQualite.push({ catalogueId: "route_seuil", jour: "mardi" });
      seancesQualite.push({ catalogueId: semainePaire ? "route_interval" : "route_repetition", jour: "jeudi" });
    }

    // Les séances qualité priment sur le footing récupération (lendemain de
    // séance qualité, §6.1) — en cas de disponibilité restreinte, le
    // fractionné (I/R) ne doit jamais être le premier sacrifié.
    const blocQualite = seancesQualite.slice(0, slotsRestants);
    for (let i = 0; i < seancesQualite.length && blocQualite.length < slotsRestants; i++) {
      blocQualite.push({ catalogueId: "route_footing_recup", jour: "lendemain" });
    }
    const nbFillersE = Math.max(0, slotsRestants - blocQualite.length);
    const fillersE = Array.from({ length: nbFillersE }, () => ({
      catalogueId: "route_endurance_fondamentale",
      jour: "libre",
    }));

    slots.push(...fillersE, ...blocQualite);
    if (slotsPourLongue > 0) slots.push({ catalogueId: "route_sortie_longue", jour: "dimanche" });
  } else {
    const seancesQualite = [];
    if (!isTaper && !isBase) {
      // "Côtes longues 1×/sem, côtes courtes 1×/sem (alterné)" (Partie II §4.1) —
      // dues chaque semaine de Développement, sans seuil de disponibilité.
      seancesQualite.push({ catalogueId: "trail_cotes_longues", jour: "mardi" });
      seancesQualite.push({ catalogueId: "trail_cotes_courtes", jour: "jeudi" });
    }
    // "1×/2 semaines en phase Base, jusqu'à 1×/semaine en Développement" (§7.4)
    if ((isBase && semainePaire) || (!isBase && !isTaper)) {
      seancesQualite.push({ catalogueId: "trail_descente_technique", jour: "mercredi" });
    }

    const blocQualite = seancesQualite.slice(0, slotsRestants);
    const nbFillersE = Math.max(0, slotsRestants - blocQualite.length);
    const fillersE = Array.from({ length: nbFillersE }, () => ({
      catalogueId: "trail_sortie_dplus_progressif",
      jour: "libre",
    }));

    slots.push(...fillersE, ...blocQualite);
    if (slotsPourLongue > 0) {
      slots.push({
        catalogueId: estRepetitionGenerale ? "trail_sortie_longue_specifique" : "trail_sortie_dplus_progressif",
        jour: "dimanche",
      });
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
 * Séances trail dédiées à la spécificité D+ (côtes, descente technique) —
 * équivalent trail du bloc à l'allure objectif de la sortie longue route
 * (fractionBlocObjectif) : leur volume grandit avec l'ambition de l'objectif
 * plutôt que de rester fixe quelle que soit la difficulté à combler.
 */
const TRAIL_SPECIFICITE_IDS = ["trail_cotes_longues", "trail_cotes_courtes", "trail_descente_technique"];

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
 * @param {{facteurPhase?:number, distanceSortieLongueKm?:number|null, fractionBlocObjectif?:number, boostSpecificiteTrail?:number}|null} progressionContext
 *   fractionBlocObjectif : part de la sortie longue à courir à l'allure objectif — pilotée par
 *   evaluerCoherenceObjectif (plus l'objectif est ambitieux pour le délai, plus la spécificité
 *   allure course prend de place dans la séance, jusqu'au plafond du catalogue).
 *   boostSpecificiteTrail : multiplicateur de volume pour les séances de spécificité D+ trail
 *   (TRAIL_SPECIFICITE_IDS — côtes, descente technique), même logique côté trail.
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
  // Borne rapide de la fourchette de zone — même traitement (GAP, relais
  // sortie longue ci-dessous) que l'allure cible, pour que la fourchette
  // affichée reste cohérente avec le terrain/la phase de la séance.
  let allureRapide = allureZone ? allureZone.fast : null;
  let gapWarning = null;

  if (template.discipline === "trail" && template.gapAjuste && allureCible != null) {
    const pente = contexteDenivele.penteMoyenne ?? 0;
    const facteurCalibre = profilCourant.facteurGapCalibre ?? 1;
    const ajusteCible = flatEquivalentToRealPace(allureCible, pente, facteurCalibre);
    allureCible = ajusteCible.paceMinPerKm;
    gapWarning = ajusteCible.warning;
    if (allureRapide != null) {
      allureRapide = flatEquivalentToRealPace(allureRapide, pente, facteurCalibre).paceMinPerKm;
    }
  }

  let volumeSeanceMin;
  let distanceKm = null;
  let allureBlocObjectifMinParKm = null;
  let blocObjectifDureeMin = null;

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
    const allureRapideMajoriteE = zoneCible === "E" ? allureRapide : profilCourant.allures.E.fast;
    volumeSeanceMin = distanceKm * allureMajoriteE;
    allureCible = allureMajoriteE;
    allureRapide = allureRapideMajoriteE;

    if (zoneCible === "M" && template.discipline === "route" && objectifPaceMinParKm != null) {
      allureBlocObjectifMinParKm = objectifPaceMinParKm;
      const fraction = progressionContext?.fractionBlocObjectif ?? 0;
      if (fraction > 0) {
        // Plafond du catalogue (route_sortie_longue, Partie I §6.1) : "Portion M
        // ≤ min(110 min, 29 km)" — jamais dépassé, même pour un objectif jugé
        // très ambitieux (la spécificité a une limite de sécurité, pas la dose
        // qui comble un écart de forme).
        blocObjectifDureeMin = Math.min(volumeSeanceMin * fraction, 110);
      }
    }
  } else {
    const volumeBaseMin = template.corpsDeSeance.dureeMin
      ? (template.corpsDeSeance.dureeMin[0] + template.corpsDeSeance.dureeMin[1]) / 2
      : 30;
    volumeSeanceMin = calculerVolumeSeance(volumeBaseMin, semaineContexte, progressionContext);
    if (TRAIL_SPECIFICITE_IDS.includes(template.id)) {
      volumeSeanceMin *= progressionContext?.boostSpecificiteTrail ?? 1;
    }
    distanceKm = allureCible ? volumeSeanceMin / allureCible : null;
  }

  return {
    templateId: template.id,
    nom: template.nom,
    discipline: template.discipline,
    zoneDaniels: zoneCible,
    allureCibleMinParKm: allureCible,
    allureRapideMinParKm: allureRapide,
    allureBlocObjectifMinParKm,
    blocObjectifDureeMin,
    volumeSeanceMin,
    distanceKm,
    structureDetaillee:
      blocObjectifDureeMin != null
        ? { ...template.corpsDeSeance, format: formaterBlocObjectif(blocObjectifDureeMin) }
        : resoudreStructureDetaillee(template.corpsDeSeance, volumeSeanceMin, allureCible),
    protocoleEchauffement: template.protocoleEchauffement ?? false,
    precautions: [template.precautions, gapWarning].filter(Boolean),
    statut: "a_venir",
  };
}

/** Phrase de prescription pour le bloc "sortie longue + spécificité allure objectif"
 * (route_sortie_longue) — distincte de formaterStructure() (structureSeance.js) car ce
 * n'est pas une séance à répétitions : une seule portion continue à l'allure objectif. */
function formaterBlocObjectif(blocObjectifDureeMin) {
  return `Majorité en E, dont ${formatDureeCourte(blocObjectifDureeMin)} à l'allure objectif`;
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
        // Le volume vient de changer : une structure à répétitions déjà résolue
        // (4 × 4 min...) doit être re-résolue sur ce nouveau volume, sous peine
        // d'afficher une prescription précise mais incohérente avec la durée
        // réelle de la séance écrêtée.
        structureDetaillee: s.structureDetaillee
          ? resoudreStructureDetaillee(s.structureDetaillee, volumeSeanceMin, s.allureCibleMinParKm)
          : s.structureDetaillee,
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
 * Plafonne le volume TOTAL de la semaine au "volume horaire max" déclaré par
 * l'utilisateur (Partie I §1, champ "Disponibilité hebdo : Nombre de séances
 * / volume horaire max") — distinct des plafonds par zone T/I/R au-dessus.
 * Réduit toutes les séances proportionnellement plutôt que d'en supprimer,
 * pour garder la variété de la semaine (fractionné, seuil, sortie longue)
 * même quand le budget hebdo est serré.
 * @param {Array<{volumeSeanceMin:number, allureCibleMinParKm:number|null, distanceKm:number|null}>} seances
 * @param {number|null} volumeHebdoMaxMin
 */
export function plafonnerVolumeHebdoTotal(seances, volumeHebdoMaxMin) {
  if (!volumeHebdoMaxMin) return seances;
  const total = seances.reduce((sum, s) => sum + s.volumeSeanceMin, 0);
  if (total <= volumeHebdoMaxMin) return seances;
  const ratio = volumeHebdoMaxMin / total;
  return seances.map((s) => {
    const volumeSeanceMin = s.volumeSeanceMin * ratio;
    // Le bloc à l'allure objectif (route_sortie_longue) suit le même ratio que
    // le volume global de la séance, pour rester dans la même proportion —
    // sinon un écrêtage sévère pourrait laisser un bloc M plus long que la
    // séance réduite elle-même.
    const blocObjectifDureeMin = s.blocObjectifDureeMin != null ? s.blocObjectifDureeMin * ratio : s.blocObjectifDureeMin;
    return {
      ...s,
      volumeSeanceMin,
      distanceKm: s.allureCibleMinParKm ? volumeSeanceMin / s.allureCibleMinParKm : s.distanceKm != null ? s.distanceKm * ratio : null,
      blocObjectifDureeMin,
      // Même raison qu'au-dessus (appliquerPlafondsHebdo) : re-résoudre la
      // structure à répétitions sur le volume réduit pour rester cohérent ;
      // le bloc objectif a sa propre phrase, régénérée sur sa nouvelle durée.
      structureDetaillee:
        blocObjectifDureeMin != null
          ? { ...s.structureDetaillee, format: formaterBlocObjectif(blocObjectifDureeMin) }
          : s.structureDetaillee
            ? resoudreStructureDetaillee(s.structureDetaillee, volumeSeanceMin, s.allureCibleMinParKm)
            : s.structureDetaillee,
      avertissementVolumeHebdo: `Volume réduit pour respecter ton volume hebdo maximum disponible (${(volumeHebdoMaxMin / 60).toFixed(1)} h).`,
    };
  });
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
  const dateDebutPlan = inputs.dateDebut ?? new Date().toISOString();
  const semDispo = semainesDisponibles(inputs.dateEcheance, dateDebutPlan);
  const macrocycle = construireMacrocycle(semDispo, inputs.chargeHebdoMoyenneActuelle ?? "moderee", {
    typeObjectif: inputs.typeObjectif ?? "finale",
  });
  // semDispo tronque à un nombre entier de semaines (floor) — le reste (0-6
  // jours) est absorbé dans la fenêtre de la 1ère semaine (genererSemaines)
  // pour que le plan couvre exactement jusqu'à l'échéance, taper compris.
  const joursEcartTotal = Math.round((new Date(inputs.dateEcheance) - new Date(dateDebutPlan)) / JOUR_MS);
  const dureeSupplementaireJours = Math.max(0, joursEcartTotal - semDispo * 7);
  const semaines = genererSemaines(macrocycle, dateDebutPlan, dureeSupplementaireJours);
  const objectifPaceMinParKm = calculerAllureObjectif(inputs.distanceObjectifM, inputs.tempsObjectifS);
  // Cohérence objectif/forme (vdot.js) — pilote la part de la sortie longue
  // courue à l'allure objectif (fractionBlocObjectif ci-dessous) : un objectif
  // ambitieux pour le délai donné doit se traduire dans le CONTENU des
  // séances (plus de spécificité allure course), pas rester un simple constat
  // affiché ailleurs dans l'appli.
  const coherenceObjectif =
    inputs.distanceObjectifM && inputs.tempsObjectifS
      ? evaluerCoherenceObjectif(profilCourant.vdot, inputs.distanceObjectifM, inputs.tempsObjectifS, semDispo, inputs.deniveleM ?? 0)
      : null;
  const fractionBlocObjectif = { atteint: 0.12, ambitieux: 0.18, tres_ambitieux: 0.2 }[coherenceObjectif?.niveau] ?? 0;
  // Équivalent trail de fractionBlocObjectif : le volume des séances de
  // spécificité D+ (côtes, descente technique — TRAIL_SPECIFICITE_IDS) grandit
  // avec l'ambition de l'objectif, plutôt que de rester fixe quelle que soit
  // la difficulté à combler. Sans objectif chiffré, pas de boost (1x = inchangé).
  const boostSpecificiteTrail =
    inputs.discipline === "trail" ? { atteint: 1, ambitieux: 1.15, tres_ambitieux: 1.3 }[coherenceObjectif?.niveau] ?? 1 : 1;
  // Pente moyenne attendue de la course (trail, D+ / distance) — contexte GAP
  // pour les séances qualité du plan (côtes, descente technique, sortie D+ :
  // gapAjuste, cf. catalogue trail). Sans D+ renseigné, retombe sur du plat
  // (comportement antérieur préservé).
  const penteMoyenneCible = inputs.deniveleM && inputs.distanceObjectifM ? inputs.deniveleM / inputs.distanceObjectifM : 0;

  // Index de chaque semaine au sein de sa propre phase (progression du volume,
  // calculerFacteurProgression) et parmi les semaines hors affûtage (rampe de
  // distance de la sortie longue, calculerDistanceSortieLongue).
  const semainesParPhase = { base: [], developpement: [], taper: [] };
  for (const s of semaines) semainesParPhase[s.phase].push(s);
  const semainesNonTaper = semaines.filter((s) => s.phase !== "taper");

  // Si des jours d'entraînement précis sont choisis, leur nombre gouverne le
  // nombre de séances/semaine (pas de risque d'incohérence entre les deux) ;
  // sinon on retombe sur nbSeancesHebdo comme avant (comportement préservé).
  const nbSeancesEffectif = inputs.joursEntrainement?.length || inputs.nbSeancesHebdo || 4;

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

    const progressionContext = { facteurPhase, distanceSortieLongueKm, fractionBlocObjectif, boostSpecificiteTrail };

    const slots = composerSemaine(
      semaineContexte.phase,
      inputs.discipline,
      nbSeancesEffectif,
      semaineContexte.numero,
      estRepetitionGenerale
    );
    const renfo = renfoPourPhase(semaineContexte.phase);
    const seances = slots
      .map((slot) => trouverTemplate(slot.catalogueId))
      .filter(Boolean)
      .map((tpl) => instancierSeance(tpl, profilCourant, semaineContexte, { penteMoyenne: penteMoyenneCible }, objectifPaceMinParKm, progressionContext));
    // Volume horaire max hebdo (Partie I §1) d'abord — recadre au budget de
    // temps réel de l'utilisateur — puis plafonds par zone T/I/R (Partie I §3),
    // calculés sur ce total déjà réaliste.
    const seancesDansBudget = plafonnerVolumeHebdoTotal(seances, inputs.volumeHebdoMaxMin);
    const seancesWithCaps = appliquerPlafondsHebdo(seancesDansBudget);

    // Date calendaire précise par séance, selon les jours d'entraînement
    // choisis — demande explicite "pouvoir choisir les jours sur lesquels
    // je veux faire mes séances".
    const dates = assignerDatesSeances(
      semaineContexte.dateDebut,
      seancesWithCaps.length,
      inputs.joursEntrainement,
      semaineContexte.dureeJours ?? 7
    );
    const seancesDatees = seancesWithCaps.map((s, i) => ({ ...s, date: dates[i] }));

    return { ...semaineContexte, seances: seancesDatees, renfoRecommande: renfo };
  });

  return {
    profilCourant,
    macrocycle,
    semaines: semainesAvecSeances,
    distanceObjectifM: inputs.distanceObjectifM ?? null,
    tempsObjectifS: inputs.tempsObjectifS ?? null,
    deniveleM: inputs.deniveleM ?? null,
    objectifPaceMinParKm,
    nbSeancesHebdo: nbSeancesEffectif,
    dateDebutPlan: inputs.dateDebut ?? null,
    joursEntrainement: inputs.joursEntrainement ?? null,
    volumeHebdoMaxMin: inputs.volumeHebdoMaxMin ?? null,
    chargeHebdoMoyenneActuelle: inputs.chargeHebdoMoyenneActuelle ?? "moderee",
    typeObjectif: inputs.typeObjectif ?? "finale",
    statut: "en_attente",
  };
}

// ---------------------------------------------------------------------------
// Saison — objectif final + objectifs intermédiaires (Partie II §9 étendue)
// ---------------------------------------------------------------------------

/**
 * Génère une saison complète : un objectif final et, en option, des objectifs
 * intermédiaires (courses "d'étape"), chacun avec son propre bloc de plan
 * (①→④), chaînés chronologiquement bout à bout du début de saison à
 * l'objectif final. Seul l'objectif final reçoit l'affûtage complet
 * (construireMacrocycle) ; les intermédiaires gardent un affûtage minimal
 * (typeObjectif:"intermediaire") pour que la course d'étape serve la
 * progression vers l'objectif final plutôt que de l'interrompre.
 * @param {object} inputs profil commun à toute la saison (performanceRef,
 *   joursEntrainement, chargeHebdoMoyenneActuelle, volumeHebdoMaxMin,
 *   facteurGapCalibre, dateDebut) + :
 *   - objectifFinal: {nom, distanceM, tempsS, date, discipline, deniveleM}
 *   - objectifsIntermediaires: [{nom, distanceM, tempsS, date, discipline, deniveleM}, ...]
 *     (optionnel) — chaque objectif (final ou intermédiaire) porte sa PROPRE
 *     discipline ("route"|"trail") et, en trail, son propre D+ attendu
 *     (deniveleM) : une saison peut mêler une course d'étape en trail et un
 *     objectif final sur route, ou l'inverse.
 * @returns {Array<object>} blocs de plan générés, dans l'ordre chronologique,
 *   chacun enrichi de {roleSaison:"intermediaire"|"finale", ordreSaison}
 */
export function genererSaison(inputs) {
  const { objectifFinal, objectifsIntermediaires = [], ...profilCommun } = inputs;
  if (!objectifFinal?.date) {
    throw new Error("L'objectif final (nom, distance, date) est requis pour générer une saison.");
  }

  const intermediairesTries = [...objectifsIntermediaires].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  const blocsObjectifs = [
    ...intermediairesTries.map((o) => ({ ...o, role: "intermediaire" })),
    { ...objectifFinal, role: "finale" },
  ];

  let dateDebutCourante = profilCommun.dateDebut ?? new Date().toISOString();
  const plans = [];
  for (const [i, objectif] of blocsObjectifs.entries()) {
    if (new Date(objectif.date) <= new Date(dateDebutCourante)) {
      const nom = objectif.nom || `Objectif ${i + 1}`;
      throw new Error(
        `"${nom}" (${new Date(objectif.date).toLocaleDateString("fr-FR")}) doit être postérieur à la fin du bloc précédent (${new Date(dateDebutCourante).toLocaleDateString("fr-FR")}).`
      );
    }

    const discipline = objectif.discipline || profilCommun.discipline || "route";
    const plan = genererPlanComplet({
      ...profilCommun,
      dateDebut: dateDebutCourante,
      dateEcheance: objectif.date,
      discipline,
      distanceObjectifM: objectif.distanceM ?? null,
      tempsObjectifS: objectif.tempsS ?? null,
      deniveleM: discipline === "trail" ? objectif.deniveleM ?? null : null,
      objectif: objectif.nom || profilCommun.objectif || null,
      typeObjectif: objectif.role,
    });
    // genererPlanComplet ne pose pas discipline/objectif/dateEcheance sur le
    // plan lui-même (habituellement posés par store.creerPlan) — nécessaires
    // ici puisque chaque bloc de saison doit être un plan autonome et complet.
    plan.discipline = discipline;
    plan.objectif = objectif.nom || profilCommun.objectif || null;
    plan.dateEcheance = objectif.date;
    plan.roleSaison = objectif.role;
    plan.ordreSaison = i + 1;
    plans.push(plan);

    // Le bloc suivant démarre le lendemain de cette course (le taper réduit
    // des intermédiaires laisse un jour de récupération avant de relancer).
    dateDebutCourante = new Date(new Date(objectif.date).getTime() + JOUR_MS).toISOString();
  }

  return plans;
}
