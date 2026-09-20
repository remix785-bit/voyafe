// Couche d'accès aux données — au-dessus du wrapper IndexedDB (db.js).
// Centralise le modèle de données de l'app (saisons, objectifs, plans,
// séances, journal, résultats, renfo) pour que l'UI ne manipule pas
// directement les stores.

import * as db from "./db.js";
import { generatePlan, recalculerApresAlea } from "../engines/planGenerator.js";
import { vdotFromPerformance } from "../engines/vdot.js";

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

/**
 * Marque une séance comme manquée pour un aléa (blessure/maladie/voyage) et
 * déclenche le recalcul du reste du plan (cadrage produit Section 9).
 */
export async function marquerAlea(seanceId, raison) {
  const seance = await db.get("seances", seanceId);
  seance.status = "manquee";
  seance.log = { aleaRaison: raison };
  await db.put("seances", seance);

  const plan = await db.get("plans", seance.planId);
  const seances = await listSeancesByPlan(plan.id);
  const generated = {
    weeks: groupSeancesByWeek(seances),
  };
  const adjusted = recalculerApresAlea(generated, seance.weekIndex, { raison, semainesReduites: 1 });
  const affectedWeek = adjusted.weeks.find((w) => w.index === seance.weekIndex);
  if (affectedWeek) {
    for (const s of affectedWeek.sessions) {
      await db.put("seances", s);
    }
  }
  return seance;
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
