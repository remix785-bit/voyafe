import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePlan,
  computePhasePlan,
  ZONE_CAPS,
  PREP_WINDOW_WEEKS,
  recalculerApresAlea,
  elevationTierFor,
} from "../js/engines/planGenerator.js";
import { SESSIONS_TRAIL } from "../js/catalog/sessionsTrail.js";

test("computePhasePlan: moins de 6 semaines -> gestion de forme existante", () => {
  const plan = computePhasePlan(4, { type: "route", niveau: "intermediaire" });
  assert.equal(plan.mode, "gestion_forme_existante");
});

test("computePhasePlan: cycle complet contient base/développement/affûtage", () => {
  const plan = computePhasePlan(18, { type: "route", niveau: "intermediaire" });
  assert.equal(plan.mode, "cycle_complet");
  const names = plan.phases.map((p) => p.name);
  assert.deepEqual(names, ["base", "developpement", "affutage"]);
  const total = plan.phases.reduce((s, p) => s + p.weeks, 0);
  assert.equal(total, 18);
});

test("generatePlan: nombre de semaines cohérent avec l'intervalle de dates", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 42.195,
    dateDebut: "2026-01-01",
    dateCourse: "2026-05-03",
    niveau: "intermediaire",
    vdot: 48,
  });
  assert.ok(plan.totalWeeks >= 16 && plan.totalWeeks <= 18, `totalWeeks: ${plan.totalWeeks}`);
  assert.equal(plan.weeks.length, plan.totalWeeks);
});

test("generatePlan: respecte les plafonds de volume par zone T/I/R chaque semaine", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 21.1,
    dateDebut: "2026-01-01",
    dateCourse: "2026-06-01",
    niveau: "avance",
    vdot: 52,
  });
  for (const week of plan.weeks) {
    for (const zone of ["T", "I", "R"]) {
      const fraction = week.zoneFractions[zone] ?? 0;
      assert.ok(
        fraction <= ZONE_CAPS[zone] + 1e-6,
        `Semaine ${week.index} (${week.phase}): zone ${zone} = ${fraction} > plafond ${ZONE_CAPS[zone]}`
      );
    }
  }
});

test("generatePlan: inclut des semaines de décharge", () => {
  const plan = generatePlan({
    type: "trail",
    distanceKm: 50,
    deniveleM: 3000,
    dateDebut: "2026-01-01",
    dateCourse: "2026-06-15",
    niveau: "intermediaire",
    vdot: 45,
  });
  const decharges = plan.weeks.filter((w) => w.decharge);
  assert.ok(decharges.length >= 2, `attendu au moins 2 semaines de décharge, trouvé ${decharges.length}`);
});

test("generatePlan: chaque semaine a au moins une séance", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 10,
    dateDebut: "2026-01-01",
    dateCourse: "2026-03-01",
    niveau: "debutant",
    vdot: 38,
  });
  for (const week of plan.weeks) {
    assert.ok(week.sessions.length > 0, `semaine ${week.index} sans séance`);
  }
});

test("elevationTierFor: classe le palier de dénivelé selon le ratio m/km", () => {
  assert.equal(elevationTierFor(3000, 50), "eleve"); // 60 m/km
  assert.equal(elevationTierFor(1000, 50), "modere"); // 20 m/km
  assert.equal(elevationTierFor(500, 50), "faible"); // 10 m/km
  assert.equal(elevationTierFor(0, 50), null);
});

test("generatePlan: un objectif trail avec beaucoup de D+ privilégie des séances dénivelé soutenu en développement", () => {
  const soutenuIds = new Set(SESSIONS_TRAIL.filter((s) => s.elevationTag === "soutenu").map((s) => s.id));

  const planFortDenivele = generatePlan({
    type: "trail",
    distanceKm: 50,
    deniveleM: 3500, // 70 m/km -> palier "eleve"
    dateDebut: "2026-01-01",
    dateCourse: "2026-06-15",
    niveau: "intermediaire",
    vdot: 45,
  });
  const planFaibleDenivele = generatePlan({
    type: "trail",
    distanceKm: 50,
    deniveleM: 300, // 6 m/km -> palier "faible"
    dateDebut: "2026-01-01",
    dateCourse: "2026-06-15",
    niveau: "intermediaire",
    vdot: 45,
  });

  const countSoutenu = (plan) =>
    plan.weeks
      .filter((w) => w.phase === "developpement")
      .flatMap((w) => w.sessions)
      .filter((s) => soutenuIds.has(s.catalogId)).length;

  assert.ok(
    countSoutenu(planFortDenivele) > countSoutenu(planFaibleDenivele),
    `attendu plus de séances "soutenu" avec fort D+ (${countSoutenu(planFortDenivele)}) qu'avec faible D+ (${countSoutenu(planFaibleDenivele)})`
  );
});

test("generatePlan: la cadence de décharge ne dépasse pas 4 semaines entre base et développement", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 42.195,
    dateDebut: "2026-01-01",
    dateCourse: "2026-05-10", // ~18 semaines, débutant -> base plus longue
    niveau: "debutant",
    vdot: 38,
  });
  const buildWeeks = plan.weeks.filter((w) => w.phase === "base" || w.phase === "developpement");
  const decharges = buildWeeks.filter((w) => w.decharge).map((w) => w.index);
  assert.ok(decharges.length >= 2, `attendu plusieurs décharges, trouvé ${decharges.length}`);
  for (let i = 1; i < decharges.length; i++) {
    const gap = decharges[i] - decharges[i - 1];
    assert.ok(gap <= 4, `écart entre décharges base/développement de ${gap} semaines (> 4) : ${decharges}`);
  }
});

test("generatePlan: plan court (<6 semaines) reste en mode maintien, sans ramp-up base/développement", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 10,
    dateDebut: "2026-01-01",
    dateCourse: "2026-01-29", // 4 semaines
    niveau: "intermediaire",
    vdot: 45,
  });
  assert.equal(plan.mode, "gestion_forme_existante");
  const volumes = plan.weeks.map((w) => w.targetVolumeKm);
  // Pas de vraie montée en charge : le volume ne doit jamais dépasser la
  // semaine de référence de plus de quelques %, jusqu'à l'affûtage anticipé.
  const ref = volumes[0];
  for (let i = 0; i < volumes.length - 1; i++) {
    assert.ok(volumes[i] <= ref * 1.05, `semaine ${i} en hausse (${volumes[i]} vs réf ${ref}) : ramp-up inattendu en mode maintien`);
  }
  // Affûtage anticipé sur la dernière semaine.
  assert.ok(plan.weeks[plan.weeks.length - 1].targetVolumeKm < ref, "dernière semaine attendue en affûtage (volume réduit)");
});

test("generatePlan: avertit quand la fenêtre est sous le référentiel de préparation utile (18 route / 22 trail)", () => {
  const courte = generatePlan({
    type: "trail",
    distanceKm: 50,
    deniveleM: 2000,
    dateDebut: "2026-01-01",
    dateCourse: "2026-05-01", // ~17 semaines < 22
    niveau: "intermediaire",
    vdot: 45,
  });
  assert.ok(courte.prepWindowWarning, "attendu un avertissement de fenêtre courte");
  assert.equal(courte.prepWindowWarning.idealWeeks, PREP_WINDOW_WEEKS.trail);

  const suffisante = generatePlan({
    type: "route",
    distanceKm: 42.195,
    dateDebut: "2026-01-01",
    dateCourse: "2026-05-15", // ~19 semaines >= 18
    niveau: "intermediaire",
    vdot: 45,
  });
  assert.equal(suffisante.prepWindowWarning, null);
});

test("recalculerApresAlea: réduit le volume et retire les séances T/I de la semaine affectée", () => {
  const plan = generatePlan({
    type: "route",
    distanceKm: 21.1,
    dateDebut: "2026-01-01",
    dateCourse: "2026-06-01",
    niveau: "avance",
    vdot: 52,
  });
  const targetWeek = plan.weeks.findIndex((w) => w.phase === "developpement");
  const originalVolume = plan.weeks[targetWeek].targetVolumeKm;
  const adjusted = recalculerApresAlea(plan, targetWeek, { raison: "blessure", semainesReduites: 1 });
  assert.ok(adjusted.weeks[targetWeek].targetVolumeKm < originalVolume);
  assert.ok(!adjusted.weeks[targetWeek].sessions.some((s) => s.type === "I" || s.type === "T"));
  assert.equal(adjusted.weeks[targetWeek].ajuste.raison, "blessure");
});
