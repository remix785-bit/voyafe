import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionLoad,
  renfoSessionLoad,
  acwr,
  acwrRiskLevel,
  ctlAtlTsb,
  latestLoadState,
  ACWR_SAFE_MIN,
  ACWR_SAFE_MAX,
  renfoExcentriqueConflicts,
  signauxSurentrainement,
} from "../js/engines/load.js";

test("sessionLoad: distance * facteur d'intensité", () => {
  assert.equal(sessionLoad({ distanceKm: 10, intensityFactor: 1 }), 10);
  assert.equal(sessionLoad({ distanceKm: 10, intensityFactor: 1.5 }), 15);
});

test("sessionLoad: TRIMP-like utilisé quand FC disponible", () => {
  const load = sessionLoad({ durationMin: 60, avgHr: 150, maxHr: 190, restHr: 50 });
  assert.ok(load > 0);
});

test("renfoSessionLoad: RPE * durée", () => {
  assert.equal(renfoSessionLoad({ rpe: 6, dureeMin: 30 }), 180);
  assert.equal(renfoSessionLoad({}), 0);
  assert.equal(renfoSessionLoad({ rpe: 5 }), 0);
});

test("renfoSessionLoad: une séance de renfo loggée influence l'ACWR/CTL", () => {
  const runLoads = buildFlatLoads(28, 5);
  const { ratio: ratioSansRenfo } = acwr(runLoads, runLoads[27].date);
  const { ctl: ctlSansRenfo } = latestLoadState(runLoads);

  const renfoLoad = renfoSessionLoad({ rpe: 7, dureeMin: 40 });
  const withRenfo = runLoads.map((d, i) => (i === 27 ? { ...d, load: d.load + renfoLoad } : d));
  const { ratio: ratioAvecRenfo } = acwr(withRenfo, withRenfo[27].date);
  const { ctl: ctlAvecRenfo } = latestLoadState(withRenfo);

  assert.ok(ratioAvecRenfo > ratioSansRenfo, "l'ACWR devrait augmenter avec la charge de renfo");
  assert.ok(ctlAvecRenfo > ctlSansRenfo, "le CTL devrait augmenter avec la charge de renfo");
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

test("renfoExcentriqueConflicts: détecte une séance de qualité dans les 48h suivant le renfo", () => {
  const seances = [
    { date: "2026-03-02", type: "T" }, // 24h après
    { date: "2026-03-05", type: "I" }, // 96h après, hors délai
    { date: "2026-03-01", type: "E" }, // même type non concerné
  ];
  const conflicts = renfoExcentriqueConflicts("2026-03-01", seances);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].date, "2026-03-02");
});

test("renfoExcentriqueConflicts: aucun conflit si les séances de qualité sont assez éloignées", () => {
  const seances = [{ date: "2026-03-10", type: "longue" }];
  assert.equal(renfoExcentriqueConflicts("2026-03-01", seances).length, 0);
});

test("signauxSurentrainement: détecte une convergence RPE élevé + sommeil dégradé", () => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [0, 1, 2].map((i) => ({ date: addDays(today, -i), rpe: 8, sommeilQualite: 1 }));
  const result = signauxSurentrainement(entries);
  assert.equal(result.detecte, true);
  assert.equal(result.joursConvergents, 3);
});

test("signauxSurentrainement: pas de détection si peu de jours convergents", () => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [{ date: today, rpe: 8, sommeilQualite: 1 }];
  assert.equal(signauxSurentrainement(entries).detecte, false);
});
