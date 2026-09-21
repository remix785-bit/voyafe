import { test } from "node:test";
import assert from "node:assert/strict";
import { chargeNiveauFromAcwr, dailyMacroNeeds, fuelingCarbsPerHour, hydrationNeeds } from "../js/engines/nutrition.js";

test("chargeNiveauFromAcwr: classe selon la zone sûre ACWR", () => {
  assert.equal(chargeNiveauFromAcwr(0.5), "decharge");
  assert.equal(chargeNiveauFromAcwr(1.0), "normale");
  assert.equal(chargeNiveauFromAcwr(2.0), "elevee");
  assert.equal(chargeNiveauFromAcwr(NaN), "normale");
});

test("dailyMacroNeeds: glucides plus élevés en semaine de forte charge qu'en décharge", () => {
  const decharge = dailyMacroNeeds({ weightKg: 70, acwrRatio: 0.5 });
  const elevee = dailyMacroNeeds({ weightKg: 70, acwrRatio: 2.0 });
  assert.ok(elevee.glucidesG > decharge.glucidesG);
  assert.ok(elevee.proteinesG >= decharge.proteinesG);
});

test("dailyMacroNeeds: retourne null sans poids", () => {
  assert.equal(dailyMacroNeeds({ weightKg: 0 }), null);
});

test("dailyMacroNeeds: charge glucidique pré-course sur semi et au-delà, dans les 3 jours avant", () => {
  const preCourseMarathon = dailyMacroNeeds({ weightKg: 70, acwrRatio: 1, joursAvantCourse: 2, distanceCourseKm: 42.195 });
  assert.equal(preCourseMarathon.carbLoading, true);
  assert.ok(preCourseMarathon.glucidesG > dailyMacroNeeds({ weightKg: 70, acwrRatio: 1 }).glucidesG);

  const preCourse10k = dailyMacroNeeds({ weightKg: 70, acwrRatio: 1, joursAvantCourse: 2, distanceCourseKm: 10 });
  assert.equal(preCourse10k.carbLoading, false);

  const loinDeLaCourse = dailyMacroNeeds({ weightKg: 70, acwrRatio: 1, joursAvantCourse: 10, distanceCourseKm: 42.195 });
  assert.equal(loinDeLaCourse.carbLoading, false);
});

test("fuelingCarbsPerHour: paliers croissants selon la durée", () => {
  assert.equal(fuelingCarbsPerHour(30), 0);
  assert.equal(fuelingCarbsPerHour(90), 45);
  assert.equal(fuelingCarbsPerHour(180), 75);
  assert.equal(fuelingCarbsPerHour(360), 90);
});

test("hydrationNeeds: besoins hydriques et sodium augmentent avec la température", () => {
  const frais = hydrationNeeds({ dureeMin: 120, temperatureC: 15 });
  const chaud = hydrationNeeds({ dureeMin: 120, temperatureC: 30 });
  assert.ok(chaud.mlPerHour > frais.mlPerHour);
  assert.ok(chaud.totalSodiumMg > frais.totalSodiumMg);
});

test("hydrationNeeds: alerte hyponatrémie sur épreuve longue et chaude", () => {
  const longueChaude = hydrationNeeds({ dureeMin: 240, temperatureC: 28 });
  assert.equal(longueChaude.hyponatremieAlerte, true);
  const courteFraiche = hydrationNeeds({ dureeMin: 60, temperatureC: 15 });
  assert.equal(courteFraiche.hyponatremieAlerte, false);
});
