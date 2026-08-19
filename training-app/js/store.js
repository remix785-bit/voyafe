// État applicatif central — wrappe IndexedDB (db.js) + moteurs de calcul.
// Règle multi-objectifs (Partie II §9) : plusieurs Plan peuvent exister, un
// seul a le statut 'actif'. Aucune fusion de charge entre plans.

import * as db from "./data/db.js";
import { genererPlanComplet } from "./engines/planGenerator.js";
import { loadSummary } from "./engines/load.js";
import { evaluerBoucleAdaptative, detecterRetestImplicite } from "./engines/adaptiveLoop.js";

const listeners = new Set();

const state = {
  ready: false,
  profil: null, // ProfilUtilisateur
  plans: [], // tous les plans (statut en_attente/actif/termine)
  logsQuotidiens: [], // tri chronologique
  seancesRealisees: [],
  historiqueAjustements: [],
  reglages: { theme: "dark", githubToken: "", githubOwner: "", githubRepo: "", stravaToken: "" },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

export async function init() {
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
  state.ready = true;
  notify();
}

export function planActif() {
  return state.plans.find((p) => p.statut === "actif") ?? null;
}

export async function enregistrerProfil(performanceRef, weightKg, disponibiliteHebdo) {
  const id = state.profil?.id ?? db.newId("profil");
  const profil = {
    id,
    performanceRef,
    weightKg,
    disponibiliteHebdo,
    historiqueVdot: [...(state.profil?.historiqueVdot ?? [])],
  };
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

  if (state.profil) {
    state.profil.historiqueVdot = [
      ...(state.profil.historiqueVdot ?? []),
      { date: new Date().toISOString(), vdot: plan.profilCourant.vdot },
    ];
    await db.put("profil", state.profil);
  }

  notify();
  return plan;
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
  // Approximation : charge journalière = RPE déclaré du log × 30 (faute de TRIMP/Strava réel).
  return state.logsQuotidiens.map((l) => (l.rpe ?? 0) * 30);
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
  localStorage.setItem("voyafe-settings", JSON.stringify(state.reglages));
  notify();
}

export { detecterRetestImplicite };
