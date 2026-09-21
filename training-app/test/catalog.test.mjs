import { test } from "node:test";
import assert from "node:assert/strict";
import { SESSIONS_ROUTE } from "../js/catalog/sessionsRoute.js";
import { SESSIONS_TRAIL } from "../js/catalog/sessionsTrail.js";
import { RENFO_EXERCISES, RENFO_CATEGORIES } from "../js/catalog/renfo.js";

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

test("catalogue renfo : couverture large (30-35 exercices) sur les 4 catégories", () => {
  assert.ok(RENFO_EXERCISES.length >= 30, `catalogue renfo trop restreint : ${RENFO_EXERCISES.length} exercices`);
  assert.ok(RENFO_EXERCISES.length <= 35, `catalogue renfo au-delà de la cible : ${RENFO_EXERCISES.length} exercices`);
  const ids = new Set(RENFO_EXERCISES.map((e) => e.id));
  assert.equal(ids.size, RENFO_EXERCISES.length, "ids en double dans le catalogue renfo");
  for (const categorie of Object.keys(RENFO_CATEGORIES)) {
    const count = RENFO_EXERCISES.filter((e) => e.categorie === categorie).length;
    assert.ok(count >= 4, `catégorie ${categorie} sous-représentée : ${count} exercice(s)`);
  }
});

test("catalogue renfo : le renfo lourd et la pliométrie sont identifiés et bien représentés", () => {
  const lourd = RENFO_EXERCISES.filter((e) => e.type === "lourd");
  const pliometrie = RENFO_EXERCISES.filter((e) => e.type === "pliometrie");
  assert.ok(lourd.length >= 5, `renfo lourd sous-représenté : ${lourd.length} exercice(s)`);
  assert.ok(pliometrie.length >= 4, `pliométrie sous-représentée : ${pliometrie.length} exercice(s)`);
  assert.ok(
    RENFO_EXERCISES.every((e) => typeof e.type === "string" && e.type.length > 0),
    "chaque exercice de renfo doit avoir un champ type"
  );
});

test("catalogue route: le seuil (T) couvre à la fois le tempo continu et les cruise intervals", () => {
  const thresholdVariants = SESSIONS_ROUTE.filter((s) => s.type === "T");
  const hasContinuous = thresholdVariants.some((s) => /continu/i.test(s.label));
  const hasCruise = thresholdVariants.some((s) => /cruise/i.test(s.label));
  assert.ok(hasContinuous, "aucune variante de seuil continu (tempo) trouvée");
  assert.ok(hasCruise, "aucune variante de cruise intervals trouvée");
});
