import { test } from "node:test";
import assert from "node:assert/strict";
import { latLonADistance, projeterPlan, arrondirEchelle } from "../js/engines/geoMap.js";

test("latLonADistance — interpole linéairement entre les deux points encadrants", () => {
  const points = [
    { lat: 45.0, lon: 5.0, distanceCumulee: 0 },
    { lat: 45.01, lon: 5.02, distanceCumulee: 1000 },
  ];
  const mi = latLonADistance(points, 500);
  assert.ok(Math.abs(mi.lat - 45.005) < 1e-9);
  assert.ok(Math.abs(mi.lon - 5.01) < 1e-9);
});

test("latLonADistance — borne aux extrémités (avant le premier point, après le dernier)", () => {
  const points = [
    { lat: 45.0, lon: 5.0, distanceCumulee: 0 },
    { lat: 45.01, lon: 5.02, distanceCumulee: 1000 },
  ];
  assert.deepEqual(latLonADistance(points, -50), { lat: 45.0, lon: 5.0 });
  assert.deepEqual(latLonADistance(points, 5000), { lat: 45.01, lon: 5.02 });
});

test("latLonADistance — tableau vide renvoie null", () => {
  assert.equal(latLonADistance([], 100), null);
});

test("projeterPlan — le point de référence se projette à l'origine (0,0)", () => {
  const points = [{ lat: 45.0, lon: 5.0 }, { lat: 45.01, lon: 5.0 }];
  const proj = projeterPlan(points);
  assert.ok(Math.abs(proj[0].x) < 1e-9);
  assert.ok(Math.abs(proj[0].y) < 1e-9);
});

test("projeterPlan — un point plus au nord (même longitude) a un y positif proportionnel à la distance réelle", () => {
  const points = [{ lat: 45.0, lon: 5.0 }, { lat: 45.01, lon: 5.0 }];
  const proj = projeterPlan(points);
  // 0.01° de latitude ≈ 1113 m
  assert.ok(Math.abs(proj[1].y - 1113) < 5, `y attendu ~1113m, obtenu ${proj[1].y}`);
  assert.ok(Math.abs(proj[1].x) < 1e-6, "même longitude -> x quasi nul");
});

test("projeterPlan — un point plus à l'est (même latitude) a un x positif, réduit par cos(latitude)", () => {
  const points = [{ lat: 45.0, lon: 5.0 }, { lat: 45.0, lon: 5.01 }];
  const proj = projeterPlan(points);
  // 0.01° de longitude à 45° ≈ 1113 * cos(45°) ≈ 787 m
  assert.ok(Math.abs(proj[1].x - 787) < 5, `x attendu ~787m, obtenu ${proj[1].x}`);
  assert.ok(Math.abs(proj[1].y) < 1e-6);
});

test("projeterPlan — accepte une référence explicite partagée (route et marqueurs sur la même origine)", () => {
  const reference = { lat: 45.0, lon: 5.0 };
  const marqueur = projeterPlan([{ lat: 45.01, lon: 5.0 }], reference);
  const route = projeterPlan([{ lat: 45.0, lon: 5.0 }, { lat: 45.01, lon: 5.0 }], reference);
  assert.ok(Math.abs(marqueur[0].y - route[1].y) < 1e-9, "même point, même origine -> même projection");
});

test("projeterPlan — tableau vide renvoie un tableau vide", () => {
  assert.deepEqual(projeterPlan([]), []);
});

test("arrondirEchelle — choisit la plus grande valeur ronde (1/2/5×10^n) sous le maximum disponible", () => {
  assert.equal(arrondirEchelle(1), 1);
  assert.equal(arrondirEchelle(4), 2);
  assert.equal(arrondirEchelle(9), 5);
  assert.equal(arrondirEchelle(30), 20);
  assert.equal(arrondirEchelle(999), 500);
  assert.equal(arrondirEchelle(1000), 1000);
  assert.equal(arrondirEchelle(0), 0);
});
