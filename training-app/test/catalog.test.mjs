import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSIONS_ROUTE } from "../js/catalog/sessionsRoute.js";
import { SESSIONS_TRAIL } from "../js/catalog/sessionsTrail.js";

// Doc technique Section 4 : chaque type de séance doit offrir au moins 3
// variantes réelles (pas de doublons sous un nom différent) pour casser la
// monotonie du plan.
const REQUIRED_TYPES = ["E", "longue", "T", "I", "R", "recuperation"];
const MIN_VARIANTS = 3;

function countByType(catalog) {
  const byType = {};
  for (const s of catalog) (byType[s.type] ||= []).push(s);
  return byType;
}

for (const [name, catalog] of [
  ["route", SESSIONS_ROUTE],
  ["trail", SESSIONS_TRAIL],
]) {
  test(`catalogue ${name}: au moins ${MIN_VARIANTS} variantes réelles par type de séance`, () => {
    const byType = countByType(catalog);
    for (const type of REQUIRED_TYPES) {
      const variants = byType[type] ?? [];
      assert.ok(
        variants.length >= MIN_VARIANTS,
        `type ${type} (${name}) : ${variants.length} variante(s), attendu >= ${MIN_VARIANTS}`
      );
      // Pas de doublons : ids et structures distincts.
      const ids = new Set(variants.map((v) => v.id));
      assert.equal(ids.size, variants.length, `ids en double pour le type ${type} (${name})`);
      const structures = new Set(variants.map((v) => JSON.stringify(v.structure)));
      assert.equal(
        structures.size,
        variants.length,
        `variantes ${type} (${name}) avec une structure identique (nom différent seulement)`
      );
    }
  });
}

test("catalogue route: le seuil (T) couvre à la fois le tempo continu et les cruise intervals", () => {
  const thresholdVariants = SESSIONS_ROUTE.filter((s) => s.type === "T");
  const hasContinuous = thresholdVariants.some((s) => /continu/i.test(s.label));
  const hasCruise = thresholdVariants.some((s) => /cruise/i.test(s.label));
  assert.ok(hasContinuous, "aucune variante de seuil continu (tempo) trouvée");
  assert.ok(hasCruise, "aucune variante de cruise intervals trouvée");
});
