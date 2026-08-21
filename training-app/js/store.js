// État applicatif central — wrappe IndexedDB (db.js) + moteurs de calcul.
// Règle multi-objectifs (Partie II §9) : plusieurs Plan peuvent exister, un
// seul a le statut 'actif'. Aucune fusion de charge entre plans.

import * as db from "./data/db.js";
import { genererPlanComplet } from "./engines/planGenerator.js";
import { vdotFromPerformance } from "./engines/vdot.js";
import { loadSummary } from "./engines/load.js";
import { evaluerBoucleAdaptative, detecterRetestImplicite } from "./engines/adaptiveLoop.js";
import {
  listerActivites,
  calculerEcart,
  estimerChargeJournaliere,
  urlAutorisation,
  echangerCode,
  rafraichirToken,
  verifierAcces as verifierAccesStrava,
} from "./data/stravaSync.js";
import { lireFichier, synchroniserFichier } from "./data/githubSync.js";

const GITHUB_DATA_PATH = "voyafe-training-data.json";

const listeners = new Set();

const state = {
  ready: false,
  profil: null, // ProfilUtilisateur
  plans: [], // tous les plans (statut en_attente/actif/termine)
  logsQuotidiens: [], // tri chronologique
  seancesRealisees: [],
  historiqueAjustements: [],
  reglages: {
    theme: "dark",
    githubToken: "",
    githubOwner: "",
    githubRepo: "",
    stravaClientId: "",
    stravaClientSecret: "",
    stravaAccessToken: "",
    stravaRefreshToken: "",
    stravaExpiresAt: 0,
    stravaAthleteNom: "",
    githubDerniereSyncLe: null,
    githubDerniereErreur: null,
  },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
  // Toute mutation de données après le chargement initial déclenche une
  // sauvegarde GitHub différée (si configuré) — le "push après chaque
  // écriture" documenté comme reste à faire (Partie III §4). Le pull initial
  // (init(), avant que state.ready ne passe à true) ne doit pas se
  // re-déclencher un push immédiat de ce qu'on vient de recevoir.
  if (state.ready) planifierSyncGithub();
}

export function getState() {
  return state;
}

async function chargerEtatDepuisDb() {
  const [profils, plans, logs, realisees, ajustements] = await Promise.all([
    db.getAll("profil"),
    db.getAll("plans"),
    db.getAll("logsQuotidiens"),
    db.getAll("seancesRealisees"),
    db.getAll("historiqueAjustements"),
  ]);
  state.profil = profils[0] ?? null;
  state.plans = plans;
  state.logsQuotidiens = logs.sort((a, b) => a.date.localeCompare(b.date));
  state.seancesRealisees = realisees;
  state.historiqueAjustements = ajustements;
}

export async function init() {
  await chargerEtatDepuisDb();

  const savedTheme = localStorage.getItem("voyafe-theme");
  if (savedTheme) state.reglages.theme = savedTheme;
  const savedSettings = localStorage.getItem("voyafe-settings");
  if (savedSettings) {
    try {
      Object.assign(state.reglages, JSON.parse(savedSettings));
    } catch {
      /* ignore corrupted local settings */
    }
  }
  applyTheme();

  // Pull au démarrage (Partie III §4) — uniquement pour amorcer un appareil
  // sans données locales : ne jamais écraser silencieusement un IndexedDB
  // déjà peuplé avec ce qui est sur GitHub (le push après chaque écriture
  // maintient GitHub à jour dans l'autre sens en continu).
  if (!state.profil && githubConfigure()) {
    try {
      await tirerDepuisGithub();
    } catch (err) {
      console.warn("Pull GitHub au démarrage échoué :", err.message);
    }
  }

  state.ready = true;
  notify();
}

function githubConfigure() {
  const { githubOwner, githubRepo, githubToken } = state.reglages;
  return Boolean(githubOwner && githubRepo && githubToken);
}

/** Récupère le dump distant et remplace l'état local par son contenu. */
async function tirerDepuisGithub() {
  const { githubOwner, githubRepo, githubToken } = state.reglages;
  const resultat = await lireFichier({
    owner: githubOwner,
    repo: githubRepo,
    token: githubToken,
    path: GITHUB_DATA_PATH,
  });
  if (!resultat?.content?.donnees) return false;
  await db.restoreAll(resultat.content.donnees);
  await chargerEtatDepuisDb();
  return true;
}

let githubSyncTimer = null;

/** Programme un push GitHub différé (regroupe les écritures rapprochées en un seul commit). */
function planifierSyncGithub() {
  if (!githubConfigure()) return;
  clearTimeout(githubSyncTimer);
  githubSyncTimer = setTimeout(() => {
    pousserVersGithub().catch((err) => console.warn("Sync GitHub échouée :", err.message));
  }, 3000);
}

/** Pousse un dump complet des données locales vers le dépôt GitHub configuré. */
async function pousserVersGithub() {
  if (!githubConfigure()) return;
  const { githubOwner, githubRepo, githubToken } = state.reglages;
  try {
    const donnees = await db.dumpAll();
    await synchroniserFichier({
      owner: githubOwner,
      repo: githubRepo,
      token: githubToken,
      path: GITHUB_DATA_PATH,
      data: { exporteLe: new Date().toISOString(), version: 1, donnees },
    });
    state.reglages.githubDerniereSyncLe = new Date().toISOString();
    state.reglages.githubDerniereErreur = null;
  } catch (err) {
    state.reglages.githubDerniereErreur = err.message;
    throw err;
  } finally {
    persistReglages();
    for (const fn of listeners) fn(state); // notify() sans re-déclencher une synchro
  }
}

/** Déclenche une synchronisation GitHub immédiate (bouton "Synchroniser maintenant"). */
export async function synchroniserGithubMaintenant() {
  if (!githubConfigure()) {
    throw new Error("Configure d'abord Propriétaire / Dépôt / Token GitHub.");
  }
  clearTimeout(githubSyncTimer);
  await pousserVersGithub();
}

export function planActif() {
  return state.plans.find((p) => p.statut === "actif") ?? null;
}

/**
 * Enregistre le profil (performance de référence, poids, disponibilité).
 * Journalise un nouveau point d'historique VDOT quand la performance de
 * référence (distance/temps) a réellement changé par rapport à l'enregistrement
 * précédent — c'est-à-dire un retest — pas à chaque sauvegarde (modifier
 * seulement le poids ou la disponibilité ne doit pas polluer l'historique
 * VDOT de doublons). C'est l'unique point d'écriture de historiqueVdot :
 * creerPlan/modifierPlan lisent ensuite ce même profil sans re-journaliser,
 * pour ne jamais dupliquer l'entrée d'un même test.
 */
export async function enregistrerProfil(performanceRef, weightKg, disponibiliteHebdo) {
  const id = state.profil?.id ?? db.newId("profil");
  const ancien = state.profil;
  const performanceChangee =
    !ancien ||
    ancien.performanceRef.distanceM !== performanceRef.distanceM ||
    ancien.performanceRef.tempsS !== performanceRef.tempsS;

  const historiqueVdot = [...(ancien?.historiqueVdot ?? [])];
  if (performanceChangee) {
    const { vdot } = vdotFromPerformance(performanceRef.distanceM, performanceRef.tempsS);
    historiqueVdot.push({ date: performanceRef.dateTest ?? new Date().toISOString(), vdot });
  }

  const profil = { id, performanceRef, weightKg, disponibiliteHebdo, historiqueVdot };
  await db.put("profil", profil);
  state.profil = profil;
  notify();
  return profil;
}

/** Étapes ①→④ : génère un plan complet et le range en 'en_attente'. */
export async function creerPlan(inputs) {
  const plan = genererPlanComplet(inputs);
  plan.id = db.newId("plan");
  plan.discipline = inputs.discipline;
  plan.objectif = inputs.objectif;
  plan.dateEcheance = inputs.dateEcheance;
  plan.creeLe = new Date().toISOString();

  // Aucun autre plan actif -> celui-ci passe actif immédiatement.
  const aUnPlanActif = state.plans.some((p) => p.statut === "actif");
  plan.statut = aUnPlanActif ? "en_attente" : "actif";

  await db.put("plans", plan);
  state.plans.push(plan);

  notify();
  return plan;
}

/**
 * Met à jour un plan existant (distance/temps objectif, échéance, discipline,
 * charge, disponibilité...) en régénérant les étapes ①→④ avec les nouveaux
 * inputs, tout en conservant l'identité du plan (id, statut) et l'historique
 * des séances déjà passées (réalisée/manquée + note) pour les semaines dont
 * la date de début est révolue — best-effort par numéro de semaine + zone.
 */
export async function modifierPlan(planId, inputs) {
  const ancien = state.plans.find((p) => p.id === planId);
  if (!ancien) throw new Error("Plan introuvable.");

  const nouveau = genererPlanComplet(inputs);
  nouveau.id = ancien.id;
  nouveau.statut = ancien.statut;
  nouveau.discipline = inputs.discipline;
  nouveau.objectif = inputs.objectif;
  nouveau.dateEcheance = inputs.dateEcheance;
  nouveau.creeLe = ancien.creeLe;
  nouveau.modifieLe = new Date().toISOString();

  const maintenant = new Date();
  for (const semaine of nouveau.semaines) {
    if (new Date(semaine.dateDebut) > maintenant) continue;
    const ancienneSemaine = ancien.semaines.find((s) => s.numero === semaine.numero);
    if (!ancienneSemaine) continue;
    for (const seance of semaine.seances) {
      const ancienneSeance = ancienneSemaine.seances.find(
        (s) => s.zoneDaniels === seance.zoneDaniels && s.statut !== "a_venir"
      );
      if (ancienneSeance) {
        seance.statut = ancienneSeance.statut;
        if (ancienneSeance.note) seance.note = ancienneSeance.note;
      }
    }
  }

  await db.put("plans", nouveau);
  const idx = state.plans.findIndex((p) => p.id === planId);
  state.plans[idx] = nouveau;

  notify();
  return nouveau;
}

export async function marquerSeanceStatut(planId, semaineNumero, seanceIndex, statut, note) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return;
  const semaine = plan.semaines.find((s) => s.numero === semaineNumero);
  if (!semaine) return;
  const seance = semaine.seances[seanceIndex];
  if (!seance) return;
  seance.statut = statut;
  if (note) seance.note = note;
  await db.put("plans", plan);
  notify();
}

export async function ajouterLogQuotidien(log) {
  const record = { id: db.newId("log"), date: new Date().toISOString().slice(0, 10), ...log };
  await db.put("logsQuotidiens", record);
  state.logsQuotidiens.push(record);
  state.logsQuotidiens.sort((a, b) => a.date.localeCompare(b.date));
  notify();
  return record;
}

export function chargeHebdoDepuisLogs() {
  // Charge journalière : durée RÉELLE de l'activité Strava synchronisée (×
  // le RPE déclaré ce jour-là si connu, sinon un RPE par défaut) quand elle
  // existe — sinon repli sur l'approximation RPE déclaré × 30 (faute de mieux
  // sans données objectives ce jour-là).
  const parJour = new Map();
  for (const log of state.logsQuotidiens) {
    parJour.set(log.date, (log.rpe ?? 0) * 30);
  }
  for (const seance of state.seancesRealisees) {
    const jour = seance.date.slice(0, 10);
    const logDuJour = state.logsQuotidiens.find((l) => l.date === jour);
    const charge = estimerChargeJournaliere({ moving_time: seance.dureeMin * 60 }, logDuJour?.rpe ?? 5);
    parJour.set(jour, charge);
  }
  return Array.from(parJour.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, charge]) => charge);
}

/**
 * Cherche, dans le plan donné, la première séance encore "à venir" datée
 * exactement sur le jour indiqué — pour rapprocher une activité Strava
 * synchronisée de la séance planifiée correspondante.
 */
function trouverSeancePlanifieePourJour(plan, jourISO) {
  for (const semaine of plan.semaines) {
    const index = semaine.seances.findIndex((s) => s.date && s.date.slice(0, 10) === jourISO && s.statut === "a_venir");
    if (index !== -1) return { semaine, index, seance: semaine.seances[index] };
  }
  return null;
}

/**
 * URL vers laquelle rediriger pour connecter le compte Strava une seule fois
 * (Client ID/Secret déjà enregistrés en amont). Après retour de Strava, voir
 * finaliserConnexionStrava.
 */
export function demarrerConnexionStrava() {
  const clientId = state.reglages.stravaClientId;
  if (!clientId) throw new Error("Renseigne d'abord le Client ID Strava.");
  const redirectUri = `${location.origin}${location.pathname}`;
  location.href = urlAutorisation({ clientId, redirectUri });
}

/** Échange le `code` reçu dans l'URL de retour Strava contre les jetons durables. */
export async function finaliserConnexionStrava(code) {
  const { stravaClientId, stravaClientSecret } = state.reglages;
  if (!stravaClientId || !stravaClientSecret) {
    throw new Error("Client ID / Client Secret Strava manquants.");
  }
  const jetons = await echangerCode({ clientId: stravaClientId, clientSecret: stravaClientSecret, code });
  state.reglages.stravaAccessToken = jetons.access_token;
  state.reglages.stravaRefreshToken = jetons.refresh_token;
  state.reglages.stravaExpiresAt = jetons.expires_at;
  state.reglages.stravaAthleteNom = jetons.athlete ? `${jetons.athlete.firstname} ${jetons.athlete.lastname}` : "";
  persistReglages();
  notify();
}

export function deconnecterStrava() {
  Object.assign(state.reglages, {
    stravaAccessToken: "",
    stravaRefreshToken: "",
    stravaExpiresAt: 0,
    stravaAthleteNom: "",
  });
  persistReglages();
  notify();
}

/**
 * Retourne un access_token Strava garanti valide, en le renouvelant via le
 * refresh_token (durable) s'il est expiré ou sur le point de l'être — c'est
 * ce qui évite d'avoir à recoller un token manuellement toutes les 6h.
 */
async function tokenStravaValide() {
  const { stravaAccessToken, stravaRefreshToken, stravaExpiresAt, stravaClientId, stravaClientSecret } =
    state.reglages;
  if (!stravaRefreshToken) {
    throw new Error("Strava non connecté — clique sur « Se connecter à Strava » dans Réglages.");
  }
  const maintenant = Math.floor(Date.now() / 1000);
  if (stravaAccessToken && maintenant < stravaExpiresAt - 60) {
    return stravaAccessToken;
  }
  const jetons = await rafraichirToken({
    clientId: stravaClientId,
    clientSecret: stravaClientSecret,
    refreshToken: stravaRefreshToken,
  });
  state.reglages.stravaAccessToken = jetons.access_token;
  state.reglages.stravaRefreshToken = jetons.refresh_token;
  state.reglages.stravaExpiresAt = jetons.expires_at;
  persistReglages();
  return state.reglages.stravaAccessToken;
}

export async function testerConnexionStrava() {
  const token = await tokenStravaValide();
  return verifierAccesStrava({ token });
}

function persistReglages() {
  localStorage.setItem("voyafe-settings", JSON.stringify(state.reglages));
}

/**
 * Synchronise les activités Strava récentes (Partie III §5, Étape ⑤ Partie
 * II §6) : ingère les nouvelles activités, les rapproche d'une séance
 * planifiée du même jour quand il y en a une (marquée "réalisée"
 * automatiquement — c'est un fait, pas une proposition de la boucle
 * adaptative), et alimente le moteur de charge via chargeHebdoDepuisLogs.
 * @param {number} joursHistorique fenêtre de récupération (jours)
 */
export async function synchroniserStrava(joursHistorique = 14) {
  const token = await tokenStravaValide();

  const after = Math.floor((Date.now() - joursHistorique * 24 * 60 * 60 * 1000) / 1000);
  const activites = await listerActivites({ token, after, perPage: 50 });
  const plan = planActif();

  let nouvelles = 0;
  let rapprochees = 0;

  for (const activite of activites) {
    if (state.seancesRealisees.some((s) => s.stravaId === activite.id)) continue;

    const jour = new Date(activite.start_date ?? activite.start_date_local).toISOString().slice(0, 10);
    const correspondance = plan ? trouverSeancePlanifieePourJour(plan, jour) : null;
    const ecart = calculerEcart(activite, correspondance?.seance ?? null);

    const record = {
      id: db.newId("realisee"),
      stravaId: activite.id,
      nom: activite.name ?? "Activité Strava",
      date: activite.start_date ?? new Date(activite.start_date_local).toISOString(),
      distanceKm: ecart.distanceKm,
      dureeMin: ecart.dureeMin,
      deniveleM: ecart.deniveleM,
      allureMoyenneMinParKm: ecart.allureMoyenneMinParKm,
      ecart: ecart.ecart,
      planId: plan?.id ?? null,
      semaineNumero: correspondance?.semaine.numero ?? null,
      seanceIndex: correspondance?.index ?? null,
    };
    await db.put("seancesRealisees", record);
    state.seancesRealisees.push(record);
    nouvelles++;

    if (plan && correspondance) {
      await marquerSeanceStatut(plan.id, correspondance.semaine.numero, correspondance.index, "realisee");
      rapprochees++;
    }
  }

  state.reglages.stravaDerniereSyncLe = new Date().toISOString();
  persistReglages();
  notify();
  return { nouvelles, rapprochees, totalRecuperees: activites.length };
}

export function resumeCharge() {
  const loads = chargeHebdoDepuisLogs();
  if (loads.length < 7) return null;
  return loadSummary(loads);
}

export function evaluerAdaptation() {
  const rmssd = state.logsQuotidiens.map((l) => l.rmssd).filter((v) => v != null);
  const fcRepos = state.logsQuotidiens.map((l) => l.fcRepos).filter((v) => v != null);
  const bienEtre = state.logsQuotidiens.map((l) => l.bienEtre).filter((v) => v != null);
  const charge = resumeCharge();
  return evaluerBoucleAdaptative({ rmssd, fcRepos, bienEtre }, charge ?? { acwrEwma: 1, zone: "verte" });
}

export async function enregistrerPropositionDecision(proposition, decision) {
  const record = {
    id: db.newId("ajustement"),
    date: new Date().toISOString(),
    proposition,
    decision, // 'accepte' | 'refuse'
  };
  await db.put("historiqueAjustements", record);
  state.historiqueAjustements.push(record);
  notify();
  return record;
}

export function setTheme(theme) {
  state.reglages.theme = theme;
  localStorage.setItem("voyafe-theme", theme);
  applyTheme();
  notify();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.reglages.theme);
}

export function sauvegarderReglages(partial) {
  Object.assign(state.reglages, partial);
  persistReglages();
  notify();
}

export { detecterRetestImplicite };
