import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionLoad,
  acwr,
  acwrRiskLevel,
  ctlAtlTsb,
  latestLoadState,
  ACWR_SAFE_MIN,
  ACWR_SAFE_MAX,
} from "../js/engines/load.js";

test("sessionLoad: distance * facteur d'intensité", () => {
  assert.equal(sessionLoad({ distanceKm: 10, intensityFactor: 1 }), 10);
  assert.equal(sessionLoad({ distanceKm: 10, intensityFactor: 1.5 }), 15);
});

test("sessionLoad: TRIMP-like utilisé quand FC disponible", () => {
  const load = sessionLoad({ durationMin: 60, avgHr: 150, maxHr: 190, restHr: 50 });
  assert.ok(load > 0);
});

function buildFlatLoads(days, load) {
  const loads = [];
  const start = new Date("2026-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    loads.push({ date: d.toISOString().slice(0, 10), load });
  }
  return loads;
}

test("acwr: charge constante donne un ratio proche de 1", () => {
  const loads = buildFlatLoads(35, 10);
  const { ratio } = acwr(loads, "2026-02-04");
  assert.ok(Math.abs(ratio - 1) < 0.01, `ratio inattendu: ${ratio}`);
});

test("acwr: pic récent de charge fait grimper le ratio au-dessus de la zone sûre", () => {
  const loads = buildFlatLoads(28, 5);
  for (let i = 21; i < 28; i++) loads[i].load = 25;
  const { ratio } = acwr(loads, loads[27].date);
  assert.ok(ratio > ACWR_SAFE_MAX);
  assert.equal(acwrRiskLevel(ratio), "risque_surcharge");
});

test("acwrRiskLevel: dans [0.8, 1.5] -> ok", () => {
  assert.equal(acwrRiskLevel(1.0), "ok");
  assert.equal(acwrRiskLevel(ACWR_SAFE_MIN), "ok");
  assert.equal(acwrRiskLevel(ACWR_SAFE_MAX), "ok");
  assert.equal(acwrRiskLevel(0.5), "sous_charge");
});

test("ctlAtlTsb: charge constante fait converger CTL et ATL, TSB proche de 0", () => {
  const loads = buildFlatLoads(300, 10);
  const { ctl, atl, tsb } = latestLoadState(loads);
  assert.ok(Math.abs(ctl - 10) < 0.5, `CTL: ${ctl}`);
  assert.ok(Math.abs(atl - 10) < 0.5, `ATL: ${atl}`);
  assert.ok(Math.abs(tsb) < 0.5, `TSB: ${tsb}`);
});

test("ctlAtlTsb: arrêt de charge après une phase soutenue fait monter le TSB (fraîcheur)", () => {
  const loads = buildFlatLoads(60, 10).concat(buildFlatLoads(10, 0).map((l, i) => ({ ...l, date: addDays("2026-03-02", i) })));
  const { tsb } = latestLoadState(loads);
  assert.ok(tsb > 0, `TSB devrait être positif après une coupure: ${tsb}`);
});

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
