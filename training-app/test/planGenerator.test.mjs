import { test } from "node:test";
import assert from "node:assert/strict";
import {
  construireMacrocycle,
  genererSemaines,
  genererPlanComplet,
  genererSaison,
  semainesDisponibles,
  appliquerPlafondsHebdo,
  calculerAllureObjectif,
  instancierSeance,
  composerSemaine,
  calculerFacteurProgression,
  calculerDistanceSortieLongue,
  plafonnerVolumeHebdoTotal,
  assignerDatesSeances,
  trouverTemplate,
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

test("appliquerPlafondsHebdo — quand le volume d'une séance à répétitions est écrêté, sa structure précise (structureSeance.js) est re-résolue en cohérence, pas figée sur l'ancien volume", () => {
  const seanceInterval = instancierSeance(
    {
      zoneDaniels: "I",
      discipline: "route",
      corpsDeSeance: { dureeMin: [40, 56], type: "repetitions", repDureeMinRange: [3, 5], nbRepsRange: [4, 6], ratioEffortRecup: "1:1", recupLabel: "trot" },
    },
    { allures: { I: { target: 4, fast: 3.8 } } },
    { numero: 1, phase: "developpement", statut: "normale" }
  );
  assert.equal(seanceInterval.volumeSeanceMin, 48); // (40+56)/2, pas de progression appliquée (contexte null)
  assert.equal(seanceInterval.structureDetaillee.format, "6 × 4 min — récup 4 min trot"); // round(48/8)=6, plafond haut de [4,6]

  // Volume hebdo dominé par une grosse sortie E -> I dépasse 8% et se fait écrêter.
  const seances = [{ zoneDaniels: "E", volumeSeanceMin: 352 }, seanceInterval];
  const [, iEcretee] = appliquerPlafondsHebdo(seances);
  assert.ok(iEcretee.avertissementPlafond, "le plafond doit s'être déclenché");
  assert.equal(iEcretee.volumeSeanceMin, 32); // 400 * 8%
  assert.equal(iEcretee.structureDetaillee.format, "4 × 4 min — récup 4 min trot"); // round(32/8)=4, re-résolu sur le nouveau volume
  assert.notEqual(iEcretee.structureDetaillee.format, seanceInterval.structureDetaillee.format, "le format doit refléter le volume réduit, pas rester celui d'avant écrêtage");
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
  for (const [i, semaine] of plan.semaines.entries()) {
    // Dernière semaine : une séance de moins (repos garanti la veille de course).
    const attendu = i === plan.semaines.length - 1 ? 4 : 5;
    assert.equal(semaine.seances.length, attendu);
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

test("genererPlanComplet — le bloc à l'allure objectif de la sortie longue grandit avec l'ambition de l'objectif (evaluerCoherenceObjectif)", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const inputsCommuns = {
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
  };

  const trouverSortieLongueM = (plan) =>
    plan.semaines.find((s) => s.phase === "developpement").seances.find((s) => s.templateId === "route_sortie_longue");

  const atteint = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 3.5 * 3600 }); // vérifié: niveau "atteint"
  const ambitieux = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 190 * 60 }); // vérifié: niveau "ambitieux"
  const tresAmbitieux = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 186 * 60 }); // vérifié: niveau "tres_ambitieux"

  const sAtteint = trouverSortieLongueM(atteint);
  const sAmbitieux = trouverSortieLongueM(ambitieux);
  const sTresAmbitieux = trouverSortieLongueM(tresAmbitieux);

  const fraction = (s) => s.blocObjectifDureeMin / s.volumeSeanceMin;
  assert.ok(Math.abs(fraction(sAtteint) - 0.12) < 0.005);
  assert.ok(Math.abs(fraction(sAmbitieux) - 0.18) < 0.005);
  assert.ok(Math.abs(fraction(sTresAmbitieux) - 0.2) < 0.005);

  // Le contenu de la séance grandit avec l'ambition, pas seulement un badge affiché ailleurs.
  assert.ok(sAtteint.blocObjectifDureeMin < sAmbitieux.blocObjectifDureeMin);
  assert.ok(sAmbitieux.blocObjectifDureeMin < sTresAmbitieux.blocObjectifDureeMin);

  for (const s of [sAtteint, sAmbitieux, sTresAmbitieux]) {
    assert.ok(s.blocObjectifDureeMin <= 110, "jamais au-delà du plafond de sécurité du catalogue");
    assert.match(s.structureDetaillee.format, /à l'allure objectif/);
  }
});

test("genererPlanComplet — le volume des séances de spécificité trail (côtes, descente technique) grandit avec l'ambition de l'objectif", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const inputsCommuns = {
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195, // mêmes valeurs que le test route — même mécanique de niveau, discipline indifférente
  };

  const trouverCotesLongues = (plan) =>
    plan.semaines.find((s) => s.phase === "developpement").seances.find((s) => s.templateId === "trail_cotes_longues");

  const atteint = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 3.5 * 3600 }); // vérifié: niveau "atteint"
  const ambitieux = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 190 * 60 }); // vérifié: niveau "ambitieux"
  const tresAmbitieux = genererPlanComplet({ ...inputsCommuns, tempsObjectifS: 186 * 60 }); // vérifié: niveau "tres_ambitieux"

  const sAtteint = trouverCotesLongues(atteint);
  const sAmbitieux = trouverCotesLongues(ambitieux);
  const sTresAmbitieux = trouverCotesLongues(tresAmbitieux);
  assert.ok(sAtteint && sAmbitieux && sTresAmbitieux);

  // Même facteurPhase (même position dans le plan) -> le seul écart vient du boost d'ambition.
  assert.ok(Math.abs(sAmbitieux.volumeSeanceMin / sAtteint.volumeSeanceMin - 1.15) < 0.01);
  assert.ok(Math.abs(sTresAmbitieux.volumeSeanceMin / sAtteint.volumeSeanceMin - 1.3) < 0.01);
  assert.ok(sAtteint.volumeSeanceMin < sAmbitieux.volumeSeanceMin);
  assert.ok(sAmbitieux.volumeSeanceMin < sTresAmbitieux.volumeSeanceMin);
});

test("instancierSeance — boostSpecificiteTrail s'applique uniquement aux séances TRAIL_SPECIFICITE_IDS (côtes, descente technique)", () => {
  const profilCourant = { allures: { T: { target: 4.2, fast: 4.0 }, E: { target: 5.2, fast: 5.0 } }, facteurGapCalibre: 1 };
  const semaineContexte = { numero: 3, phase: "developpement", statut: "normale" };

  const cotesLongues = {
    id: "trail_cotes_longues",
    zoneDaniels: "T",
    discipline: "trail",
    gapAjuste: true,
    corpsDeSeance: { type: "repetitions", repDureeMinRange: [6, 10], nbRepsRange: [3, 5], ratioEffortRecup: "5:1" },
  };
  const sansBoost = instancierSeance(cotesLongues, profilCourant, semaineContexte, {}, null, { facteurPhase: 1 });
  const avecBoost = instancierSeance(cotesLongues, profilCourant, semaineContexte, {}, null, { facteurPhase: 1, boostSpecificiteTrail: 1.3 });
  assert.ok(Math.abs(avecBoost.volumeSeanceMin / sansBoost.volumeSeanceMin - 1.3) < 0.01);

  // Un template trail hors TRAIL_SPECIFICITE_IDS (ex: sortie D+ progressif, sans
  // rampe distance ici) n'est pas affecté par le boost — mécanique distincte
  // de fractionBlocObjectif (route) / boostSpecificiteTrail (côtes/descente).
  const sortieDplus = { id: "trail_sortie_dplus_progressif", zoneDaniels: "E", discipline: "trail", corpsDeSeance: {} };
  const sansBoostAutre = instancierSeance(sortieDplus, profilCourant, semaineContexte, {}, null, { facteurPhase: 1 });
  const avecBoostAutre = instancierSeance(sortieDplus, profilCourant, semaineContexte, {}, null, { facteurPhase: 1, boostSpecificiteTrail: 1.3 });
  assert.equal(sansBoostAutre.volumeSeanceMin, avecBoostAutre.volumeSeanceMin);
});

test("genererPlanComplet — le boost de spécificité trail ne s'applique pas aux séances route (discipline route inchangée)", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
    tempsObjectifS: 186 * 60, // "tres_ambitieux" -> boostSpecificiteTrail resterait 1x pour route de toute façon
  });
  const seuil = plan.semaines.find((s) => s.phase === "developpement").seances.find((s) => s.templateId === "route_seuil");
  // Volume attendu sans boost : uniquement facteurPhase (0.75-1.15x) sur les 30 min par défaut.
  assert.ok(seuil.volumeSeanceMin <= 30 * 1.15 + 0.01);
});

test("genererPlanComplet — sans distance+temps objectif, aucun bloc à l'allure objectif quantifié (comportement antérieur préservé)", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const sortieLongue = plan.semaines.find((s) => s.phase === "developpement").seances.find((s) => s.templateId === "route_sortie_longue");
  assert.equal(sortieLongue.blocObjectifDureeMin, null);
});

test("plafonnerVolumeHebdoTotal — le bloc à l'allure objectif est réduit dans la même proportion que le volume de la séance", () => {
  const seances = [
    {
      zoneDaniels: "M",
      volumeSeanceMin: 120,
      allureCibleMinParKm: 5,
      distanceKm: 24,
      blocObjectifDureeMin: 20,
      structureDetaillee: { format: "Majorité en E, dont 20 min à l'allure objectif" },
    },
  ];
  const [out] = plafonnerVolumeHebdoTotal(seances, 60); // ratio 0.5
  assert.equal(out.volumeSeanceMin, 60);
  assert.equal(out.blocObjectifDureeMin, 10);
  assert.match(out.structureDetaillee.format, /10 min à l'allure objectif/);
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

test("composerSemaine — répétition générale trail remplace la sortie D+ progressif (en fin de semaine)", () => {
  const normale = composerSemaine("developpement", "trail", 5, 3, false);
  const repGenerale = composerSemaine("developpement", "trail", 5, 3, true);
  assert.equal(normale[normale.length - 1].catalogueId, "trail_sortie_dplus_progressif");
  assert.equal(repGenerale[repGenerale.length - 1].catalogueId, "trail_sortie_longue_specifique");
});

test("composerSemaine — sortie longue en fin de semaine, endurance fondamentale en début", () => {
  const semaine = composerSemaine("developpement", "route", 5, 2);
  assert.equal(semaine[semaine.length - 1].catalogueId, "route_sortie_longue", "sortie longue attendue en dernier");

  const semaineBase = composerSemaine("base", "route", 5, 1); // impaire -> pas de T
  assert.equal(semaineBase[0].catalogueId, "route_endurance_fondamentale", "endurance fondamentale attendue en premier");
  assert.equal(semaineBase[semaineBase.length - 1].catalogueId, "route_sortie_longue");
});

test("composerSemaine — sortie longue trail toujours en dernier, même à faible disponibilité", () => {
  const semaine = composerSemaine("developpement", "trail", 3, 1);
  assert.equal(semaine[semaine.length - 1].catalogueId, "trail_sortie_dplus_progressif");
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

test("genererPlanComplet — facteurGapCalibre passé en input se retrouve sur profilCourant et amplifie l'ajustement GAP trail", () => {
  const dateDebut = new Date();
  const inputsCommuns = {
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  };
  const planStandard = genererPlanComplet(inputsCommuns);
  const planCalibre = genererPlanComplet({ ...inputsCommuns, facteurGapCalibre: 1.5 });
  assert.equal(planStandard.profilCourant.facteurGapCalibre, null);
  assert.equal(planCalibre.profilCourant.facteurGapCalibre, 1.5);

  const tplCotes = { zoneDaniels: "I", discipline: "trail", gapAjuste: true, corpsDeSeance: {} };
  const montee = { penteMoyenne: 0.1 };
  const seanceStandard = instancierSeance(tplCotes, planStandard.profilCourant, planStandard.semaines[0], montee, null);
  const seanceCalibree = instancierSeance(tplCotes, planCalibre.profilCourant, planCalibre.semaines[0], montee, null);
  assert.ok(
    seanceCalibree.allureCibleMinParKm > seanceStandard.allureCibleMinParKm,
    "avec un facteur >1, la séance en montée doit être ajustée à une allure plus lente que le modèle standard"
  );
});

test("instancierSeance — porte aussi la borne rapide de la fourchette (route, pas de GAP)", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const tplT = { zoneDaniels: "T", discipline: "route", corpsDeSeance: {} };
  const s = instancierSeance(tplT, plan.profilCourant, plan.semaines[0], {}, null);
  assert.equal(s.allureRapideMinParKm, plan.profilCourant.allures.T.fast);
  assert.ok(s.allureRapideMinParKm < s.allureCibleMinParKm, "rapide doit être un temps/km plus petit (plus vite) que cible");
});

test("instancierSeance — la borne rapide suit le même ajustement GAP que l'allure cible (trail)", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const tplCotes = { zoneDaniels: "I", discipline: "trail", gapAjuste: true, corpsDeSeance: {} };
  const plat = instancierSeance(tplCotes, plan.profilCourant, plan.semaines[0], { penteMoyenne: 0 }, null);
  const montee = instancierSeance(tplCotes, plan.profilCourant, plan.semaines[0], { penteMoyenne: 0.1 }, null);
  // en montée, l'allure GAP-ajustée (temps/km réel) doit être plus lente (nombre plus grand) qu'à plat,
  // pour la cible ET pour la borne rapide -- sinon la fourchette affichée serait incohérente avec le terrain.
  assert.ok(montee.allureCibleMinParKm > plat.allureCibleMinParKm);
  assert.ok(montee.allureRapideMinParKm > plat.allureRapideMinParKm);
  assert.ok(montee.allureRapideMinParKm < montee.allureCibleMinParKm);
});

test("instancierSeance — sortie longue avec objectif : la fourchette suit l'allure E majoritaire, pas la zone du template", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 21097,
  });
  const tplLongue = { id: "route_sortie_longue", zoneDaniels: "E", discipline: "route", corpsDeSeance: {} };
  const s = instancierSeance(tplLongue, plan.profilCourant, plan.semaines[0], {}, null, {
    facteurPhase: 1,
    distanceSortieLongueKm: 16,
  });
  assert.equal(s.allureRapideMinParKm, plan.profilCourant.allures.E.fast);
  assert.equal(s.allureCibleMinParKm, plan.profilCourant.allures.E.target);
});

test("instancierSeance — sortie longue en run/walk pour un VDOT bas sur une durée qui dépasse le seuil de risque", () => {
  const template = { id: "route_sortie_longue", zoneDaniels: "M", discipline: "route", corpsDeSeance: {} };
  const profilBas = { vdot: 28, allures: { E: { target: 8, fast: 7.5 }, M: { target: 7, fast: 6.5 } } };
  const s = instancierSeance(template, profilBas, { numero: 10, phase: "developpement", statut: "normale" }, {}, 6, {
    facteurPhase: 1,
    distanceSortieLongueKm: 30, // 30km à ~8min/km E -> 240 min, largement au-dessus du seuil
    fractionBlocObjectif: 0.2, // serait normalement du bloc objectif, doit être écarté par le run/walk
  });
  assert.equal(s.structureDetaillee.format, "Alterner 4 min course / 1 min marche active sur l'ensemble de la sortie");
  assert.equal(s.blocObjectifDureeMin, null, "le run/walk prime sur le bloc spécificité allure objectif");
  assert.ok(s.precautions.some((p) => p.includes("Alternance course/marche")));
});

test("instancierSeance — pas de run/walk pour un VDOT confortable ou une sortie courte, même sous le seuil VDOT", () => {
  const template = { id: "route_sortie_longue", zoneDaniels: "E", discipline: "route", corpsDeSeance: {} };
  const profilBon = { vdot: 50, allures: { E: { target: 5, fast: 4.8 } } };
  const sBonVdot = instancierSeance(template, profilBon, { numero: 10, phase: "developpement", statut: "normale" }, {}, null, {
    facteurPhase: 1,
    distanceSortieLongueKm: 30,
  });
  assert.notEqual(sBonVdot.structureDetaillee.format, "Alterner 4 min course / 1 min marche active sur l'ensemble de la sortie");

  const profilBas = { vdot: 28, allures: { E: { target: 8, fast: 7.5 } } };
  const sCourte = instancierSeance(template, profilBas, { numero: 10, phase: "developpement", statut: "normale" }, {}, null, {
    facteurPhase: 1,
    distanceSortieLongueKm: 6, // 6km à 8min/km = 48 min, sous le seuil de 70 min
  });
  assert.notEqual(sCourte.structureDetaillee.format, "Alterner 4 min course / 1 min marche active sur l'ensemble de la sortie");
});

test("composerSemaine — back-to-back (ultra trail) ajoute un 2e jour de sortie longue (jambes fatiguées) plutôt qu'une seule", () => {
  const normale = composerSemaine("developpement", "trail", 5, 3, false, null, false);
  const backToBack = composerSemaine("developpement", "trail", 5, 3, false, null, true);
  assert.ok(!normale.some((s) => s.catalogueId === "trail_sortie_longue_j2"));
  assert.ok(backToBack.some((s) => s.catalogueId === "trail_sortie_longue_j2"));
  assert.equal(backToBack[backToBack.length - 1].catalogueId, "trail_sortie_longue_j2", "le 2e jour (dimanche) reste en dernier");
  assert.equal(backToBack.length, normale.length, "toujours plafonné à nbSeancesDispo");
});

test("composerSemaine — le back-to-back ne s'applique jamais route (pas de pertinence identifiée), taper ou entretien", () => {
  const route = composerSemaine("developpement", "route", 5, 3, false, null, true);
  assert.ok(!route.some((s) => s.catalogueId === "trail_sortie_longue_j2"));
  const taper = composerSemaine("taper", "trail", 5, 3, false, null, true);
  assert.ok(!taper.some((s) => s.catalogueId === "trail_sortie_longue_j2"));
  const entretien = composerSemaine("entretien", "trail", 5, 3, false, null, true);
  assert.ok(!entretien.some((s) => s.catalogueId === "trail_sortie_longue_j2"));
});

test("instancierSeance — le 2e jour du back-to-back vaut ~40% de la distance du jour 1", () => {
  const jour1 = { id: "trail_sortie_dplus_progressif", zoneDaniels: "E", discipline: "trail", corpsDeSeance: {} };
  const jour2 = { id: "trail_sortie_longue_j2", zoneDaniels: "E", discipline: "trail", corpsDeSeance: {} };
  const profilCourant = { allures: { E: { target: 6, fast: 5.5 } } };
  const semaineContexte = { numero: 1, phase: "developpement", statut: "normale" };
  const s1 = instancierSeance(jour1, profilCourant, semaineContexte, {}, null, { facteurPhase: 1, distanceSortieLongueKm: 30 });
  const s2 = instancierSeance(jour2, profilCourant, semaineContexte, {}, null, { facteurPhase: 1, distanceSortieLongueKm: 30 });
  assert.ok(Math.abs(s2.distanceKm - s1.distanceKm * 0.4) < 0.01, `attendu ~40% de ${s1.distanceKm}, obtenu ${s2.distanceKm}`);
});

test("genererPlanComplet — back-to-back se déclenche uniquement pour un objectif trail > 25km, sur l'avant-dernière semaine hors taper", () => {
  const dateDebut = new Date();
  const planUltra = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 20 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 80000,
    deniveleM: 4000,
  });
  const semainesUtiles = planUltra.semaines.filter((s) => s.phase === "base" || s.phase === "developpement");
  const avantDerniere = semainesUtiles[semainesUtiles.length - 2];
  assert.ok(avantDerniere.seances.some((s) => s.templateId === "trail_sortie_longue_j2"));
  const autres = planUltra.semaines.filter((s) => s !== avantDerniere);
  assert.ok(autres.every((s) => !s.seances.some((se) => se.templateId === "trail_sortie_longue_j2")));

  const planCourt = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 20 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 15000, // sous le seuil ultra
    deniveleM: 800,
  });
  assert.ok(planCourt.semaines.every((s) => !s.seances.some((se) => se.templateId === "trail_sortie_longue_j2")));
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

test("genererPlanComplet — les séances à répétitions (T/I/R) du catalogue réel sortent avec UNE prescription précise, jamais une fourchette ni un choix « OU »", () => {
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
  const seancesQualite = plan.semaines
    .flatMap((s) => s.seances)
    .filter((s) => ["route_seuil", "route_interval", "route_repetition"].includes(s.templateId));
  assert.ok(seancesQualite.length > 0, "le plan doit contenir des séances T/I/R (phase Développement)");
  for (const s of seancesQualite) {
    const format = s.structureDetaillee.format;
    assert.ok(!/ OU /.test(format), `pas de choix « OU » attendu, obtenu : "${format}"`);
    assert.ok(!/\d+\s*-\s*\d+/.test(format), `pas de fourchette numérique attendue, obtenu : "${format}"`);
    if (s.templateId !== "route_seuil") {
      assert.ok(/^\d+ ×/.test(format), `un nombre entier de répétitions est attendu en tête, obtenu : "${format}"`);
    }
  }
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

test("assignerDatesSeances — place chaque séance sur le bon jour ISO choisi, dans l'ordre chronologique", () => {
  // Lundi 2026-01-05 (à vérifier : getDay()=1 -> lundi)
  const lundi = new Date("2026-01-05T00:00:00Z");
  assert.equal(lundi.getUTCDay(), 1, "pré-requis test: 2026-01-05 doit être un lundi");

  const joursEntrainement = [2, 4, 7]; // mardi, jeudi, dimanche
  const dates = assignerDatesSeances(lundi.toISOString(), 3, joursEntrainement);
  const jours = dates.map((d) => new Date(d).getUTCDay());
  assert.deepEqual(jours, [2, 4, 0], "mardi(2), jeudi(4), dimanche(0 en JS)");
  // La dernière séance (sortie longue, toujours en dernier dans composerSemaine)
  // tombe donc sur le dernier jour choisi chronologiquement -> dimanche.
  assert.ok(new Date(dates[2]) > new Date(dates[1]));
});

test("assignerDatesSeances — sans jours choisis, retourne null partout (comportement antérieur préservé)", () => {
  const dates = assignerDatesSeances(new Date().toISOString(), 4, null);
  assert.deepEqual(dates, [null, null, null, null]);
});

test("genererPlanComplet — le nombre de jours d'entraînement choisis détermine le nombre de séances/semaine", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    joursEntrainement: [1, 3, 5, 7], // 4 jours choisis
    nbSeancesHebdo: 99, // doit être ignoré au profit de joursEntrainement.length
  });
  assert.equal(plan.nbSeancesHebdo, 4);
  for (const [i, semaine] of plan.semaines.entries()) {
    // Dernière semaine : une séance de moins (repos garanti la veille de course).
    const attendu = i === plan.semaines.length - 1 ? 3 : 4;
    assert.equal(semaine.seances.length, attendu);
    for (const s of semaine.seances) assert.ok(s.date, "chaque séance doit avoir une date précise");
  }
});

test("construireMacrocycle — un objectif intermédiaire plafonne l'affûtage à 1 semaine, même en charge élevée", () => {
  const finale = construireMacrocycle(16, "elevee");
  const intermediaire = construireMacrocycle(16, "elevee", { typeObjectif: "intermediaire" });
  assert.equal(finale.taper, 3);
  assert.equal(intermediaire.taper, 1);
  assert.ok(intermediaire.base + intermediaire.developpement > finale.base + finale.developpement, "le taper réduit laisse plus de semaines de développement");
});

test("construireMacrocycle — plan court intermédiaire aussi plafonné à 1 semaine de taper", () => {
  const finale = construireMacrocycle(5, "moderee");
  const intermediaire = construireMacrocycle(5, "moderee", { typeObjectif: "intermediaire" });
  assert.equal(finale.taper, 2);
  assert.equal(intermediaire.taper, 1);
});

test("genererSaison — chaîne objectif(s) intermédiaire(s) puis objectif final, bout à bout sans chevauchement", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z"); // lundi
  const objectifIntermediaire = { nom: "10km de rentrée", distanceM: 10000, tempsS: 40 * 60, date: new Date(dateDebut.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objectifFinal = { nom: "Marathon", distanceM: 42195, tempsS: 3.5 * 3600, date: new Date(dateDebut.getTime() + 24 * 7 * 24 * 60 * 60 * 1000).toISOString() };

  const blocs = genererSaison({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    nbSeancesHebdo: 5,
    chargeHebdoMoyenneActuelle: "moderee",
    objectifFinal,
    objectifsIntermediaires: [objectifIntermediaire],
  });

  assert.equal(blocs.length, 2);
  const [bloc1, bloc2] = blocs;
  assert.equal(bloc1.roleSaison, "intermediaire");
  assert.equal(bloc1.ordreSaison, 1);
  assert.equal(bloc1.typeObjectif, "intermediaire");
  assert.equal(bloc1.dateEcheance, objectifIntermediaire.date);
  assert.equal(bloc1.dateDebutPlan, dateDebut.toISOString());

  assert.equal(bloc2.roleSaison, "finale");
  assert.equal(bloc2.ordreSaison, 2);
  assert.equal(bloc2.typeObjectif, "finale");
  assert.equal(bloc2.dateEcheance, objectifFinal.date);
  // Le bloc final démarre le lendemain de la course intermédiaire — pas de chevauchement.
  assert.equal(new Date(bloc2.dateDebutPlan).getTime(), new Date(objectifIntermediaire.date).getTime() + 24 * 60 * 60 * 1000);

  // Le taper de la course intermédiaire est réduit (1 semaine max) par rapport à l'objectif final.
  assert.ok(bloc1.macrocycle.taper <= 1);
  assert.equal(bloc2.macrocycle.taper, 2);
});

test("genererSaison — trie les objectifs intermédiaires par date même fournis dans le désordre", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objA = { nom: "A", distanceM: 10000, date: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objB = { nom: "B", distanceM: 10000, date: new Date(dateDebut.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objectifFinal = { nom: "Final", distanceM: 42195, date: new Date(dateDebut.getTime() + 24 * 7 * 24 * 60 * 60 * 1000).toISOString() };

  const blocs = genererSaison({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    objectifFinal,
    objectifsIntermediaires: [objA, objB], // A (16 sem.) fourni avant B (8 sem.) alors qu'il est plus tardif
  });

  assert.equal(blocs.length, 3);
  assert.equal(blocs[0].dateEcheance, objB.date, "B (plus tôt) doit être traité en premier");
  assert.equal(blocs[1].dateEcheance, objA.date);
  assert.equal(blocs[2].dateEcheance, objectifFinal.date);
});

test("genererSaison — rejette un objectif intermédiaire postérieur ou égal à l'objectif final", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  assert.throws(() =>
    genererSaison({
      discipline: "route",
      performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
      dateDebut: dateDebut.toISOString(),
      objectifFinal: { nom: "Final", distanceM: 42195, date: new Date(dateDebut.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString() },
      objectifsIntermediaires: [
        { nom: "Trop tard", distanceM: 10000, date: new Date(dateDebut.getTime() + 12 * 7 * 24 * 60 * 60 * 1000).toISOString() },
      ],
    })
  );
});

test("genererSaison — objectif final seul (aucun intermédiaire) équivaut à un plan simple", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objectifFinal = { nom: "10K", distanceM: 10000, tempsS: 40 * 60, date: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const blocs = genererSaison({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    objectifFinal,
  });
  assert.equal(blocs.length, 1);
  assert.equal(blocs[0].roleSaison, "finale");
  assert.equal(blocs[0].ordreSaison, 1);
});

test("genererPlanComplet — le D+ attendu (deniveleM) ajuste l'allure GAP des séances trail, sans D+ retombe sur du plat", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const planPlat = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 20000,
  });
  const planDPlus = genererPlanComplet({
    discipline: "trail",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 20000,
    deniveleM: 2000, // 10% de pente moyenne attendue
  });
  assert.equal(planPlat.deniveleM, null);
  assert.equal(planDPlus.deniveleM, 2000);

  const semaineDev = (p) => p.semaines.find((s) => s.phase === "developpement");
  const cotesPlat = semaineDev(planPlat).seances.find((s) => s.templateId === "trail_cotes_longues");
  const cotesDPlus = semaineDev(planDPlus).seances.find((s) => s.templateId === "trail_cotes_longues");
  assert.ok(cotesPlat && cotesDPlus);
  assert.ok(
    cotesDPlus.allureCibleMinParKm > cotesPlat.allureCibleMinParKm,
    "avec un D+ attendu, la séance de côtes doit être GAP-ajustée à une allure plus lente qu'à plat"
  );
});

test("genererSaison — chaque objectif porte sa propre discipline et son propre D+ (saison mixte route/trail)", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objectifTrail = {
    nom: "Trail des crêtes",
    discipline: "trail",
    distanceM: 20000,
    deniveleM: 1200,
    date: new Date(dateDebut.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const objectifFinal = {
    nom: "Marathon de Paris",
    discipline: "route",
    distanceM: 42195,
    tempsS: 3.5 * 3600,
    date: new Date(dateDebut.getTime() + 24 * 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const blocs = genererSaison({
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    nbSeancesHebdo: 5,
    objectifFinal,
    objectifsIntermediaires: [objectifTrail],
  });

  const [blocTrail, blocRoute] = blocs;
  assert.equal(blocTrail.discipline, "trail");
  assert.equal(blocTrail.deniveleM, 1200);
  assert.ok(blocTrail.semaines[0].seances.some((s) => s.templateId?.startsWith("trail_")), "le bloc trail doit utiliser le catalogue trail");

  assert.equal(blocRoute.discipline, "route");
  assert.equal(blocRoute.deniveleM, null, "le bloc route ne doit porter aucun D+, même si un autre bloc de la saison en a un");
  assert.ok(blocRoute.semaines[0].seances.some((s) => s.templateId?.startsWith("route_")), "le bloc route doit utiliser le catalogue route");
});

test("genererSaison — accepte plusieurs objectifs intermédiaires (pas seulement un), tous chaînés bout à bout", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objectifFinal = { nom: "Final", discipline: "route", distanceM: 42195, date: new Date(dateDebut.getTime() + 40 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objectifsIntermediaires = [
    { nom: "Course 1", discipline: "route", distanceM: 10000, date: new Date(dateDebut.getTime() + 8 * 7 * 24 * 60 * 60 * 1000).toISOString() },
    { nom: "Course 2", discipline: "trail", distanceM: 15000, deniveleM: 900, date: new Date(dateDebut.getTime() + 18 * 7 * 24 * 60 * 60 * 1000).toISOString() },
    { nom: "Course 3", discipline: "route", distanceM: 21097, date: new Date(dateDebut.getTime() + 28 * 7 * 24 * 60 * 60 * 1000).toISOString() },
  ];

  const blocs = genererSaison({
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    objectifFinal,
    objectifsIntermediaires,
  });

  assert.equal(blocs.length, 4, "3 intermédiaires + 1 final = 4 blocs");
  assert.deepEqual(blocs.map((b) => b.objectif), ["Course 1", "Course 2", "Course 3", "Final"]);
  assert.deepEqual(blocs.map((b) => b.ordreSaison), [1, 2, 3, 4]);
  // Chaque bloc démarre le lendemain de la fin du précédent, sans chevauchement.
  for (let i = 1; i < blocs.length; i++) {
    assert.equal(
      new Date(blocs[i].dateDebutPlan).getTime(),
      new Date(blocs[i - 1].dateEcheance).getTime() + 24 * 60 * 60 * 1000
    );
  }
});

test("construireMacrocycle — priorite prime sur typeObjectif : A pas de plafond, B 2 semaines, C 1 semaine", () => {
  const a = construireMacrocycle(16, "elevee", { typeObjectif: "intermediaire", priorite: "A" });
  const b = construireMacrocycle(16, "elevee", { typeObjectif: "intermediaire", priorite: "B" });
  const c = construireMacrocycle(16, "elevee", { typeObjectif: "intermediaire", priorite: "C" });
  assert.equal(a.taper, 3, "priorite A -> aucun plafond, taper suit la charge (élevée -> 3)");
  assert.equal(b.taper, 2, "priorite B -> plafonné à 2");
  assert.equal(c.taper, 1, "priorite C -> plafonné à 1, comme l'ancien comportement 'intermediaire'");
});

test("construireMacrocycle — au-delà de la fenêtre utile (18 semaines route), le surplus devient une phase d'entretien plutôt que d'étirer base/développement", () => {
  const court = construireMacrocycle(16, "moderee", { discipline: "route" });
  assert.equal(court.entretien, 0, "sous la fenêtre utile, pas d'entretien");

  const long = construireMacrocycle(30, "moderee", { discipline: "route" });
  assert.equal(long.entretien, 12, "30 - 18 (fenêtre utile route) = 12 semaines d'entretien");
  assert.equal(long.entretien + long.base + long.developpement + long.taper, 30, "le total de semaines reste inchangé");
  // La partie "utile" (18 semaines) se découpe exactement comme un plan de
  // 18 semaines autonome — le surplus ne dilue pas le macrocycle spécifique.
  const equivalent18 = construireMacrocycle(18, "moderee", { discipline: "route" });
  assert.equal(long.base, equivalent18.base);
  assert.equal(long.developpement, equivalent18.developpement);
  assert.equal(long.taper, equivalent18.taper);
});

test("construireMacrocycle — le trail tolère une fenêtre utile plus longue (22 semaines) avant d'ajouter de l'entretien", () => {
  const route20 = construireMacrocycle(20, "moderee", { discipline: "route" });
  const trail20 = construireMacrocycle(20, "moderee", { discipline: "trail" });
  assert.ok(route20.entretien > 0, "20 semaines dépasse déjà la fenêtre utile route (18)");
  assert.equal(trail20.entretien, 0, "20 semaines reste sous la fenêtre utile trail (22)");
});

test("construireMacrocycle — la part de Base dépend de la charge actuelle (proxy de niveau), sauf 'moderee' qui reste l'exemple chiffré du dossier", () => {
  const faible = construireMacrocycle(16, "faible");
  const moderee = construireMacrocycle(16, "moderee");
  const elevee = construireMacrocycle(16, "elevee");
  // Charges de taper différentes (1/2/3) -> comparer le RATIO base/(base+dev), pas les valeurs brutes.
  const ratio = (m) => m.base / (m.base + m.developpement);
  assert.ok(ratio(faible) > ratio(moderee), "charge faible (reprise) -> base proportionnellement plus longue");
  assert.ok(ratio(elevee) < ratio(moderee), "charge élevée (déjà bien entraîné) -> base proportionnellement plus courte");
  assert.equal(moderee.base, 7, "moderee reste l'exemple chiffré du dossier (16 semaines -> base 7)");
});

test("composerSemaine — phase entretien : touche vitesse (fartlek/répétition) chaque semaine, jamais de I ni de T (seuil réservé au bloc spécifique)", () => {
  const semaineImpaire = composerSemaine("entretien", "route", 5, 3); // 3 % 2 !== 0 -> fartlek
  const semainePaire = composerSemaine("entretien", "route", 5, 4); // 4 % 2 === 0 -> répétition
  assert.ok(semaineImpaire.some((s) => s.catalogueId === "route_fartlek"), "semaine impaire -> fartlek");
  assert.ok(semainePaire.some((s) => s.catalogueId === "route_repetition"), "semaine paire -> répétition");
  for (const semaine of [semaineImpaire, semainePaire]) {
    assert.ok(
      !semaine.some((s) => ["route_interval", "route_seuil"].includes(s.catalogueId)),
      "jamais de I (VO2max) ni de T (seuil, réservé au bloc spécifique) en entretien"
    );
    assert.equal(semaine[semaine.length - 1].catalogueId, "route_sortie_longue", "sortie longue toujours en dernier");
  }
});

test("genererPlanComplet — semaines d'entretien : sortie longue à plat (valeur de départ de la rampe), pas de progression vers le pic", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 30 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
    tempsObjectifS: 3.5 * 3600,
  });
  // Semaines normales seulement — une semaine de décharge (entretien ou pas)
  // réduit le volume comme partout ailleurs, ce n'est pas ce que ce test vérifie.
  const semainesEntretien = plan.semaines.filter((s) => s.phase === "entretien" && s.statut === "normale");
  assert.ok(semainesEntretien.length > 0);
  const distances = semainesEntretien.map((s) => s.seances.find((se) => se.templateId === "route_sortie_longue")?.distanceKm);
  const premiereSemaineBase = plan.semaines.find((s) => s.phase === "base" && s.statut === "normale");
  const distanceDebutRampe = premiereSemaineBase.seances.find((se) => se.templateId === "route_sortie_longue")?.distanceKm;
  for (const d of distances) {
    assert.ok(Math.abs(d - distanceDebutRampe) < 0.5, `sortie longue d'entretien attendue ~plate à la valeur de départ (${distanceDebutRampe}), obtenu ${d}`);
  }
});

test("composerSemaine — axeTravail 'endurance' en Développement route : 2 séances seuil (dont cruise intervals), pas de R/I", () => {
  const semaine = composerSemaine("developpement", "route", 5, 2, false, "endurance");
  const ids = semaine.map((s) => s.catalogueId);
  assert.ok(ids.includes("route_seuil"));
  assert.ok(ids.includes("route_seuil_cruise"));
  assert.ok(!ids.includes("route_interval") && !ids.includes("route_repetition"));
});

test("composerSemaine — axeTravail 'vitesse' en Développement route : répétitions plutôt qu'interval en alternance", () => {
  const semainePaire = composerSemaine("developpement", "route", 5, 2, false, "vitesse");
  const semaineImpaire = composerSemaine("developpement", "route", 5, 3, false, "vitesse");
  assert.ok(semainePaire.some((s) => s.catalogueId === "route_repetition"));
  assert.ok(semaineImpaire.some((s) => s.catalogueId === "route_repetition"));
  assert.ok(!semainePaire.some((s) => s.catalogueId === "route_interval"), "axe vitesse ne dilue pas en interval alterné");
});

test("composerSemaine — axeTravail 'vitesse'/'endurance' en Développement trail : côtes courtes/longues systématiques, plus d'alternance", () => {
  const vitesse = composerSemaine("developpement", "trail", 5, 1, false, "vitesse");
  const endurance = composerSemaine("developpement", "trail", 5, 1, false, "endurance");
  assert.equal(vitesse.filter((s) => s.catalogueId === "trail_cotes_courtes").length, 2);
  assert.equal(endurance.filter((s) => s.catalogueId === "trail_cotes_longues").length, 2);
});

test("composerSemaine — sans axeTravail (équilibre), le comportement historique route/trail est inchangé", () => {
  const route = composerSemaine("developpement", "route", 5, 2);
  assert.ok(route.some((s) => s.catalogueId === "route_seuil") && route.some((s) => s.catalogueId === "route_interval"));
  const trail = composerSemaine("developpement", "trail", 5, 1);
  assert.ok(trail.some((s) => s.catalogueId === "trail_cotes_longues") && trail.some((s) => s.catalogueId === "trail_cotes_courtes"));
});

test("composerSemaine — Base route, variété en semaine impaire 4k+3 (fartlek/progressif), toujours rien en 4k+1", () => {
  const semaine1 = composerSemaine("base", "route", 5, 1); // 1 % 4 === 1
  const semaine3 = composerSemaine("base", "route", 5, 3); // 3 % 4 === 3
  assert.ok(!semaine1.some((s) => ["route_fartlek", "route_progressif", "route_seuil"].includes(s.catalogueId)));
  assert.ok(semaine3.some((s) => ["route_fartlek", "route_progressif"].includes(s.catalogueId)));
});

test("composerSemaine — taper trail garde une touche de côtes courtes à volume réduit, miroir du taper route", () => {
  const taperRoute = composerSemaine("taper", "route", 4, 1);
  const taperTrail = composerSemaine("taper", "trail", 4, 1);
  assert.ok(taperRoute.some((s) => s.catalogueId === "route_interval" && s.volumeReduit));
  assert.ok(taperTrail.some((s) => s.catalogueId === "trail_cotes_courtes" && s.volumeReduit), "le taper trail perdait jusqu'ici toute côte");
});

test("instancierSeance — la réduction de taper dépend de la priorité de la course (A -50%, B -20%, C -10%)", () => {
  const template = { zoneDaniels: "T", discipline: "route", corpsDeSeance: { dureeMin: [40, 40] } };
  const profilCourant = { allures: { T: { target: 4, fast: 3.8 } } };
  const semaineTaper = { numero: 1, phase: "taper", statut: "normale" };
  const volA = instancierSeance(template, profilCourant, semaineTaper, {}, null, { facteurPhase: 1, priorite: "A" }).volumeSeanceMin;
  const volB = instancierSeance(template, profilCourant, semaineTaper, {}, null, { facteurPhase: 1, priorite: "B" }).volumeSeanceMin;
  const volC = instancierSeance(template, profilCourant, semaineTaper, {}, null, { facteurPhase: 1, priorite: "C" }).volumeSeanceMin;
  const volDefaut = instancierSeance(template, profilCourant, semaineTaper, {}, null, { facteurPhase: 1 }).volumeSeanceMin;
  assert.ok(volA < volB && volB < volC, `taper progressivement plus léger de A à C, obtenu A=${volA} B=${volB} C=${volC}`);
  assert.equal(volDefaut, volA, "sans priorité connue (plan autonome), comportement historique (-50%) préservé");
});

test("instancierSeance — fartlek résolu en nombre de relances précis, progressif avec facteurPhase (pas la même fourchette à chaque séance)", () => {
  const template = trouverTemplate("route_fartlek");
  const profilCourant = { allures: { E: { target: 5, fast: 4.5, slow: 5.5 } }, vdot: 50 };
  const semaineContexte = { numero: 1, phase: "base", statut: "normale" };
  const debutPhase = instancierSeance(template, profilCourant, semaineContexte, {}, null, { facteurPhase: 0.75 });
  const finPhase = instancierSeance(template, profilCourant, semaineContexte, {}, null, { facteurPhase: 1.15 });
  assert.match(debutPhase.structureDetaillee.format, /^\d+ relances de /);
  assert.notEqual(debutPhase.structureDetaillee.format, finPhase.structureDetaillee.format, "la prescription doit progresser avec la phase, pas rester figée");
});

test("instancierSeance — séance seuil fractionné (cruise intervals) : plus de récupération inversée, en-tête toujours cohérent avec le corps de séance même en semaine à faible volume", () => {
  const template = trouverTemplate("route_seuil_cruise");
  assert.equal(template.corpsDeSeance.ratioEffortRecup, "6:1", "récupération courte (effort:récup), pas 1:6 (récup 6x plus longue que l'effort — backwards pour des cruise intervals)");
  const profilCourant = { allures: { T: { target: 4.85, fast: 4.6 } }, vdot: 50 };
  // Semaine à faible volume (ex. décharge/début de phase) — c'est ce cas
  // précis qui produisait "1 × 8 min" en corps de séance alors que l'en-tête
  // affichait un volume/distance bien plus grand (calculé indépendamment,
  // avant l'arrondi du nombre de répétitions à un entier).
  const semaineContexte = { numero: 1, phase: "developpement", statut: "normale" };
  const s = instancierSeance(template, profilCourant, semaineContexte, {}, null, { facteurPhase: 0.75 });
  const attendu = s.structureDetaillee.nbRepsResolu * (s.structureDetaillee.repDureeMinResolu + (s.structureDetaillee.recupMinResolu ?? 0));
  assert.ok(Math.abs(s.volumeSeanceMin - attendu) < 0.01, `l'en-tête (${s.volumeSeanceMin} min) doit correspondre exactement au corps de séance résolu (${attendu} min)`);
  assert.ok(Math.abs(s.distanceKm - s.volumeSeanceMin / s.allureCibleMinParKm) < 0.01, "la distance en-tête doit elle aussi refléter le volume réel, pas le volume cible d'avant arrondi");
});

test("instancierSeance — pour toute séance à répétitions HORS spécificité trail (qui porte son propre boost de progression continu, testé séparément), l'en-tête (volume/distance) correspond exactement au corps de séance résolu, quel que soit le volume de la semaine", () => {
  // trail_cotes_courtes/longues et trail_descente_technique (TRAIL_SPECIFICITE_IDS)
  // sont délibérément exclues : leur volumeSeanceMin porte le boostSpecificiteTrail
  // (progression continue avec l'ambition de l'objectif), plus fin qu'un nombre
  // entier de répétitions ne peut l'exprimer — cf. le test boostSpecificiteTrail.
  const idsRepetitions = ["route_seuil_cruise", "route_interval", "route_repetition"];
  const profilRoute = { allures: { T: { target: 4.85, fast: 4.6 }, I: { target: 4, fast: 3.8 }, R: { target: 3.3, fast: 3.1 } }, vdot: 50 };
  for (const id of idsRepetitions) {
    const template = trouverTemplate(id);
    const profilCourant = profilRoute;
    // Balaie plusieurs facteurs de phase (début/milieu/fin de phase, et une
    // décharge) — la classe de bug touchait spécifiquement les volumes
    // faibles (début de phase, décharge).
    for (const facteurPhase of [0.75, 1, 1.15]) {
      const semaineContexte = { numero: 1, phase: "developpement", statut: "normale" };
      const s = instancierSeance(template, profilCourant, semaineContexte, {}, null, { facteurPhase });
      if (s.structureDetaillee.nbRepsResolu == null) continue; // ratio "n/a" (trail_descente_technique) : nbReps indépendant du volume, rien à vérifier ici
      const attendu = s.structureDetaillee.nbRepsResolu * (s.structureDetaillee.repDureeMinResolu + (s.structureDetaillee.recupMinResolu ?? 0));
      assert.ok(
        Math.abs(s.volumeSeanceMin - attendu) < 0.01,
        `${id} @ facteurPhase=${facteurPhase} : en-tête ${s.volumeSeanceMin} min ≠ corps de séance résolu ${attendu} min`
      );
    }
  }
});

test("instancierSeance — endurance fondamentale : lignes droites seulement en phase Développement", () => {
  const template = trouverTemplate("route_endurance_fondamentale");
  const profilCourant = { allures: { E: { target: 5, fast: 4.5, slow: 5.5 } }, vdot: 50 };
  const dev = instancierSeance(template, profilCourant, { numero: 1, phase: "developpement", statut: "normale" }, {}, null, { facteurPhase: 1 });
  const base = instancierSeance(template, profilCourant, { numero: 1, phase: "base", statut: "normale" }, {}, null, { facteurPhase: 1 });
  assert.match(dev.structureDetaillee.format, /lignes droites/);
  assert.doesNotMatch(base.structureDetaillee.format, /lignes droites/);
});

test("genererPlanComplet — croiseRecommande présent chaque semaine (base/développement/entretien), absent en taper", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 30 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    distanceObjectifM: 42195,
    tempsObjectifS: 3.5 * 3600,
  });
  for (const semaine of plan.semaines) {
    if (semaine.phase === "taper") {
      assert.equal(semaine.croiseRecommande.length, 0, "pas de croisé en taper (Le Coaching du Coureur — disparaît en fin de préparation)");
    } else {
      assert.ok(semaine.croiseRecommande.length > 0, `croisé attendu en phase ${semaine.phase}`);
      assert.equal(semaine.croiseRecommande[0].id, "croise_endurance");
    }
  }
});

test("genererPlanComplet — le taper mène à un pic de forme le jour de la course : le volume continue de BAISSER semaine après semaine à l'approche de la course, jamais de rebond", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 20 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
    chargeHebdoMoyenneActuelle: "elevee", // -> taper de 3 semaines (construireMacrocycle)
  });
  const semainesTaper = plan.semaines.filter((s) => s.phase === "taper");
  assert.equal(semainesTaper.length, 3, "ce scénario doit produire un taper de 3 semaines pour tester une vraie progression");
  // route_endurance_fondamentale est présente chaque semaine de taper (filler E) :
  // sert de témoin direct du facteur de phase, indépendamment des plafonds hebdo
  // (zone E, jamais plafonnée par PLAFONDS_VOLUME_HEBDO).
  const volumesParSemaine = semainesTaper.map(
    (s) => s.seances.find((se) => se.templateId === "route_endurance_fondamentale")?.volumeSeanceMin
  );
  assert.ok(volumesParSemaine.every((v) => v != null), "route_endurance_fondamentale attendue chaque semaine de taper");
  for (let i = 1; i < volumesParSemaine.length; i++) {
    assert.ok(
      volumesParSemaine[i] <= volumesParSemaine[i - 1] + 0.01,
      `le volume ne doit jamais remonter en approchant de la course : semaine taper ${i - 1}=${volumesParSemaine[i - 1]}, semaine ${i}=${volumesParSemaine[i]}`
    );
  }
  assert.ok(volumesParSemaine[0] > volumesParSemaine[volumesParSemaine.length - 1], "la dernière semaine de taper doit être nettement plus légère que la première");
});

test("genererPlanComplet — jamais de séance programmée la veille ni le jour de la course, quels que soient les jours d'entraînement choisis", () => {
  const dateDebut = new Date("2026-09-01T00:00:00Z");
  // Balaie plusieurs configurations de jours choisis, y compris celles qui
  // incluraient normalement le jour précédant l'échéance.
  const configs = [
    { dateEcheance: "2026-11-30T00:00:00Z", joursEntrainement: [1, 2, 3, 4, 5, 6, 7] }, // tous les jours
    { dateEcheance: "2026-12-13T00:00:00Z", joursEntrainement: [1, 3, 5, 7] },
    { dateEcheance: "2026-12-20T00:00:00Z", joursEntrainement: [2, 4, 6] },
  ];
  for (const { dateEcheance, joursEntrainement } of configs) {
    const plan = genererPlanComplet({
      discipline: "route",
      performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
      dateDebut: dateDebut.toISOString(),
      dateEcheance,
      nbSeancesHebdo: joursEntrainement.length,
      joursEntrainement,
    });
    const veilleISO = new Date(new Date(dateEcheance).getTime() - 24 * 60 * 60 * 1000).toDateString();
    const jourJISO = new Date(dateEcheance).toDateString();
    for (const semaine of plan.semaines) {
      for (const s of semaine.seances) {
        if (!s.date) continue;
        const d = new Date(s.date).toDateString();
        assert.notEqual(d, veilleISO, `séance programmée la veille de la course (jours choisis: ${joursEntrainement})`);
        assert.notEqual(d, jourJISO, `séance programmée le jour de la course (jours choisis: ${joursEntrainement})`);
      }
    }
  }
});

test("genererPlanComplet — la dernière semaine du plan a une séance de moins que les autres (repos garanti la veille de course)", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 10 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    nbSeancesHebdo: 5,
  });
  const derniere = plan.semaines[plan.semaines.length - 1];
  const avantDerniere = plan.semaines[plan.semaines.length - 2];
  assert.equal(derniere.seances.length, avantDerniere.seances.length - 1);
});

test("genererSaison — priorite par objectif intermédiaire (A/B/C) pilote l'affûtage de son propre bloc, indépendamment des autres", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objectifFinal = { nom: "Final", discipline: "route", distanceM: 42195, date: new Date(dateDebut.getTime() + 32 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objectifsIntermediaires = [
    { nom: "Course A", priorite: "A", discipline: "route", distanceM: 21097, date: new Date(dateDebut.getTime() + 10 * 7 * 24 * 60 * 60 * 1000).toISOString() },
    { nom: "Course C", discipline: "route", distanceM: 10000, date: new Date(dateDebut.getTime() + 20 * 7 * 24 * 60 * 60 * 1000).toISOString() }, // pas de priorite -> "C" par défaut
  ];
  const blocs = genererSaison({
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    chargeHebdoMoyenneActuelle: "elevee",
    objectifFinal,
    objectifsIntermediaires,
  });
  const [blocA, blocC, blocFinal] = blocs;
  assert.equal(blocA.priorite, "A");
  assert.equal(blocA.macrocycle.taper, 3, "priorite A -> affûtage complet comme un objectif final");
  assert.equal(blocC.priorite, "C");
  assert.equal(blocC.macrocycle.taper, 1, "sans priorite précisée -> C par défaut, affûtage minimal");
  assert.equal(blocFinal.priorite, "A", "l'objectif final est toujours priorite A");
});

test("genererSaison — joursDeCoupure permet une pause plus longue que le jour de battement par défaut entre deux blocs", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const dateInter = new Date(dateDebut.getTime() + 10 * 7 * 24 * 60 * 60 * 1000);
  const objectifsIntermediaires = [
    { nom: "10km", discipline: "route", distanceM: 10000, date: dateInter.toISOString(), joursDeCoupure: 14 }, // 2 semaines de coupure
  ];
  const objectifFinal = { nom: "Final", discipline: "route", distanceM: 42195, date: new Date(dateInter.getTime() + 20 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const blocs = genererSaison({
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    objectifFinal,
    objectifsIntermediaires,
  });
  const [blocInter, blocFinal] = blocs;
  assert.equal(
    new Date(blocFinal.dateDebutPlan).getTime() - new Date(blocInter.dateEcheance).getTime(),
    14 * 24 * 60 * 60 * 1000
  );
});

test("genererSaison — chaque objectif peut avoir ses propres jours d'entraînement et sa propre charge, sinon hérite du réglage commun de la saison", () => {
  const dateDebut = new Date("2026-01-05T00:00:00Z");
  const objectifFinal = { nom: "Final", discipline: "route", distanceM: 42195, date: new Date(dateDebut.getTime() + 30 * 7 * 24 * 60 * 60 * 1000).toISOString() };
  const objectifsIntermediaires = [
    {
      nom: "10km d'été",
      discipline: "route",
      distanceM: 10000,
      date: new Date(dateDebut.getTime() + 10 * 7 * 24 * 60 * 60 * 1000).toISOString(),
      joursEntrainement: [1, 2, 3, 4, 5, 6, 7], // plus de dispo l'été
      chargeHebdoMoyenneActuelle: "elevee",
    },
  ];
  const blocs = genererSaison({
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    joursEntrainement: [1, 3, 5, 7], // réglage commun de la saison
    chargeHebdoMoyenneActuelle: "moderee",
    objectifFinal,
    objectifsIntermediaires,
  });
  const [blocEte, blocFinal] = blocs;
  assert.equal(blocEte.joursEntrainement.length, 7, "le bloc d'été utilise ses propres jours, pas ceux de la saison");
  assert.equal(blocEte.chargeHebdoMoyenneActuelle, "elevee");
  assert.equal(blocFinal.joursEntrainement.length, 4, "sans réglage propre, le bloc final hérite du réglage commun de la saison");
  assert.equal(blocFinal.chargeHebdoMoyenneActuelle, "moderee");
});

test("genererSemaines — absorbe le reste de semainesDisponibles (floor) dans la fenêtre de la 1ère semaine, sans changer le nombre de semaines par phase", () => {
  const m = construireMacrocycle(15, "moderee"); // 15 semaines pleines
  const semainesSansReste = genererSemaines(m, new Date("2026-09-01T00:00:00Z").toISOString());
  const semainesAvecReste = genererSemaines(m, new Date("2026-09-01T00:00:00Z").toISOString(), 5);

  assert.equal(semainesSansReste.length, semainesAvecReste.length, "le reste ne doit pas changer le nombre de semaines");
  assert.equal(semainesSansReste[0].dureeJours, 7);
  assert.equal(semainesAvecReste[0].dureeJours, 12, "la 1ère semaine absorbe les 5 jours de reste");
  for (let i = 1; i < semainesAvecReste.length; i++) {
    assert.equal(semainesAvecReste[i].dureeJours, 7, "les semaines suivantes gardent 7 jours");
  }
  // Le décalage cumulé de 5 jours se propage à toutes les semaines suivantes,
  // donc la dernière semaine finit exactement 5 jours plus tard qu'avant.
  const derniereSansReste = semainesSansReste[semainesSansReste.length - 1];
  const derniereAvecReste = semainesAvecReste[semainesAvecReste.length - 1];
  const finSansReste = new Date(derniereSansReste.dateDebut).getTime() + 7 * 86400000;
  const finAvecReste = new Date(derniereAvecReste.dateDebut).getTime() + 7 * 86400000;
  assert.equal((finAvecReste - finSansReste) / 86400000, 5);
});

test("genererPlanComplet — le plan couvre jusqu'à l'échéance SANS jamais programmer la veille ni le jour de course, même quand l'écart n'est pas un multiple de 7 jours", () => {
  const dateDebut = new Date("2026-09-01T00:00:00Z");
  const dateEcheance = new Date("2026-12-20T00:00:00Z"); // 110 jours = 15 semaines + 5 jours de reste
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
    joursEntrainement: [1, 2, 4, 6, 7],
  });
  const toutesLesDates = plan.semaines.flatMap((s) => s.seances.map((se) => new Date(se.date).getTime()));
  const derniereDate = Math.max(...toutesLesDates);
  const ecartJours = Math.round((dateEcheance.getTime() - derniereDate) / 86400000);
  // La veille de course doit toujours rester un jour de repos garanti (repos
  // ci-dessous), donc au moins 1 jour d'écart désormais — jamais après la
  // course (>= 0, comportement préexistant), et une fenêtre large en amont
  // pour rester tolérant à la répartition des jours d'entraînement choisis.
  assert.ok(ecartJours >= 1, `la veille de course ne doit jamais recevoir de séance, écart obtenu : ${ecartJours} jour(s)`);
  assert.ok(ecartJours <= 4, `dernière séance anormalement loin de la course, écart de ${ecartJours} jours`);
});

test("genererPlanComplet — quand l'écart est un multiple exact de 7 jours, aucun reste à absorber (comportement inchangé)", () => {
  const dateDebut = new Date();
  const dateEcheance = new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000);
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: dateEcheance.toISOString(),
    nbSeancesHebdo: 5,
  });
  assert.equal(plan.semaines[0].dureeJours, 7);
});

test("genererPlanComplet — la sortie longue tombe sur le dernier jour d'entraînement choisi de la semaine", () => {
  const dateDebut = new Date();
  const plan = genererPlanComplet({
    discipline: "route",
    performanceRef: { distanceM: 10000, tempsS: 42 * 60 },
    dateDebut: dateDebut.toISOString(),
    dateEcheance: new Date(dateDebut.getTime() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    joursEntrainement: [1, 3, 5, 7], // lundi, mercredi, vendredi, dimanche
  });
  const semaine = plan.semaines.find((s) => s.phase === "developpement");
  const sortieLongue = semaine.seances.find((s) => s.templateId === "route_sortie_longue");
  const autres = semaine.seances.filter((s) => s !== sortieLongue);
  for (const autre of autres) {
    assert.ok(new Date(sortieLongue.date) >= new Date(autre.date), "sortie longue doit être la plus tardive de la semaine");
  }
});
