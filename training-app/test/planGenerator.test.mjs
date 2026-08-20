import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construireMacrocycle,
  genererSemaines,
  genererPlanComplet,
  semainesDisponibles,
  appliquerPlafondsHebdo,
  calculerAllureObjectif,
  instancierSeance,
} from "../js/engines/planGenerator.js";

test("Macrocycle — exemple chiffré du dossier: 16 semaines, charge modérée -> taper 2, base 7, dev 7", () => {
  const m = construireMacrocycle(16, "moderee");
  assert.equal(m.taper, 2);
  assert.equal(m.base, 7);
  assert.equal(m.developpement, 7);
  assert.equal(m.base + m.developpement + m.taper, 16);
});

test("Macrocycle — sous 6 semaines bascule en mode plan court, sans base", () => {
  const m = construireMacrocycle(4, "moderee");
  assert.equal(m.mode, "court");
  assert.equal(m.base, 0);
});

test("genererSemaines — insère une décharge toutes les ~4 semaines, jamais en taper", () => {
  const m = construireMacrocycle(16, "moderee");
  const semaines = genererSemaines(m, new Date().toISOString());
  assert.equal(semaines.length, 16);
  const taperSemaines = semaines.filter((s) => s.phase === "taper");
  assert.ok(taperSemaines.every((s) => s.statut === "taper"));
  const decharges = semaines.filter((s) => s.statut === "decharge");
  assert.ok(decharges.length >= 2, `attendu plusieurs décharges sur 16 semaines, obtenu ${decharges.length}`);
});

test("appliquerPlafondsHebdo — écrête le volume T au-delà de 10% du volume hebdo", () => {
  const seances = [
    { zoneDaniels: "E", volumeSeanceMin: 60 },
    { zoneDaniels: "E", volumeSeanceMin: 60 },
    { zoneDaniels: "T", volumeSeanceMin: 40 }, // 40/160 = 25% > 10%
  ];
  const out = appliquerPlafondsHebdo(seances);
  const t = out.find((s) => s.zoneDaniels === "T");
  assert.ok(t.avertissementPlafond);
  assert.ok(t.volumeSeanceMin < 40);
});

test("genererPlanComplet — pipeline complet produit un plan daté cohérent (route, 16 semaines)", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    chargeHebdoMoyenneActuelle: "moderee",
  });
  assert.equal(plan.statut, "en_attente");
  assert.equal(plan.semaines.length, 16);
  assert.ok(plan.profilCourant.vdot > 0);
  for (const semaine of plan.semaines) {
    assert.equal(semaine.seances.length, 5);
    for (const s of semaine.seances) {
      assert.ok(s.allureCibleMinParKm > 0);
    }
  }
});

test("calculerAllureObjectif — marathon en 3h30 donne ~4:58/km", () => {
  const pace = calculerAllureObjectif(42195, 3.5 * 3600);
  assert.ok(Math.abs(pace - 4.977) < 0.01, `allure inattendue: ${pace}`);
});

test("calculerAllureObjectif — null si distance ou temps manquant", () => {
  assert.equal(calculerAllureObjectif(null, 3600), null);
  assert.equal(calculerAllureObjectif(10000, null), null);
});

test("genererPlanComplet — l'allure objectif remplace l'allure M déduite du VDOT (route)", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const sansObjectif = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
  });
  const avecObjectif = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
    tempsObjectifS: 3.5 * 3600, // objectif ambitieux, allure plus rapide que l'allure M de forme actuelle
  });

  const seanceM_sans = sansObjectif.semaines[0].seances.find((s) => s.zoneDaniels === "M");
  const seanceM_avec = avecObjectif.semaines[0].seances.find((s) => s.zoneDaniels === "M");
  assert.ok(seanceM_sans && seanceM_avec);
  assert.notEqual(seanceM_sans.allureCibleMinParKm, seanceM_avec.allureCibleMinParKm);
  assert.ok(Math.abs(seanceM_avec.allureCibleMinParKm - 4.977) < 0.01);
  assert.equal(avecObjectif.objectifPaceMinParKm, seanceM_avec.allureCibleMinParKm);
  assert.equal(avecObjectif.distanceObjectifM, 42195);
});

test("instancierSeance — sans objectif fourni, retombe sur l'allure M dérivée du VDOT", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const tplM = { zoneDaniels: "M", discipline: "route", corpsDeSeance: {} };
  const s = instancierSeance(tplM, plan.profilCourant, plan.semaines[0], {}, null);
  assert.equal(s.allureCibleMinParKm, plan.profilCourant.allures.M.target);
});

test("semainesDisponibles — calcule un nombre entier de semaines", () => {
  const debut = new Date("2026-01-01T00:00:00Z");
  const fin = new Date("2026-01-01T00:00:00Z");
  fin.setDate(fin.getDate() + 16 * 7);
  assert.equal(semainesDisponibles(fin.toISOString(), debut.toISOString()), 16);
});
