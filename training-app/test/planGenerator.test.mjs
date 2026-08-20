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
  composerSemaine,
  calculerFacteurProgression,
  calculerDistanceSortieLongue,
  plafonnerVolumeHebdoTotal,
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

test("genererPlanComplet — l'allure objectif apparaît comme bloc dédié, l'allure globale reste cohérente avec distance/durée (route)", () => {
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

  // Sans objectif : pas de rampe de distance -> allure globale = allure M brute du VDOT.
  assert.equal(seanceM_sans.allureCibleMinParKm, sansObjectif.profilCourant.allures.M.target);
  assert.equal(seanceM_sans.allureBlocObjectifMinParKm, null);

  // Avec objectif : allure globale = allure E (majorité du volume, cohérente avec
  // distance/durée) ; l'allure objectif apparaît séparément, dans son propre champ.
  assert.equal(seanceM_avec.allureCibleMinParKm, avecObjectif.profilCourant.allures.E.target);
  assert.ok(Math.abs(seanceM_avec.allureBlocObjectifMinParKm - 4.977) < 0.01);
  assert.equal(avecObjectif.objectifPaceMinParKm, seanceM_avec.allureBlocObjectifMinParKm);
  assert.equal(avecObjectif.distanceObjectifM, 42195);

  // Cohérence interne : distance ≈ durée / allure globale affichée.
  const distanceRecalculee = seanceM_avec.volumeSeanceMin / seanceM_avec.allureCibleMinParKm;
  assert.ok(Math.abs(distanceRecalculee - seanceM_avec.distanceKm) < 0.01);
});

test("composerSemaine — le fractionné (T+I ou T+R) prime toujours sur le footing récupération quand la place manque", () => {
  const semaineDev4 = composerSemaine("developpement", "route", 4, 2); // paire -> T + I, 4 séances dispo
  const ids4 = semaineDev4.map((s) => s.catalogueId);
  assert.ok(ids4.includes("route_seuil"), "T attendu même à 4 séances/semaine");
  assert.ok(ids4.includes("route_interval"), "fractionné attendu même à 4 séances/semaine (pas de seuil arbitraire)");

  const semaineDev5 = composerSemaine("developpement", "route", 5, 2);
  const ids5 = semaineDev5.map((s) => s.catalogueId);
  assert.ok(ids5.includes("route_footing_recup"), "avec assez de place, le footing récup complète la semaine");
});

test("composerSemaine — route_footing_recup absent quand il n'y a pas de séance qualité (Base, semaine impaire)", () => {
  const semaine = composerSemaine("base", "route", 5, 1);
  assert.ok(!semaine.some((s) => s.catalogueId === "route_footing_recup"));
});

test("composerSemaine — le fractionné survit même à 3 séances/semaine disponibles (régression)", () => {
  const semainePaire = composerSemaine("developpement", "route", 3, 2);
  const semaineImpaire = composerSemaine("developpement", "route", 3, 3);
  const idsPaire = semainePaire.map((s) => s.catalogueId);
  const idsImpaire = semaineImpaire.map((s) => s.catalogueId);
  assert.ok(idsPaire.includes("route_interval"), `attendu route_interval, obtenu ${idsPaire}`);
  assert.ok(idsImpaire.includes("route_repetition"), `attendu route_repetition, obtenu ${idsImpaire}`);
});

test("composerSemaine — trail_cotes_courtes survit même à 3 séances/semaine disponibles", () => {
  const semaine = composerSemaine("developpement", "trail", 3, 1);
  const ids = semaine.map((s) => s.catalogueId);
  assert.ok(ids.includes("trail_cotes_courtes"), `attendu trail_cotes_courtes, obtenu ${ids}`);
});

test("composerSemaine — trail_descente_technique passe à 1×/semaine en Développement (§7.4)", () => {
  const dev1 = composerSemaine("developpement", "trail", 5, 1);
  const dev2 = composerSemaine("developpement", "trail", 5, 2);
  assert.ok(dev1.some((s) => s.catalogueId === "trail_descente_technique"));
  assert.ok(dev2.some((s) => s.catalogueId === "trail_descente_technique"));
});

test("composerSemaine — trail_descente_technique reste 1×/2 semaines en Base", () => {
  const base1 = composerSemaine("base", "trail", 5, 1);
  const base2 = composerSemaine("base", "trail", 5, 2);
  assert.ok(!base1.some((s) => s.catalogueId === "trail_descente_technique"));
  assert.ok(base2.some((s) => s.catalogueId === "trail_descente_technique"));
});

test("composerSemaine — répétition générale trail remplace la sortie D+ progressif", () => {
  const normale = composerSemaine("developpement", "trail", 5, 3, false);
  const repGenerale = composerSemaine("developpement", "trail", 5, 3, true);
  assert.equal(normale[0].catalogueId, "trail_sortie_dplus_progressif");
  assert.equal(repGenerale[0].catalogueId, "trail_sortie_longue_specifique");
});

test("genererPlanComplet — la répétition générale trail tombe sur la dernière semaine hors affûtage", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const semainesNonTaper = plan.semaines.filter((s) => s.phase !== "taper");
  const derniere = semainesNonTaper[semainesNonTaper.length - 1];
  assert.ok(derniere.seances.some((s) => s.templateId === "trail_sortie_longue_specifique"));
  // aucune autre semaine ne doit porter cette séance
  const autres = plan.semaines.filter((s) => s !== derniere);
  assert.ok(autres.every((s) => !s.seances.some((se) => se.templateId === "trail_sortie_longue_specifique")));
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

test("composerSemaine — Base route : T seulement 1 semaine sur 2, jamais d'I/R", () => {
  const semaine1 = composerSemaine("base", "route", 5, 1);
  const semaine2 = composerSemaine("base", "route", 5, 2);
  assert.ok(!semaine1.some((s) => s.catalogueId === "route_seuil"), "semaine impaire : pas de T");
  assert.ok(semaine2.some((s) => s.catalogueId === "route_seuil"), "semaine paire : T présent");
  assert.ok(!semaine1.some((s) => s.catalogueId === "route_interval" || s.catalogueId === "route_repetition"));
  assert.ok(!semaine2.some((s) => s.catalogueId === "route_interval" || s.catalogueId === "route_repetition"));
});

test("composerSemaine — Développement route : T chaque semaine, I/R en alternance", () => {
  const semaine1 = composerSemaine("developpement", "route", 5, 1);
  const semaine2 = composerSemaine("developpement", "route", 5, 2);
  assert.ok(semaine1.some((s) => s.catalogueId === "route_seuil"));
  assert.ok(semaine2.some((s) => s.catalogueId === "route_seuil"));
  assert.ok(semaine1.some((s) => s.catalogueId === "route_repetition"), "semaine impaire -> R");
  assert.ok(!semaine1.some((s) => s.catalogueId === "route_interval"));
  assert.ok(semaine2.some((s) => s.catalogueId === "route_interval"), "semaine paire -> I");
  assert.ok(!semaine2.some((s) => s.catalogueId === "route_repetition"));
});

test("calculerFacteurProgression — croît de 0.75x à 1.15x au sein d'une phase", () => {
  assert.equal(calculerFacteurProgression(0, 5), 0.75);
  assert.equal(calculerFacteurProgression(4, 5), 1.15);
  assert.ok(calculerFacteurProgression(2, 5) > 0.75 && calculerFacteurProgression(2, 5) < 1.15);
});

test("calculerDistanceSortieLongue — rampe vers le pic, plafonnée pour le marathon", () => {
  const debut = calculerDistanceSortieLongue(0, 10, 42195);
  const fin = calculerDistanceSortieLongue(9, 10, 42195);
  assert.ok(debut < fin, "la distance doit croître au fil du plan");
  assert.ok(fin <= 35, "jamais la distance complète du marathon à l'entraînement");
  assert.ok(fin > 30, `pic attendu proche de 35km, obtenu ${fin}`);
});

test("calculerDistanceSortieLongue — course courte (10K) : pic peut atteindre la distance objectif", () => {
  const fin = calculerDistanceSortieLongue(9, 10, 10000);
  assert.ok(Math.abs(fin - 10) < 0.01);
});

test("genererPlanComplet — la sortie longue progresse en distance vers l'objectif au fil du plan", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
    tempsObjectifS: 3.5 * 3600,
  });
  const sortieLongueParSemaine = plan.semaines
    .filter((s) => s.phase !== "taper")
    .map((s) => s.seances.find((se) => se.templateId === "route_sortie_longue").distanceKm);
  assert.ok(sortieLongueParSemaine[0] < sortieLongueParSemaine[sortieLongueParSemaine.length - 1]);
  for (const km of sortieLongueParSemaine) assert.ok(km > 0 && km <= 35);

  // Semaine de taper : distance nettement réduite par rapport au pic
  const semaineTaper = plan.semaines.find((s) => s.phase === "taper");
  const distanceTaper = semaineTaper.seances.find((se) => se.templateId === "route_sortie_longue").distanceKm;
  assert.ok(distanceTaper < sortieLongueParSemaine[sortieLongueParSemaine.length - 1]);
});

test("genererPlanComplet — chaque séance porte une distanceKm cohérente avec sa durée et son allure", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  for (const semaine of plan.semaines) {
    for (const s of semaine.seances) {
      assert.ok(s.distanceKm > 0, `distanceKm manquante pour ${s.nom}`);
    }
  }
});

test("semainesDisponibles — calcule un nombre entier de semaines", () => {
  const debut = new Date("2026-01-01T00:00:00Z");
  const fin = new Date("2026-01-01T00:00:00Z");
  fin.setDate(fin.getDate() + 16 * 7);
  assert.equal(semainesDisponibles(fin.toISOString(), debut.toISOString()), 16);
});

test("plafonnerVolumeHebdoTotal — réduit proportionnellement sans rien supprimer", () => {
  const seances = [
    { volumeSeanceMin: 90, allureCibleMinParKm: 5, distanceKm: 18 },
    { volumeSeanceMin: 30, allureCibleMinParKm: 4, distanceKm: 7.5 },
    { volumeSeanceMin: 30, allureCibleMinParKm: 3.5, distanceKm: 8.57 },
  ];
  const total = 150;
  const budget = 90; // 1h30, bien en dessous du total généré
  const out = plafonnerVolumeHebdoTotal(seances, budget);
  assert.equal(out.length, 3, "aucune séance supprimée, seulement réduites");
  const nouveauTotal = out.reduce((s, x) => s + x.volumeSeanceMin, 0);
  assert.ok(Math.abs(nouveauTotal - budget) < 0.01);
  for (const s of out) {
    assert.ok(s.avertissementVolumeHebdo);
    // distance recalculée cohérente avec la nouvelle durée
    assert.ok(Math.abs(s.distanceKm - s.volumeSeanceMin / s.allureCibleMinParKm) < 0.01);
  }
});

test("plafonnerVolumeHebdoTotal — ne touche à rien si le budget n'est pas dépassé ou non renseigné", () => {
  const seances = [{ volumeSeanceMin: 30, allureCibleMinParKm: 5, distanceKm: 6 }];
  assert.deepEqual(plafonnerVolumeHebdoTotal(seances, null), seances);
  assert.deepEqual(plafonnerVolumeHebdoTotal(seances, 60), seances);
});

test("genererPlanComplet — respecte le volume hebdo max sans faire disparaître le fractionné", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 3,
    volumeHebdoMaxMin: 120, // 2h/semaine, budget serré pour 3 séances
  });
  const semaineDev = plan.semaines.find((s) => s.phase === "developpement");
  const total = semaineDev.seances.reduce((sum, s) => sum + s.volumeSeanceMin, 0);
  assert.ok(total <= 120 + 0.5, `volume hebdo dépasse le budget: ${total}`);
  const zones = semaineDev.seances.map((s) => s.zoneDaniels);
  assert.ok(zones.includes("T"), `T attendu, obtenu ${zones}`);
  assert.ok(zones.includes("I") || zones.includes("R"), `fractionné attendu, obtenu ${zones}`);
});
