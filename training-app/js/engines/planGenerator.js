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
 */
export function composerSemaine(phase, discipline, nbSeancesDispo) {
  const slots = [];
  const isTaper = phase === "taper";
  const isBase = phase === "base";

  if (discipline === "route") {
    slots.push({ catalogueId: "route_sortie_longue", jour: "dimanche" });
    if (!isTaper) {
      slots.push({ catalogueId: isBase ? "route_seuil" : "route_seuil", jour: "mardi", frequenceQuinzaine: isBase });
    }
    if (!isBase && !isTaper && nbSeancesDispo >= 4) {
      slots.push({ catalogueId: "route_interval", jour: "jeudi", alterneAvec: "route_repetition" });
    }
    if (isTaper) {
      slots.push({ catalogueId: "route_interval", jour: "mardi", volumeReduit: true });
    }
    while (slots.length < nbSeancesDispo) {
      slots.push({ catalogueId: "route_endurance_fondamentale", jour: "libre" });
    }
  } else {
    slots.push({ catalogueId: "trail_sortie_dplus_progressif", jour: "dimanche" });
    if (!isTaper && !isBase) {
      slots.push({ catalogueId: "trail_cotes_longues", jour: "mardi" });
      if (nbSeancesDispo >= 4) {
        slots.push({ catalogueId: "trail_cotes_courtes", jour: "jeudi" });
      }
    }
    if (isBase) {
      slots.push({ catalogueId: "trail_descente_technique", jour: "mercredi", frequenceQuinzaine: true });
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
 * Calcule le volume de séance en appliquant la progression (+10%/semaine max)
 * et les modificateurs de phase (décharge -30/-40%, taper -40/-60%).
 */
function calculerVolumeSeance(volumeBase, semaineContexte) {
  let volume = volumeBase;
  if (semaineContexte.statut === "decharge") volume *= 0.65; // -35% (milieu de -30/-40%)
  if (semaineContexte.phase === "taper") volume *= 0.5; // -50% (milieu de -40/-60%)
  return volume;
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
 */
export function instancierSeance(template, profilCourant, semaineContexte, contexteDenivele = {}, objectifPaceMinParKm = null) {
  const zoneCible = template.zoneDaniels;
  const allureZone = profilCourant.allures[zoneCible];
  let allureCible = allureZone ? allureZone.target : null;
  let gapWarning = null;

  if (zoneCible === "M" && template.discipline === "route" && objectifPaceMinParKm != null) {
    allureCible = objectifPaceMinParKm;
  }

  if (template.discipline === "trail" && template.gapAjuste && allureCible != null) {
    const pente = contexteDenivele.penteMoyenne ?? 0;
    const ajuste = flatEquivalentToRealPace(allureCible, pente);
    allureCible = ajuste.paceMinPerKm;
    gapWarning = ajuste.warning;
  }

  const volumeBaseMin = template.corpsDeSeance.dureeMin
    ? (template.corpsDeSeance.dureeMin[0] + template.corpsDeSeance.dureeMin[1]) / 2
    : 30;
  const volumeSeanceMin = calculerVolumeSeance(volumeBaseMin, semaineContexte);

  return {
    templateId: template.id,
    nom: template.nom,
    discipline: template.discipline,
    zoneDaniels: zoneCible,
    allureCibleMinParKm: allureCible,
    volumeSeanceMin,
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
      return {
        ...s,
        volumeSeanceMin: volumeTotal * plafond,
        zoneDaniels: s.zoneDaniels, // la séance reste identifiée mais le volume est écrêté
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

  const semainesAvecSeances = semaines.map((semaineContexte) => {
    const slots = composerSemaine(semaineContexte.phase, inputs.discipline, inputs.nbSeancesHebdo ?? 4);
    const renfo = renfoPourPhase(semaineContexte.phase);
    const seances = slots
      .map((slot) => trouverTemplate(slot.catalogueId))
      .filter(Boolean)
      .map((tpl) => instancierSeance(tpl, profilCourant, semaineContexte, {}, objectifPaceMinParKm));
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
