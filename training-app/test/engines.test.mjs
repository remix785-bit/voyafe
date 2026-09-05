import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vdotFromPerformance,
  paceZonesForVdot,
  riegelPredict,
  altitudeDeltaVo2max,
  adjustPaceForAltitude,
  formatPace,
  parsePaceLabel,
  parseDureeLabel,
  formatDureeCompacte,
  evaluerCoherenceObjectif,
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
  detecterPointsSignificatifs,
  resoudreDistanceAllureTemps,
  coutGapDomaine,
  facteurTechnicite,
  modeSegment,
  tempsMinSegmentHike,
  allurePlatEquivalenteCible,
  genererPlanPacing,
  agregerPacingParKm,
  detecterAlertesPlan,
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

test("evaluerCoherenceObjectif — objectif déjà couvert par le VDOT actuel -> niveau 'atteint'", () => {
  const { vdot: vdotActuel } = vdotFromPerformance(10000, 40 * 60);
  // Objectif 10K en 42:00, plus lent que la forme actuelle -> déjà à portée.
  const res = evaluerCoherenceObjectif(vdotActuel, 10000, 42 * 60, 12);
  assert.equal(res.niveau, "atteint");
  assert.ok(res.ecartPct <= 0);
});

test("evaluerCoherenceObjectif — écart modéré sur un plan assez long -> 'ambitieux' (dans le plafond réaliste)", () => {
  const { vdot: vdotActuel } = vdotFromPerformance(10000, 42 * 60);
  const { vdot: vdotObjectifAttendu } = vdotFromPerformance(10000, 40 * 60); // ~5.9% de VDOT en plus
  const ecartAttendu = ((vdotObjectifAttendu - vdotActuel) / vdotActuel) * 100;
  assert.ok(ecartAttendu > 5 && ecartAttendu < 7, `écart de test hors bornes utiles: ${ecartAttendu}`);
  const res = evaluerCoherenceObjectif(vdotActuel, 10000, 40 * 60, 30); // 30 semaines -> plafond 7.5%, > écart
  assert.equal(res.niveau, "ambitieux");
  assert.ok(Math.abs(res.ecartPct - ecartAttendu) < 0.01);
});

test("evaluerCoherenceObjectif — grand écart sur un plan court -> 'tres_ambitieux'", () => {
  const { vdot: vdotActuel } = vdotFromPerformance(10000, 50 * 60);
  const res = evaluerCoherenceObjectif(vdotActuel, 10000, 35 * 60, 6); // objectif très ambitieux, 6 semaines seulement
  assert.equal(res.niveau, "tres_ambitieux");
  assert.ok(res.ecartPct > res.plafondRealistePct);
});

test("evaluerCoherenceObjectif — le plafond réaliste croît avec le nombre de semaines disponibles, mais reste borné", () => {
  const vdotActuel = 50;
  const court = evaluerCoherenceObjectif(vdotActuel, 10000, 40 * 60, 4);
  const long = evaluerCoherenceObjectif(vdotActuel, 10000, 40 * 60, 40);
  assert.ok(long.plafondRealistePct > court.plafondRealistePct);
  assert.ok(long.plafondRealistePct <= 12, "le plafond doit rester borné même sur un très long plan");
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

test("GAP — facteur de calibration 1.0 (défaut) reproduit exactement le modèle Minetti standard", () => {
  const flatPace = 5.0;
  const sansFacteur = flatEquivalentToRealPace(flatPace, 0.1);
  const facteurUn = flatEquivalentToRealPace(flatPace, 0.1, 1);
  assert.equal(sansFacteur.paceMinPerKm, facteurUn.paceMinPerKm);
});

test("GAP — facteur de calibration >1 amplifie l'écart au plat (coureur plus sensible aux pentes que le modèle)", () => {
  const flatPace = 5.0;
  const standard = flatEquivalentToRealPace(flatPace, 0.1, 1).paceMinPerKm;
  const amplifie = flatEquivalentToRealPace(flatPace, 0.1, 1.5).paceMinPerKm;
  assert.ok(amplifie > standard, "1.5x en montée doit ralentir davantage que le modèle non calibré");
});

test("GAP — facteur de calibration <1 atténue l'écart au plat, et à pente nulle le facteur n'a aucun effet", () => {
  const flatPace = 5.0;
  const standard = flatEquivalentToRealPace(flatPace, 0.1, 1).paceMinPerKm;
  const attenue = flatEquivalentToRealPace(flatPace, 0.1, 0.5).paceMinPerKm;
  assert.ok(attenue < standard, "0.5x en montée doit ralentir moins que le modèle non calibré");
  assert.ok(attenue > flatPace, "reste tout de même plus lent qu'à plat");
  // pente nulle -> gapFactor(0) = 1 -> l'écart (facteur-1) est nul quel que soit facteurCalibre
  assert.equal(flatEquivalentToRealPace(flatPace, 0, 1.8).paceMinPerKm, flatPace);
});

test("coutGapDomaine — borne la pente au domaine de validité fiable ±20% avant d'appliquer Minetti (§2.3)", () => {
  assert.equal(coutGapDomaine(0.25), coutGapDomaine(0.2));
  assert.equal(coutGapDomaine(-0.3), coutGapDomaine(-0.2));
});

test("coutGapDomaine — reproduit la table de facteurs de coût du §2.2 (tolérance 0.02)", () => {
  const table = [
    [0.2, 2.5],
    [0.15, 2.06],
    [0.1, 1.66],
    [0.05, 1.3],
    [0, 1.0],
    [-0.05, 0.76],
    [-0.1, 0.6],
    [-0.15, 0.51],
    [-0.2, 0.5],
  ];
  for (const [penteMoyenne, attendu] of table) {
    assert.ok(Math.abs(coutGapDomaine(penteMoyenne) - attendu) < 0.02, `pente ${penteMoyenne}: attendu ~${attendu}, obtenu ${coutGapDomaine(penteMoyenne)}`);
  }
});

test("facteurTechnicite — chemin roulant = 1.00, technicité croissante = facteur croissant (§3)", () => {
  assert.equal(facteurTechnicite("roulant"), 1.0);
  assert.ok(facteurTechnicite("modere") < facteurTechnicite("technique"));
  assert.ok(facteurTechnicite("technique") < facteurTechnicite("extreme"));
});

test("modeSegment — bascule en marche (hike) au seuil de pente, course (run) en-dessous (§4)", () => {
  assert.equal(modeSegment(0.2, 0.15), "hike");
  assert.equal(modeSegment(0.1, 0.15), "run");
  assert.equal(modeSegment(0.15, 0.15), "hike");
});

test("tempsMinSegmentHike — temps proportionnel au D+ et inversement proportionnel à la capacité D+/h (§5)", () => {
  assert.equal(tempsMinSegmentHike(600, 600), 60);
  assert.equal(tempsMinSegmentHike(300, 600), 30);
  assert.equal(tempsMinSegmentHike(600, 1200), 30);
});

test("allurePlatEquivalenteCible — exemple appliqué du document (§13, Trail de Volvic 45km/1350m D+, objectif 4h30) : ≈4:37/km", () => {
  const allure = allurePlatEquivalenteCible(45, 1350, 270);
  assert.ok(Math.abs(allure - (4 + 37 / 60)) < 0.01, `attendu ~4:37/km (4.6167), obtenu ${allure}`);
});

test("genererPlanPacing — segment plat (mode course) : temps = distance × allure plat-équivalente (facteur GAP = 1)", () => {
  const segments = [{ distance: 5000, denivele: 0, penteMoyenne: 0 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 1500 });
  assert.equal(plan.segments[0].mode, "run");
  assert.ok(Math.abs(plan.segments[0].tempsSegmentMin - 25) < 1e-9);
  assert.ok(Math.abs(plan.totals.predictedTimeMin - 25) < 1e-9);
});

test("genererPlanPacing — pente ≥ seuil de marche bascule en mode hike, calculé via la capacité D+/h et non l'allure plat-équivalente (§4/§5)", () => {
  const segments = [{ distance: 1000, denivele: 200, penteMoyenne: 0.2 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600, seuilMarchePct: 0.15 }, { tempsCibleSecondes: 99999 });
  assert.equal(plan.segments[0].mode, "hike");
  assert.ok(Math.abs(plan.segments[0].tempsSegmentMin - 20) < 1e-9); // 200/600*60=20min
});

test("genererPlanPacing — montée en mode course (sous le seuil) : allure plus lente que le plat, descente économique plus rapide (§2)", () => {
  const segments = [
    { distance: 1000, denivele: 0, penteMoyenne: 0 },
    { distance: 1000, denivele: 80, penteMoyenne: 0.08 },
    { distance: 1000, denivele: -80, penteMoyenne: -0.08 },
  ];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 900 });
  assert.ok(plan.segments[1].allureMinParKm > plan.segments[0].allureMinParKm, "montée plus lente que le plat");
  assert.ok(plan.segments[2].allureMinParKm < plan.segments[0].allureMinParKm, "descente économique plus rapide que le plat");
});

test("genererPlanPacing — le facteur de technicité multiplie le temps final du segment (§3)", () => {
  const segments = [{ distance: 1000, denivele: 0, penteMoyenne: 0 }];
  const roulant = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600, technicite: "roulant" }, { tempsCibleSecondes: 300 });
  const technique = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600, technicite: "technique" }, { tempsCibleSecondes: 300 });
  assert.ok(technique.segments[0].tempsSegmentMin > roulant.segments[0].tempsSegmentMin);
});

test("genererPlanPacing — totals.deltaMin reflète l'écart réel entre temps prédit et objectif (pas de recalage forcé, §10/§11)", () => {
  const segments = [{ distance: 10000, denivele: 0, penteMoyenne: 0 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 6, dplusParHeure: 600 }, { tempsCibleSecondes: 1800 }); // objectif 30min, prédit 60min
  assert.ok(Math.abs(plan.totals.predictedTimeMin - 60) < 1e-9);
  assert.ok(Math.abs(plan.totals.deltaMin - 30) < 1e-9);
});

test("agregerPacingParKm — un parcours vallonné avec segments fins (150-300m) donne une ligne par km complet", () => {
  const segmentsFins = [
    { distance: 200, denivele: 6, penteMoyenne: 0.03 },
    { distance: 180, denivele: -3.6, penteMoyenne: -0.02 },
    { distance: 300, denivele: 3, penteMoyenne: 0.01 },
    { distance: 220, denivele: 8.8, penteMoyenne: 0.04 },
    { distance: 250, denivele: -2.5, penteMoyenne: -0.01 },
    { distance: 350, denivele: 0, penteMoyenne: 0 },
    { distance: 1000, denivele: 20, penteMoyenne: 0.02 },
    { distance: 1500, denivele: -30, penteMoyenne: -0.02 },
  ]; // total = 4000m
  const plan = genererPlanPacing(segmentsFins, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 1200 });
  const parKm = agregerPacingParKm(plan.segments, 4000);
  assert.equal(parKm.length, 4, "4 lignes attendues pour 4000m (une par km complet)");
  for (const ligne of parKm) {
    assert.ok(Math.abs(ligne.distance - 1000) < 0.01, `chaque ligne doit couvrir exactement 1km, obtenu ${ligne.distance}`);
  }
  const dernierCumule = parKm[parKm.length - 1].tempsCumuleMin;
  assert.ok(Math.abs(dernierCumule - plan.totals.predictedTimeMin) < 0.01, "le cumul de la dernière ligne doit correspondre au temps total prédit");
});

test("agregerPacingParKm — distance non multiple de 1000m ajoute un dernier segment partiel", () => {
  const segments = [
    { distance: 1000, denivele: 0, penteMoyenne: 0 },
    { distance: 1000, denivele: 0, penteMoyenne: 0 },
    { distance: 195, denivele: 0, penteMoyenne: 0 },
  ];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 600 });
  const parKm = agregerPacingParKm(plan.segments, 2195);
  assert.equal(parKm.length, 3, "2 km complets + 1 segment partiel de 195m");
  assert.ok(Math.abs(parKm[0].distance - 1000) < 0.01);
  assert.ok(Math.abs(parKm[1].distance - 1000) < 0.01);
  assert.ok(Math.abs(parKm[2].distance - 195) < 0.01);
});

test("agregerPacingParKm — le mode retenu par ligne km reflète le mode (course/marche) du segment d'origine couvrant le milieu de l'intervalle", () => {
  const segments = [
    { distance: 1000, denivele: 0, penteMoyenne: 0 },
    { distance: 1000, denivele: 200, penteMoyenne: 0.2 },
  ];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600, seuilMarchePct: 0.15 }, { tempsCibleSecondes: 99999 });
  const parKm = agregerPacingParKm(plan.segments, 2000);
  assert.equal(parKm[0].mode, "run");
  assert.equal(parKm[1].mode, "hike");
});

test("detecterAlertesPlan — signale les pentes hors domaine de validité ±20% quand une portion significative du parcours (>3%) est concernée (§2.3/§14)", () => {
  const segments = [{ distance: 500, denivele: 150, penteMoyenne: 0.3 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 600 });
  const alertes = detecterAlertesPlan(segments, plan, {});
  assert.ok(alertes.some((a) => a.includes("domaine de validité")));
});

test("detecterAlertesPlan — un segment isolé et bref hors domaine (<3% du parcours) ne déclenche PAS l'alerte (bruit GPS/pointe technique courante sur un GPX réel)", () => {
  const segments = [
    { distance: 9900, denivele: 0, penteMoyenne: 0 },
    { distance: 100, denivele: 30, penteMoyenne: 0.3 }, // 1% de la distance totale, hors domaine
  ];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 3000 });
  const alertes = detecterAlertesPlan(segments, plan, {});
  assert.ok(!alertes.some((a) => a.includes("domaine de validité")), "un segment isolé hors domaine ne doit pas déclencher l'alerte globale");
});

test("detecterAlertesPlan — signale un écart nutrition >45min entre rappels (§9/§14)", () => {
  const segments = [{ distance: 1000, denivele: 0, penteMoyenne: 0 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 300 });
  const alertes = detecterAlertesPlan(segments, plan, { frequenceMin: 50 });
  assert.ok(alertes.some((a) => a.includes("nutrition")));
});

test("detecterAlertesPlan — signale un écart important entre temps prédit et objectif (§10/§11)", () => {
  const segments = [{ distance: 10000, denivele: 0, penteMoyenne: 0 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 6, dplusParHeure: 600 }, { tempsCibleSecondes: 1800 });
  const alertes = detecterAlertesPlan(segments, plan, {});
  assert.ok(alertes.some((a) => a.includes("objectif")));
});

test("detecterAlertesPlan — aucune alerte si tout est dans les clous", () => {
  const segments = [{ distance: 5000, denivele: 0, penteMoyenne: 0 }];
  const plan = genererPlanPacing(segments, { flatEquivalentPaceMinKm: 5, dplusParHeure: 600 }, { tempsCibleSecondes: 1500 });
  const alertes = detecterAlertesPlan(segments, plan, { frequenceMin: 30 });
  assert.equal(alertes.length, 0);
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

test("loadSummary — sans dailyVolumes fourni, se comporte comme avant (zone = zone d'intensité seule)", () => {
  const summary = loadSummary(Array(28).fill(40));
  assert.equal(summary.acwrVolumeEwma, null);
  assert.equal(summary.zoneVolume, null);
  assert.equal(summary.zone, summary.zoneIntensite);
});

test("loadSummary — le volume brut pèse au moins autant que l'intensité perçue : un pic de volume seul suffit à faire passer la zone en rouge", () => {
  // Intensité perçue (sRPE) stable -> zone verte sur cet axe seul.
  const chargesIntensite = Array(28).fill(50);
  // Volume brut (km) : pic aigu sur les 7 derniers jours après une base stable -> zone rouge sur cet axe.
  const volumes = [...Array(21).fill(30), ...Array(7).fill(90)];
  const summary = loadSummary(chargesIntensite, volumes);
  assert.equal(summary.zoneIntensite, "verte");
  assert.equal(summary.zoneVolume, "rouge");
  assert.equal(summary.zone, "rouge", "la zone finale doit retenir la plus prudente des deux axes, pas seulement l'intensité");
});

test("loadSummary — quand les deux axes sont alignés, la zone est simplement celle des deux", () => {
  const stable = Array(28).fill(50);
  const summary = loadSummary(stable, stable);
  assert.equal(summary.zoneIntensite, "verte");
  assert.equal(summary.zoneVolume, "verte");
  assert.equal(summary.zone, "verte");
});

test("loadSummary — donneesLimitees est vrai en dessous de 7 jours d'historique, et le disclaimer le mentionne", () => {
  const debutant = loadSummary([40, 42, 38], [5, 6, 4]);
  assert.equal(debutant.donneesLimitees, true);
  assert.ok(debutant.disclaimer.includes("provisoire"));
  const confirme = loadSummary(Array(10).fill(40), Array(10).fill(5));
  assert.equal(confirme.donneesLimitees, false);
  assert.ok(!confirme.disclaimer.includes("provisoire"));
});

test("loadSummary — calculable dès le premier jour de données (pas d'attente de 7 jours), sur demande explicite", () => {
  const summary = loadSummary([40], [8]);
  assert.equal(summary.acwrVolumeEwma, 1); // un seul point -> ratio trivial mais non nul, pas de crash
  assert.ok(summary.zone);
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

test("Boucle adaptative — zone rouge déclenchée par le seul volume brut : la justification nomme le volume, pas l'intensité perçue", () => {
  const logs = { rmssd: [], fcRepos: [], bienEtre: [] };
  const chargeActuelle = { acwrEwma: 1.0, zoneIntensite: "verte", acwrVolumeEwma: 1.8, zoneVolume: "rouge", zone: "rouge" };
  const result = evaluerBoucleAdaptative(logs, chargeActuelle);
  assert.equal(result.propositions.length, 1);
  assert.ok(result.propositions[0].justification.includes("volume brut"));
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

test("parsePaceLabel — parse « m:ss » (avec ou sans /km) en allure décimale, inverse de formatPace", () => {
  assert.equal(parsePaceLabel("4:00"), 4);
  assert.equal(parsePaceLabel("4:00/km"), 4);
  assert.ok(Math.abs(parsePaceLabel("3:45") - 3.75) < 1e-9);
  assert.equal(parsePaceLabel(""), null);
  assert.equal(parsePaceLabel("pas une allure"), null);
});

test("formatPace / parsePaceLabel — round-trip cohérent", () => {
  const allure = 4.5;
  assert.equal(parsePaceLabel(formatPace(allure)), allure);
});

test("parseDureeLabel — parse « m:ss » et « h:mm:ss » en secondes", () => {
  assert.equal(parseDureeLabel("1:36"), 96);
  assert.equal(parseDureeLabel("3:30:00"), 3.5 * 3600);
  assert.equal(parseDureeLabel(""), 0);
});

test("formatDureeCompacte / parseDureeLabel — round-trip cohérent, bascule en h:mm:ss au-delà d'une heure", () => {
  assert.equal(formatDureeCompacte(96), "1:36");
  assert.equal(formatDureeCompacte(3.5 * 3600), "3:30:00");
  assert.equal(parseDureeLabel(formatDureeCompacte(5025)), 5025);
});

test("resoudreDistanceAllureTemps — distance + allure connues -> résout le temps (cas d'usage principal : piste/ligne droite)", () => {
  const r = resoudreDistanceAllureTemps({ distanceM: 400, allureMinParKm: 4 });
  assert.equal(r.tempsS, 96); // 0.4km * 4min/km = 1.6min = 96s
});

test("resoudreDistanceAllureTemps — distance + temps connus -> résout l'allure", () => {
  const r = resoudreDistanceAllureTemps({ distanceM: 400, tempsS: 96 });
  assert.ok(Math.abs(r.allureMinParKm - 4) < 1e-9);
});

test("resoudreDistanceAllureTemps — allure + temps connus -> résout la distance", () => {
  const r = resoudreDistanceAllureTemps({ allureMinParKm: 4, tempsS: 96 });
  assert.ok(Math.abs(r.distanceM - 400) < 1e-9);
});

test("resoudreDistanceAllureTemps — moins de deux valeurs connues -> null (rien à résoudre)", () => {
  assert.equal(resoudreDistanceAllureTemps({ distanceM: 400 }), null);
  assert.equal(resoudreDistanceAllureTemps({}), null);
  assert.equal(resoudreDistanceAllureTemps(), null);
});
