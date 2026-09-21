// Couche d'accès aux données — au-dessus du wrapper IndexedDB (db.js).
// Centralise le modèle de données de l'app (saisons, objectifs, plans,
// séances, journal, résultats, renfo) pour que l'UI ne manipule pas
// directement les stores.

import * as db from "./db.js";
import { generatePlan, recalculerApresAlea } from "../engines/planGenerator.js";
import { vdotFromPerformance } from "../engines/vdot.js";
import { renfoExcentriqueConflicts } from "../engines/load.js";

export async function listSaisons() {
  return db.getAll("saisons");
}

export async function createSaison({ nom, dateDebut, dateFin }) {
  const record = { id: db.genId("saison"), nom, dateDebut, dateFin };
  await db.put("saisons", record);
  return record;
}

export async function listObjectifs(saisonId) {
  const all = saisonId ? await db.getAllByIndex("objectifs", "saisonId", saisonId) : await db.getAll("objectifs");
  return all.sort((a, b) => new Date(a.dateCourse) - new Date(b.dateCourse));
}

export async function getObjectif(id) {
  return db.get("objectifs", id);
}

export async function createObjectif(data) {
  const record = {
    id: db.genId("objectif"),
    principal: false,
    type: "route",
    niveau: "intermediaire",
    priorite: "B",
    axeTravail: "equilibre",
    ...data,
  };
  await db.put("objectifs", record);
  return record;
}

export async function setObjectifPrincipal(saisonId, objectifId) {
  const objectifs = await listObjectifs(saisonId);
  for (const o of objectifs) {
    const shouldBePrincipal = o.id === objectifId;
    if (o.principal !== shouldBePrincipal) {
      o.principal = shouldBePrincipal;
      await db.put("objectifs", o);
    }
  }
}

export async function getObjectifPrincipal() {
  const objectifs = await db.getAll("objectifs");
  return objectifs.find((o) => o.principal) ?? null;
}

export async function getPlanForObjectif(objectifId) {
  const plans = await db.getAllByIndex("plans", "objectifId", objectifId);
  return plans.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))[0] ?? null;
}

/** Génère un plan pour un objectif et persiste plan + séances à plat. */
export async function generateAndSavePlan(objectif) {
  const vdot = await currentVdot();
  const generated = generatePlan({
    type: objectif.type,
    distanceKm: objectif.distanceKm,
    deniveleM: objectif.deniveleM,
    dateCourse: objectif.dateCourse,
    dateDebut: objectif.dateDebut,
    niveau: objectif.niveau,
    tempsViseS: objectif.tempsViseS,
    priorite: objectif.priorite,
    axeTravail: objectif.axeTravail,
    vdot,
  });

  const planId = db.genId("plan");
  const planRecord = {
    id: planId,
    objectifId: objectif.id,
    generatedAt: new Date().toISOString(),
    mode: generated.mode,
    totalWeeks: generated.totalWeeks,
    dateDebut: generated.dateDebut,
    dateCourse: generated.dateCourse,
    phases: generated.phases,
    prepWindowWarning: generated.prepWindowWarning,
    priorite: generated.priorite,
    axeTravail: generated.axeTravail,
    objectifFit: generated.objectifFit,
  };
  await db.put("plans", planRecord);

  for (const week of generated.weeks) {
    for (const session of week.sessions) {
      const date = addDays(week.startDate, session.dayOffset);
      const seance = {
        id: db.genId("seance"),
        planId,
        objectifId: objectif.id,
        weekIndex: week.index,
        phase: week.phase,
        decharge: week.decharge,
        date,
        catalogId: session.catalogId,
        label: session.label,
        type: session.type,
        zone: session.zone,
        structure: session.structure,
        targetVolumeKm: session.targetVolumeKm,
        pctAllureObjectif: session.pctAllureObjectif ?? null,
        runWalkSuggested: session.runWalkSuggested ?? false,
        status: "planifiee",
        log: null,
      };
      await db.put("seances", seance);
    }
  }
  return planRecord;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function listSeancesByPlan(planId) {
  const all = await db.getAllByIndex("seances", "planId", planId);
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function getSeance(id) {
  return db.get("seances", id);
}

export async function updateSeance(seance) {
  await db.put("seances", seance);
  return seance;
}

export async function logSeance(id, log) {
  const seance = await db.get("seances", id);
  if (!seance) throw new Error("Séance introuvable");
  seance.log = log;
  seance.status = log.aleaRaison ? "modifiee" : "realisee";
  await db.put("seances", seance);
  return seance;
}

// Boucle adaptative (doc technique Section 11) : une séance manquée isolée
// ne justifie généralement pas de recalcul (la reprendre ou l'omettre
// suffit). Seule une série de séances manquées ou une coupure prolongée
// doit déclencher une réévaluation — reprendre directement au niveau
// pré-coupure exposerait à un pic ACWR. Seuils choisis : >=3 séances
// manquées sur les 14 derniers jours (série), ou une coupure explicitement
// déclarée d'au moins 5 jours sans courir.
export const SERIE_MANQUEES_SEUIL = 3;
export const SERIE_MANQUEES_FENETRE_JOURS = 14;
export const COUPURE_JOURS_SEUIL = 5;

/**
 * Marque une séance comme manquée pour un aléa (blessure/maladie/voyage).
 * Ne recalcule le reste du plan que si le critère de "série" ou de
 * "coupure prolongée" est atteint (doc technique Section 11) ; une séance
 * isolée est simplement marquée manquée, sans réduction de charge.
 * @param {string} seanceId
 * @param {string} raison
 * @param {{coupureJours?: number}} [options]
 */
export async function marquerAlea(seanceId, raison, options = {}) {
  const seance = await db.get("seances", seanceId);
  seance.status = "manquee";
  seance.log = { aleaRaison: raison };
  await db.put("seances", seance);

  const plan = await db.get("plans", seance.planId);
  const seances = await listSeancesByPlan(plan.id);

  const seuilDate = new Date(seance.date);
  seuilDate.setDate(seuilDate.getDate() - SERIE_MANQUEES_FENETRE_JOURS);
  const manqueesRecentes = seances.filter((s) => s.status === "manquee" && new Date(s.date) >= seuilDate && new Date(s.date) <= new Date(seance.date));
  const coupureJours = options.coupureJours ?? 0;
  const estSerie = manqueesRecentes.length >= SERIE_MANQUEES_SEUIL;
  const estCoupureProlongee = coupureJours >= COUPURE_JOURS_SEUIL;
  const recalcule = estSerie || estCoupureProlongee;

  if (!recalcule) {
    return { seance, recalcule: false, isole: true, manqueesRecentes: manqueesRecentes.length };
  }

  const generated = { weeks: groupSeancesByWeek(seances) };
  const semainesReduites = estCoupureProlongee ? Math.max(1, Math.ceil(coupureJours / 7)) : 1;
  const adjusted = recalculerApresAlea(generated, seance.weekIndex, { raison, semainesReduites });
  const affectedWeekIndexes = new Set();
  for (let i = seance.weekIndex; i < seance.weekIndex + semainesReduites; i++) affectedWeekIndexes.add(i);
  for (const w of adjusted.weeks) {
    if (!affectedWeekIndexes.has(w.index)) continue;
    for (const s of w.sessions) {
      await db.put("seances", s);
    }
  }
  return { seance, recalcule: true, isole: false, estSerie, estCoupureProlongee, manqueesRecentes: manqueesRecentes.length };
}

function groupSeancesByWeek(seances) {
  const byWeek = new Map();
  for (const s of seances) {
    if (!byWeek.has(s.weekIndex)) byWeek.set(s.weekIndex, { index: s.weekIndex, targetVolumeKm: 0, sessions: [] });
    const w = byWeek.get(s.weekIndex);
    w.targetVolumeKm += s.targetVolumeKm;
    w.sessions.push(s);
  }
  return [...byWeek.values()];
}

export async function listJournal() {
  const all = await db.getAll("journal");
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function addJournalEntry(entry) {
  const record = { id: db.genId("journal"), ...entry };
  await db.put("journal", record);
  return record;
}

export async function listResultats() {
  const all = await db.getAll("resultats");
  return all.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export async function addResultat({ date, distanceM, tempsS, altitudeM, contexte }) {
  const { vdot, warnings } = vdotFromPerformance(distanceM, tempsS, { altitudeM });
  const record = {
    id: db.genId("resultat"),
    date,
    distanceM,
    tempsS,
    altitudeM: altitudeM ?? 0,
    contexte: contexte ?? "",
    vdot: Math.round(vdot * 10) / 10,
    warnings,
  };
  await db.put("resultats", record);
  return record;
}

export async function currentVdot() {
  const resultats = await listResultats();
  if (resultats.length === 0) return 40;
  return resultats[resultats.length - 1].vdot;
}

export async function currentVdotResultat() {
  const resultats = await listResultats();
  return resultats[resultats.length - 1] ?? null;
}

/**
 * Séances de qualité (T/I/R) ou sorties longues planifiées dans les
 * `delaiHeures` suivant une date de renfo excentrique — délai de sécurité
 * doc technique Section 9.
 */
export async function seancesEnConflitAvecRenfoExcentrique(renfoDate, delaiHeures = 48) {
  const plans = (await Promise.all((await listObjectifs()).map((o) => getPlanForObjectif(o.id)))).filter(Boolean);
  const allSeances = (await Promise.all(plans.map((p) => listSeancesByPlan(p.id)))).flat();
  return renfoExcentriqueConflicts(renfoDate, allSeances, delaiHeures);
}

export async function listRenfoLogs() {
  const all = await db.getAll("renfoLog");
  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function addRenfoLog(entry) {
  const record = { id: db.genId("renfo"), ...entry };
  await db.put("renfoLog", record);
  return record;
}

export async function getProfil() {
  const profil = await db.get("profil", "main");
  return profil ?? { id: "main", nom: "" };
}

export async function saveProfil(data) {
  const record = { id: "main", ...data };
  await db.put("profil", record);
  return record;
}
