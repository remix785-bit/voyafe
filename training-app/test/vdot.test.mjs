import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vdotFromPerformance,
  paceZonesFromVdot,
  correctionAltitude,
  nextRetestWindow,
  formatPace,
} from "../js/engines/vdot.js";

test("vdotFromPerformance: 10km en 40:00 donne un VDOT plausible (~52-55)", () => {
  const { vdot, warnings } = vdotFromPerformance(10000, 40 * 60);
  assert.ok(vdot > 50 && vdot < 56, `VDOT hors plage attendue: ${vdot}`);
  assert.equal(warnings.length, 0);
});

test("vdotFromPerformance: distance sous la borne déclenche un warning", () => {
  const { warnings } = vdotFromPerformance(800, 150);
  assert.ok(warnings.length > 0);
});

test("correctionAltitude: aucune correction sous 1200m", () => {
  assert.equal(correctionAltitude(50, 800), 50);
});

test("correctionAltitude: majore le VDOT au-dessus de 1200m, plafonné à 12%", () => {
  const v2000 = correctionAltitude(50, 2000);
  assert.ok(v2000 > 50);
  const vExtreme = correctionAltitude(50, 6000);
  assert.ok(vExtreme <= 50 * 1.12 + 1e-9);
});

test("paceZonesFromVdot: 5 zones ordonnées E plus lent que R", () => {
  const zones = paceZonesFromVdot(50);
  assert.ok(zones.E.slowPaceMinPerKm > zones.T.slowPaceMinPerKm);
  assert.ok(zones.T.slowPaceMinPerKm > zones.I.slowPaceMinPerKm);
  assert.ok(zones.I.slowPaceMinPerKm >= zones.R.slowPaceMinPerKm - 0.5);
});

test("nextRetestWindow: fenêtre de 4 à 8 semaines après le test", () => {
  const { minDate, maxDate } = nextRetestWindow("2026-01-01");
  const diffMinWeeks = (minDate - new Date("2026-01-01")) / (7 * 24 * 3600 * 1000);
  const diffMaxWeeks = (maxDate - new Date("2026-01-01")) / (7 * 24 * 3600 * 1000);
  assert.equal(diffMinWeeks, 4);
  assert.equal(diffMaxWeeks, 8);
});

test("formatPace: formate correctement", () => {
  assert.equal(formatPace(4.5), "4:30/km");
});
