import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parserRatioRecuperation,
  resoudreRepetitionsDuree,
  resoudreRepetitionsDistance,
  formatDureeCourte,
  formaterStructure,
  resoudreStructureDetaillee,
} from "../js/engines/structureSeance.js";

test("parserRatioRecuperation — ratio simple, fourchette (moyenne des bornes), et texte non parsable", () => {
  assert.equal(parserRatioRecuperation("5:1"), 0.2);
  assert.equal(parserRatioRecuperation("1:1"), 1);
  assert.equal(parserRatioRecuperation("1:2 à 1:3"), 2.5);
  assert.equal(parserRatioRecuperation("1:1 approx (descente active)"), 1);
  assert.equal(parserRatioRecuperation("n/a"), null);
  assert.equal(parserRatioRecuperation("continu"), null);
});

test("resoudreRepetitionsDuree — choisit UNE durée de répétition (milieu de fourchette) et UN nombre de répétitions, jamais une fourchette", () => {
  const corps = { repDureeMinRange: [3, 5], nbRepsRange: [4, 6], ratioEffortRecup: "1:1" };
  const r = resoudreRepetitionsDuree(corps, 32);
  assert.equal(r.repDureeMin, 4); // milieu de [3,5]
  assert.equal(r.recupMin, 4); // ratio 1:1
  assert.equal(r.nbReps, 4); // round(32/8)=4, dans [4,6]
  assert.ok(Number.isInteger(r.nbReps));
});

test("resoudreRepetitionsDuree — plafonné à nbRepsMax si le volume est énorme ; PAS de plancher à nbRepsMin si le volume est très réduit (priorité à la cohérence avec le budget de temps réellement alloué, ex. après un plafond hebdo sévère)", () => {
  const corps = { repDureeMinRange: [6, 10], nbRepsRange: [3, 5], ratioEffortRecup: "5:1" };
  const trop = resoudreRepetitionsDuree(corps, 200); // volume énorme -> ne doit jamais dépasser 5
  assert.equal(trop.nbReps, 5);
  const trop_peu = resoudreRepetitionsDuree(corps, 1); // volume minuscule -> descend sous 3, jamais sous 1
  assert.equal(trop_peu.nbReps, 1);
  assert.equal(trop_peu.recupMin, null, "pas de récupération affichée pour une répétition unique");
});

test("resoudreRepetitionsDuree — ratio non parsable (n/a) : pas de récupération calculée, nombre de répétitions au milieu de la fourchette", () => {
  const corps = { repDureeMinRange: [3, 5], nbRepsRange: [5, 8], ratioEffortRecup: "n/a" };
  const r = resoudreRepetitionsDuree(corps, 25);
  assert.equal(r.recupMin, null);
  assert.equal(r.nbReps, Math.round((5 + 8) / 2));
});

test("resoudreRepetitionsDistance — convertit la distance en durée via l'allure cible pour résoudre le nombre de répétitions", () => {
  const corps = { repDistanceKmRange: [0.2, 0.4], nbRepsRange: [8, 12], ratioEffortRecup: "1:2 à 1:3" };
  const r = resoudreRepetitionsDistance(corps, 24, 4); // 300 m à 4 min/km -> 1.2 min/rep
  assert.equal(r.repDistanceKm, 0.3);
  assert.ok(Math.abs(r.repDureeMin - 1.2) < 1e-9);
  assert.equal(r.uniteRep, "distance");
  // round(24 / (1.2 + récup 3 min à ratio moyen 2.5)) = round(24/4.2) = 6 —
  // sous nbRepsMin (8) : pas de plancher forcé, cf. tests dédiés ci-dessous.
  assert.equal(r.nbReps, 6);
  assert.ok(r.nbReps <= 12);
});

test("resoudreRepetitionsDistance — sans allure disponible, pas de durée ni de récup calculables, repli sur le milieu de la fourchette de répétitions", () => {
  const corps = { repDistanceKmRange: [0.2, 0.4], nbRepsRange: [8, 12], ratioEffortRecup: "1:2" };
  const r = resoudreRepetitionsDistance(corps, 24, null);
  assert.equal(r.repDureeMin, null);
  assert.equal(r.recupMin, null);
  assert.equal(r.nbReps, 10);
});

test("formatDureeCourte — secondes sous la minute, minutes rondes, minutes+secondes", () => {
  assert.equal(formatDureeCourte(0.5), "30 s");
  assert.equal(formatDureeCourte(4), "4 min");
  assert.equal(formatDureeCourte(1.5), "1 min 30 s");
});

test("formaterStructure — répétitions en durée, avec contexte et récupération", () => {
  const texte = formaterStructure({ nbReps: 9, repDureeMin: 1.5, recupMin: 1.5, uniteRep: "duree" }, "montée forte pente", "descente active");
  assert.equal(texte, "9 × 1 min 30 s montée forte pente — récup 1 min 30 s descente active");
});

test("formaterStructure — répétitions en distance sous le km affichées en mètres", () => {
  const texte = formaterStructure({ nbReps: 10, repDistanceKm: 0.3, recupMin: 3, uniteRep: "distance" }, null, "marche/trot");
  assert.equal(texte, "10 × 300 m — récup 3 min marche/trot");
});

test("resoudreStructureDetaillee — séance continue (pas de type repetitions) renvoyée inchangée", () => {
  const corps = { format: "Tempo continu", ratioEffortRecup: "n/a" };
  assert.equal(resoudreStructureDetaillee(corps, 20, 4), corps);
});

test("resoudreStructureDetaillee — séance à répétitions : format résolu en UNE prescription précise, sans fourchette ni « OU »", () => {
  const corps = {
    type: "repetitions",
    repDureeMinRange: [3, 5],
    nbRepsRange: [4, 6],
    ratioEffortRecup: "1:1",
    recupLabel: "trot",
  };
  const resolu = resoudreStructureDetaillee(corps, 32, 4);
  assert.equal(resolu.format, "4 × 4 min — récup 4 min trot");
  assert.ok(!resolu.format.includes("-"), "aucune fourchette dans le texte final");
  assert.ok(!resolu.format.includes(" OU "), "aucun choix « OU » dans le texte final");
});

test("resoudreStructureDetaillee — ratioEffortRecup est conservé (pas neutralisé) pour rester re-résolvable après un écrêtage de volume hebdo", () => {
  const corps = { type: "repetitions", repDureeMinRange: [3, 5], nbRepsRange: [4, 6], ratioEffortRecup: "1:1", recupLabel: "trot" };
  const resolu = resoudreStructureDetaillee(corps, 32, 4);
  assert.equal(resolu.ratioEffortRecup, "1:1");
});

test("resoudreStructureDetaillee — idempotente/re-résolvable : appelée une seconde fois avec un volume réduit (cas d'un plafond hebdo appliqué après coup), le format se met à jour de façon cohérente plutôt que de rester figé sur l'ancien volume", () => {
  const corps = { type: "repetitions", repDureeMinRange: [6, 10], nbRepsRange: [3, 5], ratioEffortRecup: "5:1", recupLabel: "descente active" };
  const premiereResolution = resoudreStructureDetaillee(corps, 40, null);
  const volumeEcrete = 20; // ex. appliquerPlafondsHebdo réduit le volume après coup
  const reResolution = resoudreStructureDetaillee(premiereResolution, volumeEcrete, null);
  assert.notEqual(reResolution.format, premiereResolution.format, "le format doit refléter le nouveau volume, pas rester celui de la première résolution");
  assert.ok(/^\d+ ×/.test(reResolution.format), `un nombre entier de répétitions est attendu en tête, obtenu : "${reResolution.format}"`);
});
