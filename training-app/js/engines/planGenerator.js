// Générateur de plan d'entraînement — macrocycle en phases + microcycles.
// Cadrage produit Section 2 (macrocycle) et Section 3 (microcycle).
// Architecture volontairement modulaire : les sections 5+ du doc technique
// (calage précis sur l'objectif, affûtage détaillé, boucle adaptative)
// viendront affiner ce moteur sans le refactorer (voir TODOs).

import { SESSIONS_ROUTE } from "../catalog/sessionsRoute.js";
import { SESSIONS_TRAIL } from "../catalog/sessionsTrail.js";

// Fenêtres de préparation utiles (doc technique Section 2).
export const PREP_WINDOW_WEEKS = { route: 18, trail: 22 };
export const MIN_WEEKS_FOR_FULL_CYCLE = 6;

// Plafonds hebdo de part du volume par zone d'intensité (doc technique Section 3).
export const ZONE_CAPS = { T: 0.1, I: 0.08, R: 0.05 };

const VOLUME_BASE_KM_BY_NIVEAU = {
  debutant: 25,
  intermediaire: 40,
  avance: 60,
};

// Facteurs de progression intra-phase (non linéaire), avec décharge en fin
// de bloc de 3-4 semaines (doc technique Section 3).
const BLOCK_FACTORS_4W = [0.85, 1.0, 1.15, 0.75];
const BLOCK_FACTORS_3W = [0.9, 1.05, 0.75];

function catalogFor(type) {
  return type === "trail" ? SESSIONS_TRAIL : SESSIONS_ROUTE;
}

function sessionsOfType(type, catalogType, phase) {
  return catalogFor(type).filter((s) => s.type === catalogType && s.phases.includes(phase));
}

/** Choisit une variante en rotation (modulo) pour éviter la monotonie. */
function pickVariant(candidates, index) {
  if (candidates.length === 0) return null;
  return candidates[index % candidates.length];
}

// Préférence de dénivelé (élévation) pour la sélection de séances trail en
// phase développement (doc technique Section 4 / cadrage produit) : un
// objectif avec beaucoup de D+/km doit privilégier des séances taguées
// dénivelé plus exigeant (`elevationTag`), tout en gardant la rotation pour
// éviter la monotonie.
const ELEVATION_TIER_TAGS = {
  eleve: ["soutenu", "progressif", "specifique"],
  modere: ["progressif", "leger", "specifique"],
  faible: ["leger", "plat"],
};

/** Palier de dénivelé (m/km) : eleve >= 30 m/km, modere >= 15 m/km, sinon faible. */
export function elevationTierFor(deniveleM, distanceKm) {
  if (!deniveleM || !distanceKm) return null;
  const ratio = deniveleM / distanceKm;
  if (ratio >= 30) return "eleve";
  if (ratio >= 15) return "modere";
  return "faible";
}

/** Comme pickVariant, mais priorise les séances dont l'elevationTag colle au palier de D+ de l'objectif. */
function pickVariantWithElevation(candidates, index, tier) {
  if (candidates.length === 0) return null;
  if (!tier) return pickVariant(candidates, index);
  const preferredTags = ELEVATION_TIER_TAGS[tier] ?? [];
  const preferred = candidates.filter((c) => preferredTags.includes(c.elevationTag));
  const pool = preferred.length > 0 ? preferred : candidates;
  return pickVariant(pool, index);
}

function weeksBetween(dateDebut, dateCourse) {
  const ms = new Date(dateCourse) - new Date(dateDebut);
  return Math.max(1, Math.round(ms / (7 * 24 * 3600 * 1000)));
}

/**
 * Découpe le nombre total de semaines en phases (base/développement/affûtage).
 * Base plus longue si niveau débutant. Développement plus long en trail
 * (accumulation progressive du dénivelé).
 */
export function computePhasePlan(totalWeeks, { type, niveau }) {
  if (totalWeeks < MIN_WEEKS_FOR_FULL_CYCLE) {
    return {
      mode: "gestion_forme_existante",
      phases: [{ name: "affutage", weeks: totalWeeks }],
    };
  }
  const taperWeeks = totalWeeks <= 10 ? 1 : totalWeeks <= 16 ? 2 : 3;
  const remaining = totalWeeks - taperWeeks;

  let baseShare = niveau === "debutant" ? 0.45 : niveau === "avance" ? 0.3 : 0.38;
  if (type === "trail") baseShare -= 0.05; // développement plus long en trail

  const baseWeeks = Math.max(2, Math.round(remaining * baseShare));
  const devWeeks = Math.max(2, remaining - baseWeeks);

  return {
    mode: "cycle_complet",
    phases: [
      { name: "base", weeks: baseWeeks },
      { name: "developpement", weeks: devWeeks },
      { name: "affutage", weeks: taperWeeks },
    ],
  };
}

/** Étend le plan de phases en une liste plate {phase, indexInPhase}. */
function expandPhaseWeeks(phasePlan) {
  const weeks = [];
  for (const phase of phasePlan.phases) {
    for (let i = 0; i < phase.weeks; i++) {
      weeks.push({ phase: phase.name, indexInPhase: i, phaseTotalWeeks: phase.weeks });
    }
  }
  return weeks;
}

/** Facteur de volume + drapeau décharge pour une semaine donnée d'une phase. */
function volumeFactorForWeek(indexInPhase, phaseTotalWeeks) {
  const blockLen = phaseTotalWeeks >= 4 ? 4 : 3;
  const factors = blockLen === 4 ? BLOCK_FACTORS_4W : BLOCK_FACTORS_3W;
  const posInBlock = indexInPhase % blockLen;
  const factor = factors[Math.min(posInBlock, factors.length - 1)];
  const decharge = posInBlock === factors.length - 1;
  return { factor, decharge };
}

const PHASE_VOLUME_MULTIPLIER = { base: 1.0, developpement: 1.15, affutage: 0.6 };

function sessionsPerWeek(niveau) {
  return { debutant: 3, intermediaire: 4, avance: 6 }[niveau] ?? 4;
}

/**
 * Construit les séances d'une semaine en respectant les plafonds de zone,
 * l'espacement des séances de qualité (>=48h) et un footing de récup après
 * une séance dure.
 */
function buildWeekSessions({ type, phase, weekIndex, volumeKm, niveauCount, mode, deniveleM, distanceKm }) {
  const sessions = [];
  const catalog = catalogFor(type);
  const dayOffsets = [];
  const step = niveauCount > 1 ? Math.floor(6 / (niveauCount - 1)) || 1 : 0;
  for (let i = 0; i < niveauCount; i++) dayOffsets.push(Math.min(6, i * step));

  const elevationTier = type === "trail" && phase === "developpement" ? elevationTierFor(deniveleM, distanceKm) : null;

  const longue = pickVariantWithElevation(
    sessionsOfType(type, "longue", phase === "gestion_forme_existante" ? "affutage" : phase),
    weekIndex,
    elevationTier
  );
  const includeQuality = phase !== "base" || weekIndex % 2 === 1;
  const qualityZones = [];
  if (phase === "developpement") {
    qualityZones.push(weekIndex % 2 === 0 ? "T" : "I");
    if (niveauCount >= 5) qualityZones.push("R");
  } else if (phase === "affutage") {
    qualityZones.push(weekIndex % 2 === 0 ? "T" : "R");
  } else if (phase === "base" && includeQuality) {
    qualityZones.push("R");
  }

  const zoneVolumeKm = { T: 0, I: 0, R: 0 };
  const zoneFractionTarget = { T: 0.08, I: 0.06, R: 0.03 };

  let dayIdx = 0;
  let lastQualityDay = -Infinity;
  const usedDays = new Set();

  if (longue) {
    const day = dayOffsets[dayOffsets.length - 1] ?? 6;
    sessions.push(toPlannedSession(longue, volumeKm * 0.28, day));
    usedDays.add(day);
  }

  for (const zone of qualityZones) {
    const catalogType = zone;
    const variants = sessionsOfType(type, catalogType, phase === "gestion_forme_existante" ? "affutage" : phase);
    const chosen = pickVariantWithElevation(variants, weekIndex + zone.charCodeAt(0), elevationTier);
    if (!chosen) continue;
    const desiredKm = Math.min(volumeKm * zoneFractionTarget[zone], volumeKm * ZONE_CAPS[zone]);
    const day = dayOffsets[dayIdx % dayOffsets.length];
    if ((day - lastQualityDay < 2 && sessions.length > 0) || usedDays.has(day)) {
      dayIdx++;
      continue;
    }
    sessions.push(toPlannedSession(chosen, desiredKm, day));
    zoneVolumeKm[zone] += desiredKm;
    usedDays.add(day);
    lastQualityDay = day;
    dayIdx++;

    const recupVariants = sessionsOfType(type, "recuperation", "base");
    const recup = pickVariant(recupVariants, weekIndex);
    const recupDay = Math.min(6, day + 1);
    if (recup && dayIdx < dayOffsets.length && !usedDays.has(recupDay)) {
      sessions.push(toPlannedSession(recup, volumeKm * 0.08, recupDay));
      usedDays.add(recupDay);
    }
  }

  const usedKm = sessions.reduce((s, x) => s + x.targetVolumeKm, 0);
  const remainingSlots = Math.max(0, niveauCount - sessions.length);
  const remainingKm = Math.max(0, volumeKm - usedKm);
  const eVariants = sessionsOfType(type, "E", phase === "gestion_forme_existante" ? "affutage" : phase);
  const freeDays = dayOffsets.filter((d) => !usedDays.has(d));
  for (let i = 0; i < remainingSlots; i++) {
    const chosen = pickVariantWithElevation(eVariants, weekIndex + i, elevationTier);
    if (!chosen) continue;
    const day = freeDays[i] ?? dayOffsets[i % dayOffsets.length];
    sessions.push(toPlannedSession(chosen, remainingKm / remainingSlots, day));
    usedDays.add(day);
  }

  return { sessions: sessions.sort((a, b) => a.dayOffset - b.dayOffset), zoneVolumeKm };
}

function toPlannedSession(catalogSession, targetVolumeKm, dayOffset) {
  return {
    catalogId: catalogSession.id,
    label: catalogSession.label,
    type: catalogSession.type,
    zone: catalogSession.zone,
    structure: catalogSession.structure,
    targetVolumeKm: Math.round(targetVolumeKm * 10) / 10,
    dayOffset,
  };
}

/**
 * Génère un plan complet pour un objectif.
 * @param {{
 *   type: 'route'|'trail', distanceKm: number, deniveleM?: number,
 *   dateCourse: string|Date, dateDebut?: string|Date,
 *   niveau: 'debutant'|'intermediaire'|'avance', vdot?: number,
 * }} objectif
 */
export function generatePlan(objectif) {
  const { type, niveau, dateCourse, deniveleM, distanceKm } = objectif;
  const dateDebut = objectif.dateDebut ?? new Date().toISOString().slice(0, 10);
  const totalWeeks = weeksBetween(dateDebut, dateCourse);
  const phasePlan = computePhasePlan(totalWeeks, { type, niveau });
  const phaseWeeks = expandPhaseWeeks(phasePlan);
  const baseVolume = VOLUME_BASE_KM_BY_NIVEAU[niveau] ?? VOLUME_BASE_KM_BY_NIVEAU.intermediaire;
  const niveauCount = sessionsPerWeek(niveau);

  const weeks = phaseWeeks.map((pw, globalIndex) => {
    const { factor, decharge } = volumeFactorForWeek(pw.indexInPhase, pw.phaseTotalWeeks);
    const phaseMultiplier = PHASE_VOLUME_MULTIPLIER[pw.phase] ?? 1;
    const volumeKm = Math.round(baseVolume * phaseMultiplier * factor);
    const { sessions, zoneVolumeKm } = buildWeekSessions({
      type,
      phase: phasePlan.mode === "gestion_forme_existante" ? "gestion_forme_existante" : pw.phase,
      weekIndex: globalIndex,
      volumeKm,
      niveauCount,
      mode: phasePlan.mode,
      deniveleM,
      distanceKm,
    });
    const startDate = addDays(dateDebut, globalIndex * 7);
    return {
      index: globalIndex,
      phase: pw.phase,
      decharge,
      startDate,
      targetVolumeKm: volumeKm,
      sessions,
      zoneVolumeKm,
      zoneFractions: Object.fromEntries(
        Object.entries(zoneVolumeKm).map(([z, km]) => [z, volumeKm > 0 ? Math.round((km / volumeKm) * 1000) / 1000 : 0])
      ),
    };
  });

  return {
    mode: phasePlan.mode,
    type,
    totalWeeks,
    dateDebut,
    dateCourse: new Date(dateCourse).toISOString().slice(0, 10),
    phases: phasePlan.phases,
    weeks,
  };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Recalcule le reste du plan à partir d'une semaine donnée suite à un aléa
 * (blessure/maladie/voyage) — cadrage produit Section 9. Réinjecte une
 * semaine de reprise progressive puis reprend la progression normale.
 * @param {ReturnType<typeof generatePlan>} plan
 * @param {number} fromWeekIndex première semaine affectée
 * @param {{raison: string, semainesReduites?: number}} alea
 */
export function recalculerApresAlea(plan, fromWeekIndex, alea) {
  const semainesReduites = alea.semainesReduites ?? 1;
  const weeks = plan.weeks.map((w) => ({ ...w, sessions: w.sessions.map((s) => ({ ...s })) }));
  for (let i = fromWeekIndex; i < Math.min(weeks.length, fromWeekIndex + semainesReduites); i++) {
    const reduction = 0.5;
    weeks[i] = {
      ...weeks[i],
      targetVolumeKm: Math.round(weeks[i].targetVolumeKm * reduction),
      sessions: weeks[i].sessions
        .filter((s) => s.type !== "I" && s.type !== "T")
        .map((s) => ({ ...s, targetVolumeKm: Math.round(s.targetVolumeKm * reduction * 10) / 10 })),
      ajuste: { raison: alea.raison },
    };
  }
  return { ...plan, weeks };
}
