import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerEcart, estimerChargeJournaliere } from "../js/data/stravaSync.js";

// Fixture réaliste (champs REST Strava v3 : distance en m, moving_time/elapsed_time
// en s, total_elevation_gain en m, start_date en ISO) — dérivée d'une vraie
// activité de trail (multi-jours, longues pauses -> gros écart moving/elapsed).
const activiteReelle = {
  id: 19742607109,
  name: "Gr34 en courant jour 5/8",
  distance: 19799.7,
  moving_time: 7891,
  elapsed_time: 30824,
  total_elevation_gain: 284.8,
  start_date: "2026-08-14T10:43:48Z",
};

test("calculerEcart — utilise moving_time (pas elapsed_time) pour l'allure, correct sur une activité avec longues pauses", () => {
  const { distanceKm, dureeMin, deniveleM, allureMoyenneMinParKm } = calculerEcart(activiteReelle, null);
  assert.ok(Math.abs(distanceKm - 19.7997) < 0.001);
  assert.ok(Math.abs(dureeMin - 7891 / 60) < 0.001);
  assert.equal(deniveleM, 284.8);
  // 7891s / 60 / 19.7997km ≈ 6.64 min/km — pas 30824/60/19.7997 ≈ 25.9 (elapsed, faussé par les pauses)
  assert.ok(Math.abs(allureMoyenneMinParKm - 6.64) < 0.05, `allure inattendue: ${allureMoyenneMinParKm}`);
});

test("calculerEcart — sans séance planifiée, ecart est null", () => {
  const { ecart } = calculerEcart(activiteReelle, null);
  assert.equal(ecart, null);
});

test("calculerEcart — avec séance planifiée, calcule l'écart de volume et d'allure", () => {
  const seancePlanifiee = { volumeSeanceMin: 90, allureCibleMinParKm: 6.0 };
  const { ecart } = calculerEcart(activiteReelle, seancePlanifiee);
  assert.ok(ecart);
  assert.ok(Math.abs(ecart.ecartVolumeMin - (7891 / 60 - 90)) < 0.01);
  assert.ok(ecart.ecartAllureMinParKm > 0, "allure réelle plus lente que la cible -> écart positif");
});

test("estimerChargeJournaliere — proportionnelle à la durée réelle (moving_time) et au RPE", () => {
  const chargeRpe5 = estimerChargeJournaliere(activiteReelle, 5);
  const chargeRpe8 = estimerChargeJournaliere(activiteReelle, 8);
  assert.ok(Math.abs(chargeRpe5 - (7891 / 60) * 5) < 0.01);
  assert.ok(chargeRpe8 > chargeRpe5, "RPE plus élevé -> charge plus élevée");
});

test("estimerChargeJournaliere — active sans moving_time renseigné ne casse pas (0)", () => {
  assert.equal(estimerChargeJournaliere({}, 5), 0);
});
