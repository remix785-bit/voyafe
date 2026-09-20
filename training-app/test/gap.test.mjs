import { test } from "node:test";
import assert from "node:assert/strict";
import { minettiCost, gapFactor, rawPaceToGap, gapToRawPace, averageGrade } from "../js/engines/gap.js";

test("minettiCost: coût minimal proche d'une pente légèrement négative (descente économique)", () => {
  const flat = minettiCost(0);
  const slightDown = minettiCost(-0.1);
  assert.ok(slightDown < flat);
});

test("gapFactor: facteur de 1 sur terrain plat", () => {
  assert.ok(Math.abs(gapFactor(0) - 1) < 1e-9);
});

test("gapFactor: montée coûte plus cher que le plat", () => {
  assert.ok(gapFactor(0.1) > 1);
});

test("rawPaceToGap / gapToRawPace: round-trip cohérent", () => {
  const raw = 6.0;
  const grade = 0.08;
  const gap = rawPaceToGap(raw, grade);
  const back = gapToRawPace(gap, grade);
  assert.ok(Math.abs(back - raw) < 1e-9);
});

test("rawPaceToGap: en montée, l'allure GAP (équivalent plat) est plus rapide que l'allure brute", () => {
  const raw = 6.0;
  const gap = rawPaceToGap(raw, 0.1);
  assert.ok(gap < raw);
});

test("averageGrade: calcule la pente moyenne depuis D+/D-", () => {
  assert.equal(averageGrade(1000, 100, 0), 0.1);
  assert.equal(averageGrade(1000, 0, 100), -0.1);
});
