import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlan, computePhasePlan, ZONE_CAPS, recalculerApresAlea, elevationTierFor } from "../js/engines/planGenerator.js";
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
