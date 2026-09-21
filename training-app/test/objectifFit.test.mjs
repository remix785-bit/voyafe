import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requiredVdotForObjectif,
  objectifFitLevel,
  specificiteAllureLongue,
  evaluateObjectifFit,
} from "../js/engines/objectifFit.js";

test("requiredVdotForObjectif: route, dépend uniquement de distance/temps", () => {
  const vdot = requiredVdotForObjectif({ distanceKm: 10, tempsViseS: 40 * 60, type: "route" });
  assert.ok(vdot > 40 && vdot < 55, `vdot: ${vdot}`);
});

test("requiredVdotForObjectif: trail avec D+ exige un VDOT plus élevé qu'un objectif identique sur plat", () => {
  const plat = requiredVdotForObjectif({ distanceKm: 30, tempsViseS: 3 * 3600, type: "route" });
  const denivele = requiredVdotForObjectif({ distanceKm: 30, tempsViseS: 3 * 3600, deniveleM: 1500, type: "trail" });
  assert.ok(denivele > plat, `denivele (${denivele}) devrait être > plat (${plat})`);
});

test("objectifFitLevel: classe atteint/ambitieux/tres_ambitieux selon l'écart de VDOT", () => {
  assert.equal(objectifFitLevel(50, 50.5), "atteint");
  assert.equal(objectifFitLevel(50, 53), "ambitieux");
  assert.equal(objectifFitLevel(50, 58), "tres_ambitieux");
});

test("specificiteAllureLongue: augmente avec le niveau d'ambition", () => {
  const atteint = specificiteAllureLongue("atteint");
  const ambitieux = specificiteAllureLongue("ambitieux");
  const tresAmbitieux = specificiteAllureLongue("tres_ambitieux");
  assert.ok(atteint < ambitieux);
  assert.ok(ambitieux < tresAmbitieux);
});

test("specificiteAllureLongue: amplifiée par un fort D+ trail quand l'objectif n'est pas 'atteint'", () => {
  const sansDenivele = specificiteAllureLongue("ambitieux", { type: "route" });
  const avecFortDenivele = specificiteAllureLongue("ambitieux", { type: "trail", deniveleM: 3000, distanceKm: 50 });
  assert.ok(avecFortDenivele > sansDenivele);
});

test("specificiteAllureLongue: pas d'amplification D+ pour un objectif déjà 'atteint'", () => {
  const sansDenivele = specificiteAllureLongue("atteint", { type: "route" });
  const avecFortDenivele = specificiteAllureLongue("atteint", { type: "trail", deniveleM: 3000, distanceKm: 50 });
  assert.equal(avecFortDenivele, sansDenivele);
});

test("evaluateObjectifFit: retourne null sans temps visé", () => {
  assert.equal(evaluateObjectifFit({ distanceKm: 10 }, 45), null);
});

test("evaluateObjectifFit: retourne un niveau et une part d'allure objectif cohérents", () => {
  const fit = evaluateObjectifFit({ distanceKm: 42.195, tempsViseS: 3 * 3600 + 30 * 60, type: "route" }, 45);
  assert.ok(fit);
  assert.ok(["atteint", "ambitieux", "tres_ambitieux"].includes(fit.niveau));
  assert.ok(fit.specificiteLongue > 0 && fit.specificiteLongue <= 0.45);
});
