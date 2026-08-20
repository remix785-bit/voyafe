import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vdotFromPerformance,
  paceZonesForVdot,
  riegelPredict,
  altitudeDeltaVo2max,
  adjustPaceForAltitude,
  formatPace,
} from "../js/engines/vdot.js";
import {
  minettiEnergyCost,
  gapFactor,
  flatEquivalentToRealPace,
  realPaceToFlatEquivalent,
} from "../js/engines/gap.js";
import { acwr, ewmaAcwr, acwrZone, loadSummary } from "../js/engines/load.js";
import {
  decouperSegments,
  calculerPacingEffortConstant,
  agregerPacingParKm,
  detecterPointsSignificatifs,
} from "../js/engines/pacing.js";
import { evaluerBoucleAdaptative, detecterRetestImplicite } from "../js/engines/adaptiveLoop.js";

test("VDOT — 10K en 40:00 donne un VDOT plausible (~50-54, cohérent avec la table Daniels: VDOT 50 = 10K 41:32)", () => {
  const { vdot, warnings } = vdotFromPerformance(10000, 40 * 60);
  assert.ok(vdot > 50 && vdot < 54, `VDOT hors plage attendue: ${vdot}`);
  assert.equal(warnings.length, 0);
});

test("VDOT — anchor élite: marathon 2:05:00 donne un VDOT ~80-84 (cohérent avec la littérature)", () => {
  const { vdot } = vdotFromPerformance(42195, 125 * 60);
  assert.ok(vdot > 80 && vdot < 84, `VDOT hors plage attendue: ${vdot}`);
});

test("VDOT — avertit sous 1500m et au-delà de 50km", () => {
  const short = vdotFromPerformance(800, 150);
  assert.equal(short.warnings.length, 1);
  const long = vdotFromPerformance(60000, 4 * 3600);
  assert.equal(long.warnings.length, 1);
});

test("Zones de VDOT — allure E plus lente que M plus lente que T plus lente que I plus lente que R", () => {
  const { vdot } = vdotFromPerformance(10000, 40 * 60);
  const zones = paceZonesForVdot(vdot);
  assert.ok(zones.E.target > zones.M.target);
  assert.ok(zones.M.target > zones.T.target);
  assert.ok(zones.T.target > zones.I.target);
  assert.ok(zones.I.target > zones.R.target);
});

test("formatPace formate correctement", () => {
  assert.equal(formatPace(4.5), "4:30/km");
  assert.equal(formatPace(3.9833333), "3:59/km");
});

test("Riegel — prédiction semi à partir d'un 10K cohérente avec (D2/D1)^1.06", () => {
  const t10k = 40 * 60;
  const tSemi = riegelPredict(t10k, 10000, 21097.5);
  const ratio = tSemi / t10k;
  const attendu = (21097.5 / 10000) ** 1.06;
  assert.ok(Math.abs(ratio - attendu) < 1e-9);
  assert.ok(ratio > 2.15 && ratio < 2.25, `ratio inattendu: ${ratio}`);
});

test("Altitude — effet négligeable sous 1500m, marqué au-delà", () => {
  const d1000 = altitudeDeltaVo2max(1000);
  const d3000 = altitudeDeltaVo2max(3000);
  assert.ok(d1000 > -0.02 && d1000 < 0);
  assert.ok(d3000 < -0.10, `attendu forte baisse à 3000m, obtenu ${d3000}`);
});

test("Altitude — acclimatation réduit l'effet sur l'allure ajustée", () => {
  const sansAcclim = adjustPaceForAltitude(4.0, 2500, "aucune");
  const avecAcclim = adjustPaceForAltitude(4.0, 2500, "3semaines+");
  assert.ok(sansAcclim.paceAjustee > avecAcclim.paceAjustee);
  assert.ok(sansAcclim.paceAjustee > 4.0); // plus lent qu'au niveau de la mer
});

test("Minetti — coût minimal aux alentours de -10%, remonte au-delà de -20%", () => {
  const ecFlat = minettiEnergyCost(0);
  const ecMinus10 = minettiEnergyCost(-0.1);
  const ecMinus30 = minettiEnergyCost(-0.3);
  assert.ok(ecMinus10 < ecFlat * 0.65 && ecMinus10 > ecFlat * 0.55, `EC(-10%)=${ecMinus10}, EC(0)=${ecFlat}`);
  assert.ok(ecMinus30 > ecMinus10, "le coût doit remonter au-delà de -20%");
});

test("GAP — facteur >1 en montée, <1 en légère descente", () => {
  assert.ok(gapFactor(0.1) > 1);
  assert.ok(gapFactor(-0.1) < 1);
});

test("GAP — montée: allure réelle plus lente que l'allure plat équivalente inversée", () => {
  const flatPace = 5.0; // 5:00/km cible zone E
  const { paceMinPerKm: realUphillPace } = flatEquivalentToRealPace(flatPace, 0.1);
  assert.ok(realUphillPace > flatPace, "monter à la même allure coûte plus cher: l'allure réelle doit être plus lente (plus grande) que la cible plat");
  const backToFlat = realPaceToFlatEquivalent(realUphillPace, 0.1);
  assert.ok(Math.abs(backToFlat - flatPace) < 1e-9);
});

test("GAP — avertissement au-delà de -15%", () => {
  const { warning } = flatEquivalentToRealPace(5.0, -0.25);
  assert.ok(warning);
});

test("ACWR — zone verte entre 0.8 et 1.3", () => {
  const loads = Array(28).fill(50);
  assert.equal(acwrZone(acwr(loads)), "verte");
});

test("ACWR — zone rouge sur pic aigu après charge chronique stable", () => {
  const loads = [...Array(21).fill(50), ...Array(7).fill(150)];
  const value = acwr(loads);
  assert.ok(value > 1.5, `ACWR attendu >1.5, obtenu ${value}`);
  assert.equal(acwrZone(value), "rouge");
});

test("loadSummary inclut toujours l'avertissement méthodologique", () => {
  const summary = loadSummary(Array(28).fill(40));
  assert.ok(summary.disclaimer.length > 0);
});

test("Pacing — découpage en segments respecte la longueur min/max", () => {
  const points = [];
  let dist = 0;
  for (let i = 0; i < 200; i++) {
    dist += 20;
    const altitude = i < 100 ? i * 2 : 200 - (i - 100) * 2; // montée puis descente
    points.push({ lat: 0, lon: 0, altitude, distanceCumulee: dist });
  }
  const segments = decouperSegments(points, { tolerancePente: 0.02, longueurMin: 150, longueurMax: 1200 });
  assert.ok(segments.length >= 2, "doit détecter au moins la montée et la descente");
  for (const s of segments) {
    assert.ok(s.distance <= 1200 + 20, `segment trop long: ${s.distance}`);
  }
});

test("Pacing — effort constant: temps total des segments = temps cible", () => {
  const segments = [
    { distance: 5000, penteMoyenne: 0 },
    { distance: 2000, penteMoyenne: 0.08 },
    { distance: 3000, penteMoyenne: -0.08 },
  ];
  const tempsCibleSec = 3600; // 1h
  const { segments: out } = calculerPacingEffortConstant(segments, tempsCibleSec);
  const dernierCumule = out[out.length - 1].tempsCumuleMin;
  assert.ok(Math.abs(dernierCumule - 60) < 0.01, `temps cumulé final=${dernierCumule}, attendu 60`);
  // segment en montée doit être parcouru plus lentement (allure min/km plus grande) que le plat
  assert.ok(out[1].allureMinParKm > out[0].allureMinParKm);
  // segment en descente légère doit être plus rapide que le plat (jusqu'à -10%, zone économique)
  assert.ok(out[2].allureMinParKm < out[0].allureMinParKm);
});

test("Pacing — agrégation par km: un parcours vallonné avec des segments de 150-200m donne une ligne par km complet", () => {
  // Simule ce que produit decouperSegments sur un GPX vallonné réel : beaucoup
  // de petits segments (150-300m) sur les 3 premiers km, un segment plus long ensuite.
  const segmentsFins = [
    { distance: 200, penteMoyenne: 0.03 },
    { distance: 180, penteMoyenne: -0.02 },
    { distance: 300, penteMoyenne: 0.01 },
    { distance: 220, penteMoyenne: 0.04 },
    { distance: 250, penteMoyenne: -0.01 },
    { distance: 350, penteMoyenne: 0 },
    { distance: 1000, penteMoyenne: 0.02 },
    { distance: 1500, penteMoyenne: -0.02 },
  ]; // total = 4000m
  const tempsCibleSec = 1200; // 20 min
  const { segments } = calculerPacingEffortConstant(segmentsFins, tempsCibleSec);

  const parKm = agregerPacingParKm(segments, 4000);
  assert.equal(parKm.length, 4, "4 lignes attendues pour 4000m (une par km complet)");
  for (const ligne of parKm) {
    assert.ok(Math.abs(ligne.distance - 1000) < 0.01, `chaque ligne doit couvrir exactement 1km, obtenu ${ligne.distance}`);
  }
  const tempsTotal = parKm[parKm.length - 1].tempsCumuleMin;
  assert.ok(Math.abs(tempsTotal - 20) < 0.01, `temps cumulé final=${tempsTotal}, attendu 20min`);
});

test("Pacing — agrégation par km: distance non multiple de 1000m ajoute un dernier segment partiel", () => {
  const segmentsFins = [
    { distance: 1000, penteMoyenne: 0 },
    { distance: 1000, penteMoyenne: 0 },
    { distance: 195, penteMoyenne: 0 }, // ex. marathon 2195m après les 2 premiers km (simplifié)
  ];
  const { segments } = calculerPacingEffortConstant(segmentsFins, 600); // 10 min
  const parKm = agregerPacingParKm(segments, 2195);
  assert.equal(parKm.length, 3, "2 km complets + 1 segment partiel de 195m");
  assert.ok(Math.abs(parKm[0].distance - 1000) < 0.01);
  assert.ok(Math.abs(parKm[1].distance - 1000) < 0.01);
  assert.ok(Math.abs(parKm[2].distance - 195) < 0.01);
});

test("Pacing — détection des points significatifs: une vraie bosse (50m sur 1km) est détectée comme sommet", () => {
  const points = [];
  for (let d = 0; d <= 1000; d += 100) points.push({ distanceCumulee: d, altitude: (d / 1000) * 50 });
  for (let d = 1100; d <= 2000; d += 100) points.push({ distanceCumulee: d, altitude: 50 });
  for (let d = 2100; d <= 3000; d += 100) points.push({ distanceCumulee: d, altitude: 50 - ((d - 2000) / 1000) * 50 });

  const reperes = detecterPointsSignificatifs(points);
  assert.equal(reperes.length, 1, `attendu 1 repère (sommet), obtenu ${reperes.length}`);
  assert.equal(reperes[0].type, "sommet");
  assert.ok(Math.abs(reperes[0].altitude - 50) < 1);
  assert.ok(reperes[0].distanceM >= 1000 && reperes[0].distanceM <= 2000);
});

test("Pacing — détection des points significatifs: le bruit GPS résiduel (<20m) est ignoré", () => {
  const points = [];
  for (let d = 0; d <= 2000; d += 50) {
    // micro-oscillations de +/- 5m autour de 100m d'altitude -> pas un vrai relief
    points.push({ distanceCumulee: d, altitude: 100 + Math.sin(d / 100) * 5 });
  }
  const reperes = detecterPointsSignificatifs(points);
  assert.equal(reperes.length, 0, `bruit résiduel ne doit produire aucun repère, obtenu ${reperes.length}`);
});

test("Boucle adaptative — propose une conversion si 2 marqueurs sur 3 dégradés", () => {
  const baseline = Array(14).fill(60); // RMSSD stable
  const logs = {
    rmssd: [...baseline, 40, 38, 39], // dégradé (baisse)
    fcRepos: [...Array(14).fill(50), 65, 66, 64], // dégradé (hausse)
    bienEtre: [...Array(14).fill(7), 7, 7, 7], // stable
  };
  const result = evaluerBoucleAdaptative(logs, { acwrEwma: 1.0, zone: "verte" });
  assert.equal(result.marqueursDegrades.length, 2);
  assert.equal(result.propositions.length, 1);
  assert.equal(result.modeAutomatique, false);
});

test("Boucle adaptative — ne propose rien si les marqueurs sont stables", () => {
  const logs = {
    rmssd: Array(17).fill(60),
    fcRepos: Array(17).fill(50),
    bienEtre: Array(17).fill(7),
  };
  const result = evaluerBoucleAdaptative(logs, { acwrEwma: 1.0, zone: "verte" });
  assert.equal(result.propositions.length, 0);
});

test("Retest implicite — proposé si écart VDOT observé > seuil", () => {
  const r = detecterRetestImplicite(50, 53);
  assert.equal(r.proposer, true);
  const r2 = detecterRetestImplicite(50, 50.5);
  assert.equal(r2.proposer, false);
});
